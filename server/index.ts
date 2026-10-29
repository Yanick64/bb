import { resolve } from "node:path";
import { AmpWorker } from "./amp";
import { createApp } from "./app";
import { Connectors } from "./connectors";
import { SentryMcp } from "./sentry-mcp";
import { Store } from "./store";
import { processReceipt, receipts } from "./webhooks";

const hostname = Bun.env.BB_HOST ?? "127.0.0.1";
if (!["127.0.0.1", "localhost", "::1"].includes(hostname) && !Bun.env.BB_PASSWORD)
  throw new Error("BB_PASSWORD is required when binding beyond loopback");
const dataDir = resolve(Bun.env.BB_DATA_DIR ?? "./data");
if (Bun.env.BB_PUBLIC_URL && !Bun.env.BB_PASSWORD)
  throw new Error("BB_PASSWORD is required with a public URL");
const store = new Store(resolve(dataDir, "bb.sqlite"));
const sentryMcp = Bun.env.SENTRY_MCP_URL
  ? new SentryMcp(
      store,
      Bun.env.SENTRY_MCP_URL,
      new URL(
        "/api/sentry/oauth/callback",
        Bun.env.BB_PUBLIC_URL || `http://localhost:${Bun.env.BB_PORT ?? 4310}`,
      ).href,
    )
  : undefined;
const connectors = new Connectors(
  {
    orbitUrl: Bun.env.ORBIT_MCP_URL,
    orbitToken: Bun.env.ORBIT_MCP_TOKEN,
    orbitWebUrl: Bun.env.ORBIT_WEB_URL,
    sentryUrl: Bun.env.SENTRY_BASE_URL ?? "https://sentry.io",
    sentryToken: Bun.env.SENTRY_AUTH_TOKEN,
    sentryOrg: Bun.env.SENTRY_ORG,
  },
  sentryMcp,
);
const enabled = Bun.env.BB_AMP_ENABLED === "true";
const app = createApp(store, connectors, {
  dataDir,
  password: Bun.env.BB_PASSWORD,
  publicUrl: Bun.env.BB_PUBLIC_URL,
  ampEnabled: enabled,
  webhookSecret: Bun.env.BB_ORBIT_WEBHOOK_SECRET,
});
const worker = new AmpWorker(store, {
  dataDir,
  enabled,
  binary: Bun.env.AMP_BIN ?? "amp",
  concurrency: Math.max(1, Math.min(4, Number(Bun.env.BB_WORKER_CONCURRENCY) || 2)),
});
worker.start();
let processing = false;
const webhookTimer = setInterval(async () => {
  if (processing) return;
  const receipt = receipts(store).find((r) => r.status === "pending");
  if (!receipt) return;
  processing = true;
  try {
    await processReceipt(store, connectors, receipt.id);
  } finally {
    processing = false;
  }
}, 3000);
const server = Bun.serve({
  hostname,
  port: Number(Bun.env.BB_PORT ?? 4310),
  fetch: app.fetch,
  idleTimeout: 30,
});
console.log(`BB listening on ${server.url} · Amp ${enabled ? "enabled" : "not configured"}`);
function shutdown() {
  worker.stop();
  clearInterval(webhookTimer);
  server.stop();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", () => {
  shutdown();
  process.exit(0);
});
