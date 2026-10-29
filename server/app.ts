import { createHmac, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { serveStatic } from "hono/bun";
import { setCookie } from "hono/cookie";
import { streamSSE } from "hono/streaming";
import { ZodError, z } from "zod";
import { projectInput, taskInput } from "../shared/domain";
import { enqueue } from "./amp";
import type { Connectors } from "./connectors";
import { seedDemo } from "./demo";
import { createProjectToken, handleMcp } from "./mcp";
import { AppError, id, type Store } from "./store";
import {
  processReceipt,
  receipts,
  receive,
  saveReceipt,
  secureEqual,
  verifyWebhook,
} from "./webhooks";
import { command, ingest, taskCommand } from "./workflow";

export type AppConfig = {
  dataDir: string;
  password?: string;
  publicUrl?: string;
  ampEnabled: boolean;
  webhookSecret?: string;
};
export function createApp(store: Store, connectors: Connectors, config: AppConfig) {
  const app = new Hono();
  const sessionSecret = store.setting("session_secret") ?? randomBytes(32).toString("hex");
  store.setSetting("session_secret", sessionSecret);
  const signature = (value: string) =>
    createHmac("sha256", sessionSecret + (config.password ?? ""))
      .update(value)
      .digest("hex");
  const loginAttempts = new Map<string, { count: number; until: number }>();
  app.use(
    "*",
    bodyLimit({
      maxSize: 12 * 1024 * 1024,
      onError: (c) => c.json({ error: "Bestand te groot. Maximaal 10 MB per afbeelding." }, 413),
    }),
  );
  app.use("*", async (c, next) => {
    const url = new URL(c.req.url);
    const publicOrigin = config.publicUrl ? new URL(config.publicUrl).origin : null;
    const allowed =
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.origin === publicOrigin;
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
      secure: new URL(c.req.url).protocol === "https:",
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
    const receipt = receive(store, JSON.parse(raw));
    return c.json({ receiptId: receipt.id, status: receipt.status }, 202);
  });
  app.all("/mcp/:projectId", (c) => handleMcp(store, c.req.raw, c.req.param("projectId")));
  app.use("/api/*", async (c, next) => {
    if (!authenticated(c.req.header("cookie"))) return c.json({ error: "Log eerst in" }, 401);
    await next();
  });
  app.use("/uploads/*", async (c, next) => {
    if (!authenticated(c.req.header("cookie"))) return c.json({ error: "Log eerst in" }, 401);
    await next();
  });
  app.get("/api/state", (c) =>
    c.json({
      projects: store.projects(),
      tasks: store.tasks().map((t) => ({ ...t, runs: t.runs.map((r) => ({ ...r, prompt: "" })) })),
      connections: {
        ...connectors.status,
        amp: config.ampEnabled,
        webhook: Boolean(config.webhookSecret),
        publicUrl: config.publicUrl ?? "",
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
  app.post("/api/tasks", async (c) =>
    c.json(store.createTask(taskInput.parse(await c.req.json())), 201),
  );
  app.post("/api/tasks/:id/commands", async (c) => {
    const input = z
      .object({ revision: z.number().int().positive(), command: taskCommand })
      .parse(await c.req.json());
    return c.json(command(store, c.req.param("id"), input.command, input.revision));
  });
  app.post("/api/tasks/:id/runs", async (c) => {
    if (!config.ampEnabled)
      throw new AppError("Schakel Amp in met BB_AMP_ENABLED=true nadat de CLI is aangemeld", 503);
    const data = z
      .object({
        mode: z.enum(["triage", "plan", "implement", "revise"]),
        instruction: z.string().max(20000).default(""),
        revision: z.number().int().positive(),
      })
      .parse(await c.req.json());
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
    const bytes = new Uint8Array(await file.arrayBuffer());
    const png = bytes.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10";
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const webp =
      new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
      new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
    if (!png && !jpeg && !webp) throw new AppError("Ongeldig afbeeldingsformaat");
    const filename = `${id()}.${png ? "png" : jpeg ? "jpg" : "webp"}`;
    mkdirSync(join(config.dataDir, "uploads"), { recursive: true, mode: 0o700 });
    await Bun.write(join(config.dataDir, "uploads", filename), bytes);
    return c.json({ url: `/uploads/${filename}` }, 201);
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
