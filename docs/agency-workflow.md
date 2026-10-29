# Agency workflow changes

## Sources

Orbit mappings now select client entities. Tickets with no linked Orbit project can route to the correct board. Several clients can share one board. Existing project mappings keep working, with client matches taking precedence. Local catalogs contain only names and IDs and remain available during a failed connection.

Sentry supports an application-owned MCP OAuth connection with PKCE, expiring single-use state and persistent refresh credentials. BB reads project and issue tools only. The connection must be authorized separately from a coding assistant. Source synchronization reports partial failures rather than abandoning other mapped sources.

The local Belvaardig project now has the verified Orbit client and Sentry project mappings. Two Sentry issues and one open Orbit ticket were imported into its inbox. No implementation was launched for those tickets.

## From question to implementation

The final blocking answer queues continuation automatically when Amp is enabled and the previous run succeeded in the same project. The answer and queued run commit together in SQLite. Retried requests cannot enqueue the same continuation twice. Interrupted runs still require reconciliation.

Answers that invalidate approval return to planning. BB preserves findings and the remote thread, while requiring human approval of the resulting plan before code changes resume. A question created without a prior agent run does not launch an unexpected orb.

Agent instructions are in `server/agent-instructions.ts`. They cover full ticket context, reproduction, root-cause investigation, affected-flow checks, minimal implementation, unmerged draft PRs, technical review and delivery. They distinguish facts from hypotheses and require actual evidence. Client-facing text follows the client's language.

## Time and commercial context

The instructions distinguish new business, extensions, ongoing delivery and explicitly agreed paid preparation. They prohibit invented estimates, rates, approvals and SLA coverage. Technical plan approval is not proof of spending authorization.

The task's **Tijd** tab records actual developer minutes, date, work description, billing classification and agreement notes. Unknown classification can remain open. Paid preparation requires an agreement note. These are local records, not invoices or confirmed Orbit bookings. Amp execution time does not become developer time automatically.

## Review and delivery

A technical review run can inspect the implementation and report findings. It cannot accept the human review. Evidence remains bound to its plan version, review cycle and final revision.

Implementation and revision reports can include a client-language delivery draft. After human review, the delivery form shows that draft or a fallback assembled from accepted evidence. An optional delivery run refines the wording. The operator can edit the text or record it as generated. Recording a delivery does not send a message, merge a PR or deploy code.

## Team preparation

The team roster supports stable developer IDs, assignment, workload counts and filtering on boards and the action queue. Optimistic revisions prevent stale task writes. This prepares team planning, while login still uses one operator session. Personal accounts, invitations, permissions and actor-attributed approvals are the next step toward a shared workspace.

## Interface and performance

The interface uses the 2DIGITS purple `#762bff`, pale `#efeff8`, black and white. Fira Sans and Barlow are self-hosted as Latin WOFF2 files with their licenses. Mobile filters have a full-width search row. Light and dark themes share the same contrast-aware tokens.

Task details, project settings and task creation load on demand. The initial JavaScript bundle dropped from approximately 498 kB to 460 kB before gzip in the measured builds. Live state responses omit stored agent prompts and raw final JSON; the readable summary appears in the conversation. Full reports remain stored on the server.

## Remaining connection steps

- Finish Sentry login from **Verbindingen → Verbind Sentry via MCP**. An unfinished authorization expires after ten minutes, so start a new flow when returning.
- Confirm the Orbit token's matching MCP URL. The official endpoint returned 401 for the supplied token. The token remains in the local ignored `.env` only.
- Configure actual webhook forwarding and each customer's Amp project/environment before processing live work.

See [verification status](status.md) for test results and known follow-up work.
