# Implementation status

Updated 29 October 2026 after the personal-workbench redesign.

## Verified in this revision

- Strict TypeScript, Biome, 50 tests and production build pass.
- Regression tests cover empty Orbit descriptions, conversation ordering within the same minute, existing-signal enrichment, preservation of operator descriptions, Sentry issue/event refresh and retained snapshots after failed access.
- Real CLI subprocess fixtures distinguish inaccessible-project startup failure from unknown observer loss and failure after a thread exists.
- The affected local Orbit task now contains its customer request, four comments, attachment metadata and an original-source link. Two local Sentry issues received deeper issue/event snapshots through the coding assistant's MCP connection.
- The affected Amp mapping was verified against the accessible project catalog and corrected. The confirmed pre-launch error was reconciled through the existing task API. No customer implementation was launched.
- Browser checks use synthetic Studio Noord data. The task list and full-page ticket were inspected at 1440px and 390px, with an additional list check at 800px. Mobile document width equals viewport width; reading text computes to 15px. The task detail has no dialog wrapper.
- Personal time registration saved 15 minutes under `self` through the browser with an empty member roster. The live affected ticket renders its 406-character request, four comments, two attachments, metadata, source link and corrected Amp mapping without horizontal overflow.
- The project picker lists actual accessible Amp projects and fills the matching repository on selection.
- Axe reported zero WCAG 2 A/AA violations on desktop/mobile ticket views and the dark task list. The reviewer checked the offscreen tab contrast manually and measured 5.60:1 in light mode and 8.36:1 in dark mode.
- Impeccable's final verdict is `ship`. The recheck confirmed mobile project-settings access, the secondary typography fixes and visible status at intermediate widths. The mechanical detector returned no findings. Local review evidence stays under `.impeccable/review/`; committed screenshots contain synthetic data.

## Previous integration evidence

The live automatic-continuation smoke test completed two remote turns in one thread and returned an unapproved plan. Existing repository smoke tests also exercised HTTPS preview login and authenticated screenshot import. These checks were completed before this redesign; this revision uses subprocess fixtures for failure classification rather than launching another customer orb.

## Needs configuration or verification

- Orbit persistent access still returns HTTP 401 for the local token. Confirm its matching MCP endpoint or provide accepted authorization. Credentials stay in ignored local storage.
- Finish BB's own Sentry OAuth login from **Verbindingen**. The coding assistant's connection does not authorize the application.
- Orbit's `/ticket/<number>` route was confirmed to reach tenant login. The authenticated destination could not be verified in this session. The source link and ticket number are available for checking after login.
- Configure actual webhook forwarding and capture one event to verify the envelope.
- Configure each Amp project's orb environment and MCP permissions. Optional BB MCP callbacks need an orb-reachable URL.

## Remaining product work

Full source pagination, scheduled reconciliation, webhook/event retention, time corrections/export, GitHub CI import and a disposable code-changing PR exercise remain follow-ups. The current workbench is for personal use and one server process per database.
