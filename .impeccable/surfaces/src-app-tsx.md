---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: ["src/styles.css", "src/components/task-detail.tsx"]
---

# Personal ticket workbench

Mode: Operate. The user chose project kanban boards, readable ticket detail and consistent purple action guidance, then delegated refinement without further questions.

## Direction contract

THESIS: A personal ticket workbench that puts the original request next to the next decision. Replace the metric dashboard and modal-within-modal feel.

OWN-WORLD: White reading surfaces, cool neutral navigation, dark text and one restrained purple action color. One system UI sans at 15px for content, 13px minimum for metadata. Real 2DIGITS favicon and wordmark text. Flat sections separated by spacing and rules.

STORY: Scan the work list, open a ticket, read its source and conversation, then investigate, answer, approve or review. Configuration errors offer a direct route to project settings.

FIRST VIEWPORT: A 240px navigation rail and a project kanban board, with a list toggle. An opened task replaces the board with a full-width document. One purple next-action bar sits above Ticket, Vragen, Plan, Review and Activiteit. On mobile the action stacks above the document.

FORM: Grounded candidate 4, the production desk's source document and decision margin. Seed 980c1b99. Other grounded candidates were issue tracker, correspondence inbox, case folder, build console, code-review queue and technical worksheet. The user's operational brief and delegation fix the selected form.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Challenger verdicts

- Crouwel grid: declined on identification and clarity. Keep consistent alignment, not giant constructed letters.
- Boarding pass and gate board: competitive on state clarity, weaker identification. Keep errors attached to the affected action.
- Transit diagram: declined on both axes. Keep orientation across workflow stages without a decorative map.
- Star atlas: declined on both axes. Keep a readable focus instead of shrinking the entire board.
- Reference manual: competitive on readable documents, weaker task visibility. Keep stable section navigation and generous reading measure.
- Exposure record: declined on both axes. Keep sufficient tonal separation without overlapping sheets or condensed labels.

## Constraints

Preserve user data. Remove team/account and time-registration UI, keeping recorded history. Show source context, safe text rendering and original links. Distinguish deterministic launch failures from uncertain remote disconnections. Source-specific investigation and project AI guidance must reach Amp. Google Mail imports one conversation per task and does not send mail.
