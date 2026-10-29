# Personal development workflow

The 29 October redesign replaces the earlier team-oriented dashboard.

## Read the request first

The default project view is a task list. A list/board switch keeps kanban available. Opening a task replaces the list with a document workspace. Its source content and conversation sit beside the next action on desktop; mobile puts the action above the document. Back navigation returns to the list.

The brand is 2DIGITS with its official favicon and the caption “Developmentwerkplek”. The interface uses one system UI sans, 15px reading text, 14px controls and a 13px metadata floor. Neutral surfaces separate navigation and documents. Purple identifies primary actions and selected tabs.

## Source-specific investigation

Orbit imports ticket details, conversation and attachment metadata. Empty ticket descriptions fall back to the first customer-visible message. Public messages and internal notes remain distinct. The original source is linked, HTML is rendered as plain text, and refresh enriches an existing task without replacing an operator-written description. The connector reports its 100-message cap. Expired attachment links require a fresh fetch or opening Orbit.

Sentry triage/planning requests fetch issue details and recent events through MCP before queueing Amp. The resulting snapshot includes stack information and environment/release context when supplied by Sentry. Amp must investigate the relevant event and affected flow before proposing a cause. The interface and prompt expose missing source access, preserving the last fetched context.

Manual tasks first distinguish a defect from a change request or research question. Orbit questions may end with a researched answer rather than a code change. Client drafts follow the client's language and exclude internal notes.

## Amp setup and recovery

Project settings list the projects accessible to the authenticated Amp CLI. Selection fills the repository and removes namespace guessing. Requested runs validate the selected project before queueing.

A confirmed project-not-found startup without a thread is failed, with an action to correct project settings. Unknown observer failures remain interrupted, because a remote orb may still be active. Failed work is never retried automatically.

## Approval, delivery and time

The final blocking answer still queues continuation atomically when eligible. Answers that invalidate approval return to planning. Changed plans and completed work require human approval. Delivery starts with an editable draft grounded in the accepted result.

The **Tijd** tab records your own minutes directly. It retains the distinction between new business, extensions, ongoing delivery, agreed paid preparation and unclassified time. These are local records; no invoice or Orbit booking is created. Earlier time and assignment records remain stored. Team navigation, developer filters and account-related UI have been removed.

## Connection status

The local Orbit bearer token is still rejected by the official MCP endpoint. Sentry's app-owned OAuth connection still needs login. Existing source snapshots were enriched through the coding assistant's authenticated MCP access, which is separate from the app's persistent connections. Webhook forwarding also needs configuration.

See [status](status.md) for verification and [architecture](architecture.md) for storage and execution boundaries.
