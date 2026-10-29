import { resolve } from "node:path";
import { AmpWorker, commandAndContinue, enqueue } from "../server/amp";
import { Store } from "../server/store";
import { projectInput, type Task } from "../shared/domain";

// Explicit, opt-in live test. It creates one remote orb and runs two short turns.
// It does not check out a repository or ask Amp to call external tools.
const store = new Store(resolve("data/amp-smoke.sqlite"));
const project = store.saveProject(projectInput.parse({ name: "BB integration smoke" }));
const task = store.createTask({
  title: "BB remote integration smoke test",
  projectId: project.id,
  kind: "question",
  description:
    'Synthetic integration test. Do not call any tools, read repositories, contact anyone, or change any files. Only return JSON. After the operator answers Ja to the synthetic question, return {"summary":"Antwoord ontvangen in dezelfde thread.","plan":{"summary":"Synthetische test afgerond","steps":["Controleer de ontvangst van het antwoord"],"criteria":["Het antwoord is ontvangen"]}} without asking further questions. This synthetic test has no client, budget or billing.',
});
const worker = new AmpWorker(store, {
  enabled: true,
  binary: Bun.env.AMP_BIN ?? "amp",
  concurrency: 1,
  timeoutMs: 180000,
});
function waitForTurn(): Promise<Task> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Remote smoke test timed out"));
    }, 190000);
    const listener = () => {
      const current = store.task(task.id);
      const run = current.runs.at(-1);
      if (!run || ["running", "queued"].includes(run.status)) return;
      cleanup();
      if (run.status !== "succeeded") reject(new Error(run.error ?? run.status));
      else resolve(current);
    };
    function cleanup() {
      clearTimeout(timeout);
      store.listeners.delete(listener);
    }
    store.listeners.add(listener);
    listener();
  });
}
try {
  enqueue(
    store,
    task.id,
    "triage",
    'Return exactly {"summary":"BB orbverbinding werkt.","questions":[{"question":"Mag deze synthetische test verder?","reason":"Test van de verduidelijkingscyclus","recipient":"operator","blocks":"planning","suggestion":"Ja"}]}',
    task.revision,
  );
  worker.start();
  let current = await waitForTurn();
  const firstThread = current.runs[0].threadId;
  if (!firstThread || !current.questions.length)
    throw new Error("Missing remote thread or structured question");
  current = commandAndContinue(
    store,
    task.id,
    {
      type: "answer",
      questionId: current.questions[0].id,
      answer: "Ja, alleen deze synthetische test.",
      answeredBy: "operator",
    },
    current.revision,
    true,
  );
  if (current.runs.length !== 2 || current.runs[1].status !== "queued")
    throw new Error("The final answer did not automatically queue continuation");
  worker.tick();
  current = await waitForTurn();
  if (current.runs[1].threadId !== firstThread || !current.plans.length)
    throw new Error("Thread continuation or structured plan failed");
  console.log(
    JSON.stringify(
      {
        success: true,
        threadId: firstThread,
        turns: current.runs.length,
        questionReceived: true,
        planReceived: true,
        approved: Boolean(current.plans.at(-1)?.approvedAt),
      },
      null,
      2,
    ),
  );
} finally {
  worker.stop();
  store.db.close();
}
