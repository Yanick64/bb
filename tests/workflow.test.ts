import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AmpWorker, ampArgs, enqueue, parseReport } from "../server/amp";
import { Store } from "../server/store";
import {
  acceptReview,
  addEvidence,
  addPlan,
  addQuestion,
  approve,
  command,
  ingest,
  transition,
} from "../server/workflow";
import { activeRun, currentPlan, nextAction, projectInput } from "../shared/domain";

const stores: Store[] = [];
function setup() {
  const store = new Store();
  stores.push(store);
  const project = store.saveProject(
    projectInput.parse({
      name: "Example",
      ampProject: "example/app",
      mappings: [
        {
          provider: "orbit",
          externalId: "PR0000000000001",
          name: "Selected project",
          client: "Example client",
        },
      ],
    }),
  );
  const task = store.createTask({ title: "Fix checkout", projectId: project.id });
  return { store, project, task };
}
afterEach(() => {
  for (const store of stores.splice(0)) store.db.close();
});
const plan = {
  summary: "Fix checkout overflow",
  steps: ["Reproduce", "Fix", "Verify"],
  criteria: ["Checkout works at 375px"],
};
const signal = {
  provider: "orbit",
  externalId: "TC0000000000001",
  externalProjectId: "PR0000000000001",
  title: "Checkout broken",
  body: "Please investigate",
};

describe("intake and routing", () => {
  test("routes only explicit mappings and deduplicates webhook retries", () => {
    const { store, project } = setup();
    const first = ingest(store, signal);
    const repeated = ingest(store, signal);
    expect(first.task.projectId).toBe(project.id);
    expect(repeated.task.id).toBe(first.task.id);
    expect(repeated.duplicate).toBe(true);
    expect(store.signals()).toHaveLength(1);
    expect(
      ingest(store, { ...signal, externalId: "other", externalProjectId: "unknown" }).task
        .projectId,
    ).toBeNull();
  });
  test("several signals can link to one task", () => {
    const { store, task } = setup();
    ingest(store, signal, task.id);
    ingest(store, { ...signal, provider: "sentry", externalId: "123" }, task.id);
    expect(store.signals(task.id)).toHaveLength(2);
    expect(store.tasks()).toHaveLength(1);
  });
  test("a source project cannot silently route to two BB projects", () => {
    const { store, project } = setup();
    expect(() => store.saveProject({ ...project, name: "Other" })).toThrow("al gekoppeld");
  });
});
describe("approval and clarification", () => {
  test("unapproved plans cannot start implementation", () => {
    const { store, task } = setup();
    const t = store.update(task.id, (t) => addPlan(t, plan));
    expect(() => enqueue(store, t.id, "implement", "", t.revision)).toThrow("Keur eerst");
    expect(store.task(t.id).runs).toHaveLength(0);
  });
  test("an approval for v1 never authorizes v2", () => {
    const { store, task } = setup();
    store.update(task.id, (t) => {
      addPlan(t, plan);
      approve(t, 1);
      addPlan(t, { ...plan, summary: "Changed scope" });
    });
    const t = store.task(task.id);
    expect(currentPlan(t)?.approvedAt).toBeNull();
    expect(() => store.update(t.id, (t) => approve(t, 1))).toThrow("laatste planversie");
    expect(() => enqueue(store, t.id, "implement", "", t.revision)).toThrow();
    expect(t.plans[0].summary).toBe(plan.summary);
  });
  test("questions have a clear owner and blocking scope; answering invalidates approval", () => {
    const { store, task } = setup();
    let t = store.update(task.id, (t) => {
      addPlan(t, plan);
      approve(t, 1);
      addQuestion(t, {
        question: "Who gets a discount?",
        recipient: "client",
        blocks: "implementation",
      });
    });
    expect(nextAction(t).owner).toBe("client");
    expect(() => enqueue(store, t.id, "implement", "", t.revision)).toThrow("blokkerende vragen");
    t = command(
      store,
      t.id,
      {
        type: "answer",
        questionId: t.questions[0].id,
        answer: "Approved accounts",
        answeredBy: "client",
      },
      t.revision,
    );
    expect(currentPlan(t)?.approvedAt).toBeNull();
    expect(t.questions[0].answeredBy).toBe("client");
    expect(nextAction(t).label).toContain("Beoordeel plan");
  });
  test("optimistic revisions prevent stale clients from overwriting work", () => {
    const { store, task } = setup();
    command(store, task.id, { type: "summary", summary: "First" }, task.revision);
    expect(() =>
      command(store, task.id, { type: "summary", summary: "Stale" }, task.revision),
    ).toThrow("intussen gewijzigd");
    expect(store.task(task.id).summary).toBe("First");
  });
});
describe("evidence and delivery", () => {
  test("missing, failing and unreviewed evidence cannot be called accepted", () => {
    const { store, task } = setup();
    const t = store.update(task.id, (t) => {
      addPlan(t, plan);
      approve(t, 1);
    });
    expect(() => acceptReview(t, "sha1")).toThrow();
    addEvidence(t, {
      title: "Tests",
      kind: "test",
      revision: "sha1",
      criterion: plan.criteria[0],
      checkStatus: "failed",
    });
    expect(() => acceptReview(t, "sha1")).toThrow("Beoordeel eerst");
    t.evidence[0].review = "accepted";
    expect(() => acceptReview(t, "sha1")).toThrow("niet geslaagd");
    t.evidence[0].checkStatus = "not_run";
    expect(() => acceptReview(t, "sha1")).toThrow("niet geslaagd");
  });
  test("review requires every criterion and the newest revision", () => {
    const { store, task } = setup();
    const t = store.update(task.id, (t) => {
      addPlan(t, plan);
      approve(t, 1);
    });
    addEvidence(t, { title: "Result", kind: "document", revision: "v1", notes: "Actual result" });
    t.evidence[0].review = "accepted";
    expect(() => acceptReview(t, "v1")).toThrow("ieder acceptatiecriterium");
    t.evidence[0].criterion = plan.criteria[0];
    addEvidence(t, {
      title: "New result",
      kind: "document",
      revision: "v2",
      criterion: plan.criteria[0],
    });
    expect(() => acceptReview(t, "v1")).toThrow("niet meer actueel");
  });
  test("new execution invalidates screenshots even when the plan did not change", () => {
    const { store, task } = setup();
    let t = store.update(task.id, (t) => {
      addPlan(t, plan);
      approve(t, 1);
      addEvidence(t, {
        title: "Proof",
        kind: "document",
        revision: "v1",
        criterion: plan.criteria[0],
      });
      t.evidence[0].review = "accepted";
    });
    t = enqueue(store, t.id, "revise", "Change requested", t.revision);
    expect(t.reviewCycle).toBe(1);
    expect(t.evidence[0].reviewCycle).toBe(0);
    t.runs[0].status = "succeeded";
    expect(() => acceptReview(t, "v1")).toThrow();
  });
  test("non-coding inquiry can be reviewed and delivered without a PR", () => {
    const { store, task } = setup();
    let t = store.update(task.id, (t) => {
      t.kind = "question";
      addPlan(t, plan);
      approve(t, 1);
      addEvidence(t, {
        title: "Client answer",
        kind: "document",
        revision: "answer-v1",
        criterion: plan.criteria[0],
        notes: "A researched answer",
      });
      t.evidence[0].review = "accepted";
      acceptReview(t, "answer-v1");
    });
    expect(t.stage).toBe("delivery");
    t = command(
      store,
      t.id,
      { type: "deliver", note: "Sent the reviewed answer through Orbit" },
      t.revision,
    );
    expect(t.stage).toBe("done");
    expect(nextAction(t).owner).toBe("none");
    expect(t.evidence.some((e) => e.kind === "pull_request")).toBe(false);
  });
  test("board movement cannot bypass review or delivery", () => {
    const { task } = setup();
    expect(() => transition(task, "done")).toThrow();
    expect(() => transition(task, "delivery")).toThrow();
    expect(() => transition(task, "review")).toThrow();
  });
});
describe("Amp and recovery", () => {
  test("remote invocation is shell-free, resumable and keeps threads unarchived", () => {
    const { store, task, project } = setup();
    const t = enqueue(store, task.id, "triage", "", task.revision);
    const r = t.runs[0];
    expect(ampArgs(r, project)).toContain("-ox");
    expect(ampArgs(r, project)).toContain("--no-archive-after-execute");
    r.threadId = "T-example";
    expect(ampArgs(r, project).slice(0, 3)).toEqual(["threads", "continue", "T-example"]);
    expect(ampArgs(r, project)).not.toContain("--project");
  });
  test("invalid agent JSON cannot mutate workflow state", () => {
    expect(parseReport("Done, all good")).toBeNull();
    expect(parseReport('{"plan":{"summary":"fake"}}')).toBeNull();
    expect(parseReport('```json\n{"summary":"Investigated"}\n```')?.summary).toBe("Investigated");
  });
  test("restart marks running orbs interrupted and never retries them", () => {
    const { store, task } = setup();
    const t = enqueue(store, task.id, "triage", "", task.revision);
    store.update(t.id, (t) => {
      t.runs[0].status = "running";
      t.runs[0].threadId = "T-remote";
    });
    const worker = new AmpWorker(store, { enabled: false, binary: "amp", concurrency: 1 });
    worker.start();
    expect(activeRun(store.task(t.id))?.status).toBe("interrupted");
    expect(nextAction(store.task(t.id)).label).toBe("Controleer de Amp-thread");
    expect(() => enqueue(store, t.id, "triage", "", store.task(t.id).revision)).toThrow();
    worker.stop();
  });
  test("reassigning a task never continues the previous project's thread", () => {
    const { store, task } = setup();
    let t = enqueue(store, task.id, "triage", "", task.revision);
    t = store.update(t.id, (t) => {
      t.runs[0].status = "succeeded";
      t.runs[0].threadId = "T-old";
    });
    const other = store.saveProject(
      projectInput.parse({ name: "Example", ampProject: "other/app" }),
    );
    t = command(store, t.id, { type: "assign", projectId: other.id }, t.revision);
    t = enqueue(store, t.id, "triage", "", t.revision);
    expect(t.runs.at(-1)?.threadId).toBeNull();
  });
  test("SQLite survives reopening and deduplication survives with it", () => {
    const folder = mkdtempSync(join(tmpdir(), "bb-persistence-"));
    const path = join(folder, "bb.sqlite");
    try {
      const first = new Store(path);
      const task = ingest(first, signal).task;
      first.db.close();
      const second = new Store(path);
      expect(second.task(task.id).title).toBe(signal.title);
      expect(ingest(second, signal).duplicate).toBe(true);
      expect(second.tasks()).toHaveLength(1);
      second.db.close();
    } finally {
      rmSync(folder, { recursive: true });
    }
  });
});
