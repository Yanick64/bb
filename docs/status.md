# Implementation status

Updated 29 October 2026.

## Verified

- Strict typecheck, Biome, 43 tests and production build pass locally. The expanded suite covers client routing, automatic continuation, assignment, time records and Sentry OAuth in addition to the original workflow checks.
- Commit `4d3a4d7` passed the [GitHub Actions check job](https://github.com/Yanick64/bb/actions/runs/40919050876).
- Browser walkthrough completed on synthetic data: client question, answer, plan creation, approval, screenshot upload, positioned annotation, evidence acceptance, review acceptance and recorded delivery.
- The desktop action queue passes the automated WCAG 2 A/AA axe checks with zero violations.
- Live Amp integration completed two remote turns in one thread: structured question, human answer and a structured unapproved plan. This was a repo-less smoke test, not a claim that customer code was modified or deployed.
- A repository-backed orb checked commit `50342b5` with Bun 1.4.4. Its typecheck, lint, 30 tests and production build passed. It rendered the synthetic Studio Noord demo and attached an actual PNG, which BB downloaded into local storage with `amp files get`.
- That orb exposed a reverse-proxy bug: BB compared the internal HTTP origin against the configured HTTPS origin and returned 403. Commit `4d3a4d7` fixes the host check and secure cookies. The live retest passed through the HTTPS Portal: unauthenticated state returned 401, login returned 200, the cookie carried Secure, HttpOnly and SameSite=Strict, and the authenticated API and Studio Noord board loaded. All 31 tests and the production build also passed in the orb. Generated Amp Portal manifests are excluded from lint and Git because the service manages their formatting.
- The HTTPS browser capture is saved at [screenshots/orb-preview.png](screenshots/orb-preview.png). The viewport was 1440×1000 at DPR 2; the board scrolls horizontally. Verification thread: [Amp repository smoke test](https://ampcode.com/threads/T-01a1889e-ff79-724b-bff4-ce0982380b29).
- Actual Orbit `ListProjects`, `ListTickets` and `GetTicketDetail` response shapes were inspected read-only. A local catalog of 343 open/draft projects was imported through the local operator API. Only IDs, names and client names were retained. No catalog or customer data is tracked in Git.
- Orbit selection now uses client entities. A local catalog of 2,763 companies was imported, retaining only names and API IDs. A ticket without an Orbit project routed successfully through its client mapping.
- The updated live Amp smoke test passed two turns in thread `T-01a188e6-0e8e-70f7-970a-8cc9852d5b12`: the final blocking answer automatically queued continuation in the same thread and returned a plan without approving it.
- Synthetic browser checks passed developer assignment, a 25-minute time entry, human evidence/review acceptance and delivery using the generated note without manual text entry. Customer projects were not used for these checks.
- Light and dark desktop action pages and the time-entry dialog reported zero automated WCAG 2 A/AA violations. Axe flags gradients and hidden dialog backgrounds for manual inspection; this is not a claim of complete accessibility certification.
- New screenshots: [action queue](screenshots/agency-actions.png), [dark theme](screenshots/agency-dark.png), [mobile](screenshots/agency-mobile.png), [generated delivery](screenshots/agency-delivery.png). All contain synthetic data.

## Ready to use locally

The UI, persistent task workflow, project selection, question drafts, human review and delivery work without source credentials. The Amp CLI login on the development machine passed the live smoke test. Local `.env` enables the worker; new installations default to disabled until configured.

The demo project and QA changes are synthetic. They are labelled as examples and are stored only in the local database.

## Needs configuration

1. **Persistent Orbit access.** The supplied token is saved only in the ignored local environment. The official MCP endpoint rejected it with HTTP 401. Confirm its matching gateway URL or obtain an accepted bearer token. BB does not implement Orbit OAuth refresh yet. The client catalog and explicitly imported tickets remain available.
2. **Sentry authorization.** The OAuth flow reaches Sentry's login screen. The operator must complete that login from BB's Connections page. Two issues were imported through the coding assistant's existing MCP access; BB's own recurring connection is not yet authorized.
3. **Webhook forwarding.** The supplied URL belongs to an existing receiver. Forward it to BB or change the sender. Capture one actual event to confirm the envelope.
4. **Amp project setup.** Choose the Amp project for each real BB project, including its orb environment and MCP tool permissions.
5. **Optional BB MCP callbacks.** Supply an orb-reachable public URL and add a project-scoped token to Amp. Structured final reports already work without callbacks.

## Follow-up work

- Verify a code-changing task and draft PR in a disposable repository. Repository builds, HTTPS preview login and private screenshot import have been verified.
- Add full source pagination, reconciliation and durable rate-limit checkpoints. Orbit has an explicit connection check; current sync remains a bounded manual import.
- Add webhook receipt archival and run-event retention before sustained use.
- Add Gmail intake, reply-to-task association and client/project routing rules. Email remains a planned source.
- Import GitHub CI results and Amp Portal feedback instead of relying on attached evidence and external links.
- Add explicit remote cancellation only after verifying Amp's supported cancellation interface. Killing the observer currently does not claim to cancel an orb.
- Add per-user login, invitations, roles, actor-attributed approvals and workspace membership before shared team access. The developer roster and task assignments are implemented, but are not access control.
- Add worker leases and database migrations before multi-instance operation.
- Add correction/export and reviewed Orbit booking for local time entries. No invoice or external booking is created by the current time form.

## Review the build

Run `bun dev`, open http://localhost:5173 and explore **Studio Noord** or load the example on a fresh database. In **Projecten**, create a BB project and search the local Orbit client catalog. Select the clients whose tickets belong on that board.

Use **Volgende acties** to see what needs a decision and filter by developer. Add developers under **Team**. Open a task to assign it, record time and inspect questions, plan versions and evidence. Oplevering starts with an editable draft from the actual result.
