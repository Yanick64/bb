import { createHash, randomBytes } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { activeRun, evidenceInput, planInput, questionInput } from "../shared/domain";
import { AppError, type Store } from "./store";
import { secureEqual } from "./webhooks";
import { addEvidence, addPlan, addQuestion } from "./workflow";

export function createProjectToken(store: Store, projectId: string) {
  store.project(projectId);
  const token = randomBytes(32).toString("hex");
  store.setSetting(`mcp_token:${projectId}`, createHash("sha256").update(token).digest("hex"));
  return token;
}
export async function handleMcp(store: Store, request: Request, projectId: string) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const expected = store.setting(`mcp_token:${projectId}`);
  if (!expected || !secureEqual(expected, createHash("sha256").update(token).digest("hex")))
    throw new AppError("MCP-token ongeldig", 401);
  const server = new McpServer({ name: "bb", version: "0.1.0" });
  function scoped(taskId: string) {
    const task = store.task(taskId);
    if (task.projectId !== projectId) throw new AppError("Taak hoort niet bij dit project", 403);
    return task;
  }
  const result = (value: unknown) => ({
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
  });
  server.registerTool(
    "get_task",
    {
      description:
        "Read a BB task, its plan, questions and review feedback. Access is limited to this project.",
      inputSchema: { taskId: z.string() },
    },
    ({ taskId }) => result(scoped(taskId)),
  );
  server.registerTool(
    "ask_question",
    {
      description:
        "Register a clarification question. Never answers or approves on behalf of the operator.",
      inputSchema: { taskId: z.string(), question: questionInput },
    },
    ({ taskId, question }) => {
      scoped(taskId);
      return result(store.update(taskId, (task) => addQuestion(task, question)));
    },
  );
  server.registerTool(
    "propose_plan",
    {
      description:
        "Propose an unapproved plan during a BB triage/planning run. Human approval is separate.",
      inputSchema: { taskId: z.string(), plan: planInput },
    },
    ({ taskId, plan }) => {
      const task = scoped(taskId);
      const run = activeRun(task);
      if (!run || !["triage", "plan"].includes(run.mode))
        throw new AppError("Geen actieve planningsuitvoering", 409);
      return result(store.update(taskId, (t) => addPlan(t, plan)));
    },
  );
  server.registerTool(
    "submit_evidence",
    {
      description:
        "Attach actual review evidence to this task. Does not approve it or mark the task done.",
      inputSchema: { taskId: z.string(), evidence: evidenceInput },
    },
    ({ taskId, evidence }) => {
      scoped(taskId);
      return result(store.update(taskId, (task) => addEvidence(task, evidence)));
    },
  );
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    await server.close();
  }
}
