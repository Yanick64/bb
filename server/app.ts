import { createHmac, randomBytes } from "node:crypto";
import { join } from "node:path";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { serveStatic } from "hono/bun";
import { setCookie } from "hono/cookie";
import { streamSSE } from "hono/streaming";
import { ZodError, z } from "zod";
import { mappingSchema, projectInput, taskInput } from "../shared/domain";
import { commandAndContinue, enqueue } from "./amp";
import { listAmpProjects, validateAmpProject } from "./amp-projects";
import { saveImage } from "./artifacts";
import {
  type Connectors,
  parseOrbitClients,
  parseOrbitProjects,
  type SourceProject,
} from "./connectors";
import { seedDemo } from "./demo";
import { createProjectToken, handleMcp } from "./mcp";
import { AppError, type Store } from "./store";
import {
  processReceipt,
  receipts,
  receive,
  saveReceipt,
  secureEqual,
  verifyWebhook,
} from "./webhooks";
import { ingest, taskCommand } from "./workflow";

export type AppConfig = {
  dataDir: string;
  password?: string;
  publicUrl?: string;
  ampEnabled: boolean;
  webhookSecret?: string;
  webhookUrl?: string;
};
export function createApp(store: Store, connectors: Connectors, config: AppConfig) {
  const app = new Hono();
  const publicUrl = config.publicUrl ? new URL(config.publicUrl) : null;
  const webhookUrl = config.webhookUrl ? new URL(config.webhookUrl) : null;
  if (
    webhookUrl &&
    (webhookUrl.protocol !== "https:" ||
      webhookUrl.pathname !== "/api/webhooks/orbit" ||
      webhookUrl.search ||
      webhookUrl.hash ||
      webhookUrl.username ||
      webhookUrl.password)
  )
    throw new Error("BB_WEBHOOK_URL must be an HTTPS URL ending in /api/webhooks/orbit");
  const sessionSecret = store.setting("session_secret") ?? randomBytes(32).toString("hex");
  store.setSetting("session_secret", sessionSecret);
  const signature = (value: string) =>
    createHmac("sha256", sessionSecret + (config.password ?? ""))
      .update(value)
      .digest("hex");
  const loginAttempts = new Map<string, { count: number; until: number }>();
  function catalog(provider: string): { projects: SourceProject[]; capturedAt: string } | null {
    const value = store.setting(`catalog:${provider}`);
    return value ? JSON.parse(value) : null;
  }
  app.use(
    "*",
    bodyLimit({
      maxSize: 12 * 1024 * 1024,
      onError: (c) => c.json({ error: "Bestand te groot. Maximaal 10 MB per afbeelding." }, 413),
    }),
  );
  app.use("*", async (c, next) => {
    const url = new URL(c.req.url);
    const publicOrigin = publicUrl?.origin;
    // TLS may terminate at a proxy. Match the configured host and port without
    // trusting client-supplied forwarded headers or the internal HTTP scheme.
    const allowed =
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
      url.host === publicUrl?.host ||
      (c.req.method === "POST" &&
        c.req.path === "/api/webhooks/orbit" &&
        url.host === webhookUrl?.host);
    if (!allowed) return c.json({ error: "Host niet toegestaan. Stel BB_PUBLIC_URL in." }, 403);
    const origin = c.req.header("origin");
    if (
      origin &&
      origin !== url.origin &&
      origin !== publicOrigin &&
      !["http://localhost:5173", "http://127.0.0.1:5173"].includes(origin)
    )
      return c.json({ error: "Origin niet toegestaan" }, 403);
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer");
    c.header("X-Frame-Options", "DENY");
    if (c.req.path.startsWith("/api")) c.header("Cache-Control", "no-store");
    await next();
  });
  app.get("/api/auth", (c) =>
    c.json({
      required: Boolean(config.password),
      authenticated: authenticated(c.req.header("cookie")),
    }),
  );
  function authenticated(cookieHeader?: string) {
    if (!config.password) return true;
    const cookie = cookieHeader?.match(/(?:^|;\s*)bb_session=([^;]+)/)?.[1];
    if (!cookie) return false;
    const [expires, sig] = cookie.split(".");
    return Number(expires) > Date.now() && secureEqual(sig ?? "", signature(expires));
  }
  app.post("/api/login", async (c) => {
    const key = "operator";
    const attempt = loginAttempts.get(key);
    if (attempt && attempt.until > Date.now() && attempt.count >= 10)
      return c.json({ error: "Probeer over 5 minuten opnieuw" }, 429);
    const { password } = z.object({ password: z.string().max(1000) }).parse(await c.req.json());
    if (!config.password || !secureEqual(password, config.password)) {
      loginAttempts.set(key, {
        count: attempt && attempt.until > Date.now() ? attempt.count + 1 : 1,
        until: Date.now() + 300000,
      });
      return c.json({ error: "Wachtwoord onjuist" }, 401);
    }
    loginAttempts.delete(key);
    const expires = String(Date.now() + 7 * 86400000);
    setCookie(c, "bb_session", `${expires}.${signature(expires)}`, {
      httpOnly: true,
      sameSite: "Strict",
      secure: publicUrl?.protocol === "https:" || new URL(c.req.url).protocol === "https:",
      path: "/",
      maxAge: 7 * 86400,
    });
    return c.json({ ok: true });
  });
  app.post("/api/webhooks/orbit", async (c) => {
    const raw = await c.req.text();
    if (raw.length > 1_000_000) throw new AppError("Webhook te groot", 413);
    verifyWebhook(
      raw,
      config.webhookSecret,
      c.req.header("authorization"),
      c.req.header("x-bb-signature"),
    );
    const payload = JSON.parse(raw);
    if (z.object({ probe: z.string().uuid() }).strict().safeParse(payload).success)
      return c.json({ ok: true, probe: payload.probe });
    const receipt = receive(store, payload);
    return c.json({ receiptId: receipt.id, status: receipt.status }, 202);
  });
  app.all("/mcp/:projectId", (c) => handleMcp(store, c.req.raw, c.req.param("projectId")));
  app.get("/api/sentry/oauth/callback", async (c) => {
    if (!connectors.sentryMcp) throw new AppError("Sentry MCP is niet ingesteld", 503);
    const { state, code } = z
      .object({ state: z.string().min(1), code: z.string().min(1) })
      .parse(c.req.query());
    await connectors.sentryMcp.callback(state, code);
    return c.redirect("/?view=connections");
  });
  app.get("/api/orbit/oauth/callback", async (c) => {
    if (!connectors.orbitMcp) throw new AppError("Teamleader Orbit OAuth is niet ingesteld", 503);
    const { state, code } = z
      .object({ state: z.string().min(1), code: z.string().min(1) })
      .parse(c.req.query());
    await connectors.orbitMcp.callback(state, code);
    await connectors.clients("", 1);
    return c.redirect("/?view=connections");
  });
  app.use("/api/*", async (c, next) => {
    if (!authenticated(c.req.header("cookie"))) return c.json({ error: "Log eerst in" }, 401);
    await next();
  });
  app.use("/uploads/*", async (c, next) => {
    if (!authenticated(c.req.header("cookie"))) return c.json({ error: "Log eerst in" }, 401);
    await next();
  });
  app.post("/api/sentry/oauth/start", async (c) => {
    if (!connectors.sentryMcp) throw new AppError("Stel SENTRY_MCP_URL en SENTRY_ORG in", 503);
    return c.json({ url: await connectors.sentryMcp.authorize() });
  });
  app.post("/api/orbit/oauth/start", async (c) => {
    if (!connectors.orbitMcp)
      throw new AppError("Stel de officiële ORBIT_MCP_URL in voor OAuth", 503);
    const url = await connectors.orbitMcp.authorize();
    if (!url) await connectors.clients("", 1);
    return c.json({ url });
  });
  app.get("/api/state", (c) =>
    c.json({
      projects: store.projects(),
      members: store.members(),
      tasks: store
        .tasks()
        .map((t) => ({ ...t, runs: t.runs.map((r) => ({ ...r, prompt: "", result: "" })) })),
      connections: {
        ...connectors.status,
        amp: config.ampEnabled,
        webhook: Boolean(config.webhookSecret),
        webhookUrl:
          config.webhookUrl ?? (config.publicUrl ? `${config.publicUrl}/api/webhooks/orbit` : ""),
        publicUrl: config.publicUrl ?? "",
        orbitCatalog: catalog("orbit:clients")
          ? {
              count: catalog("orbit:clients")?.projects.length ?? 0,
              capturedAt: catalog("orbit:clients")?.capturedAt ?? "",
            }
          : null,
      },
    }),
  );
  app.get("/api/events", (c) =>
    streamSSE(c, async (stream) => {
      let pending = true;
      const changed = () => {
        pending = true;
      };
      store.listeners.add(changed);
      stream.onAbort(() => {
        store.listeners.delete(changed);
      });
      try {
        while (!stream.aborted) {
          await stream.writeSSE({ event: pending ? "change" : "heartbeat", data: "{}" });
          pending = false;
          await stream.sleep(1500);
        }
      } finally {
        store.listeners.delete(changed);
      }
    }),
  );
  app.post("/api/demo", (c) => c.json(seedDemo(store), 201));
  app.post("/api/members", async (c) => {
    const { name } = z
      .object({ name: z.string().trim().min(1).max(100) })
      .parse(await c.req.json());
    return c.json(store.addMember(name), 201);
  });
  app.post("/api/projects", async (c) =>
    c.json(store.saveProject(projectInput.parse(await c.req.json())), 201),
  );
  app.put("/api/projects/:id", async (c) =>
    c.json(store.saveProject(projectInput.parse(await c.req.json()), c.req.param("id"))),
  );
  app.post("/api/projects/:id/mcp-token", (c) =>
    c.json({
      token: createProjectToken(store, c.req.param("id")),
      endpoint: `${config.publicUrl ?? "http://localhost:4310"}/mcp/${c.req.param("id")}`,
    }),
  );
  app.post("/api/projects/:id/sync", async (c) =>
    c.json(await connectors.sync(store, c.req.param("id"))),
  );
  app.get("/api/sources/:provider/projects", async (c) => {
    const provider = z.enum(["orbit", "sentry"]).parse(c.req.param("provider"));
    const snapshot = catalog(provider);
    if (!connectors.status[provider] && snapshot) {
      const query = (c.req.query("q") ?? "").toLocaleLowerCase();
      const page = z.coerce
        .number()
        .int()
        .min(1)
        .parse(c.req.query("page") ?? 1);
      const matching = snapshot.projects.filter((p) =>
        `${p.name} ${p.client}`.toLocaleLowerCase().includes(query),
      );
      return c.json({
        projects: matching.slice((page - 1) * 30, page * 30),
        hasMore: matching.length > page * 30,
        snapshotAt: snapshot.capturedAt,
      });
    }
    return c.json(
      await connectors.projects(
        provider,
        (c.req.query("q") ?? "").slice(0, 200),
        z.coerce
          .number()
          .int()
          .min(1)
          .max(10000)
          .parse(c.req.query("page") ?? 1),
      ),
    );
  });
  app.get("/api/sources/orbit/clients", async (c) => {
    const query = (c.req.query("q") ?? "").slice(0, 200);
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(10000)
      .parse(c.req.query("page") ?? 1);
    const snapshot = catalog("orbit:clients");
    const local = () => {
      if (!snapshot) throw new AppError("Geen lokale klantencatalogus beschikbaar", 503);
      const matching = snapshot.projects.filter((p) =>
        `${p.name} ${p.externalId}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
      );
      return c.json({
        clients: matching.slice((page - 1) * 30, page * 30),
        hasMore: matching.length > page * 30,
        snapshotAt: snapshot.capturedAt,
        warning: connectors.status.orbitError,
      });
    };
    if ((!connectors.status.orbitConfigured || connectors.status.orbitError) && snapshot)
      return local();
    try {
      return c.json(await connectors.clients(query, page));
    } catch (error) {
      if (snapshot) return local();
      throw error;
    }
  });
  app.post("/api/sources/orbit/check", async (c) => {
    await connectors.clients("", 1);
    return c.json({ ok: true });
  });
  app.post("/api/sources/orbit/clients/catalog", async (c) => {
    const { pages } = z
      .object({ pages: z.array(z.string().max(500000)).min(1).max(100) })
      .parse(await c.req.json());
    const clients = pages.flatMap((page) => parseOrbitClients(page).clients);
    const projects = [...new Map(clients.map((p) => [p.externalId, p])).values()];
    const capturedAt = new Date().toISOString();
    store.setSetting("catalog:orbit:clients", JSON.stringify({ projects, capturedAt }));
    store.changed();
    return c.json({ count: projects.length, capturedAt });
  });
  app.post("/api/sources/sentry/catalog", async (c) => {
    const { projects } = z
      .object({
        projects: z
          .array(mappingSchema.refine((m) => m.provider === "sentry" && m.scope === "project"))
          .max(500),
      })
      .parse(await c.req.json());
    const capturedAt = new Date().toISOString();
    store.setSetting("catalog:sentry", JSON.stringify({ projects, capturedAt }));
    store.changed();
    return c.json({ count: projects.length, capturedAt });
  });
  app.post("/api/sources/orbit/catalog", async (c) => {
    const { pages } = z
      .object({ pages: z.array(z.string().max(500000)).min(1).max(100) })
      .parse(await c.req.json());
    const projects = pages.flatMap((page) => parseOrbitProjects(page).projects);
    const unique = [...new Map(projects.map((p) => [p.externalId, p])).values()];
    const snapshot = { projects: unique, capturedAt: new Date().toISOString() };
    store.setSetting("catalog:orbit", JSON.stringify(snapshot));
    store.changed();
    return c.json({ count: unique.length, capturedAt: snapshot.capturedAt });
  });
  app.post("/api/tasks", async (c) =>
    c.json(store.createTask(taskInput.parse(await c.req.json())), 201),
  );
  app.post("/api/tasks/:id/commands", async (c) => {
    const input = z
      .object({ revision: z.number().int().positive(), command: taskCommand })
      .parse(await c.req.json());
    return c.json(
      commandAndContinue(
        store,
        c.req.param("id"),
        input.command,
        input.revision,
        config.ampEnabled,
      ),
    );
  });
  app.post("/api/tasks/:id/runs", async (c) => {
    if (!config.ampEnabled)
      throw new AppError("Schakel Amp in met BB_AMP_ENABLED=true nadat de CLI is aangemeld", 503);
    const data = z
      .object({
        mode: z.enum(["triage", "plan", "implement", "revise", "review", "delivery"]),
        instruction: z.string().max(20000).default(""),
        revision: z.number().int().positive(),
      })
      .parse(await c.req.json());
    const task = store.task(c.req.param("id"));
    if (task.revision !== data.revision)
      throw new AppError("De taak is intussen gewijzigd. Controleer de actuele gegevens.", 409);
    if (task.projectId) await validateAmpProject(store.project(task.projectId).ampProject);
    if (["triage", "plan"].includes(data.mode))
      await connectors.refreshContext(store, task.id, false);
    return c.json(
      enqueue(store, c.req.param("id"), data.mode, data.instruction, data.revision),
      202,
    );
  });
  app.get("/api/tasks/:id/context", (c) => {
    store.task(c.req.param("id"));
    return c.json({
      signals: store.signals(c.req.param("id")),
      events: store.events(c.req.param("id")),
    });
  });
  app.get("/api/amp/projects", async (c) => c.json({ projects: await listAmpProjects() }));
  app.post("/api/connections/amp/check", async (c) =>
    c.json({ ok: true, projects: (await listAmpProjects()).length }),
  );
  app.post("/api/connections/sentry/check", async (c) => {
    await connectors.projects("sentry", "", 1);
    return c.json({ ok: true });
  });
  app.post("/api/connections/webhook/check", async (c) => {
    if (!config.webhookSecret || !webhookUrl)
      throw new AppError(
        "Stel BB_WEBHOOK_URL en BB_ORBIT_WEBHOOK_SECRET in en herstart de werkplek.",
        503,
      );
    const probe = crypto.randomUUID();
    const response = await fetch(webhookUrl, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(10000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.webhookSecret}`,
      },
      body: JSON.stringify({ probe }),
    }).catch(() => {
      throw new AppError(
        "De publieke webhook is niet bereikbaar. Controleer Tailscale Funnel en de ingestelde URL.",
        502,
      );
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.probe !== probe)
      throw new AppError(
        `Webhookcontrole mislukt (${response.status}). Controleer de route en het webhookgeheim.`,
        502,
      );
    return c.json({ ok: true });
  });
  app.post("/api/connections/mail/check", async (c) => {
    if (!connectors.googleMail) throw new AppError("Google Workspace MCP is niet ingesteld", 503);
    return c.json(await connectors.googleMail.check());
  });
  app.get("/api/mail", async (c) => {
    if (!connectors.googleMail) throw new AppError("Google Workspace MCP is niet ingesteld", 503);
    const result = await connectors.googleMail.search(
      (c.req.query("q") || "in:inbox -in:drafts").slice(0, 1000),
      c.req.query("page"),
    );
    const signals = store.signals();
    return c.json({
      ...result,
      messages: result.messages.map((m) => ({
        ...m,
        url: `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(connectors.googleMail?.email ?? "")}#all/${m.threadId}`,
        taskId:
          signals.find(
            (s) =>
              s.provider === "email" &&
              s.externalId === `${connectors.googleMail?.email}:${m.threadId}`,
          )?.taskId ?? null,
      })),
    });
  });
  app.post("/api/mail/import", async (c) => {
    if (!connectors.googleMail) throw new AppError("Google Workspace MCP is niet ingesteld", 503);
    const { threadId, projectId } = z
      .object({
        threadId: z.string().regex(/^[a-f0-9]+$/),
        projectId: z.string().nullable().default(null),
      })
      .parse(await c.req.json());
    if (projectId) store.project(projectId);
    const signal = await connectors.googleMail.thread(threadId);
    // Fetch first; commit the source and its destination atomically.
    const result = store.db.transaction(() => {
      const existing = store
        .signals()
        .find((s) => s.provider === "email" && s.externalId === signal.externalId);
      if (existing) return ingest(store, signal);
      const task = store.createTask(
        {
          title: signal.title,
          description: signal.body.slice(0, 20000),
          projectId,
          kind: "question",
        },
        "email",
      );
      return ingest(store, signal, task.id);
    })();
    return c.json(result, 201);
  });
  app.post("/api/tasks/:id/context/refresh", async (c) => {
    store.task(c.req.param("id"));
    return c.json(await connectors.refreshContext(store, c.req.param("id")));
  });
  app.post("/api/signals", async (c) => {
    const body = z
      .object({ signal: z.unknown(), taskId: z.string().optional() })
      .parse(await c.req.json());
    return c.json(ingest(store, body.signal, body.taskId), 201);
  });
  app.get("/api/webhook-receipts", (c) => c.json(receipts(store).toReversed()));
  app.post("/api/webhook-receipts/:id/process", async (c) =>
    c.json(await processReceipt(store, connectors, c.req.param("id"))),
  );
  app.post("/api/webhook-receipts/:id/map", async (c) => {
    const { ticketId } = z
      .object({ ticketId: z.string().regex(/^TC[A-Z0-9]{13}$/) })
      .parse(await c.req.json());
    const receipt = receipts(store).find((r) => r.id === c.req.param("id"));
    if (!receipt) throw new AppError("Webhook niet gevonden", 404);
    if (receipt.status === "processed") throw new AppError("Webhook is al verwerkt", 409);
    receipt.payload = { ticketId };
    receipt.status = "pending";
    receipt.error = null;
    saveReceipt(store, receipt);
    return c.json(await processReceipt(store, connectors, receipt.id));
  });
  app.post("/api/uploads", async (c) => {
    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File) || file.size > 10 * 1024 * 1024)
      throw new AppError("Kies een PNG-, JPEG- of WebP-afbeelding van maximaal 10 MB");
    return c.json(
      { url: await saveImage(config.dataDir, new Uint8Array(await file.arrayBuffer())) },
      201,
    );
  });
  app.get("/uploads/:filename", async (c) => {
    const name = z
      .string()
      .regex(/^[a-f0-9-]+\.(png|jpg|webp)$/)
      .parse(c.req.param("filename"));
    const file = Bun.file(join(config.dataDir, "uploads", name));
    if (!(await file.exists())) throw new AppError("Afbeelding niet gevonden", 404);
    return new Response(file, {
      headers: { "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=3600" },
    });
  });
  app.get("/api/*", (c) => c.json({ error: "Endpoint niet gevonden" }, 404));
  app.use("/*", serveStatic({ root: "./dist" }));
  app.get("*", serveStatic({ path: "./dist/index.html" }));
  app.onError((error, c) => {
    if (error instanceof ZodError)
      return c.json(
        { error: error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") },
        400,
      );
    if (error instanceof SyntaxError) return c.json({ error: "Ongeldige JSON" }, 400);
    if (error instanceof AppError) return c.json({ error: error.message }, error.status as 400);
    console.error("Request failed:", error.message);
    return c.json({ error: "Er ging iets mis. Je opgeslagen werk blijft bewaard." }, 500);
  });
  return app;
}
