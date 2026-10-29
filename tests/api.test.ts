import { afterEach, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { createApp } from "../server/app";
import { imageExtension } from "../server/artifacts";
import { Connectors, normalizeOrbitTicket, parseOrbitProjects } from "../server/connectors";
import { createProjectToken } from "../server/mcp";
import { Store } from "../server/store";
import { processReceipt, receive, verifyWebhook } from "../server/webhooks";
import { projectInput, type Task } from "../shared/domain";

const stores: Store[] = [];
function setup(password?: string, publicUrl?: string) {
  const store = new Store();
  stores.push(store);
  const connectors = new Connectors({ sentryUrl: "https://sentry.io" });
  const app = createApp(store, connectors, {
    dataDir: "./data/test",
    ampEnabled: false,
    password,
    publicUrl,
    webhookSecret: "test-webhook-secret",
  });
  const request = (path: string, body?: unknown, headers: Record<string, string> = {}) =>
    app.request(
      `http://localhost${path}`,
      body === undefined
        ? { headers }
        : {
            method: "POST",
            headers: { "Content-Type": "application/json", ...headers },
            body: JSON.stringify(body),
          },
    );
  return { store, app, request, connectors };
}
afterEach(() => {
  for (const store of stores.splice(0)) store.db.close();
});

test("API enforces auth, sets an httpOnly cookie and rejects cross-origin writes", async () => {
  const { request } = setup("test-password");
  expect((await request("/api/state")).status).toBe(401);
  expect((await request("/api/login", { password: "wrong" })).status).toBe(401);
  const response = await request("/api/login", { password: "test-password" });
  const cookie = response.headers.get("set-cookie") ?? "";
  expect(cookie).toContain("HttpOnly");
  expect((await request("/api/state", undefined, { cookie })).status).toBe(200);
  expect(
    (await request("/api/tasks", { title: "Forged" }, { cookie, origin: "https://evil.example" }))
      .status,
  ).toBe(403);
});
test("rejects DNS rebinding hostnames", async () => {
  const { app } = setup();
  expect((await app.request("http://evil.example/api/state")).status).toBe(403);
});
test("authenticated webhook probes verify the route without creating receipts or tasks", async () => {
  const { store, request } = setup();
  const probe = crypto.randomUUID();
  expect((await request("/api/webhooks/orbit", { probe })).status).toBe(401);
  const response = await request(
    "/api/webhooks/orbit",
    { probe },
    { authorization: "Bearer test-webhook-secret" },
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, probe });
  expect(await (await request("/api/webhook-receipts")).json()).toEqual([]);
  expect(store.tasks()).toEqual([]);
});
test("webhook-only public host admits authenticated receipts but not the application", async () => {
  const store = new Store();
  stores.push(store);
  const app = createApp(store, new Connectors({ sentryUrl: "https://sentry.io" }), {
    dataDir: "./data/test",
    ampEnabled: false,
    webhookUrl: "https://hooks.example:10000/api/webhooks/orbit",
    webhookSecret: "test-webhook-secret",
  });
  const url = "http://hooks.example:10000/api/webhooks/orbit";
  const body = JSON.stringify({ ticketId: "TC0000000000001" });
  expect((await app.request(url, { method: "POST", body })).status).toBe(401);
  expect(
    (
      await app.request(url, {
        method: "POST",
        body,
        headers: { authorization: "Bearer test-webhook-secret" },
      })
    ).status,
  ).toBe(202);
  expect((await app.request("http://hooks.example:10000/api/state")).status).toBe(403);
  expect((await app.request("http://hooks.example:10000/api/webhooks/orbit/../state")).status).toBe(
    403,
  );
  expect((await app.request("http://hooks.example:10000/")).status).toBe(403);
  expect(
    (await app.request("http://hooks.example/api/webhooks/orbit", { method: "POST", body })).status,
  ).toBe(403);
});
test("HTTPS public origin works behind an HTTP reverse proxy with secure login cookies", async () => {
  const { app } = setup("test-password", "https://preview.example");
  const auth = await app.request("http://preview.example/api/auth");
  expect(auth.status).toBe(200);
  expect(await auth.json()).toEqual({ required: true, authenticated: false });
  const login = await app.request("http://preview.example/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://preview.example" },
    body: JSON.stringify({ password: "test-password" }),
  });
  expect(login.status).toBe(200);
  const cookie = login.headers.get("set-cookie") ?? "";
  expect(cookie).toContain("Secure");
  expect(
    (await app.request("http://preview.example/api/state", { headers: { cookie } })).status,
  ).toBe(200);
  expect((await app.request("http://preview.example:9999/api/auth")).status).toBe(403);
  expect(
    (
      await app.request("http://evil.example/api/auth", {
        headers: { "X-Forwarded-Host": "preview.example" },
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await app.request("http://preview.example/api/auth", {
        headers: { Origin: "https://evil.example" },
      })
    ).status,
  ).toBe(403);
});
test("full HTTP lifecycle from manual intake to delivery", async () => {
  const { request } = setup();
  const project = await (await request("/api/projects", { name: "Client platform" })).json();
  let task: Task = await (
    await request("/api/tasks", {
      title: "Answer a customer question",
      projectId: project.id,
      kind: "question",
    })
  ).json();
  async function send(command: unknown) {
    const response = await request(`/api/tasks/${task.id}/commands`, {
      revision: task.revision,
      command,
    });
    expect(response.status).toBe(200);
    task = await response.json();
  }
  await send({
    type: "plan",
    plan: { summary: "Prepare answer", steps: ["Research"], criteria: ["Includes a source"] },
  });
  await send({ type: "approve", version: 1 });
  await send({
    type: "evidence",
    evidence: {
      title: "Answer",
      kind: "document",
      notes: "The answer, citing https://example.com",
      revision: "draft-1",
      criterion: "Includes a source",
    },
  });
  await send({ type: "review_evidence", evidenceId: task.evidence[0].id, decision: "accepted" });
  await send({ type: "accept_review", revision: "draft-1" });
  await send({ type: "deliver", note: "Delivered through the client's ticket" });
  expect(task.stage).toBe("done");
});
test("webhook authenticates before persisting and normalizes retries once", async () => {
  const { request, store, connectors } = setup();
  const signal = { provider: "orbit", externalId: "TC0000000000001", title: "Webhook question" };
  expect((await request("/api/webhooks/orbit", signal)).status).toBe(401);
  expect(store.tasks()).toHaveLength(0);
  const headers = { authorization: "Bearer test-webhook-secret" };
  const first = await (await request("/api/webhooks/orbit", signal, headers)).json();
  const second = await (await request("/api/webhooks/orbit", signal, headers)).json();
  expect(first.receiptId).toBe(second.receiptId);
  await processReceipt(store, connectors, first.receiptId);
  await processReceipt(store, connectors, second.receiptId);
  expect(store.tasks()).toHaveLength(1);
});
test("unknown webhook format remains inspectable rather than being dropped", async () => {
  const { store, connectors } = setup();
  const receipt = receive(store, { some_new_shape: 1 });
  const processed = await processReceipt(store, connectors, receipt.id);
  expect(processed.status).toBe("needs_mapping");
  expect(processed.payload).toEqual({ some_new_shape: 1 });
  expect(store.tasks()).toHaveLength(0);
});
test("HMAC verifies the exact body and rejects tampering", () => {
  const raw = '{"ticketId":"TC0000000000001"}';
  const sig = `sha256=${createHmac("sha256", "secret").update(raw).digest("hex")}`;
  expect(() => verifyWebhook(raw, "secret", undefined, sig)).not.toThrow();
  expect(() => verifyWebhook(`${raw} `, "secret", undefined, sig)).toThrow();
});
test("MCP rejects other projects and does not expose approval tools", async () => {
  const { app, store } = setup();
  const project = store.saveProject(projectInput.parse({ name: "First" }));
  const other = store.saveProject(projectInput.parse({ name: "Second" }));
  const task = store.createTask({ title: "Private", projectId: other.id });
  const token = createProjectToken(store, project.id);
  const mcp = (body: unknown, key = token) =>
    app.request(`http://localhost/mcp/${project.id}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, ...(body as object) }),
    });
  expect((await mcp({ method: "tools/list" }, "wrong")).status).toBe(401);
  const listed = await (await mcp({ method: "tools/list" })).json();
  expect(listed.result.tools.map((t: { name: string }) => t.name)).toEqual([
    "get_task",
    "ask_question",
    "propose_plan",
    "submit_evidence",
  ]);
  const read = await (
    await mcp({
      method: "tools/call",
      params: { name: "get_task", arguments: { taskId: task.id } },
    })
  ).json();
  expect(read.result.isError).toBe(true);
  expect(JSON.stringify(read)).not.toContain("Private");
});
test("Orbit parser validates identity alignment and accepts the observed table format", () => {
  const table =
    "Found 31 project(s) — showing page 1 (1 rows, pageSize 30):\n\n| Project | Name | Client | Owner | State | Billing | Budget | Invoiced | Remaining | End |\n|---|---|---|---|---|---|---:|---:|---:|---|\n| 123 | Example site | Example client | Owner | OPEN | HOURS | 0 | 0 | 0 | 2026-10-29 |\napi_ids: PR0000000000001";
  const result = parseOrbitProjects(table);
  expect(result.projects[0]).toEqual({
    provider: "orbit",
    scope: "project",
    externalId: "PR0000000000001",
    name: "Example site",
    client: "Example client",
  });
  expect(result.hasMore).toBe(true);
  expect(() => parseOrbitProjects(table.replace("PR0000000000001", ""))).toThrow();
  expect(
    normalizeOrbitTicket({ ticketId: "TC0000000000001", name: "Question", projectId: null })
      .externalProjectId,
  ).toBe("");
});
test("disabled Amp never starts a thread from an API request", async () => {
  const { request, store } = setup();
  const task = store.createTask({ title: "No remote execution" });
  expect(
    (await request(`/api/tasks/${task.id}/runs`, { revision: 1, mode: "triage" })).status,
  ).toBe(503);
  expect(store.task(task.id).runs).toHaveLength(0);
});
test("image uploads reject HTML and SVG masquerading as screenshots", () => {
  expect(() => imageExtension(new TextEncoder().encode("<svg onload='alert(1)'/>"))).toThrow();
  expect(() => imageExtension(new TextEncoder().encode("<html>not an image</html>"))).toThrow();
  expect(imageExtension(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]))).toBe("png");
});
test("local Orbit catalog is explicitly a snapshot and contains no financial columns", async () => {
  const { request, store } = setup();
  const page =
    "Found 1 project(s) — showing page 1 (1 rows, pageSize 30):\n| 123 | Example site | Example client | Owner | OPEN | HOURS | 999.99 | 0 | 999.99 | 2026-10-29 |\napi_ids: PR0000000000001";
  expect((await request("/api/sources/orbit/catalog", { pages: [page] })).status).toBe(200);
  const response = await (await request("/api/sources/orbit/projects?q=Example&page=1")).json();
  expect(response.projects).toHaveLength(1);
  expect(response.snapshotAt).toBeTruthy();
  expect(store.setting("catalog:orbit")).not.toContain("999.99");
});
