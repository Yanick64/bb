---
name: "2DIGITS Developmentwerkplek"
description: "A personal development workbench with readable tickets and visible next actions."
colors:
  background: "#ffffff"
  surface: "#fff"
  sidebar: "#f7f8fa"
  foreground: "#20232a"
  muted: "#626873"
  faint: "#626873"
  border: "#e3e5e9"
  soft: "#f2f3f5"
  primary: "#6836d5"
  primary-hover: "#6020d4"
  orange-soft: "#efe7ff"
  green: "#36745a"
  green-soft: "#eaf4ee"
  blue: "#4b6ba1"
  blue-soft: "#edf2fa"
  purple: "#6a30b4"
  purple-soft: "#efe7ff"
  rose: "#b8647b"
  background-dark: "#181a1f"
  surface-dark: "#1d2026"
  sidebar-dark: "#14161b"
  foreground-dark: "#eceef2"
  muted-dark: "#aeb4bf"
  faint-dark: "#aeb4bf"
  border-dark: "#353940"
  soft-dark: "#272b32"
  primary-dark: "#ba96ff"
  primary-hover-dark: "#cdb2ff"
  orange-soft-dark: "#302044"
  green-dark: "#8bbd9d"
  green-soft-dark: "#25392b"
  blue-dark: "#9aafd7"
  blue-soft-dark: "#293245"
  purple-dark: "#b4a0d3"
  purple-soft-dark: "#332d40"
  rose-dark: "#d598a9"
  on-primary: "#fff"
  on-primary-dark: "#1b102b"
  danger: "#ad3d32"
  error: "#b64436"
  error-background: "#b6443610"
  error-dark: "#efa18c"
  stage-inbox: "#aaa99f"
  stage-triage: "#b498c6"
  stage-planning: "#cfb06e"
  stage-in-progress: "#799bc4"
  stage-review: "#da875c"
  stage-delivery: "#80a5a3"
  stage-done: "#7c9d74"
typography:
  headline:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.7px"
  headline-mobile:
    fontSize: "26px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.7px"
  ticket-title:
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.7px"
  title:
    fontSize: "19px"
    fontWeight: 600
    lineHeight: 1.55
    letterSpacing: "-0.2px"
  section:
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.55
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
  reading:
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.8
  task-title:
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.5
  label:
    fontSize: "14px"
    fontWeight: 550
    lineHeight: 1.55
  label-small:
    fontSize: "13px"
    fontWeight: 550
    lineHeight: 1.55
  metadata:
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.55
  badge:
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.5
  identifier:
    fontFamily: '"SFMono-Regular", Consolas, monospace'
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "0.2px"
rounded:
  flat: "0"
  source: "4px"
  badge: "5px"
  navigation: "6px"
  control: "7px"
  inset: "8px"
  panel: "9px"
  dialog: "12px"
spacing:
  field-gap: "6px"
  control-gap: "7px"
  compact-gap: "8px"
  row-gap: "9px"
  navigation-gap: "10px"
  related-gap: "12px"
  form-gap: "14px"
  inset: "16px"
  stack-gap: "18px"
  mobile-gutter: "20px"
  section-inset: "24px"
  document-inset: "28px"
  desktop-gutter: "32px"
  document-gap: "40px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "9px 14px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-primary-dark:
    backgroundColor: "{colors.primary-dark}"
    textColor: "{colors.on-primary-dark}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "9px 14px"
  button-secondary-hover:
    backgroundColor: "{colors.soft}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "9px 14px"
  button-ghost-hover:
    backgroundColor: "{colors.soft}"
    textColor: "{colors.foreground}"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "9px 14px"
  button-small:
    typography: "{typography.label-small}"
    padding: "6px 10px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    padding: "9px 11px"
  navigation:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.navigation}"
    padding: "10px 12px"
  navigation-active:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    typography: "{typography.label}"
  badge:
    backgroundColor: "{colors.soft}"
    textColor: "{colors.muted}"
    typography: "{typography.badge}"
    rounded: "{rounded.badge}"
    padding: "3px 7px"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.panel}"
    padding: "21px"
  ticket-section:
    backgroundColor: "transparent"
    rounded: "{rounded.flat}"
    padding: "0"
  task-row:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    padding: "18px 12px"
  task-row-hover:
    backgroundColor: "{colors.soft}"
  ticket-tab:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    padding: "12px 14px"
---

# Design System: 2DIGITS Developmentwerkplek

## Overview

**Creative North Star: "The personal ticket workbench"**

2DIGITS Developmentwerkplek is a personal workspace for reading client requests and deciding what happens next. White documents, cool neutral navigation and restrained purple actions keep the task text prominent. The interface uses Dutch labels and the official 2DIGITS favicon beside a text wordmark.

System UI typography supports daily operational reading. Projects default to kanban; cross-project queues use separator-based lists. An opened ticket becomes a full-width document with one purple next-action bar above its tabs. Project boards and settings keep their bordered containers.

**Key Characteristics:**
- Neutral reading backgrounds in light and dark themes.
- System UI sans with readable content and metadata.
- Flat task rows and document sections.
- Purple actions, focus outlines and active-tab underlines.
- Next actions and workflow status remain visible at narrow widths.

This is a code-led record of seed `980c1b99`, refined for the user's kanban-first preference. Sources are `src/styles.css`, `src/App.tsx` and their shared components. Product context comes from `PRODUCT.md`. The current review is recorded in `.impeccable/review/workbench-refinement.md`. Later CSS overrides take precedence over earlier declarations.

## Colors

Purple identifies actions against cool neutrals. Supporting colors describe owners, sources and workflow states.

### Primary

`primary` colors primary buttons, keyboard focus, active-tab borders and original-source links. `primary-hover` is the button hover fill. `orange-soft` is the existing CSS name for the pale purple accent background, despite its historical name. Preserve the source name when editing tokens.

Primary button text uses `on-primary`; dark mode uses `on-primary-dark`. Dark mode replaces each root color with its matching `-dark` token. These suffixes document the actual `.dark` overrides, not additional CSS variable names.

### Secondary

`green` and `green-soft` mark accepted or completed work. `blue` and `blue-soft` mark Amp-owned work and messages. `purple` and `purple-soft` identify client-owned work. `rose` appears in project initials. The fixed `stage-*` colors accompany written workflow status; Inbox has an unfilled dot. Destructive buttons use `danger`, while inline errors use the separate `error` colors.

### Neutral

`background` is the page, `surface` is the control or container, and `sidebar` is navigation and internal-note fill. `foreground` is primary text. `muted` and `faint` intentionally resolve to the same readable value. `border` separates content; `soft` fills hover states and inset content. The duplicate white values and purple-tint aliases mirror the source rather than adding a new palette.

**The restrained accent Rule.** Keep task rows and ticket sections neutral; use purple for actions, focus and selection indicators.

## Typography

The headline and body use the system stack recorded in frontmatter. There is no separate display face. Task identifiers and inline code use the recorded monospace stack.

- `headline` applies to page titles. `ticket-title` keeps a slightly looser line height and a maximum width of 36ch. Both become 26px through 680px; ticket titles retain their 1.3 line height.
- `title` is the section-heading style. Subsections use `section`. The next-action heading uses 18px with a 1.4 line height; dialog headings use 20px.
- `body` is the default content style. `reading` adds a 1.8 line height and a maximum measure of 72ch for requests and conversations.
- `task-title` becomes 16px through 680px. Board-card titles use 15px, weight 550 and a 1.6 line height.
- Buttons use `label`; small buttons use `label-small`. Navigation is 14px, with weight 550 only when active.
- Metadata uses 13px, including source-result details and message timestamps. Source-result names use 14px and weight 550. Acceptance criteria use 15px. Badges keep their separate 1.5 line height.
- Generic form controls use 14px and become 16px through 680px. More specific search, source-filter, source-search select and stage-select rules retain 14px. Do not describe this as a universal mobile input-size change.

**The readable metadata Rule.** Use the implemented 13px metadata size for task, source and execution information.

## Layout

The desktop navigation rail is fixed at 240px, with a matching main-content offset. This supersedes the direction brief's proposed 224px rail and earlier stylesheet widths. The top bar is 60px high. Primary page gutters are 32px; page headers use 40px top and 28px bottom padding.

The task list spans the available content width, with no rounded outer frame or side borders. Desktop columns are `minmax(210px, 2.3fr) minmax(100px, 1fr) minmax(150px, 1.3fr) minmax(100px, 0.8fr)`, separated by 20px gaps. Rows use the frontmatter padding; column headings use 12px vertical padding.

The ticket workspace has a 1600px maximum width and `20px 32px 64px` padding. A vertical flex layout puts the next-action bar before the full-width document, with a 24px gap. The bar uses `20px 24px` padding, a purple tint and a right-aligned action. Document sections use 28px stack gaps; subsequent panel sections add a top divider and 28px top padding. The source document uses a 22px gap and source entries use 18px.

### Responsive behavior

- Through 1200px, the list hides the project column and uses `minmax(200px, 2fr) minmax(130px, 1fr) 110px`. Status stays visible.
- Project settings remain accessible above the ticket at every width. There is no secondary action sidebar.
- Through 900px, the page header stacks and the top-bar date disappears. From 681px through 900px, the list hides its headings and uses `minmax(0, 1fr) auto`. The title spans both columns, with next action and status on the second row.
- Through 680px, the main offset is zero and navigation becomes a 260px off-canvas rail. The top bar is 56px high with 16px horizontal padding. Page gutters are 20px; the header uses `28px 20px 24px`. List rows remain vertical flex stacks from the earlier mobile rule, with `20px 0` padding and 12px gaps. Later grid declarations do not change their flex display.
- Mobile ticket padding is `12px 20px 40px`. The action heading, description and button stack. Tabs scroll horizontally, use 12px padding and omit icons. Source-comment timestamps take their own line. Forms, evidence, project cards and connection cards become single-column; generic panels use 16px padding.
- Project boards scroll horizontally. Columns have a 280px minimum width and basis. Their usual 320px maximum disappears at 1750px and above. Small-screen columns retain a 450px minimum height; elsewhere it is 490px.

Keep next action and workflow status in each task row at desktop, tablet and mobile widths.

## Elevation & Depth

Ticket documents and task lists are flat. Borders, whitespace and neutral fills separate content. The active navigation item has no shadow. Primary buttons retain `0 1px 2px #0001`; board cards use `0 1px 3px #00000006`, changing to `0 3px 12px #00000008` on hover. The selected list/board toggle uses `0 1px 3px #00000012`. Dialogs use `0 24px 80px #0003`; toasts use `0 6px 40px #0002`.

The sidecar records these applied shadows. The unused root `--shadow` declaration is not a reusable elevation rule.

## Shapes

Controls have small rounded corners. Navigation and notices use `rounded.navigation`, buttons and fields use `rounded.control`, and generic panels use `rounded.panel`. Ticket sections and the task-list frame are square. Source badges use `rounded.source`, while regular badges use `rounded.badge`. Borders are generally 1px solid; active tabs use a 2px bottom border. Workflow dots are 7px circles with a 1.5px border. Icons are SVGs, not text glyphs.

## Components

### Buttons

The shared button has four variants: primary, secondary, ghost and destructive. Default minimum height is 40px. Small buttons have a 36px minimum height; icon buttons have a 40px minimum width and height with 7px padding. Secondary hover changes both fill and border; ghost hover changes fill and text. The destructive variant has no separate hover treatment in the source.

Buttons transition background and border color over 0.15s with the CSS default easing. Disabled buttons have 0.5 opacity and a not-allowed cursor. Keyboard focus uses a 2px primary outline with a 4px offset. Next-action buttons allow wrapping.

### Inputs and search

Fields have a surface fill, border stroke and the frontmatter padding. Labels sit 6px above the control; field groups add 8px bottom margin. Textareas resize vertically and use a 1.7 line height. Placeholders use `faint`; carets use `primary`. Task search wraps an unbordered input in a 6px-radius container with 10px horizontal padding and `min(340px, 100%)` width. Its focus outline surrounds the wrapper at a 2px offset.

Project AI context and customer communication are visible fields. Per-step instructions live in a disclosure. Google Mail uses a search/destination toolbar and separated conversation rows, stacking on mobile. Connection cards share **Verbinding controleren**, inline success/error feedback and a configuration disclosure; OAuth providers also offer **Aanmelden** or **Opnieuw aanmelden**.

### Navigation and tabs

Navigation items have a 42px minimum height, 10px icon gap and muted text. Hover uses `soft` and `foreground`; the active item uses `surface` and `foreground`, with a purple SVG icon. Counts use muted tabular numerals. The brand uses a 32px favicon and a 19px, weight-750 text wordmark.

Ticket tabs have a 48px minimum height and 14px text. Active tabs use foreground text, weight 600 and a purple underline. Arrow keys, Home and End move between tabs. Opening a ticket focuses its heading; returning to the list restores focus to its task row. The list/board toggle uses a soft rounded track and a surface-filled selected button.

The tabs are Ticket, Vragen, Plan, Review and Activiteit. Questions, plans and review use the same section-heading and dashed empty-state components. Time registration has no tab or controls.

### Badges and status

Neutral badges use a border and soft fill. Green, blue and accent badges replace the border with a transparent one. Source badges combine a small SVG with a written source name. Within list rows they lose their border, fill and padding. Stage dots always sit beside a written status.

### Containers and documents

Project and settings panels use the bordered `panel` style. Inside the ticket document, panels lose their frame, fill and inset; consecutive sections receive a top divider instead. Internal notes retain a sidebar fill, a border, 6px corners and 20px padding, reduced to 16px on mobile. Notes include an explicit Interne notitie badge.

Source text preserves whitespace, wraps long words and keeps original-source links underlined. Technical source details use a disclosure and a 13px preformatted block with a 640px maximum height. Conversation text stays in the document flow.

### Task rows and board cards

The whole row opens its ticket. Titles precede the identifier and source metadata. Hover uses `soft`; focus moves the global outline inward with a -2px offset so it remains visible inside the clipped list. Board cards retain their 7px corners, `13px 12px 0` padding and subtle hover shadow. Board summaries clamp to two lines; this truncation does not apply to the full ticket document.

### Motion

The mobile navigation translates over 0.2s. Loading SVGs rotate over 1.2s with linear infinite animation. Reduced-motion preference sets animation and transition durations to 0.01ms. No additional entrance or decorative motion is part of this system.

## Do's and Don'ts

### Do:

- Do use the final stylesheet cascade when extending the task list or ticket workspace.
- Do keep the written workflow status visible beside or below the next action.
- Do preserve the project-settings shortcut at every width.
- Do preserve source whitespace, readable line lengths and underlined original-source links.
- Do use theme variables for controls and document backgrounds.
- Do keep keyboard focus visible on rows, buttons, fields and tabs.

### Don't:

- Don't replace the system UI stack with the brand's marketing typography.
- Don't wrap every ticket section in a rounded card.
- Don't use workflow color as the only status label.
- Don't inherit earlier tiny metadata sizes or unused eyebrow styles as new design rules.
- Don't treat synthetic review captures as an approved visual comp.

The implementation is authoritative where older direction notes differ. The mechanical scan reports advisory values from earlier stylesheet rules, including overridden typography. These are not new palette or type tokens; inspect the computed styles of the rendered page. Current review evidence covers desktop, tablet and mobile in both themes.
