import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z } from "zod";
import type { Signal } from "../shared/domain";
import { AppError, type Store } from "./store";
import { ingest } from "./workflow";

export type SourceProject = {
  externalId: string;
  name: string;
  client: string;
  provider: "orbit" | "sentry";
};
export function unwrapMcp(result: unknown): unknown {
  const value = z
    .object({
      isError: z.boolean().optional(),
      structuredContent: z.unknown().optional(),
      content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
    })
    .parse(result);
  const text =
    value.content
      ?.filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("\n") ?? "";
  if (value.isError || text.startsWith("RATE_LIMITED") || text.startsWith("Error:"))
    throw new AppError(text.slice(0, 1000), text.startsWith("RATE_LIMITED") ? 429 : 502);
  if (value.structuredContent !== undefined) return value.structuredContent;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
export function parseOrbitProjects(value: unknown): {
  projects: SourceProject[];
  hasMore: boolean;
} {
  if (typeof value !== "string")
    throw new AppError("Onbekend Orbit-projectformaat. Controleer de connector.", 502);
  const ids = value.match(/api_ids:\s*([^\n]+)/)?.[1].match(/PR[A-Z0-9]{13}/g) ?? [];
  const rows = value.split("\n").filter((line) => /^\|\s*\d/.test(line));
  if (rows.length !== ids.length)
    throw new AppError("Orbit-projectnamen en IDs sluiten niet aan; import gestopt.", 502);
  if (!rows.length && !/Found 0 project/.test(value))
    throw new AppError("Orbit-projectoverzicht niet herkend", 502);
  const projects = rows.map((line, index) => {
    const cells = line
      .split(/(?<!\\)\|/)
      .slice(1, -1)
      .map((cell) => cell.trim().replaceAll("\\|", "|"));
    if (cells.length !== 10) throw new AppError("Orbit-tabel is gewijzigd; import gestopt.", 502);
    return { externalId: ids[index], name: cells[1], client: cells[2], provider: "orbit" as const };
  });
  const paging = value.match(
    /Found (\d+) project\(s\).*?page (\d+) \((\d+) rows, pageSize (\d+)\)/,
  );
  return {
    projects,
    hasMore: paging ? Number(paging[1]) > Number(paging[2]) * Number(paging[4]) : false,
  };
}
const orbitTicket = z.object({
  ticketId: z.string().regex(/^TC[A-Z0-9]{13}$/),
  name: z.string(),
  description: z.string().nullish(),
  client: z.string().nullish(),
  projectId: z.string().nullish(),
});
export function normalizeOrbitTicket(input: unknown) {
  const ticket = orbitTicket.parse(input);
  return {
    provider: "orbit" as const,
    externalId: ticket.ticketId,
    externalProjectId: ticket.projectId ?? "",
    title: ticket.name.slice(0, 240),
    body: ticket.description ?? "",
    client: ticket.client ?? "",
    url: "",
  };
}
export type ConnectorConfig = {
  orbitUrl?: string;
  orbitToken?: string;
  sentryUrl: string;
  sentryToken?: string;
  sentryOrg?: string;
};
export class Connectors {
  private orbitBlockedUntil = 0;
  constructor(private config: ConnectorConfig) {}
  get status() {
    return {
      orbit: Boolean(this.config.orbitUrl),
      sentry: Boolean(this.config.sentryToken && this.config.sentryOrg),
    };
  }
  async orbitCall(
    name: "ListProjects" | "GetTicketDetail" | "ListTickets",
    args: Record<string, unknown>,
  ) {
    if (!this.config.orbitUrl)
      throw new AppError("Stel ORBIT_MCP_URL in om Orbit te verbinden", 503);
    if (Date.now() < this.orbitBlockedUntil)
      throw new AppError(
        `Orbit is begrensd tot ${new Date(this.orbitBlockedUntil).toISOString()}`,
        429,
      );
    const client = new Client({ name: "bb", version: "0.1.0" });
    const transport = new StreamableHTTPClientTransport(new URL(this.config.orbitUrl), {
      requestInit: {
        headers: this.config.orbitToken
          ? { Authorization: `Bearer ${this.config.orbitToken}` }
          : {},
        signal: AbortSignal.timeout(30000),
      },
      reconnectionOptions: {
        maxRetries: 0,
        initialReconnectionDelay: 1000,
        maxReconnectionDelay: 1000,
        reconnectionDelayGrowFactor: 1,
      },
    });
    try {
      await client.connect(transport);
      return unwrapMcp(
        await client.callTool({ name, arguments: args }, undefined, { timeout: 30000 }),
      );
    } catch (error) {
      if (error instanceof AppError && error.status === 429) {
        // Preserve the provider's retry message. Require a conservative pause if no machine-readable time exists.
        const seconds = error.message.match(/(?:retry after|retry in|wait)\s*(\d+)\s*s/i)?.[1];
        this.orbitBlockedUntil = Date.now() + (seconds ? Number(seconds) * 1000 : 60 * 60 * 1000);
      }
      if (error instanceof AppError) throw error;
      throw new AppError(
        "Orbit-verbinding mislukt. Controleer de MCP-URL, autorisatie en bereikbaarheid.",
        502,
      );
    } finally {
      await client.close().catch(() => {});
    }
  }
  async projects(provider: "orbit" | "sentry", query: string, page: number) {
    if (provider === "orbit")
      return parseOrbitProjects(
        await this.orbitCall("ListProjects", {
          states: "OPEN|DRAFT",
          text: query,
          page,
          pageSize: 30,
        }),
      );
    const result = await this.sentry(
      `/organizations/${encodeURIComponent(this.config.sentryOrg ?? "")}/projects/?query=${encodeURIComponent(query)}&per_page=100`,
    );
    const projects = z
      .array(z.object({ id: z.string(), slug: z.string(), name: z.string() }))
      .parse(await result.json());
    return {
      projects: projects.map((p) => ({
        provider: "sentry" as const,
        externalId: p.slug,
        name: p.name,
        client: this.config.sentryOrg ?? "",
      })),
      hasMore: false,
    };
  }
  async ticket(ticketId: string) {
    return normalizeOrbitTicket(await this.orbitCall("GetTicketDetail", { ticketId }));
  }
  async sync(store: Store, projectId: string) {
    const project = store.project(projectId);
    let created = 0;
    let duplicate = 0;
    let limited = false;
    for (const mapping of project.mappings) {
      let signals: Omit<Signal, "id" | "taskId" | "receivedAt">[];
      if (mapping.provider === "orbit") {
        const data = z.object({ tickets: z.array(orbitTicket) }).parse(
          await this.orbitCall("ListTickets", {
            projectId: mapping.externalId,
            state: "NEW|OPEN|WAIT",
            limit: 100,
          }),
        );
        signals = data.tickets.map(normalizeOrbitTicket);
        limited ||= signals.length === 100;
      } else {
        const response = await this.sentry(
          `/projects/${encodeURIComponent(this.config.sentryOrg ?? "")}/${encodeURIComponent(mapping.externalId)}/issues/?query=is:unresolved&limit=100`,
        );
        const issues = z
          .array(
            z.object({
              id: z.string(),
              title: z.string(),
              culprit: z.string().optional(),
              permalink: z.string().url(),
            }),
          )
          .parse(await response.json());
        signals = issues.map((issue) => ({
          provider: "sentry",
          externalId: issue.id,
          externalProjectId: mapping.externalId,
          title: issue.title.slice(0, 240),
          body: issue.culprit ?? "",
          url: issue.permalink,
          client: mapping.client,
        }));
        limited ||= response.headers.get("link")?.includes('results="true"') ?? false;
      }
      for (const signal of signals) {
        if (ingest(store, signal).duplicate) duplicate++;
        else created++;
      }
    }
    return { created, duplicate, limited };
  }
  private async sentry(path: string) {
    if (!this.status.sentry) throw new AppError("Stel SENTRY_AUTH_TOKEN en SENTRY_ORG in", 503);
    const response = await fetch(`${this.config.sentryUrl.replace(/\/$/, "")}/api/0${path}`, {
      headers: { Authorization: `Bearer ${this.config.sentryToken}` },
      signal: AbortSignal.timeout(30000),
      redirect: "error",
    });
    if (!response.ok)
      throw new AppError(
        response.status === 429
          ? `Sentry rate limit. Retry-After: ${response.headers.get("retry-after") ?? "onbekend"}`
          : `Sentry antwoordde met ${response.status}`,
        response.status === 429 ? 429 : 502,
      );
    return response;
  }
}
