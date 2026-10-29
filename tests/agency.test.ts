import { afterEach, expect, spyOn, test } from "bun:test";
import { commandAndContinue, enqueue } from "../server/amp";
import {
  Connectors,
  normalizeOrbitTicket,
  parseOrbitClients,
  parseSentryMcpIssues,
} from "../server/connectors";
import { McpOAuth } from "../server/mcp-oauth";
import type { SentryMcp } from "../server/sentry-mcp";
import { Store } from "../server/store";
import {
  acceptReview,
  addEvidence,
  addPlan,
  addQuestion,
  applyReport,
  approve,
  command,
  ingest,
} from "../server/workflow";
import { currentPlan, deliveryText, projectInput } from "../shared/domain";

const stores: Store[] = [];
function setup() {
  const store = new Store();
  stores.push(store);
  const project = store.saveProject(
    projectInput.parse({
      name: "Agency",
      ampProject: "example/app",
      mappings: [
        { provider: "orbit", scope: "client", externalId: "CL0000000000001", name: "Client" },
      ],
    }),
  );
  const task = store.createTask({ title: "Investigate checkout", projectId: project.id });
  return { store, project, task };
}
afterEach(() => {
  for (const store of stores.splice(0)) store.db.close();
});
const plan = {
  summary: "Fix checkout",
  steps: ["Reproduce", "Fix", "Verify"],
  criteria: ["Checkout completes"],
};

test("client routing works without projects and takes precedence over legacy mappings", () => {
  const { store, project } = setup();
  const legacy = store.saveProject(
    projectInput.parse({
      name: "Legacy",
      mappings: [{ provider: "orbit", externalId: "PR0000000000001", name: "Legacy project" }],
    }),
  );
  const input = normalizeOrbitTicket({
    ticketId: "TC0000000000001",
    name: "Question",
    clientId: "CL0000000000001",
    projectId: null,
  });
  expect(ingest(store, input).task.projectId).toBe(project.id);
  expect(
    ingest(store, { ...input, externalId: "second", externalProjectId: "PR0000000000001" }).task
      .projectId,
  ).toBe(project.id);
  expect(
    ingest(store, {
      ...input,
      externalId: "third",
      externalClientId: "",
      externalProjectId: "PR0000000000001",
    }).task.projectId,
  ).toBe(legacy.id);
  expect(() =>
    store.saveProject(projectInput.parse({ name: "Conflict", mappings: project.mappings })),
  ).toThrow("al gekoppeld");
});

test("Orbit client parser handles escaped names, paging and rejects ID mismatch", () => {
  const page =
    "Found 31 company/companies — showing page 1 (1 rows):\n| Company | Type | City | VAT | Owner | Segments | Enabled |\n|---|---|---|---|---|---|---|\n| A \\| B | CLIENT | | | | | yes |\napi_ids: CL0000000000001\n";
  expect(parseOrbitClients(page).clients[0].name).toBe("A | B");
  expect(parseOrbitClients(page).hasMore).toBe(true);
  expect(() => parseOrbitClients(page.replace("CL0000000000001", ""))).toThrow("sluiten niet aan");
});

test("Sentry Markdown issue import preserves stable identity and validates counts", () => {
  const source =
    "Found **2** issues:\n\n## 1. [APP-1](https://example.sentry.io/issues/APP-1)\n\n**Error: timeout**\n\n- **Status**: unresolved\n- **Events**: 2\n\n## 2. [APP-2](https://example.sentry.io/issues/APP-2)\n\n**Error: interrupted**\n\n- **Users**: 4\n\n## Next Steps\nIgnore this footer";
  const result = parseSentryMcpIssues(source, "app", "example");
  expect(result.map((s) => s.externalId)).toEqual(["example:APP-1", "example:APP-2"]);
  expect(result[1].body).toBe("- **Users**: 4");
  expect(() =>
    parseSentryMcpIssues(source.replace("**2** issues", "**3** issues"), "app", "example"),
  ).toThrow();
  const { store } = setup();
  ingest(store, result[0]);
  expect(ingest(store, { ...result[0], body: "REST result" }).duplicate).toBe(true);
});

test("final blocking answer queues one durable continuation with source context", () => {
  const { store, task } = setup();
  ingest(
    store,
    { provider: "orbit", externalId: "source", title: "Source", url: "https://example.com/ticket" },
    task.id,
  );
  let t = enqueue(store, task.id, "triage", "", task.revision);
  t = store.update(t.id, (t) => {
    t.runs[0].status = "succeeded";
    t.runs[0].threadId = "T-example";
    addQuestion(t, { question: "Which browser?", blocks: "planning" });
    addQuestion(t, { question: "Which account?", blocks: "implementation" });
  });
  t = commandAndContinue(
    store,
    t.id,
    { type: "answer", questionId: t.questions[0].id, answer: "Safari", answeredBy: "client" },
    t.revision,
    true,
  );
  expect(t.runs).toHaveLength(1);
  const lastRevision = t.revision;
  const input = {
    type: "answer" as const,
    questionId: t.questions[1].id,
    answer: "Test account",
    answeredBy: "client" as const,
  };
  t = commandAndContinue(store, t.id, input, lastRevision, true);
  expect(t.runs).toHaveLength(2);
  expect(t.runs[1].status).toBe("queued");
  expect(t.runs[1].threadId).toBe("T-example");
  expect(t.runs[1].prompt).toContain("https://example.com/ticket");
  expect(t.runs[1].prompt).toContain("Safari");
  expect(() => commandAndContinue(store, t.id, input, lastRevision, true)).toThrow(
    "intussen gewijzigd",
  );
  expect(store.task(t.id).runs).toHaveLength(2);
});

test("implementation clarification replans without reusing approval", () => {
  const { store, task } = setup();
  let t = store.update(task.id, (t) => {
    addPlan(t, plan);
    approve(t, 1);
  });
  t = enqueue(store, t.id, "implement", "", t.revision);
  t = store.update(t.id, (t) => {
    t.runs[0].status = "succeeded";
    addQuestion(t, { question: "Which rule?", blocks: "implementation" });
  });
  t = commandAndContinue(
    store,
    t.id,
    { type: "answer", questionId: t.questions[0].id, answer: "New rule", answeredBy: "operator" },
    t.revision,
    true,
  );
  expect(t.runs[1].mode).toBe("plan");
  expect(currentPlan(t)?.approvedAt).toBeNull();
});

test("disabled Amp and manually created questions do not launch work", () => {
  const { store, task } = setup();
  let t = store.update(task.id, (t) => addQuestion(t, { question: "Detail?", blocks: "planning" }));
  t = commandAndContinue(
    store,
    t.id,
    { type: "answer", questionId: t.questions[0].id, answer: "Answer", answeredBy: "operator" },
    t.revision,
    true,
  );
  expect(t.runs).toHaveLength(0);
  t = enqueue(store, t.id, "triage", "", t.revision);
  t = store.update(t.id, (t) => {
    t.runs[0].status = "succeeded";
    addQuestion(t, { question: "More?", blocks: "planning" });
  });
  t = commandAndContinue(
    store,
    t.id,
    { type: "answer", questionId: t.questions[1].id, answer: "Answer", answeredBy: "operator" },
    t.revision,
    false,
  );
  expect(t.runs).toHaveLength(1);
});

test("generated delivery is version-bound and completion needs no handwritten note", () => {
  const { store, task } = setup();
  let t = store.update(task.id, (t) => {
    addPlan(t, plan);
    approve(t, 1);
    addEvidence(t, {
      title: "Checkout verified",
      kind: "document",
      revision: "sha1",
      criterion: plan.criteria[0],
    });
    t.evidence[0].review = "accepted";
    applyReport(t, { deliveryDraft: "The checkout update is ready for deployment." }, "implement");
    acceptReview(t, "sha1");
  });
  expect(deliveryText(t)).toContain("ready for deployment");
  t = command(store, t.id, { type: "deliver", note: "" }, t.revision);
  expect(t.stage).toBe("done");
  expect(t.delivery?.note).toContain("ready for deployment");
  t = store.update(t.id, (t) =>
    addEvidence(t, {
      title: "Updated checkout",
      kind: "document",
      revision: "sha2",
      criterion: plan.criteria[0],
    }),
  );
  expect(t.deliveryDraft).toBeNull();
  expect(t.delivery).toBeNull();
  t = store.update(t.id, (t) => addPlan(t, { ...plan, summary: "New scope" }));
  expect(t.deliveryDraft).toBeNull();
  expect(deliveryText(t)).not.toContain("ready for deployment");
});

test("assignees and time entries validate members, agreements and stale revisions", () => {
  const { store, task } = setup();
  const member = store.addMember("Example Developer");
  expect(() =>
    command(store, task.id, { type: "assignee", memberId: "missing" }, task.revision),
  ).toThrow("niet gevonden");
  let t = command(store, task.id, { type: "assignee", memberId: member.id }, task.revision);
  expect(t.assigneeId).toBe(member.id);
  const entry = {
    memberId: member.id,
    date: "2026-10-29",
    minutes: 30,
    description: "Investigated new request",
    billing: "paid_preparation" as const,
    agreement: "",
  };
  expect(() => command(store, t.id, { type: "log_time", entry }, t.revision)).toThrow("afspraak");
  t = command(
    store,
    t.id,
    { type: "log_time", entry: { ...entry, billing: "new_business" } },
    t.revision,
  );
  expect(t.timeEntries[0].minutes).toBe(30);
  expect(t.timeEntries[0].billing).toBe("new_business");
  expect(() => command(store, t.id, { type: "assignee", memberId: null }, task.revision)).toThrow(
    "intussen gewijzigd",
  );
});

test("failed source is reported without blocking another mapped source", async () => {
  const { store, project } = setup();
  store.saveProject(
    projectInput.parse({
      ...project,
      mappings: [
        ...project.mappings,
        { provider: "orbit", scope: "client", externalId: "CL0000000000002", name: "Second" },
      ],
    }),
    project.id,
  );
  class Stub extends Connectors {
    override async orbitCall(_name: string, args: Record<string, unknown>) {
      if (args.clientId === "CL0000000000001") throw new Error("Offline");
      return { tickets: [] };
    }
  }
  const result = await new Stub({ sentryUrl: "https://sentry.io" }).sync(store, project.id);
  expect(result.errors).toHaveLength(1);
  expect(result.created).toBe(0);
});

test.each(["sentry", "orbit"] as const)(
  "%s OAuth rejects tampering and replay, tokens persist only for this provider and origin",
  async (service) => {
    const { store } = setup();
    let state = "";
    let exchanges = 0;
    const authenticate: ConstructorParameters<typeof SentryMcp>[3] = async (provider, options) => {
      if (options.authorizationCode) {
        exchanges++;
        expect(await provider.codeVerifier()).toBe("test-verifier");
        await provider.saveTokens({ access_token: "test-access", token_type: "Bearer" });
        return "AUTHORIZED";
      }
      state = (await provider.state?.()) ?? "";
      await provider.saveCodeVerifier("test-verifier");
      await provider.redirectToAuthorization(
        new URL(`https://example.com/authorize?state=${state}`),
      );
      return "REDIRECT";
    };
    const mcp = new McpOAuth(
      store,
      "https://example.com/mcp",
      "http://localhost/callback",
      service,
      authenticate,
    );
    await mcp.authorize();
    await expect(mcp.callback("wrong", "code")).rejects.toThrow("Ongeldige");
    expect(exchanges).toBe(0);
    await mcp.callback(state, "code");
    expect(mcp.connected).toBe(true);
    await expect(mcp.callback(state, "code")).rejects.toThrow("Ongeldige");
    expect(exchanges).toBe(1);
    expect(
      new McpOAuth(store, "https://example.com/mcp", "http://localhost/callback", service)
        .connected,
    ).toBe(true);
    expect(
      new McpOAuth(store, "https://other.example/mcp", "http://localhost/callback", service)
        .connected,
    ).toBe(false);
    expect(
      new McpOAuth(
        store,
        "https://example.com/mcp",
        "http://localhost/callback",
        service === "sentry" ? "orbit" : "sentry",
      ).connected,
    ).toBe(false);
  },
);

test.each(["sentry", "orbit"] as const)(
  "%s failed OAuth exchange consumes state and removes PKCE verifier",
  async (service) => {
    const { store } = setup();
    let state = "";
    let verifier: (() => string | Promise<string>) | undefined;
    const authenticate: ConstructorParameters<typeof SentryMcp>[3] = async (provider, options) => {
      if (options.authorizationCode) {
        verifier = () => provider.codeVerifier();
        throw new Error("Exchange failed");
      }
      state = (await provider.state?.()) ?? "";
      await provider.saveCodeVerifier("verifier");
      await provider.redirectToAuthorization(new URL("https://example.com/authorize"));
      return "REDIRECT";
    };
    const mcp = new McpOAuth(
      store,
      "https://example.com/mcp",
      "http://localhost/callback",
      service,
      authenticate,
    );
    await mcp.authorize();
    await expect(mcp.callback(state, "bad-code")).rejects.toThrow("Exchange failed");
    await expect(mcp.callback(state, "bad-code")).rejects.toThrow("Ongeldige");
    expect(() => verifier?.()).toThrow("opnieuw");
  },
);

test.each(["sentry", "orbit"] as const)(
  "%s OAuth expires after ten minutes and a new login replaces older state",
  async (service) => {
    const { store } = setup();
    let state = "";
    const authenticate: ConstructorParameters<typeof SentryMcp>[3] = async (provider) => {
      state = (await provider.state?.()) ?? "";
      await provider.redirectToAuthorization(new URL("https://example.com/authorize"));
      return "REDIRECT";
    };
    const mcp = new McpOAuth(
      store,
      "https://example.com/mcp",
      "http://localhost/callback",
      service,
      authenticate,
    );
    await mcp.authorize();
    const first = state;
    await mcp.authorize();
    expect(state).not.toBe(first);
    await expect(mcp.callback(first, "code")).rejects.toThrow("Ongeldige");
    const future = Date.now() + 11 * 60 * 1000;
    const clock = spyOn(Date, "now").mockReturnValue(future);
    try {
      await expect(mcp.callback(state, "code")).rejects.toThrow("verlopen");
    } finally {
      clock.mockRestore();
    }
  },
);

test("Orbit uses its OAuth connection instead of a rejected static token", async () => {
  const { store } = setup();
  const calls: string[] = [];
  class OrbitStub extends McpOAuth {
    override get connected() {
      return true;
    }
    override async call(name: string): ReturnType<McpOAuth["call"]> {
      calls.push(name);
      return { content: [{ type: "text", text: "Authenticated Orbit result" }] };
    }
  }
  const connectors = new Connectors(
    {
      orbitUrl: "http://127.0.0.1:1/mcp",
      orbitToken: "rejected-static-token",
      sentryUrl: "https://sentry.io",
    },
    undefined,
    new OrbitStub(store, "https://example.com/mcp", "http://localhost/callback", "orbit"),
  );
  expect(await connectors.orbitCall("ListClients", {})).toBe("Authenticated Orbit result");
  expect(calls).toEqual(["ListClients"]);
  expect(connectors.status.orbit).toBe(true);
  expect(connectors.status.orbitOAuth).toBe(true);
});
