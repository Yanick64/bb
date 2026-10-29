import { auth } from "@modelcontextprotocol/sdk/client/auth.js";
import { McpOAuth } from "./mcp-oauth";
import type { Store } from "./store";

// Preserve the existing constructor and credential namespace for connected installations.
export class SentryMcp extends McpOAuth {
  constructor(store: Store, url: string, redirectUrl: string, authenticate: typeof auth = auth) {
    super(store, url, redirectUrl, "sentry", authenticate);
  }
}
