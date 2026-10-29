import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { AmpWorker, enqueue } from "../server/amp";
import { Store } from "../server/store";
import { projectInput, type Task } from "../shared/domain";

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
