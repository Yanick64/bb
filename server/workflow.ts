import { z } from "zod";
import {
  type AgentReport,
  activeRun,
  currentPlan,
  evidenceInput,
  planInput,
  questionInput,
  type Stage,
  signalInput,
  type Task,
} from "../shared/domain";
import { AppError, activity, id, now, type Store } from "./store";

export function requireIdle(task: Task) {
  if (activeRun(task))
    throw new AppError(
      "Wacht tot de uitvoering is afgerond of handel de onderbroken thread af.",
      409,
    );
}
export function invalidate(task: Task) {
  const plan = currentPlan(task);
  if (plan) {
    plan.approvedAt = null;
    plan.approvedBy = null;
  }
  task.review = null;
  task.delivery = null;
  if (["in_progress", "review", "delivery", "done"].includes(task.stage)) task.stage = "planning";
}
export function addPlan(task: Task, input: unknown) {
  const data = planInput.parse(input);
  const latest = currentPlan(task);
  if (
    latest &&
    latest.summary === data.summary &&
    JSON.stringify(latest.steps) === JSON.stringify(data.steps) &&
    JSON.stringify(latest.criteria) === JSON.stringify(data.criteria)
  )
    return;
  task.plans.push({
    ...data,
    id: id(),
    version: task.plans.length + 1,
    createdAt: now(),
    approvedAt: null,
    approvedBy: null,
  });
  task.review = null;
  task.delivery = null;
  task.stage = "planning";
  activity(task, `Plan v${task.plans.length} voorgesteld`);
}
export function addQuestion(task: Task, input: unknown) {
  const data = questionInput.parse(input);
  if (
    task.questions.some(
      (q) =>
        q.question === data.question && q.recipient === data.recipient && q.blocks === data.blocks,
    )
  )
    return;
  task.questions.push({
    ...data,
    id: id(),
    answer: null,
    answeredBy: null,
    answeredAt: null,
  });
  activity(task, "Verduidelijkingsvraag toegevoegd");
}
export function addEvidence(task: Task, input: unknown) {
  const data = evidenceInput.parse(input);
  if (
    task.evidence.some(
      (e) =>
        e.planVersion === (currentPlan(task)?.version ?? null) &&
        e.reviewCycle === task.reviewCycle &&
        Object.entries(data).every(([key, value]) => e[key as keyof typeof data] === value),
    )
  )
    return;
  if (data.kind === "screenshot" && !data.url)
    throw new AppError("Een screenshot heeft een afbeelding nodig");
  task.evidence.push({
    ...data,
    id: id(),
    createdAt: now(),
    planVersion: currentPlan(task)?.version ?? null,
    reviewCycle: task.reviewCycle,
    review: "pending",
    comments: [],
  });
  task.review = null;
  task.delivery = null;
  if (currentPlan(task)?.approvedAt && !activeRun(task)) task.stage = "review";
  if (task.stage === "delivery" || task.stage === "done") {
    task.stage = "review";
    task.delivery = null;
  }
  activity(task, `Bewijs toegevoegd: ${data.title}`);
}
export function approve(task: Task, version: number) {
  requireIdle(task);
  const plan = currentPlan(task);
  if (!plan || plan.version !== version)
    throw new AppError("Alleen de laatste planversie kan worden goedgekeurd", 409);
  if (task.questions.some((q) => !q.answer && ["planning", "implementation"].includes(q.blocks)))
    throw new AppError("Beantwoord eerst de blokkerende vragen", 409);
  plan.approvedAt = now();
  plan.approvedBy = "operator";
  activity(task, `Plan v${version} goedgekeurd`);
}
export function acceptReview(task: Task, revision: string) {
  requireIdle(task);
  const plan = currentPlan(task);
  if (!plan?.approvedAt) throw new AppError("Een goedgekeurd plan is vereist", 409);
  const evidence = task.evidence.filter(
    (e) =>
      e.planVersion === plan.version &&
      e.revision === revision &&
      e.reviewCycle === task.reviewCycle,
  );
  const latest = task.evidence
    .filter((e) => e.planVersion === plan.version && e.reviewCycle === task.reviewCycle)
    .at(-1);
  if (latest?.revision !== revision)
    throw new AppError("Deze versie is niet meer actueel. Beoordeel het nieuwste bewijs.", 409);
  if (!evidence.length)
    throw new AppError("Voeg eerst bewijs toe voor deze code- of documentversie", 409);
  if (evidence.some((e) => e.review !== "accepted"))
    throw new AppError("Beoordeel eerst alle bewijsstukken van deze versie", 409);
  if (evidence.some((e) => e.kind === "test" && e.checkStatus !== "passed"))
    throw new AppError("Technische controles zijn nog niet geslaagd", 409);
  if (plan.criteria.some((criterion) => !evidence.some((e) => e.criterion === criterion)))
    throw new AppError("Koppel voor ieder acceptatiecriterium bewijs aan deze versie", 409);
  if (task.questions.some((q) => !q.answer && q.blocks !== "none"))
    throw new AppError("Er zijn nog blokkerende vragen", 409);
  task.review = { planVersion: plan.version, revision, acceptedAt: now() };
  task.stage = "delivery";
  activity(task, `Review geaccepteerd voor ${revision}`);
}
export function transition(task: Task, stage: Stage) {
  requireIdle(task);
  if (stage === task.stage) return;
  if (stage === "done") throw new AppError("Rond de taak af via Oplevering");
  if (stage === "delivery") throw new AppError("Accepteer eerst de review");
  if (["in_progress", "review"].includes(stage) && !currentPlan(task)?.approvedAt)
    throw new AppError("Keur eerst het plan goed", 409);
  if (stage === "planning" && task.questions.some((q) => !q.answer && q.blocks === "planning"))
    throw new AppError("Er staat een vraag open die planning blokkeert", 409);
  task.stage = stage;
  task.review = null;
  task.delivery = null;
  activity(task, `Status gewijzigd naar ${stage}`);
}
export function applyReport(task: Task, report: AgentReport, mode: string) {
  if (report.summary !== undefined) task.summary = report.summary;
  for (const question of report.questions ?? [])
    if (!task.questions.some((q) => q.question === question.question)) addQuestion(task, question);
  if (report.plan && ["triage", "plan"].includes(mode)) addPlan(task, report.plan);
  for (const evidence of report.evidence ?? []) addEvidence(task, evidence);
  if (["implement", "revise"].includes(mode)) task.stage = "review";
}
export function ingest(store: Store, input: unknown, targetTaskId?: string) {
  const data = signalInput.parse(input);
  return store.db.transaction(() => {
    const existing = store
      .signals()
      .find((s) => s.provider === data.provider && s.externalId === data.externalId);
    if (existing) return { task: store.task(existing.taskId), duplicate: true };
    const matches = store
      .projects()
      .filter((p) =>
        p.mappings.some(
          (m) => m.provider === data.provider && m.externalId === data.externalProjectId,
        ),
      );
    const task = targetTaskId
      ? store.task(targetTaskId)
      : store.createTask(
          {
            title: data.title,
            description: data.body,
            projectId: matches.length === 1 ? matches[0].id : null,
            kind: data.provider === "sentry" ? "bug" : "question",
          },
          data.provider,
        );
    const signal = { ...data, id: id(), taskId: task.id, receivedAt: now() };
    store.db
      .query("INSERT INTO signals VALUES (?,?,?,?,?)")
      .run(signal.id, data.provider, data.externalId, task.id, JSON.stringify(signal));
    store.changed();
    return { task, duplicate: false };
  })();
}
export const taskCommand = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("stage"),
    stage: z.enum(["inbox", "triage", "planning", "in_progress", "review"]),
  }),
  z.object({ type: z.literal("summary"), summary: z.string().max(20000) }),
  z.object({ type: z.literal("assign"), projectId: z.string() }),
  z.object({ type: z.literal("plan"), plan: planInput }),
  z.object({ type: z.literal("approve"), version: z.number().int().positive() }),
  z.object({ type: z.literal("question"), question: questionInput }),
  z.object({
    type: z.literal("answer"),
    questionId: z.string(),
    answer: z.string().trim().min(1).max(10000),
    answeredBy: z.enum(["operator", "client"]),
  }),
  z.object({ type: z.literal("evidence"), evidence: evidenceInput }),
  z.object({
    type: z.literal("review_evidence"),
    evidenceId: z.string(),
    decision: z.enum(["accepted", "changes_requested"]),
    comment: z.string().max(10000).default(""),
  }),
  z.object({
    type: z.literal("annotate"),
    evidenceId: z.string(),
    comment: z.string().trim().min(1).max(10000),
    x: z.number().min(0).max(100).optional(),
    y: z.number().min(0).max(100).optional(),
  }),
  z.object({ type: z.literal("accept_review"), revision: z.string().min(1) }),
  z.object({ type: z.literal("deliver"), note: z.string().trim().min(1).max(10000) }),
  z.object({ type: z.literal("message"), text: z.string().trim().min(1).max(20000) }),
  z.object({
    type: z.literal("resolve_run"),
    runId: z.string(),
    note: z.string().trim().min(1).max(4000),
  }),
]);
export type TaskCommand = z.infer<typeof taskCommand>;
export function command(store: Store, taskId: string, input: TaskCommand, revision: number) {
  const cmd = taskCommand.parse(input);
  return store.update(
    taskId,
    (task) => {
      const lastRun = task.runs.at(-1);
      if (["plan", "evidence", "summary"].includes(cmd.type) && lastRun?.status === "succeeded")
        lastRun.error = null;
      if (!["message", "annotate", "resolve_run"].includes(cmd.type)) requireIdle(task);
      switch (cmd.type) {
        case "stage":
          transition(task, cmd.stage);
          break;
        case "summary":
          task.summary = cmd.summary;
          activity(task, "Samenvatting bijgewerkt");
          break;
        case "assign":
          store.project(cmd.projectId);
          invalidate(task);
          task.projectId = cmd.projectId;
          activity(task, "Projectkoppeling gewijzigd");
          break;
        case "plan":
          addPlan(task, cmd.plan);
          break;
        case "approve":
          approve(task, cmd.version);
          break;
        case "question":
          addQuestion(task, cmd.question);
          break;
        case "answer": {
          const question = task.questions.find((q) => q.id === cmd.questionId);
          if (!question) throw new AppError("Vraag niet gevonden", 404);
          question.answer = cmd.answer;
          question.answeredBy = cmd.answeredBy;
          question.answeredAt = now();
          if (question.blocks !== "none") invalidate(task);
          activity(task, "Vraag beantwoord; controleer het plan bij gewijzigde scope");
          break;
        }
        case "evidence":
          addEvidence(task, cmd.evidence);
          break;
        case "review_evidence": {
          const evidence = task.evidence.find((e) => e.id === cmd.evidenceId);
          if (!evidence) throw new AppError("Bewijs niet gevonden", 404);
          evidence.review = cmd.decision;
          task.review = null;
          task.delivery = null;
          if (["done", "delivery"].includes(task.stage)) task.stage = "review";
          if (cmd.comment)
            evidence.comments.push({ id: id(), text: cmd.comment, createdAt: now() });
          activity(
            task,
            `${cmd.decision === "accepted" ? "Bewijs geaccepteerd" : "Aanpassing gevraagd"}: ${evidence.title}`,
          );
          break;
        }
        case "annotate": {
          const evidence = task.evidence.find((e) => e.id === cmd.evidenceId);
          if (!evidence) throw new AppError("Bewijs niet gevonden", 404);
          evidence.comments.push({
            id: id(),
            text: cmd.comment,
            x: cmd.x,
            y: cmd.y,
            createdAt: now(),
          });
          activity(task, `Opmerking bij ${evidence.title}`);
          break;
        }
        case "accept_review":
          acceptReview(task, cmd.revision);
          break;
        case "deliver":
          if (
            !task.review ||
            task.stage !== "delivery" ||
            task.review.planVersion !== currentPlan(task)?.version
          )
            throw new AppError("Accepteer eerst de actuele review", 409);
          if (task.questions.some((q) => !q.answer && q.blocks !== "none"))
            throw new AppError("Beantwoord eerst de blokkerende vragen", 409);
          task.delivery = { note: cmd.note, deliveredAt: now() };
          task.stage = "done";
          activity(task, "Oplevering vastgelegd");
          break;
        case "message":
          task.messages.push({ id: id(), author: "operator", text: cmd.text, createdAt: now() });
          activity(task, "Bericht toegevoegd aan taakcontext");
          break;
        case "resolve_run": {
          const run = task.runs.find((r) => r.id === cmd.runId);
          if (run?.status !== "interrupted")
            throw new AppError("Alleen onderbroken uitvoeringen kunnen worden afgehandeld", 409);
          run.status = "failed";
          run.error = `Handmatig afgehandeld: ${cmd.note}`;
          run.finishedAt = now();
          activity(task, run.error);
          break;
        }
      }
    },
    revision,
  );
}
