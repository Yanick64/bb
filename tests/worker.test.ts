import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { AmpWorker, enqueue, parseReport } from "../server/amp";
import { Store } from "../server/store";
import { acceptReview, addPlan, approve } from "../server/workflow";
import { evidenceInput, projectInput, type Task } from "../shared/domain";

function waitForResult(store: Store, taskId: string) {
  return new Promise<Task>((resolve, reject) => {
    const timeout = setTimeout(() => {
      store.listeners.delete(listener);
      reject(new Error("Worker test timed out"));
    }, 10000);
    const listener = () => {
      const task = store.task(taskId);
      if (!task.runs.at(-1) || ["running", "queued"].includes(task.runs.at(-1)?.status ?? ""))
        return;
      clearTimeout(timeout);
      store.listeners.delete(listener);
      resolve(task);
    };
    store.listeners.add(listener);
    listener();
  });
}
test("a missing screenshot preserves the investigation without satisfying review criteria", async () => {
  const store = new Store();
  const project = store.saveProject(projectInput.parse({ name: "Synthetic" }));
  const task = store.createTask({ title: "Synthetic", projectId: project.id });
  const worker = new AmpWorker(store, {
    enabled: true,
    binary: resolve("tests/fixtures/fake-amp.ts"),
    concurrency: 1,
  });
  try {
    enqueue(store, task.id, "triage", "FAKE_MISSING_SCREENSHOT", task.revision);
    const result = waitForResult(store, task.id);
    worker.start();
    const finished = await result;
    expect(finished.runs[0].error).toBeNull();
    expect(finished.summary).toBe("Onderzocht");
    expect(finished.questions).toHaveLength(1);
    expect(finished.evidence).toHaveLength(2);
    const missing = finished.evidence[0];
    expect(missing.kind).toBe("document");
    expect(missing.checkStatus).toBe("not_run");
    expect(missing.criterion).toBe("");
    expect(missing.notes).toContain("Screenshot ontbreekt");
    expect(missing.notes).toContain(".amp/in/artifacts/login.png");
    expect(missing.notes).toContain("The original flow works");
    expect(finished.activity.some((entry) => entry.text.includes("evidence.0.url"))).toBe(true);
    expect(JSON.parse(finished.runs[0].result).evidence[0].kind).toBe("screenshot");

    finished.questions[0].answer = "Answered";
    addPlan(finished, { summary: "Fix", steps: ["Fix"], criteria: ["The original flow works"] });
    approve(finished, 1);
    for (const evidence of finished.evidence) {
      evidence.planVersion = 1;
      evidence.review = "accepted";
    }
    expect(() => acceptReview(finished, "synthetic-revision")).toThrow("acceptatiecriterium");
  } finally {
    worker.stop();
    store.db.close();
  }
});

test("malformed reports and other invalid evidence still fail validation", () => {
  const screenshot = { title: "Image", kind: "screenshot", revision: "sha" };
  expect(evidenceInput.safeParse(screenshot).success).toBe(false);
  const linked = { ...screenshot, url: "https://example.com/image.png", checkStatus: "passed" };
  expect(parseReport(JSON.stringify({ evidence: [linked] }))?.evidence?.[0]).toMatchObject(linked);
  expect(parseReport(JSON.stringify({ evidence: [screenshot] }))?.evidence?.[0].kind).toBe(
    "document",
  );
  for (const evidence of [
    { ...screenshot, url: "javascript:alert(1)" },
    { ...screenshot, url: ".amp/in/artifacts/login.png" },
    { ...screenshot, url: "", revision: "" },
    { ...screenshot, url: "", checkStatus: "invented" },
    { ...screenshot, kind: "pull_request", url: "" },
  ]) {
    expect(parseReport(JSON.stringify({ summary: "Research", evidence: [evidence] }))).toBeNull();
  }
  const diagnostics: string[] = [];
  expect(parseReport('{"questions":[{"question":""}]}', diagnostics)).toBeNull();
  expect(diagnostics[0]).toStartWith("questions.0.question:");
  const invalidJson: string[] = [];
  expect(parseReport("Not JSON", invalidJson)).toBeNull();
  expect(invalidJson).toEqual(["Het eindresultaat bevat geen geldig JSON-object."]);
});
for (const disconnect of [false, true]) {
  test(
    disconnect
      ? "a disconnected observer preserves the remote thread for reconciliation"
      : "worker persists streamed progress and validates final structured output",
    async () => {
      const store = new Store();
      const project = store.saveProject(projectInput.parse({ name: "Synthetic" }));
      const task = store.createTask({
        title: "Synthetic",
        projectId: project.id,
        kind: "question",
      });
      const binary = resolve("tests/fixtures/fake-amp.ts");
      const worker = new AmpWorker(store, { enabled: true, binary, concurrency: 1 });
      try {
        enqueue(store, task.id, "triage", disconnect ? "FAKE_DISCONNECT" : "", task.revision);
        const result = waitForResult(store, task.id);
        worker.start();
        const finished = await result;
        expect(finished.runs[0].threadId).toBe("T-fake-remote-thread");
        expect(store.events(task.id)).toHaveLength(1);
        if (disconnect) {
          expect(finished.runs[0].status).toBe("interrupted");
          expect(finished.runs[0].error).toContain("Controleer Amp");
        } else {
          expect(finished.runs[0].status).toBe("succeeded");
          expect(finished.questions[0].question).toBe("Welke doelgroep?");
          expect(finished.summary).toBe("Onderzocht");
        }
      } finally {
        worker.stop();
        store.db.close();
      }
    },
  );
}
