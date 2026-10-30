import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { z } from "zod";
import { signalInput } from "../shared/domain";
import { AppError } from "./store";

const localConfig = z.object({
  command: z.array(z.string()).min(1),
  environment: z.record(z.string(), z.string()).default({}),
});
export type MailMessage = {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  url: string;
};
export function parseMailSearch(text: string) {
  if (/^No messages found for query: /.test(text.trim())) return { messages: [], nextPage: null };
  const messages: MailMessage[] = [];
  for (const match of text.matchAll(
    /^\s*\d+\. Message ID: ([a-f0-9]+)\s*\n([\s\S]*?)(?=^\s*\d+\. Message ID:|^💡|^📄|$(?![\s\S]))/gm,
  )) {
    const field = (name: string) =>
      match[2].match(new RegExp(`^\\s*${name}: (.*)$`, "m"))?.[1]?.trim() ?? "";
    const threadId = field("Thread ID");
    if (!/^[a-f0-9]+$/.test(threadId))
      throw new AppError("Google Mail gaf een onherkenbaar gesprek terug.", 502);
    messages.push({
      id: match[1],
      threadId,
      subject: field("Subject") || "Zonder onderwerp",
      from: field("From"),
      date: field("Date"),
      url: `https://mail.google.com/mail/u/0/#all/${threadId}`,
    });
  }
  const count = text.match(/Found (\d+) messages/);
  if (!count || Number(count[1]) !== messages.length)
    throw new AppError("Google Mail-resultaat niet herkend. Controleer de MCP-verbinding.", 502);
  return {
    messages: messages.filter(
      (m, i, all) => all.findIndex((other) => other.threadId === m.threadId) === i,
    ),
    nextPage: text.match(/page_token='([^']+)'/)?.[1] ?? null,
  };
}

export function normalizeMailThread(text: string, email: string, threadId: string) {
  const header = text.match(
    /^Thread ID: ([a-f0-9]+)\r?\nSubject: ([^\r\n]*)\r?\nMessages: (\d+)\s*\n/,
  );
  if (!header || header[1] !== threadId || Number(header[3]) < 1)
    throw new AppError(
      "Google Mail-gesprek niet herkend. Er is geen taak aangemaakt; probeer het gesprek opnieuw op te halen.",
      502,
    );
  return signalInput.parse({
    provider: "email",
    externalId: `${email}:${threadId}`,
    title: (header[2].trim() || "Zonder onderwerp").slice(0, 240),
    body: text.slice(0, 50000),
    details: text.length > 50000 ? text.slice(50000, 150000) : "",
    url: `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(email)}#all/${threadId}`,
    client:
      text
        .slice(header[0].length)
        .trimStart()
        .split(/\r?\n\r?\n/, 1)[0]
        ?.match(/^From: (.+)$/m)?.[1]
        ?.trim() ?? "",
    fetchedAt: new Date().toISOString(),
    contextWarning:
      text.length > 150000
        ? "Dit gesprek is ingekort. Open Google Mail voor het volledige gesprek."
        : "",
  });
}

export class GoogleMail {
  enabled = () => true;
  private client?: Client;
  private connected = false;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    readonly configPath: string,
    readonly email: string,
  ) {}
  get status() {
    return {
      configured: this.enabled() && Boolean(this.configPath && this.email),
      connected: this.enabled() && this.connected,
      email: this.email,
    };
  }
  private async connect() {
    if (!this.enabled())
      throw new AppError("Google Mail is verwijderd. Verbind opnieuw via Verbindingen.", 409);
    if (this.client) return this.client;
    if (!this.status.configured)
      throw new AppError("Stel de Google Workspace MCP-configuratie en het account in.", 503);
    const config = localConfig.parse(await Bun.file(this.configPath).json());
    const client = new Client({ name: "2digits-workbench-mail", version: "0.1.0" });
    const transport = new StdioClientTransport({
      command: config.command[0],
      args: config.command.slice(1),
      env: { ...config.environment, USER_GOOGLE_EMAIL: this.email },
      stderr: "ignore",
    });
    try {
      await client.connect(transport, { timeout: 60000 });
      this.client = client;
      return client;
    } catch {
      await client.close().catch(() => {});
      throw new AppError(
        "Google Workspace MCP kon niet starten. Controleer de lokale configuratie.",
        503,
      );
    }
  }
  private call(
    name: "search_gmail_messages" | "get_gmail_thread_content",
    args: Record<string, unknown>,
  ): Promise<string> {
    const request = this.queue
      .catch(() => {})
      .then(async () => {
        try {
          const client = await this.connect();
          const result = await client.callTool(
            { name, arguments: { ...args, user_google_email: this.email } },
            undefined,
            { timeout: 60000 },
          );
          if (result.isError)
            throw new AppError(
              "Google Mail kon het verzoek niet uitvoeren. Controleer de verbinding en Google-autorisatie.",
              502,
            );
          const content = result.content as { type: string; text?: string }[];
          let value: unknown =
            result.structuredContent ??
            content
              .filter((c) => c.type === "text")
              .map((c) => c.text ?? "")
              .join("\n");
          if (typeof value === "string") {
            try {
              value = JSON.parse(value);
            } catch {}
          }
          const text =
            typeof value === "string"
              ? value
              : z.object({ result: z.string() }).parse(value).result;
          if (
            /^(?:error[^\n]*|authentication required|authorization required|please authenticate)/i.test(
              text.trim(),
            )
          )
            throw new AppError(
              "Meld het Google-account aan via Google Workspace MCP en controleer de verbinding opnieuw.",
              401,
            );
          this.connected = true;
          return text;
        } catch (error) {
          this.connected = false;
          if (error instanceof AppError) throw error;
          await this.close();
          throw new AppError(
            "Google Mail is niet bereikbaar. Controleer de Google Workspace MCP-verbinding.",
            502,
          );
        }
      });
    this.queue = request;
    return request;
  }
  async search(query: string, pageToken?: string) {
    return parseMailSearch(
      await this.call("search_gmail_messages", {
        query,
        page_size: 20,
        include_headers: true,
        ...(pageToken ? { page_token: pageToken } : {}),
      }),
    );
  }
  async check() {
    await this.search("in:inbox -in:drafts");
    return { ok: true, email: this.email };
  }
  async thread(threadId: string) {
    if (!/^[a-f0-9]+$/.test(threadId)) throw new AppError("Ongeldig Google Mail-gesprek", 400);
    const text = await this.call("get_gmail_thread_content", {
      thread_id: threadId,
      body_format: "text",
      include_links: true,
    });
    return normalizeMailThread(text, this.email, threadId);
  }
  async close() {
    const client = this.client;
    this.client = undefined;
    this.connected = false;
    await client?.close().catch(() => {});
  }
  async disconnect() {
    await this.queue.catch(() => {});
    await this.close();
  }
}
