import { createHash, randomBytes } from "node:crypto";
import { auth, type OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type {
  OAuthClientInformationMixed,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { AppError, type Store } from "./store";
import { secureEqual } from "./webhooks";

// One operator owns this connection. Tokens stay in the private SQLite data directory.
export class McpOAuth {
  private key: string;
  private busy = false;
  private label: string;
  constructor(
    private store: Store,
    readonly url: string,
    readonly redirectUrl: string,
    private service: "sentry" | "orbit",
    private authenticate: typeof auth = auth,
  ) {
    this.key = `${service}_oauth:${createHash("sha256").update(`${url}|${redirectUrl}`).digest("hex")}`;
    this.label = service === "orbit" ? "Teamleader Orbit" : "Sentry";
  }
  private read<T>(name: string): T | undefined {
    const value = this.store.setting(`${this.key}:${name}`);
    return value ? JSON.parse(value) : undefined;
  }
  private write(name: string, value: unknown) {
    this.store.setSetting(`${this.key}:${name}`, JSON.stringify(value));
  }
  get connected() {
    return Boolean(this.read<OAuthTokens>("tokens")?.access_token);
  }
  private async exclusive<T>(action: () => Promise<T>) {
    if (this.busy)
      throw new AppError(`${this.label} verwerkt al een verzoek. Probeer zo opnieuw.`, 409);
    this.busy = true;
    try {
      return await action();
    } finally {
      this.busy = false;
    }
  }
  private provider(onRedirect: (url: URL) => void): OAuthClientProvider {
    return {
      redirectUrl: this.redirectUrl,
      clientMetadata: {
        client_name: "2DIGITS Developmentwerkplek",
        redirect_uris: [this.redirectUrl],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      },
      state: () => this.read<{ state: string }>("pending")?.state ?? "",
      clientInformation: () => this.read<OAuthClientInformationMixed>("client"),
      saveClientInformation: (value) => this.write("client", value),
      tokens: () => this.read<OAuthTokens>("tokens"),
      saveTokens: (value) => {
        this.write("tokens", value);
        this.store.changed();
      },
      redirectToAuthorization: onRedirect,
      saveCodeVerifier: (value) => this.write("verifier", value),
      codeVerifier: () => {
        const verifier = this.read<string>("verifier");
        if (!verifier) throw new AppError(`Start de ${this.label}-login opnieuw`, 409);
        return verifier;
      },
      invalidateCredentials: (scope) => {
        for (const key of scope === "all"
          ? ["client", "tokens", "verifier"]
          : [scope === "client" ? "client" : scope])
          this.write(key, null);
      },
    };
  }
  async authorize() {
    return this.exclusive(async () => {
      this.write("pending", {
        state: randomBytes(32).toString("hex"),
        expires: Date.now() + 10 * 60 * 1000,
      });
      let redirect = "";
      const result = await this.authenticate(
        this.provider((url) => {
          redirect = url.href;
        }),
        { serverUrl: this.url },
      );
      if (result === "AUTHORIZED") {
        this.write("pending", null);
        return null;
      }
      if (!redirect) throw new AppError(`${this.label} heeft geen autorisatie-URL gegeven`, 502);
      return redirect;
    });
  }
  async callback(state: string, code: string) {
    return this.exclusive(async () => {
      const pending = this.read<{ state: string; expires: number }>("pending");
      if (!pending || pending.expires < Date.now() || !secureEqual(state, pending.state))
        throw new AppError(
          `Ongeldige of verlopen ${this.label}-login. Start opnieuw vanuit Verbindingen.`,
          400,
        );
      // Consume state before exchanging the code, including when exchange fails.
      this.write("pending", null);
      try {
        const result = await this.authenticate(
          this.provider(() => {
            throw new AppError(`Start de ${this.label}-login opnieuw`, 409);
          }),
          { serverUrl: this.url, authorizationCode: code },
        );
        if (result !== "AUTHORIZED") throw new AppError(`${this.label}-login niet afgerond`, 409);
      } finally {
        this.write("verifier", null);
      }
    });
  }
  async call(name: string, args: Record<string, unknown>) {
    return this.exclusive(async () => {
      if (!this.connected) throw new AppError(`Verbind ${this.label} via MCP in Verbindingen`, 503);
      const client = new Client({ name: "bb", version: "0.1.0" });
      const transport = new StreamableHTTPClientTransport(new URL(this.url), {
        requestInit: { signal: AbortSignal.timeout(30000) },
        authProvider: this.provider(() => {
          throw new AppError(`${this.label}-login verlopen. Verbind opnieuw in Verbindingen.`, 401);
        }),
      });
      try {
        await client.connect(transport);
        const { tools } = await client.listTools();
        if (tools.some((tool) => tool.name === name))
          return await client.callTool({ name, arguments: args }, undefined, { timeout: 30000 });
        if (this.service === "sentry" && tools.some((tool) => tool.name === "execute_sentry_tool"))
          return await client.callTool(
            {
              name: "execute_sentry_tool",
              arguments: { name, arguments: args },
            },
            undefined,
            { timeout: 30000 },
          );
        throw new AppError(`${this.label} MCP biedt ${name} niet aan`, 502);
      } finally {
        await client.close().catch(() => {});
      }
    });
  }
}
