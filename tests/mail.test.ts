import { afterEach, expect, test } from "bun:test";
import { createApp } from "../server/app";
import { Connectors } from "../server/connectors";
import { GoogleMail, normalizeMailThread, parseMailSearch } from "../server/google-mail";
import { AppError, Store } from "../server/store";
import { projectInput } from "../shared/domain";
import { mailProjects } from "../shared/mail-routing";

const email = "operator@example.com";
const threadId = "abc123def456";
const thread = `Thread ID: ${threadId}
Subject: Website feedback
Messages: 2

=== Message 1 ===
From: Client <client@example.com>
Date: 2026-10-29

Please make the search easier to find.

=== Message 2 ===
From: Operator <${email}>

We will investigate.`;
function message(index: number, id: string, thread: string) {
  return `  ${index}. Message ID: ${id}
     Subject: Website feedback
     From: Client <client@example.com>
     Date: 2026-10-29
     Labels: INBOX
     Web Link: https://mail.google.com/mail/u/0/#all/${id}
     Thread ID: ${thread}
     Thread Link: https://mail.google.com/mail/u/0/#all/${thread}
`;
}
test("mail search accepts empty results, validates counts and deduplicates conversations", () => {
  expect(parseMailSearch("No messages found for query: 'subject:missing'")).toEqual({
    messages: [],
    nextPage: null,
  });
  expect(parseMailSearch("Found 0 messages matching 'in:inbox':").messages).toEqual([]);
  const result = parseMailSearch(
    `Found 3 messages matching 'in:inbox':\n\n📧 MESSAGES:\n${message(1, "aaa", threadId)}${message(2, "bbb", threadId)}${message(3, "ccc", "def123")}\n💡 USAGE:\nHelp\n📄 PAGINATION: page_token='next-token'`,
  );
  expect(result.messages.map((m) => m.threadId)).toEqual([threadId, "def123"]);
  expect(result.messages[0].from).toBe("Client <client@example.com>");
  expect(result.nextPage).toBe("next-token");
  expect(() =>
    parseMailSearch(`Found 2 messages matching 'in:inbox':\n${message(1, "aaa", threadId)}`),
  ).toThrow("niet herkend");
  expect(() => parseMailSearch("Authentication required")).toThrow("niet herkend");
});
test("mail thread normalization rejects errors and mismatched identities, and marks truncation", () => {
  const source = normalizeMailThread(thread, email, threadId);
  expect(source.title).toBe("Website feedback");
  expect(source.externalId).toBe(`${email}:${threadId}`);
  expect(source.body).toContain("=== Message 2 ===");
  expect(source.url).toContain("authuser=operator%40example.com");
  expect(source.client).toBe("Client <client@example.com>");
  expect(() => normalizeMailThread("Error: thread not found", email, threadId)).toThrow(
    "niet herkend",
  );
  expect(() => normalizeMailThread(thread, email, "bad123")).toThrow("niet herkend");
  const long = normalizeMailThread(thread + "x".repeat(160000), email, threadId);
  expect(long.body.length + long.details.length).toBe(150000);
  expect(long.contextWarning).toContain("ingekort");
});

const stores: Store[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.db.close();
});
function setup() {
  const store = new Store();
  stores.push(store);
  class MailStub extends GoogleMail {
    fail = false;
    override async thread(id: string) {
      if (this.fail) throw new AppError("Google Mail is niet bereikbaar", 502);
      return normalizeMailThread(thread, this.email, id);
    }
    override async search() {
      return {
        messages: parseMailSearch(
          `Found 1 messages matching 'in:inbox':\n${message(1, "aaa", threadId)}`,
        ).messages,
        nextPage: null,
      };
    }
  }
  const mail = new MailStub("synthetic-config", email);
  const app = createApp(
    store,
    new Connectors({ sentryUrl: "https://sentry.io" }, undefined, undefined, mail),
    { dataDir: "./data/test", ampEnabled: false },
  );
  const importThread = (projectId?: string | null) =>
    app.request("http://localhost/api/mail/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ threadId, projectId }),
    });
  return { store, mail, app, importThread };
}
test("simultaneous mail imports produce one task and preserve its chosen destination on reimport", async () => {
  const { store, app, importThread } = setup();
  const first = store.saveProject(projectInput.parse({ name: "Studio Noord" }));
  const other = store.saveProject(projectInput.parse({ name: "Other project" }));
  const responses = await Promise.all([importThread(first.id), importThread(first.id)]);
  expect(responses.map((r) => r.status)).toEqual([201, 201]);
  expect(store.tasks()).toHaveLength(1);
  expect(store.signals()).toHaveLength(1);
  expect(store.tasks()[0].projectId).toBe(first.id);
  const result = await (await importThread(other.id)).json();
  expect(result.duplicate).toBe(true);
  expect(result.task.projectId).toBe(first.id);
  const list = await (await app.request("http://localhost/api/mail")).json();
  expect(list.messages[0].taskId).toBe(result.task.id);
  expect(store.tasks()[0].runs).toHaveLength(0);
});
test("failed mail retrieval or invalid destination cannot leave an empty task", async () => {
  const { store, mail, importThread } = setup();
  expect((await importThread("missing-project")).status).toBe(404);
  mail.fail = true;
  expect((await importThread()).status).toBe(502);
  expect(store.tasks()).toHaveLength(0);
  expect(store.signals()).toHaveLength(0);
});

test("sender rules normalize addresses and match exact senders before domains", () => {
  const { store } = setup();
  const domain = store.saveProject(
    projectInput.parse({ name: "Domain", mailSenders: ["EXAMPLE.COM", "@example.com"] }),
  );
  const exact = store.saveProject(
    projectInput.parse({ name: "Contact", mailSenders: [" Client@Example.com "] }),
  );
  expect(domain.mailSenders).toEqual(["@example.com"]);
  expect(mailProjects(store.projects(), "Client <CLIENT@example.com>").map((p) => p.id)).toEqual([
    exact.id,
  ]);
  expect(mailProjects(store.projects(), "other@example.com").map((p) => p.id)).toEqual([domain.id]);
  expect(mailProjects(store.projects(), "@example.com <attacker@evil.com>")).toEqual([]);
  expect(mailProjects(store.projects(), "client@notexample.com")).toEqual([]);
  expect(mailProjects(store.projects(), "client@sub.example.com")).toEqual([]);
  expect(projectInput.parse({ name: "Legacy" }).mailSenders).toEqual([]);
  for (const value of [
    "from:someone",
    "@",
    "example.com OR in:inbox",
    "https://example.com",
    "a@b@c.com",
  ])
    expect(projectInput.safeParse({ name: "Invalid", mailSenders: [value] }).success).toBe(false);
});

test("automatic mail routing shows suggestions and preserves the destination on reimport", async () => {
  const { store, app, importThread } = setup();
  const project = store.saveProject(
    projectInput.parse({ name: "Mail client", mailSenders: ["@example.com"] }),
  );
  const list = await (await app.request("http://localhost/api/mail")).json();
  expect(list.messages[0].suggestedProjectIds).toEqual([project.id]);
  const imported = await (await importThread()).json();
  expect(imported.task.projectId).toBe(project.id);
  store.saveProject({ ...project, mailSenders: [] }, project.id);
  const again = await (await importThread()).json();
  expect(again.duplicate).toBe(true);
  expect(again.task.projectId).toBe(project.id);
});

test("ambiguous sender rules use the inbox and an explicit inbox choice overrides matching", async () => {
  for (const ambiguous of [true, false]) {
    const { store, importThread } = setup();
    store.saveProject(projectInput.parse({ name: "First", mailSenders: ["@example.com"] }));
    if (ambiguous)
      store.saveProject(projectInput.parse({ name: "Second", mailSenders: ["@example.com"] }));
    const result = await (await importThread(ambiguous ? undefined : null)).json();
    expect(result.task.projectId).toBeNull();
  }
});

test("removed mail connection rejects search and imports until explicitly reconnected", async () => {
  const { store, app, mail, importThread } = setup();
  expect(
    (await app.request("http://localhost/api/connections/mail", { method: "DELETE" })).status,
  ).toBe(200);
  expect((await app.request("http://localhost/api/mail")).status).toBe(409);
  expect((await importThread()).status).toBe(409);
  expect(mail.status.configured).toBe(false);
  const restarted = createApp(
    store,
    new Connectors({ sentryUrl: "https://sentry.io" }, undefined, undefined, mail),
    { dataDir: "./data/test", ampEnabled: false },
  );
  expect((await restarted.request("http://localhost/api/mail")).status).toBe(409);
  expect(
    (await restarted.request("http://localhost/api/connections/mail/connect", { method: "POST" }))
      .status,
  ).toBe(200);
  expect((await restarted.request("http://localhost/api/mail")).status).toBe(200);
  expect(mail.status.configured).toBe(true);
});
