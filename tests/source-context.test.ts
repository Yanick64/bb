import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AmpWorker, enqueue } from "../server/amp";
import { Connectors, normalizeOrbitTicket } from "../server/connectors";
import { SentryMcp } from "../server/sentry-mcp";
import { Store } from "../server/store";
import { ingest } from "../server/workflow";
import { projectInput } from "../shared/domain";

const ticket = {
  ticketId: "TC0000000000001",
  number: "123",
  name: "Conversation issue",
  description: "",
  clientId: "CL0000000000001",
  attachments: [
    {
      fileId: "file1",
      name: "screen.png",
      sizeBytes: 120,
      downloadUrl: "https://example.com/image",
    },
  ],
};
const thread = {
  count: 2,
  comments: [
    {
      commentId: "second",
      date: "2026-10-29 12:00",
      author: "Developer",
      isInternal: true,
      content: "<p>Check&nbsp;the logs</p>",
    },
    {
      commentId: "first",
      date: "2026-10-29 11:00",
      author: "Customer",
      isInternal: false,
      content: "<p>I can&#39;t finish.</p><p>See screenshot &amp; details.</p>",
    },
  ],
};

test("empty Orbit descriptions use the customer conversation and retain internal context", () => {
  const signal = normalizeOrbitTicket(ticket, thread, "https://example.com");
  expect(signal.body).toContain("I can't finish.");
  expect(signal.body).not.toContain("Check");
  expect(signal.comments[1].internal).toBe(true);
  expect(signal.comments[1].text).toBe("Check the logs");
  expect(signal.attachments[0].name).toBe("screen.png");
  expect(signal.url).toBe("https://example.com/ticket/123");
  expect(signal.fetchedAt).toBeTruthy();
});

test("same-minute Orbit comments retain the source's reverse chronological ordering", () => {
  const comments = thread.comments.map((c) => ({
    ...c,
    date: "2026-10-29 12:00",
    isInternal: false,
  }));
  expect(normalizeOrbitTicket(ticket, { comments }).body).toContain("I can't finish.");
});

test("Sentry refresh fetches details and recent events, retains last snapshot on access failure", async () => {
  const store = new Store();
  const calls: string[] = [];
  class SentryStub extends SentryMcp {
    override get connected() {
      return true;
    }
    override async call(name: Parameters<SentryMcp["call"]>[0]): ReturnType<SentryMcp["call"]> {
      calls.push(name);
      return {
        content: [
          {
            type: "text",
            text:
              name === "get_sentry_resource"
                ? "Stack: checkout.ts:42; release v1"
                : "Recent production event",
          },
        ],
      };
    }
  }
  try {
    const task = ingest(store, {
      provider: "sentry",
      externalId: "example:APP-1",
      title: "Error",
      body: "Initial report",
    }).task;
    await new Connectors(
      { sentryUrl: "https://sentry.io" },
      new SentryStub(store, "https://example.com", "http://localhost/callback"),
    ).refreshContext(store, task.id, false);
    expect(calls).toEqual(["get_sentry_resource", "search_issue_events"]);
    expect(store.signals()[0].details).toContain("checkout.ts:42");
    expect(store.signals()[0].details).toContain("Recent production event");
    expect(store.task(task.id).revision).toBe(task.revision);
    const cleared = store.update(task.id, (t) => {
      t.description = "";
    });
    await new Connectors(
      { sentryUrl: "https://sentry.io" },
      new SentryStub(store, "https://example.com", "http://localhost/callback"),
    ).refreshContext(store, task.id, false);
    expect(store.task(task.id).description).toBe("");
    expect(store.task(task.id).revision).toBe(cleared.revision);
    await new Connectors({ sentryUrl: "https://sentry.io" }).refreshContext(store, task.id);
    expect(store.signals()[0].contextWarning).toContain("Verbind Sentry");
    expect(store.signals()[0].details).toContain("checkout.ts:42");
  } finally {
    store.db.close();
  }
});

test.each([
  {
    name: "inaccessible project",
    output: "",
    error: 'Error: No accessible Amp project matches "wrong/app"',
    status: "failed",
    message: "Projectinstellingen",
  },
  {
    name: "lost observer",
    output: "",
    error: "Connection closed",
    status: "interrupted",
    message: "Controleer Amp",
  },
  {
    name: "known remote thread",
    output: 'echo \'{"type":"system","session_id":"T-existing"}\'\n',
    error: 'Error: No accessible Amp project matches "wrong/app"',
    status: "interrupted",
    message: "Controleer Amp",
  },
])("worker classifies $name without unsafe retries", async ({ output, error, status, message }) => {
  const directory = mkdtempSync(join(tmpdir(), "amp-launch-test-"));
  const binary = join(directory, "amp");
  await Bun.write(binary, `#!/bin/sh\n${output}echo '${error}' >&2\nexit 1\n`);
  const { chmodSync } = await import("node:fs");
  chmodSync(binary, 0o700);
  const store = new Store();
  const project = store.saveProject(projectInput.parse({ name: "Test", ampProject: "wrong/app" }));
  const task = store.createTask({ title: "Test startup", projectId: project.id });
  enqueue(store, task.id, "triage", "", task.revision);
  const worker = new AmpWorker(store, { enabled: true, binary, concurrency: 1 });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Worker timeout")), 5000);
      const listener = () => {
        if (store.task(task.id).runs[0].finishedAt) {
          clearTimeout(timer);
          store.listeners.delete(listener);
          resolve();
        }
      };
      store.listeners.add(listener);
      worker.start();
    });
    expect(store.task(task.id).runs[0].status).toBe(status);
    expect(store.task(task.id).runs[0].error).toContain(message);
  } finally {
    worker.stop();
    store.db.close();
    rmSync(directory, { recursive: true });
  }
});

test("refresh enriches old signals once and preserves operator descriptions and workflow", () => {
  const store = new Store();
  try {
    const initial = ingest(store, {
      provider: "orbit",
      externalId: ticket.ticketId,
      title: ticket.name,
    });
    const refreshed = normalizeOrbitTicket(ticket, thread, "https://example.com");
    ingest(store, refreshed);
    expect(store.task(initial.task.id).description).toContain("I can't finish");
    store.update(initial.task.id, (t) => {
      t.description = "My investigation";
      t.summary = "Keep this";
    });
    ingest(store, refreshed);
    expect(store.tasks()).toHaveLength(1);
    expect(store.signals()).toHaveLength(1);
    expect(store.task(initial.task.id).description).toBe("My investigation");
    expect(store.task(initial.task.id).summary).toBe("Keep this");
    expect(store.signals()[0].comments).toHaveLength(2);
  } finally {
    store.db.close();
  }
});
