import { z } from "zod";

export const stages = [
  "inbox",
  "triage",
  "planning",
  "in_progress",
  "review",
  "delivery",
  "done",
] as const;
export const stageLabels: Record<Stage, string> = {
  inbox: "Inbox",
  triage: "Triage",
  planning: "Planning",
  in_progress: "In uitvoering",
  review: "Review",
  delivery: "Oplevering",
  done: "Afgerond",
};
export const stageSchema = z.enum(stages);
export type Stage = z.infer<typeof stageSchema>;
export const sourceSchema = z.enum(["manual", "orbit", "sentry", "email"]);
export type Source = z.infer<typeof sourceSchema>;
export const text = z.string().trim().min(1).max(20000);
export const httpUrl = z
  .string()
  .url()
  .refine((v) => /^https?:\/\//.test(v), "Gebruik een http- of https-URL");
const optionalUrl = z.union([httpUrl, z.literal("")]).default("");
export const mappingSchema = z.object({
  provider: z.enum(["orbit", "sentry"]),
  externalId: text.max(200),
  name: text.max(500),
  client: z.string().max(300).default(""),
});
export const projectInput = z.object({
  name: text.max(120),
  description: z.string().max(4000).default(""),
  color: z.enum(["orange", "blue", "purple", "green", "rose"]).default("orange"),
  ampProject: z
    .string()
    .max(300)
    .regex(/^(?:[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)?$/, "Gebruik namespace/project")
    .default(""),
  repository: optionalUrl,
  qualityCommands: z.string().max(4000).default(""),
  mappings: z.array(mappingSchema).max(200).default([]),
});
export type ProjectInput = z.infer<typeof projectInput>;
export type Project = ProjectInput & { id: string; createdAt: string; demo: boolean };
export const taskInput = z.object({
  title: text.max(240),
  description: z.string().max(20000).default(""),
  projectId: z.string().nullable().default(null),
  kind: z.enum(["bug", "feature", "question", "maintenance", "investigation"]).default("feature"),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
});
export const questionInput = z.object({
  question: text.max(2000),
  reason: z.string().max(4000).default(""),
  recipient: z.enum(["operator", "client"]).default("operator"),
  blocks: z.enum(["none", "planning", "implementation", "delivery"]).default("implementation"),
  suggestion: z.string().max(4000).default(""),
});
export type Question = z.infer<typeof questionInput> & {
  id: string;
  answer: string | null;
  answeredBy: string | null;
  answeredAt: string | null;
};
export const planInput = z.object({
  summary: text,
  steps: z.array(text.max(4000)).min(1).max(30),
  criteria: z.array(text.max(2000)).min(1).max(30),
});
export type Plan = z.infer<typeof planInput> & {
  id: string;
  version: number;
  createdAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
};
export const evidenceInput = z.object({
  title: text.max(240),
  kind: z.enum(["screenshot", "preview", "pull_request", "test", "document"]),
  url: z
    .union([httpUrl, z.string().regex(/^\/uploads\/[a-f0-9-]+\.(png|jpg|webp)$/), z.literal("")])
    .default(""),
  notes: z.string().max(20000).default(""),
  revision: text.max(200),
  side: z.enum(["before", "after", "other"]).default("other"),
  criterion: z.string().max(2000).default(""),
  checkStatus: z
    .enum(["not_run", "running", "passed", "failed", "not_configured"])
    .default("not_run"),
});
export type Evidence = z.infer<typeof evidenceInput> & {
  reviewCycle: number;
  id: string;
  createdAt: string;
  planVersion: number | null;
  review: "pending" | "accepted" | "changes_requested";
  comments: { id: string; text: string; x?: number; y?: number; createdAt: string }[];
};
export const signalInput = z.object({
  provider: sourceSchema.exclude(["manual"]),
  externalId: text.max(300),
  externalProjectId: z.string().max(300).default(""),
  title: text.max(240),
  body: z.string().max(50000).default(""),
  url: optionalUrl,
  client: z.string().max(300).default(""),
});
export type Signal = z.infer<typeof signalInput> & {
  id: string;
  taskId: string;
  receivedAt: string;
};
export type Run = {
  projectId: string;
  ampProject: string;
  id: string;
  mode: "triage" | "plan" | "implement" | "revise";
  status: "queued" | "running" | "succeeded" | "failed" | "interrupted";
  threadId: string | null;
  planVersion: number | null;
  createdAt: string;
  finishedAt: string | null;
  error: string | null;
  prompt: string;
  result: string;
};
export type Task = z.infer<typeof taskInput> & {
  reviewCycle: number;
  id: string;
  number: number;
  stage: Stage;
  summary: string;
  revision: number;
  source: Source;
  createdAt: string;
  updatedAt: string;
  demo: boolean;
  questions: Question[];
  plans: Plan[];
  evidence: Evidence[];
  runs: Run[];
  messages: { id: string; author: "operator" | "amp"; text: string; createdAt: string }[];
  activity: { id: string; text: string; createdAt: string }[];
  review: { planVersion: number; revision: string; acceptedAt: string } | null;
  delivery: { note: string; deliveredAt: string } | null;
};
export type Action = {
  owner: "operator" | "client" | "amp" | "none";
  label: string;
  detail: string;
  tab: "overview" | "questions" | "plan" | "review" | "activity";
};
export function currentPlan(task: Task) {
  return task.plans.at(-1);
}
export function activeRun(task: Task) {
  return task.runs.find(
    (r) => r.status === "queued" || r.status === "running" || r.status === "interrupted",
  );
}
export function nextAction(task: Task): Action {
  const run = activeRun(task);
  if (run?.status === "interrupted")
    return {
      owner: "operator",
      label: "Controleer de Amp-thread",
      detail: "De verbinding is onderbroken. De orb kan nog actief zijn.",
      tab: "activity",
    };
  if (run)
    return {
      owner: "amp",
      label: run.status === "queued" ? "Wacht op een vrije uitvoerder" : "Amp werkt in de orb",
      detail: "Je kunt de thread volgen terwijl het werk doorgaat.",
      tab: "activity",
    };
  if (task.stage === "done")
    return {
      owner: "none",
      label: "Opgeleverd",
      detail: task.delivery?.note ?? "Deze taak is afgerond.",
      tab: "overview",
    };
  if (!task.projectId)
    return {
      owner: "operator",
      label: "Kies een project",
      detail: "Koppel deze taak aan het juiste BB-project.",
      tab: "overview",
    };
  const question = task.questions.find((q) => !q.answer && q.blocks !== "none");
  if (question)
    return {
      owner: question.recipient,
      label:
        question.recipient === "client"
          ? "Vraag de klant om verduidelijking"
          : "Beantwoord een open vraag",
      detail: question.question,
      tab: "questions",
    };
  const failed = task.runs.at(-1);
  if (failed?.status === "failed")
    return {
      owner: "operator",
      label: "Bekijk de mislukte uitvoering",
      detail: failed.error ?? "Controleer de thread voordat je opnieuw start.",
      tab: "activity",
    };
  if (task.stage === "inbox" || task.stage === "triage")
    return {
      owner: "operator",
      label: "Beoordeel de aanvraag",
      detail: "Maak een samenvatting en leg ontbrekende informatie vast.",
      tab: "overview",
    };
  const plan = currentPlan(task);
  if (!plan)
    return {
      owner: "operator",
      label: "Maak een uitvoeringsplan",
      detail: "Beschrijf de aanpak en de acceptatiecriteria.",
      tab: "plan",
    };
  if (!plan.approvedAt)
    return {
      owner: "operator",
      label: `Beoordeel plan v${plan.version}`,
      detail: "Controleer de scope voordat Amp aan het werk gaat.",
      tab: "plan",
    };
  if (task.stage === "delivery")
    return {
      owner: "operator",
      label: "Lever het resultaat op",
      detail: "Leg vast wat je hebt geleverd en aan wie.",
      tab: "overview",
    };
  if (task.stage === "review")
    return {
      owner: "operator",
      label: "Controleer het resultaat",
      detail: "Bekijk de preview, het bewijs en de acceptatiecriteria.",
      tab: "review",
    };
  return {
    owner: "operator",
    label: "Start het goedgekeurde werk",
    detail: `Plan v${plan.version} staat klaar voor Amp.`,
    tab: "plan",
  };
}
export const agentReport = z.object({
  summary: z.string().max(20000).optional(),
  questions: z.array(questionInput).max(30).optional(),
  plan: planInput.optional(),
  evidence: z.array(evidenceInput).max(50).optional(),
});
export type AgentReport = z.infer<typeof agentReport>;
