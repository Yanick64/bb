# Implementation status

Updated 29 October 2026.

## Verified

- Strict typecheck, Biome, 31 tests and production build pass locally.
- Commit `4d3a4d7` passed the [GitHub Actions check job](https://github.com/Yanick64/bb/actions/runs/40919050876).
- Browser walkthrough completed on synthetic data: client question, answer, plan creation, approval, screenshot upload, positioned annotation, evidence acceptance, review acceptance and recorded delivery.
- The desktop action queue passes the automated WCAG 2 A/AA axe checks with zero violations.
- Live Amp integration completed two remote turns in one thread: structured question, human answer and a structured unapproved plan. This was a repo-less smoke test, not a claim that customer code was modified or deployed.
- A repository-backed orb checked commit `50342b5` with Bun 1.4.4. Its typecheck, lint, 30 tests and production build passed. It rendered the synthetic Studio Noord demo and attached an actual PNG, which BB downloaded into local storage with `amp files get`.
- That orb exposed a reverse-proxy bug: BB compared the internal HTTP origin against the configured HTTPS origin and returned 403. Commit `4d3a4d7` fixes the host check and secure cookies. The live retest passed through the HTTPS Portal: unauthenticated state returned 401, login returned 200, the cookie carried Secure, HttpOnly and SameSite=Strict, and the authenticated API and Studio Noord board loaded. All 31 tests and the production build also passed in the orb. Generated Amp Portal manifests are excluded from lint and Git because the service manages their formatting.
- The HTTPS browser capture is saved at [screenshots/orb-preview.png](screenshots/orb-preview.png). The viewport was 1440×1000 at DPR 2; the board scrolls horizontally. Verification thread: [Amp repository smoke test](https://ampcode.com/threads/T-01a1889e-ff79-724b-bff4-ce0982380b29).
- Actual Orbit `ListProjects`, `ListTickets` and `GetTicketDetail` response shapes were inspected read-only. A local catalog of 343 open/draft projects was imported through the local operator API. Only IDs, names and client names were retained. No catalog or customer data is tracked in Git.

## Ready to use locally

The UI, persistent task workflow, project selection, question drafts, human review and delivery work without source credentials. The Amp CLI login on the development machine passed the live smoke test. Local `.env` enables the worker; new installations default to disabled until configured.

The demo project and QA changes are synthetic. They are labelled as examples and are stored only in the local database.

## Needs configuration

1. **Persistent Orbit access.** The BB server needs its own `ORBIT_MCP_URL` and any required token. The current coding assistant's MCP connection was used for inspection and the catalog snapshot. It is not a persistent runtime credential.
2. **Sentry access.** Supply the organization, regional base URL and read-only API token, then select projects.
3. **Webhook forwarding.** The supplied URL belongs to an existing receiver. Forward it to BB or change the sender. Capture one actual event to confirm the envelope.
4. **Amp project setup.** Choose the Amp project for each real BB project, including its orb environment and MCP tool permissions.
5. **Optional BB MCP callbacks.** Supply an orb-reachable public URL and add a project-scoped token to Amp. Structured final reports already work without callbacks.

## Follow-up work

- Verify a code-changing task and draft PR in a disposable repository. Repository builds, HTTPS preview login and private screenshot import have been verified.
- Add full source pagination, reconciliation, connection health checks and durable rate-limit checkpoints. Current sync is a bounded manual import; webhooks handle new ticket arrival.
- Add webhook receipt archival and run-event retention before sustained use.
- Add Gmail intake, reply-to-task association and client/project routing rules. Email remains a planned source.
- Import GitHub CI results and Amp Portal feedback instead of relying on attached evidence and external links.
- Add explicit remote cancellation only after verifying Amp's supported cancellation interface. Killing the observer currently does not claim to cancel an orb.
- Add per-user access, worker leases and migrations before multi-user or multi-instance operation.

## Review the build

Run `bun dev`, open http://localhost:5173 and explore **Studio Noord** or load the example on a fresh database. In **Projecten**, create a BB project and search the local Orbit catalog. Select only the projects you want grouped together.

Use **Mijn volgende acties** to see what needs a decision. Open a task to inspect its questions, plan versions and review evidence. Add a screenshot, click a position to leave feedback and check that a new execution cannot reuse earlier acceptance.
