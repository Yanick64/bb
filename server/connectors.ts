import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z } from "zod";
import type { ProjectInput, Signal } from "../shared/domain";
import type { SentryMcp } from "./sentry-mcp";
import { AppError, type Store } from "./store";
import { ingest } from "./workflow";

export type SourceProject = ProjectInput["mappings"][number];
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
    return {
      externalId: ids[index],
      name: cells[1],
      client: cells[2],
      provider: "orbit" as const,
      scope: "project" as const,
    };
  });
  const paging = value.match(
    /Found (\d+) project\(s\).*?page (\d+) \((\d+) rows, pageSize (\d+)\)/,
  );
  return {
    projects,
    hasMore: paging ? Number(paging[1]) > Number(paging[2]) * Number(paging[4]) : false,
  };
}
export function parseOrbitClients(
  value: unknown,
  pageSize = 30,
): { clients: SourceProject[]; hasMore: boolean } {
  if (typeof value !== "string") throw new AppError("Orbit-klantenoverzicht niet herkend", 502);
  const paging = value.match(/Found (\d+) company\/companies.*?page (\d+) \((\d+) rows\)/);
  const ids = value.match(/api_ids:\s*([^\n]+)/)?.[1].match(/CL[A-Z0-9]{13}/g) ?? [];
  const rows = value
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .slice(2);
  if (!paging || rows.length !== ids.length || rows.length !== Number(paging[3]))
    throw new AppError("Orbit-klantnamen en IDs sluiten niet aan; import gestopt.", 502);
  const clients = rows.map((line, index) => {
    const cells = line
      .split(/(?<!\\)\|/)
      .slice(1, -1)
      .map((cell) => cell.trim().replaceAll("\\|", "|"));
    if (cells.length !== 7)
      throw new AppError("Orbit-klantentabel is gewijzigd; import gestopt.", 502);
    return {
      provider: "orbit" as const,
      scope: "client" as const,
      externalId: ids[index],
      name: cells[0] || ids[index],
      client: cells[0],
    };
  });
  return { clients, hasMore: Number(paging[1]) > Number(paging[2]) * pageSize };
}
const orbitTicket = z.object({
  ticketId: z.string().regex(/^TC[A-Z0-9]{13}$/),
  name: z.string(),
  description: z.string().nullish(),
  client: z.string().nullish(),
  clientId: z.string().nullish(),
  projectId: z.string().nullish(),
});
export function normalizeOrbitTicket(input: unknown) {
  const ticket = orbitTicket.parse(input);
  return {
    provider: "orbit" as const,
    externalId: ticket.ticketId,
    externalProjectId: ticket.projectId ?? "",
    externalClientId: ticket.clientId ?? "",
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
export function parseSentryMcpIssues(value: unknown, project: string, organization: string) {
  if (typeof value !== "string") throw new AppError("Sentry MCP-issueformaat niet herkend", 502);
  if (/No issues found|Found \*\*0\*\* issues/i.test(value)) return [];
  const count = Number(value.match(/Found \*\*(\d+)\*\* issues/)?.[1]);
  const entries = [
    ...value.matchAll(
      /^## \d+\. \[([^\]]+)\]\((https:\/\/[^\s)]+)\)\r?\n+\*\*([^\n]+)\*\*\r?\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm,
    ),
  ];
  if (!Number.isFinite(count) || count !== entries.length)
    throw new AppError("Sentry MCP-issuelijst is gewijzigd; import gestopt.", 502);
  return entries.map((entry) => ({
    provider: "sentry" as const,
    externalId: `${organization}:${entry[1]}`,
    externalProjectId: project,
    externalClientId: "",
    title: entry[3].slice(0, 240),
    body: entry[4].split("## Next Steps")[0].trim().slice(0, 50000),
    url: entry[2],
    client: organization,
  }));
}
export class Connectors {
  private orbitBlockedUntil = 0;
  private orbitError = "";
  private orbitVerified = false;
  constructor(
    private config: ConnectorConfig,
    readonly sentryMcp?: SentryMcp,
  ) {}
  get status() {
    return {
      orbit: this.orbitVerified && !this.orbitError,
      orbitConfigured: Boolean(this.config.orbitUrl),
      orbitError: this.orbitError,
      sentry: Boolean(
        this.config.sentryOrg && (this.sentryMcp?.connected || this.config.sentryToken),
      ),
      sentryMcp: Boolean(this.sentryMcp),
    };
  }
  async orbitCall(
    name: "ListProjects" | "ListClients" | "GetTicketDetail" | "ListTickets",
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
      const result = unwrapMcp(
        await client.callTool({ name, arguments: args }, undefined, { timeout: 30000 }),
      );
      this.orbitError = "";
      this.orbitVerified = true;
      return result;
    } catch (error) {
      if (error instanceof AppError && error.status === 429) {
        // Preserve the provider's retry message. Require a conservative pause if no machine-readable time exists.
        const seconds = error.message.match(/(?:retry after|retry in|wait)\s*(\d+)\s*s/i)?.[1];
        this.orbitBlockedUntil = Date.now() + (seconds ? Number(seconds) * 1000 : 60 * 60 * 1000);
      }
      if (error instanceof AppError) throw error;
      this.orbitError = /401|Unauthorized/i.test(String(error))
        ? "Orbit weigert de autorisatie (401). Controleer of de token bij deze MCP-URL hoort; het officiële endpoint gebruikt OAuth."
        : "Orbit-verbinding mislukt. Controleer de MCP-URL, autorisatie en bereikbaarheid.";
      throw new AppError(this.orbitError, 502);
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
    if (this.sentryMcp?.connected) {
      let cursor: string | null = null;
      for (let index = 1; index <= Math.min(page, 100); index++) {
        const data = z
          .object({
            projects: z.array(z.object({ slug: z.string(), name: z.string().optional() })),
            hasMore: z.boolean(),
            nextCursor: z.string().nullable(),
          })
          .parse(
            unwrapMcp(
              await this.sentryMcp.call("find_projects", {
                organizationSlug: this.config.sentryOrg,
                regionUrl: this.config.sentryUrl,
                query: query || null,
                cursor,
              }),
            ),
          );
        if (index === page || !data.hasMore || !data.nextCursor)
          return {
            projects:
              index === page
                ? data.projects.map((p) => ({
                    provider: "sentry" as const,
                    scope: "project" as const,
                    externalId: p.slug,
                    name: p.name ?? p.slug,
                    client: this.config.sentryOrg ?? "",
                  }))
                : [],
            hasMore: index === page && data.hasMore,
          };
        cursor = data.nextCursor;
      }
      throw new AppError("Te veel Sentry-pagina's. Verfijn je zoekopdracht.");
    }
    const result = await this.sentry(
      `/organizations/${encodeURIComponent(this.config.sentryOrg ?? "")}/projects/?query=${encodeURIComponent(query)}&per_page=100`,
    );
    const projects = z
      .array(z.object({ id: z.string(), slug: z.string(), name: z.string() }))
      .parse(await result.json());
    return {
      projects: projects.map((p) => ({
        provider: "sentry" as const,
        scope: "project" as const,
        externalId: p.slug,
        name: p.name,
        client: this.config.sentryOrg ?? "",
      })),
      hasMore: false,
    };
  }
  async clients(query: string, page: number) {
    return parseOrbitClients(
      await this.orbitCall("ListClients", { text: query, page, pageSize: 30 }),
    );
  }
  async ticket(ticketId: string) {
    return normalizeOrbitTicket(await this.orbitCall("GetTicketDetail", { ticketId }));
  }
  async sync(store: Store, projectId: string) {
    const project = store.project(projectId);
    let created = 0;
    let duplicate = 0;
    let limited = false;
    const errors: { source: string; message: string }[] = [];
    for (const mapping of project.mappings) {
      try {
        let signals: Omit<Signal, "id" | "taskId" | "receivedAt">[];
        if (mapping.provider === "orbit") {
          const data = z.object({ tickets: z.array(orbitTicket) }).parse(
            await this.orbitCall("ListTickets", {
              ...(mapping.scope === "client"
                ? { clientId: mapping.externalId }
                : { projectId: mapping.externalId }),
              state: "NEW|OPEN|WAIT",
              limit: 100,
            }),
          );
          limited ||= data.tickets.length === 100;
          signals = [];
          for (const ticket of data.tickets) {
            if (
              store
                .signals()
                .some(
                  (signal) => signal.provider === "orbit" && signal.externalId === ticket.ticketId,
                )
            ) {
              duplicate++;
              continue;
            }
            signals.push(await this.ticket(ticket.ticketId));
          }
        } else if (this.sentryMcp?.connected) {
          signals = parseSentryMcpIssues(
            unwrapMcp(
              await this.sentryMcp.call("search_issues", {
                organizationSlug: this.config.sentryOrg,
                regionUrl: this.config.sentryUrl,
                projectSlugOrId: mapping.externalId,
                query: "is:unresolved",
                period: "7d",
                limit: 100,
              }),
            ),
            mapping.externalId,
            this.config.sentryOrg ?? "",
          );
          limited ||= signals.length === 100;
        } else {
          const response = await this.sentry(
            `/projects/${encodeURIComponent(this.config.sentryOrg ?? "")}/${encodeURIComponent(mapping.externalId)}/issues/?query=is:unresolved&limit=100`,
          );
          const issues = z
            .array(
              z.object({
                id: z.string(),
                shortId: z.string(),
                title: z.string(),
                culprit: z.string().optional(),
                permalink: z.string().url(),
              }),
            )
            .parse(await response.json());
          signals = issues.map((issue) => ({
            provider: "sentry",
            externalId: `${this.config.sentryOrg}:${issue.shortId}`,
            externalProjectId: mapping.externalId,
            externalClientId: "",
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
      } catch (error) {
        errors.push({
          source: `${mapping.provider}: ${mapping.name}`,
          message:
            error instanceof AppError
              ? error.message
              : "Bronantwoord niet herkend; controleer de connector.",
        });
      }
    }
    return { created, duplicate, limited, errors };
  }
  private async sentry(path: string) {
    if (!this.status.sentry)
      throw new AppError(
        "Verbind Sentry via MCP in Verbindingen, of stel SENTRY_AUTH_TOKEN en SENTRY_ORG in",
        503,
      );
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
