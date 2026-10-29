# Architecture

```text
Orbit MCP / webhooks     Sentry MCP / API       Manual input
          \                 |                 /
              Normalized source signals
                         |
               BB project + task store
              SQLite / optimistic revision
                         |
              Versioned plan + approval
                         |
                    Durable queue
                         |
               Amp CLI remote adapter
                         |
                Amp thread + its orb
           Repository / MCP tools / browser
                         |
              Structured report / BB MCP
                         |
           Evidence -> human review -> delivery

React UI <-> Hono HTTP API + SSE <-> SQLite
```

## Boundaries

| Module                         | Responsibility                                                                          |
| ------------------------------ | --------------------------------------------------------------------------------------- |
| `shared/domain.ts`             | Zod boundary schemas, inferred types and deterministic next actions                     |
| `server/store.ts`              | SQLite transactions, projects, task aggregates, signals, run events and settings        |
| `server/workflow.ts`           | Plan approval, questions, review gates, delivery and idempotent intake                  |
| `server/amp.ts`                | Queuing, remote CLI execution, JSON-lines consumption, thread continuation and recovery |
| `server/artifacts.ts`          | Validated image storage and private Amp screenshot retrieval                            |
| `server/connectors.ts`         | Read-only Orbit client and Sentry MCP/REST adapters                                     |
| `server/sentry-mcp.ts`         | Persistent OAuth connection, PKCE/state checks, serialized credential operations        |
| `server/agent-instructions.ts` | Agency-wide rules and phase-specific execution instructions                             |
| `server/webhooks.ts`           | Authenticated, persisted receipt inbox and explicit payload normalization               |
| `server/mcp.ts`                | Project-scoped agent access without approval or delivery capabilities                   |
| `server/app.ts`                | HTTP boundaries, authentication, uploads, live notifications and static serving         |
| `src/components/`              | Project selection, task conversation, questions, plan editing and review                |

React + Vite serves the operator UI. Hono runs on Bun. SQLite uses WAL and synchronous transactions. This first version uses Bun's SQLite driver directly rather than adding an ORM or workflow framework. Task-local questions, plans and evidence are stored together as JSON; globally unique signal identities and run events have their own tables.

This design assumes one server process per database. It does not claim distributed leases or multi-node scheduling. Before team-scale operation, add database migrations, relational indexes for growing collections, per-user identity and an explicit worker lease protocol.

## Workflow rules

- A task may start without a project. Execution requires an assigned project.
- A BB project can select multiple Orbit clients and Sentry projects. Each provider/scope/external ID maps to at most one BB project. Orbit client-ID matches take precedence over legacy project-ID matches.
- Signals have stable provider/external-ID identity. Several signals may link to one task.
- Plan contents are versioned. Only the latest plan can be approved. A new version does not inherit approval.
- Blocking questions identify the phase they prevent. An answer to a blocking question invalidates prior plan approval and review.
- The final blocking answer and automatic continuation share one transaction. Continuation requires Amp enabled and a successful prior run in the same BB/Amp project. Failed and interrupted runs are never retried automatically. Implementation answers return to planning because approval was invalidated.
- Implementation/revision execution requires the approved current plan and no unresolved planning/implementation questions.
- Each implementation turn starts a new review cycle. Evidence from an earlier cycle remains visible as history but cannot authorize delivery.
- Review requires accepted evidence for every criterion at the current code/document revision. Failed, unconfigured, running or unrun checks cannot be treated as passed.
- Delivery records what was delivered. It requires the accepted current review and no unresolved blocking questions.
- Delivery drafts carry the plan version and review cycle. New scope or implementation invalidates them. If no current draft exists, BB builds an editable note from accepted evidence. Technical review and delivery agent runs cannot grant human approval.
- A task has one optional roster assignee. Local time entries identify a roster member, actual minutes, date, classification and agreement. Roster membership is not authentication or authority to approve work.
- A successful Amp process is an execution result, not human acceptance. Malformed structured output produces a manual-review action.

## Recovery and idempotency

Source creation and signal association share a SQLite transaction. A unique provider/external-ID constraint prevents duplicate tasks after repeated deliveries. Exact duplicate questions, plans and evidence do not create repeated entries.

Mutations from the UI carry the task revision. A stale request returns 409 rather than overwriting intervening work. The worker stores a queued run before launching Amp and marks it running before starting the CLI. On restart, running turns become interrupted, since their remote orbs may still be working. Queued work remains queued.

There is no claim of exactly-once remote thread creation. If the CLI loses the connection before returning a thread ID, BB requires manual reconciliation. It does not automatically retry a possibly successful external operation.

SSE announces changes, but the database is authoritative. Disconnecting the UI does not discard task history. An interrupted BB process does not imply a cancelled Amp orb.

## Review evidence

Evidence carries a plan version, execution cycle, code/document revision, criterion, reported check status and separate human review decision. Screenshots store normalized annotation coordinates so comments scale with the image.

Preview links open externally. Embedded Amp Portals and imported Portal annotations have not been implemented. Test results in the report are agent- or operator-supplied evidence for human review; BB does not independently rerun customer tests or query GitHub CI yet.

## Source details

Orbit's inspected `ListProjects` output is a Markdown table with a separate ordered API-ID list. The adapter validates column count and row/ID alignment and stops on unexpected shapes. Ticket detail is structured JSON. Contract tests use synthetic fixtures rather than customer records.

Incoming webhook bodies are persisted before enrichment. Known ticket IDs are resolved through `GetTicketDetail`; normalized BB signal envelopes work directly. Unknown shapes remain inspectable for mapping. Failed enrichment is retained for an explicit retry.

Email is a later connector. The intended model separates client identity rules from project routing rules. Conflicting matches belong in the shared inbox. The current app does not claim Gmail ingestion or regex routing is implemented.
