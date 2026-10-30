# 2DIGITS development workbench

A personal workbench for Teamleader Orbit tickets, Sentry issues, Google Mail conversations and manual requests. Projects open as kanban boards. Read the original request, investigate, approve a plan, implement and review. The interface is in Dutch; the repository and internal task IDs retain the BB name.

![Project kanban board](docs/screenshots/workbench-board.png)

## Run it

Requires **Bun 1.4.4**. Remote execution also requires the [Amp CLI](https://ampcode.com/docs/cli).

```sh
bun install --frozen-lockfile
cp .env.example .env
bun dev
```

Open **http://localhost:5173**. The backend runs on port 4310. Start with **Voorbeeldproject laden** for synthetic examples, or create your own project. The app does not automatically import customer tickets.

For a built app:

```sh
bun run build
bun start
```

Open http://127.0.0.1:4310. Run one BB server per data directory.

## What works

- A project board with Inbox, Triage, Planning, In uitvoering, Review, Oplevering and Afgerond.
- A cross-project next-action queue showing whether you, the client or Amp is responsible.
- Explicit selection of Orbit clients. A BB project can combine several clients and Sentry projects. Existing Orbit project mappings remain supported.
- Manual tasks, source links, search, source filters and task conversations.
- Questions with a recipient, rationale, suggested answer and blocking phase. Client questions can become an editable, copyable message.
- Versioned plans. Approval is bound to the current version. Blocking answers invalidate approval so scope can be checked again.
- A durable Amp queue with bounded concurrency, streamed progress and continuation of the same remote thread.
- Automatic continuation after the final blocking answer, committed atomically with that answer. Changed scope returns to planning and requires fresh approval.
- The task action bar stays available on every tab and names the current Amp phase, the work being performed and who acts next. Saving the final blocking answer explains that Amp is continuing automatically.
- Separate triage, planning, implementation, revision, technical review and delivery instructions, including reproduction, affected-flow verification, client language and billing rules.
- Review criteria, screenshots with positioned comments, previews, PR links, documents and actual check-status fields. Old evidence cannot authorize a new execution cycle.
- Explicit human review and delivery. A customer question can end in a reviewed answer without creating a PR.
- An editable delivery draft generated from actual results, with a reviewed-evidence fallback. Recording delivery does not send a client message or deploy code.
- Project AI context, customer communication preferences and optional instructions for each workflow step. Amp receives general guidance plus only the active step's instructions.
- Google Mail search with pagination, project selection and one deduplicated task per conversation.
- Project-specific mail sender addresses and domains, with visible destination suggestions and manual overrides during import.
- Read-only Orbit/Sentry intake, stable source-ID deduplication and a persistent Orbit webhook inbox.
- A project-scoped BB MCP endpoint for task context, questions, proposed plans and evidence.
- Responsive layout, light/dark themes, keyboard-accessible dialogs and live updates.
- A full-page ticket workspace, readable system typography, neutral surfaces and the official 2DIGITS favicon. Purple marks primary actions and active tabs. Ticket and project code loads on demand.
- Orbit conversation import, explicit internal-note labels, attachment metadata and original-source links. Refresh enriches existing signals without duplicating tasks or replacing operator-written descriptions.
- Sentry issue details and recent events fetched through MCP before requested triage/planning runs. Missing access stays visible alongside the last available snapshot.

## Connect Amp

On the machine running BB:

```sh
amp login
```

Set `BB_AMP_ENABLED=true` in `.env`, restart BB, then select an accessible **Amp-project** in project settings. The list comes from `amp projects list --json`; selecting an entry also fills its repository. BB validates access before accepting a requested run. Configure the orb environment, secrets and MCP tools in Amp. `AMP_API_KEY` can replace interactive CLI login on an unattended host.

BB launches `amp -ox --stream-json --no-archive-after-execute` and stores the returned thread ID. Follow-up turns use `amp threads continue`. The CLI observes the execution; **the agent runs in an Amp Orb**. A disconnected observer does not stop the remote agent. BB marks that run interrupted and requires reconciliation instead of silently retrying it.

A confirmed inaccessible-project launch failure without a thread is marked failed and points to project settings. Unknown exits and runs with a remote thread retain the interrupted status.

The project setting is optional for repo-less questions and investigations. Launches use an empty temporary directory so they cannot accidentally select BB's own repository.

Screenshots uploaded to BB accompany subsequent Amp turns as attachments. For screenshot URLs hosted by Amp, BB attempts authenticated download with `amp files get` and stores the image locally. Other screenshot URLs remain links. Private attachments can always be uploaded manually if download is unavailable.

If Amp returns a screenshot without a URL, BB imports it as a document noting the missing image. Its check status becomes `not_run` and its criterion moves into the notes, so it cannot satisfy review criteria. The summary, questions and other evidence are retained. Other invalid report fields still reject the report with field-level diagnostics; the original output remains in run history.

**Optional live smoke test, consumes Amp usage:**

```sh
bun run test:amp
```

It starts one repo-less orb, receives a structured question, records an answer and automatically continues the same thread to obtain an unapproved plan. Its database is separate from the app, at `data/amp-smoke.sqlite`.

### BB MCP

Set `BB_PUBLIC_URL` to an HTTPS origin reachable from the orb and set `BB_PASSWORD`. In **Verbindingen**, generate a key for the relevant BB project. Add the resulting endpoint and bearer token to that Amp project's remote MCP settings.

The endpoint exposes `get_task`, `ask_question`, `propose_plan` and `submit_evidence`. It cannot approve plans, accept reviews, mark delivery or read another project's tasks. Keys are stored as hashes; generating another key revokes the previous one.

The CLI's structured final report works without this callback connection. A Tailscale-only hostname is not automatically reachable from an Amp-hosted orb.

## Connect sources

### Teamleader Orbit

Set `ORBIT_MCP_URL=https://api.orbit.teamleader.eu/mcp`. In **Verbindingen**, choose **Aanmelden** on Teamleader Orbit and sign in with an account that has MCP read access. BB registers an OAuth client and stores access and refresh tokens in private SQLite settings. The callback is `http://localhost:4310/api/orbit/oauth/callback`, or the same path on `BB_PUBLIC_URL`. State expires after ten minutes and is consumed once; the SDK handles PKCE and token refresh.

The official MCP endpoint uses OAuth rather than a static API key. `ORBIT_MCP_TOKEN` only applies to a custom gateway and must match that gateway's URL. Use **Verbinding controleren** to verify access. The coding assistant's MCP authorization does not automatically authorize BB.

Set `ORBIT_WEB_URL` to your tenant's web origin for ticket links. Open project settings, search Orbit and select clients. **Bronnen ophalen** imports active tickets, at most 100 per selected client. Each import reads ticket details and up to 100 conversation entries, including internal notes, and enriches previously imported tickets. Empty description fields fall back to the first customer-visible message. Markup is converted to plain text. Download URLs expire; refresh the ticket context to renew them.

Tickets do not need an Orbit project. Client routing takes precedence over legacy project mappings. Repeating intake does not duplicate tasks. Unmapped webhook tickets land in the general inbox. Source errors are reported separately so one unavailable connection does not block another source.

BB also supports a local client-catalog snapshot, labelled with its capture date. It retains only names and IDs and stays available if live access fails. Orbit company web links use CP identifiers; the MCP client API uses CL identifiers. Select verified catalog entries rather than deriving IDs from web links. Catalogs and customer data stay in SQLite, outside Git.

### Sentry

Set `SENTRY_MCP_URL=https://mcp.sentry.dev/mcp`, `SENTRY_ORG` and `SENTRY_BASE_URL` for your region. In **Verbindingen**, choose **Aanmelden** on Sentry and finish the login. BB stores its own OAuth tokens in private SQLite settings. State expires after ten minutes, is consumed once, and the SDK uses PKCE and token refresh. Concurrent credential operations are rejected rather than racing. Select the relevant Sentry projects in project settings, then fetch sources.

The callback is `${BB_PUBLIC_URL}/api/sentry/oauth/callback`, or `http://localhost:4310/api/sentry/oauth/callback` locally. Changing the origin requires a fresh connection. Optional `SENTRY_AUTH_TOKEN` enables REST fallback. Both adapters use organization plus issue short ID for deduplication. MCP synchronization imports unresolved issues active in the past seven days, up to 100 per project.

Intake currently imports a bounded window of unresolved issues, at most 100 per project, and reports when the result is limited. Scheduled reconciliation, full history and automatic CI polling are follow-up work.

Requested triage and planning refresh `get_sentry_resource` and `search_issue_events` through MCP. The issue snapshot and ten recent events from the past seven days accompany the Amp prompt. Amp investigates relevant stack frames, releases, environments and linked events. Orbit research instead starts from the customer question and conversation; manual work first distinguishes a reported defect from a request or question.

### Google Mail

BB starts a separate read-only `workspace-mcp` stdio connection using the same local Google client configuration and cached authorization as your Google Workspace MCP. Install `uvx` and authorize the account through Google Workspace MCP first. Create a private `data/google-workspace.json`:

```json
{
  "command": ["uvx", "workspace-mcp", "--tools", "gmail", "--read-only"],
  "environment": {
    "GOOGLE_OAUTH_CLIENT_ID": "YOUR_GOOGLE_CLIENT_ID",
    "GOOGLE_OAUTH_CLIENT_SECRET": "YOUR_GOOGLE_CLIENT_SECRET"
  }
}
```

Copy the command and required environment from your existing local MCP configuration, preserving any authorization-related settings it needs. Set `GOOGLE_WORKSPACE_CONFIG=./data/google-workspace.json` and `GOOGLE_WORKSPACE_EMAIL` in `.env`, restrict the JSON file to its owner and restart the full dev process. Tokens are not exported through chat tools or stored in Git.

Open **Google Mail**, search with Gmail operators, choose a destination and select **Maak taak**. Each account/thread pair produces at most one task. Reimport enriches the existing task without moving it to another project. Search returns up to 20 messages per page, deduplicated into conversations. Next/previous pagination preserves the search. The imported conversation is capped at 150,000 characters and shows a warning when truncated. Attachments remain in Google Mail. No sending or mailbox mutation is exposed.

In **Projectinstellingen → Google Mail**, enter sender addresses such as `contact@client.example` or domains such as `@client.example`, one per line. **Automatisch op afzender** suggests a destination from each search result's sender. Exact addresses take precedence over domain rules; domains match exactly, without subdomains. Unmatched or ambiguous senders use the general inbox, and the interface identifies ambiguous matches so you can select a project. **Maak taak** imports into the displayed destination. These rules do not create tasks automatically or move existing tasks. API imports that omit `projectId` match the original thread sender; an explicit `null` selects the general inbox.

### Remove a connection

The red trash icon beside **Verbinding controleren** disconnects a service from this workbench. The choice persists across restarts. Orbit and Sentry discard their local OAuth credentials and pending logins. Google Mail closes its MCP session, and removing the webhook stops receipt intake and processing. Amp can be removed after queued and running executions finish. **Opnieuw verbinden** reuses the local configuration or starts OAuth again. Existing tasks and source snapshots remain available; shared CLI/Google credentials and `.env` configuration are managed outside this screen.

### Project AI guidance

Project settings contain **AI-context** for product knowledge, technical agreements and constraints, plus **Klantcommunicatie** for language, tone and preferences. Optional per-step instructions cover investigation, planning, implementation, revisions, technical review and delivery. Existing projects receive empty defaults. Guidance applies to subsequent runs; it cannot remove approval or review requirements.

### Teamleader Orbit webhooks

BB accepts `POST /api/webhooks/orbit`, authenticated with `BB_ORBIT_WEBHOOK_SECRET`. See [the payload and forwarding guide](docs/webhooks.md).

Set `BB_WEBHOOK_URL` to the full HTTPS webhook URL when exposing only this route through Tailscale Funnel. The public host is permitted only for webhook POST requests. The UI and OAuth callbacks remain local. **Verbinding controleren** sends an authenticated challenge without creating a receipt or task.

An existing webhook receiver must forward to BB, or the sender must be pointed at BB's endpoint. Merely having the existing receiver's URL does not subscribe BB to its events. No existing receiver has been modified.

## Data and access

- SQLite, screenshots and local catalogs are in `data/`, ignored by Git.
- `.env` is ignored. `.env.example` contains configuration names, not credentials.
- Loopback access is the default. A non-loopback bind or configured public origin requires `BB_PASSWORD`.
- Public hosting needs HTTPS and a persistent disk. The current app is single-operator, not a multi-tenant SaaS.
- Keep one server per workspace database. The UI is intended for personal use.
- Time-registration controls have been removed. Existing historical records remain in the private database.
- BB enforces its own workflow transitions, version checks and MCP scope. Amp's repository and external-tool permissions are configured in Amp. Phase instructions in prompts are not a security sandbox.
- No automatic merge, production deployment or client-message sending is implemented in BB.

Create a consistent database and screenshot backup:

```sh
bun run backup
```

Backups are written under `data/backups/`. Copy them to your own backup storage. To restore, stop BB, restore `bb.sqlite` and `uploads/` into a fresh data directory, and start with `BB_DATA_DIR` pointing there. Do not overlay an active database or its WAL files.

## Checks and current status

```sh
bun run check
```

This runs strict TypeScript, Biome, the test suite and a production build. GitHub Actions runs the same checks. Tests cover source enrichment, Sentry context refresh, client routing, deduplication, exact-plan approvals, automatic continuation, stale evidence, generated delivery, time records, OAuth state/expiry/replay, authenticated webhooks, HTTPS reverse proxies, MCP project boundaries, persistence and worker failure classification.

See [verification and remaining work](docs/status.md) and [architecture](docs/architecture.md).
