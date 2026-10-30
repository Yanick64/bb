import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ClipboardList,
  FileText,
  History,
  MessageCircle,
  Play,
  Send,
  Settings2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { TaskCommand } from "../../server/workflow";
import {
  activeRun,
  currentPlan,
  deliveryText,
  type Project,
  phaseLabels,
  type Run,
  type Signal,
  stageLabels,
  stages,
  type Task,
} from "../../shared/domain";
import { api, useAction, useToast } from "../lib/api";
import { runProgress, runStatusLabels, taskProgress } from "../lib/task-progress";
import { Empty, ExternalLink, Field, Priority, relativeDate, SourceBadge } from "./common";
import { SourceContext } from "./source-context";
import { QuestionsPanel } from "./task-questions";
import { ReviewPanel } from "./task-review";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";

export type SendCommand = (command: TaskCommand, onSuccess?: () => void) => void;
type Tab = "overview" | "questions" | "plan" | "review" | "activity";
export function TaskDetail({
  task,
  projects,
  ampEnabled,
  onClose,
  onProjectSettings,
}: {
  task: Task;
  projects: Project[];
  ampEnabled: boolean;
  onClose: () => void;
  onProjectSettings: () => void;
}) {
  const action = useAction();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("overview");
  const [editingPlan, setEditingPlan] = useState(false);
  const [runMode, setRunMode] = useState<Run["mode"] | null>(null);
  const plan = currentPlan(task);
  const run = activeRun(task);
  const next = taskProgress(task);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const project = projects.find((p) => p.id === task.projectId);
  const latest = task.runs.at(-1);
  const investigation =
    task.source === "sentry"
      ? "Issue-details, stacktrace en recente gebeurtenissen ophalen. Daarna de fout onderzoeken."
      : task.source === "orbit"
        ? "Klantvraag, ticketgesprek en bijlagen lezen. Daarna bepalen wat onderzoek of een antwoord vraagt."
        : "Eerst bepalen: een probleem oplossen, een wijziging uitwerken of een vraag beantwoorden.";
  const context = useQuery({
    queryKey: ["context", task.id],
    queryFn: () =>
      api<{
        signals: Signal[];
        events: {
          id: number;
          runId: string;
          data: { text?: string; tools?: string[] };
          createdAt: string;
        }[];
      }>(`/api/tasks/${task.id}/context`),
  });
  const send: SendCommand = (command, onSuccess) =>
    action.mutate(
      { path: `/api/tasks/${task.id}/commands`, body: { revision: task.revision, command } },
      {
        onSuccess: (result) => {
          if (command.type === "answer") {
            const updated = result as Task;
            toast(
              updated.runs.length > task.runs.length
                ? "Antwoord opgeslagen. Amp gaat automatisch verder met je antwoorden. Volg de voortgang bovenaan."
                : "Antwoord opgeslagen",
            );
          }
          onSuccess?.();
        },
      },
    );
  function requestRun(mode: Run["mode"]) {
    if (!ampEnabled) {
      toast("Amp is nog niet verbonden. Zie Verbindingen voor de instellingen.", true);
      return;
    }
    setRunMode(mode);
  }
  return (
    <article className="ticket-workspace">
      <div className="ticket-back row">
        <Button variant="ghost" onClick={onClose}>
          <ArrowLeft size={16} />
          Terug naar taken
        </Button>
        <span className="muted">
          BB-{String(task.number).padStart(3, "0")} · {project?.name ?? "Algemene inbox"}
        </span>
        {project ? (
          <Button
            className="ticket-project-shortcut"
            variant="ghost"
            size="sm"
            onClick={onProjectSettings}
          >
            <Settings2 size={15} />
            Projectinstellingen
          </Button>
        ) : null}
      </div>
      <div className="task-top">
        <div className="row wrap">
          <SourceBadge source={task.source} />
          <Priority value={task.priority} />
          {task.demo ? <span className="badge">Voorbeeld</span> : null}
          <span className="spacer" />
          <select
            className="stage-select"
            aria-label="Taakstatus"
            value={task.stage}
            disabled={Boolean(run) || action.isPending}
            onChange={(e) => send({ type: "stage", stage: e.target.value as "triage" })}
          >
            {stages.map((stage) => (
              <option key={stage} value={stage} disabled={stage === "delivery" || stage === "done"}>
                {stageLabels[stage]}
              </option>
            ))}
          </select>
        </div>
        <h1 ref={heading} tabIndex={-1}>
          {task.title}
        </h1>
      </div>
      <div className="ticket-layout">
        <aside className="ticket-actions stack" aria-label="Volgende stap">
          <section className="next-action">
            <div role="status" aria-live="polite">
              <span className="next-action-status">{next.status}</span>
              <h2>{next.label}</h2>
              <p>{next.detail}</p>
              {next.after ? <p className="next-action-after">{next.after}</p> : null}
            </div>
            {next.owner !== "none" ? (
              <Button
                disabled={action.isPending}
                onClick={() => {
                  if (!task.projectId) setTab("overview");
                  else if (latest?.status === "failed") requestRun(latest.mode);
                  else if (next.tab === "overview" && !run && task.stage !== "delivery")
                    requestRun("triage");
                  else {
                    setTab(next.tab);
                    const target = document.getElementById(`tab-${next.tab}`);
                    target?.focus();
                    target?.scrollIntoView({ block: "nearest" });
                  }
                }}
              >
                <ArrowRight size={16} />
                {!task.projectId
                  ? "Kies een project"
                  : latest?.status === "failed"
                    ? "Opnieuw starten"
                    : next.tab === "overview" && !run && task.stage !== "delivery"
                      ? "Start onderzoek"
                      : next.tab === "overview"
                        ? "Bekijk oplevering"
                        : next.tab === "activity"
                          ? "Bekijk uitvoering"
                          : next.tab === "questions"
                            ? "Beantwoord vragen"
                            : next.tab === "plan"
                              ? "Bekijk plan"
                              : "Bekijk review"}
              </Button>
            ) : null}
          </section>
          {latest?.error ? (
            <section className="context-notice stack">
              <h3>
                {latest.status === "failed" ? "Uitvoering mislukt" : "Uitvoering controleren"}
              </h3>
              <p>
                {!latest.threadId && latest.error.includes("No accessible Amp project matches")
                  ? "Amp kon het vorige project niet vinden. Er is geen thread gestart. Controleer het geselecteerde project en probeer opnieuw."
                  : latest.error}
              </p>
              {project ? (
                <Button variant="secondary" size="sm" onClick={onProjectSettings}>
                  Projectinstellingen
                </Button>
              ) : null}
            </section>
          ) : null}
        </aside>
        <div className="ticket-document">
          <div className="task-tabs" role="tablist" aria-label="Taakonderdelen">
            {(
              [
                ["overview", "Ticket", FileText],
                [
                  "questions",
                  `Vragen${task.questions.filter((q) => !q.answer).length ? ` · ${task.questions.filter((q) => !q.answer).length}` : ""}`,
                  MessageCircle,
                ],
                ["plan", "Plan", ClipboardList],
                ["review", "Review", Check],
                ["activity", "Activiteit", History],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                type="button"
                role="tab"
                id={`tab-${key}`}
                aria-controls={`panel-${key}`}
                aria-selected={tab === key}
                tabIndex={tab === key ? 0 : -1}
                className={tab === key ? "active" : ""}
                key={key}
                onClick={() => setTab(key)}
                onKeyDown={(event) => {
                  const tabs: Tab[] = ["overview", "questions", "plan", "review", "activity"];
                  const index = tabs.indexOf(key);
                  const target =
                    event.key === "ArrowRight"
                      ? tabs[(index + 1) % tabs.length]
                      : event.key === "ArrowLeft"
                        ? tabs[(index + tabs.length - 1) % tabs.length]
                        : event.key === "Home"
                          ? tabs[0]
                          : event.key === "End"
                            ? tabs[tabs.length - 1]
                            : null;
                  if (target) {
                    event.preventDefault();
                    setTab(target);
                    document.getElementById(`tab-${target}`)?.focus();
                  }
                }}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>
          <div
            className="task-content"
            role="tabpanel"
            id={`panel-${tab}`}
            aria-labelledby={`tab-${tab}`}
          >
            {tab === "overview" ? (
              <div className="stack">
                {!task.projectId ? (
                  <section className="panel">
                    <Field label="Kies een project">
                      <select
                        defaultValue=""
                        onChange={(e) => {
                          if (e.target.value) send({ type: "assign", projectId: e.target.value });
                        }}
                      >
                        <option value="">Selecteer project…</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </section>
                ) : null}
                <SourceContext
                  task={task}
                  signals={context.data?.signals ?? []}
                  loading={context.isPending}
                  error={context.error?.message}
                  pending={action.isPending}
                  refresh={() =>
                    action.mutate(
                      { path: `/api/tasks/${task.id}/context/refresh`, body: {} },
                      {
                        onSuccess: (result) => {
                          const r = result as { warnings: string[] };
                          toast(
                            r.warnings.length ? r.warnings.join(" ") : "Broncontext bijgewerkt",
                            Boolean(r.warnings.length),
                          );
                        },
                      },
                    )
                  }
                />
                <form
                  className="panel stack"
                  onSubmit={(e) => {
                    e.preventDefault();
                    send(
                      {
                        type: "summary",
                        summary: String(new FormData(e.currentTarget).get("summary")),
                      },
                      () => toast("Samenvatting opgeslagen"),
                    );
                  }}
                >
                  <div className="section-heading">
                    <h3>Onderzoek en resultaat</h3>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={Boolean(run) || action.isPending}
                      onClick={() => requestRun("triage")}
                    >
                      <Play size={13} />
                      {task.runs.length ? "Vervolg onderzoek" : "Laat Amp onderzoeken"}
                    </Button>
                  </div>
                  <textarea
                    name="summary"
                    aria-label="Triagesamenvatting"
                    key={task.summary}
                    defaultValue={task.summary}
                    rows={5}
                    placeholder="Wat is het probleem, wat is de impact en wat moet het resultaat zijn?"
                  />
                  <div className="row end">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={Boolean(run) || action.isPending}
                    >
                      Samenvatting opslaan
                    </Button>
                  </div>
                </form>
                {task.stage === "delivery" ? (
                  <form
                    className="panel stack"
                    onSubmit={(e) => {
                      e.preventDefault();
                      send({
                        type: "deliver",
                        note: String(new FormData(e.currentTarget).get("note")),
                      });
                    }}
                  >
                    <h3>Oplevering</h3>
                    <p className="muted">
                      Dit concept is gemaakt uit het resultaat. Controleer de tekst en pas die aan
                      als dat nodig is. Vastleggen verstuurt geen klantbericht.
                    </p>
                    <textarea
                      name="note"
                      aria-label="Oplevertekst"
                      key={deliveryText(task)}
                      defaultValue={deliveryText(task)}
                      required
                      rows={8}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={action.isPending || Boolean(run)}
                      onClick={() => requestRun("delivery")}
                    >
                      Laat Amp het opleverconcept verfijnen
                    </Button>
                    <Button disabled={action.isPending || Boolean(run)}>
                      <Check size={15} />
                      Oplevering vastleggen
                    </Button>
                  </form>
                ) : null}
                {task.delivery ? (
                  <section className="panel success-panel">
                    <h3>Opgeleverd op {relativeDate(task.delivery.deliveredAt)}</h3>
                    <p className="preserve">{task.delivery.note}</p>
                  </section>
                ) : null}
                <section className="panel stack">
                  <h3>Taakgesprek</h3>
                  <p className="muted">
                    Berichten gaan mee bij de volgende Amp-uitvoering. Start of vervolg Amp via de
                    actieknoppen.
                  </p>
                  {task.messages.map((m) => (
                    <div className={`message message-${m.author}`} key={m.id}>
                      <div className="row">
                        <strong>{m.author === "amp" ? "Amp" : "Jij"}</strong>
                        <time>{relativeDate(m.createdAt)}</time>
                      </div>
                      <div className="preserve">{m.text}</div>
                    </div>
                  ))}
                  <form
                    className="stack"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const form = e.currentTarget;
                      send({ type: "message", text: String(new FormData(form).get("text")) }, () =>
                        form.reset(),
                      );
                    }}
                  >
                    <textarea
                      name="text"
                      aria-label="Nieuw taakbericht"
                      required
                      rows={3}
                      placeholder="Geef context, corrigeer de aanpak of voeg feedback toe…"
                    />
                    <div className="row end">
                      <Button size="sm" disabled={action.isPending}>
                        <Send size={14} />
                        Bericht toevoegen
                      </Button>
                    </div>
                  </form>
                </section>
              </div>
            ) : null}
            {tab === "questions" ? (
              <QuestionsPanel
                task={task}
                send={send}
                pending={action.isPending || Boolean(run)}
                ampEnabled={ampEnabled}
              />
            ) : null}
            {tab === "plan" ? (
              <div className="stack">
                <div className="section-heading">
                  <div>
                    <h2>Uitvoeringsplan</h2>
                    <p className="muted">Scope en acceptatiecriteria, per versie bewaard.</p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={Boolean(run) || action.isPending}
                    onClick={() => setEditingPlan(true)}
                  >
                    {plan ? "Nieuwe versie" : "Zelf schrijven"}
                  </Button>
                </div>
                {plan ? (
                  <section className="panel stack">
                    <div className="row">
                      <span className="badge">Versie {plan.version}</span>
                      <span className={`badge ${plan.approvedAt ? "badge-green" : "badge-orange"}`}>
                        {plan.approvedAt ? "Goedgekeurd" : "Wacht op beoordeling"}
                      </span>
                    </div>
                    <p className="preserve">{plan.summary}</p>
                    <h3>Aanpak</h3>
                    <ol className="steps">
                      {plan.steps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                    <h3>Acceptatiecriteria</h3>
                    <ul className="criteria">
                      {plan.criteria.map((criterion) => (
                        <li key={criterion}>
                          <span className="criterion-box" />
                          {criterion}
                        </li>
                      ))}
                    </ul>
                    <div className="row wrap">
                      {!plan.approvedAt ? (
                        <Button
                          disabled={Boolean(run) || action.isPending}
                          onClick={() => send({ type: "approve", version: plan.version })}
                        >
                          <Check size={15} />
                          Keur v{plan.version} goed
                        </Button>
                      ) : (
                        <Button
                          disabled={Boolean(run) || action.isPending}
                          onClick={() => requestRun("implement")}
                        >
                          <Play size={15} />
                          Start in Amp Orb
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        disabled={Boolean(run) || action.isPending}
                        onClick={() => requestRun("plan")}
                      >
                        Laat Amp het plan bijwerken
                      </Button>
                    </div>
                  </section>
                ) : (
                  <Empty title="Nog geen uitvoeringsplan">
                    <p className="muted">
                      Laat Amp de code en context onderzoeken, of schrijf zelf een plan.
                    </p>
                    <Button
                      disabled={Boolean(run) || action.isPending}
                      onClick={() => requestRun("plan")}
                    >
                      <Play size={15} />
                      Plan maken met Amp
                    </Button>
                  </Empty>
                )}
                {task.plans.length > 1 ? (
                  <details className="panel">
                    <summary>Eerdere versies · {task.plans.length - 1}</summary>
                    {task.plans
                      .slice(0, -1)
                      .toReversed()
                      .map((p) => (
                        <div className="old-plan" key={p.id}>
                          <h4>Versie {p.version}</h4>
                          <p>{p.summary}</p>
                          <ol>
                            {p.steps.map((s) => (
                              <li key={s}>{s}</li>
                            ))}
                          </ol>
                          <ul>
                            {p.criteria.map((s) => (
                              <li key={s}>{s}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                  </details>
                ) : null}
              </div>
            ) : null}
            {tab === "review" ? (
              <div className="stack">
                <ReviewPanel
                  task={task}
                  send={send}
                  pending={action.isPending || Boolean(run)}
                  onRevise={() => requestRun("revise")}
                  onReview={() => requestRun("review")}
                />
              </div>
            ) : null}
            {tab === "activity" ? (
              <div className="stack">
                <h2>Uitvoering & geschiedenis</h2>
                {task.runs.toReversed().map((r) => (
                  <section className="panel stack" key={r.id}>
                    <div className="row">
                      <strong>Amp · {runProgress(task, r).phase}</strong>
                      <span
                        className={`badge ${r.status === "running" ? "badge-blue" : r.status === "failed" || r.status === "interrupted" ? "badge-orange" : ""}`}
                      >
                        {r.error && r.status === "succeeded"
                          ? "Resultaat controleren"
                          : runStatusLabels[r.status]}
                      </span>
                      <time>{relativeDate(r.createdAt)}</time>
                    </div>
                    {r.threadId ? (
                      <ExternalLink href={`https://ampcode.com/threads/${r.threadId}`}>
                        Open de thread in Amp
                      </ExternalLink>
                    ) : null}
                    {r.error ? <p className="inline-error">{r.error}</p> : null}
                    {r.status === "interrupted" ? (
                      <form
                        className="stack"
                        onSubmit={(e) => {
                          e.preventDefault();
                          send({
                            type: "resolve_run",
                            runId: r.id,
                            note: String(new FormData(e.currentTarget).get("note")),
                          });
                        }}
                      >
                        <p>
                          Controleer eerst in Amp dat de remote uitvoering is gestopt. De werkplek
                          start deze taak pas daarna opnieuw.
                        </p>
                        <Field label="Wat heb je gecontroleerd?">
                          <input
                            name="note"
                            required
                            placeholder="Thread gecontroleerd, uitvoering is beëindigd…"
                          />
                        </Field>
                        <Button variant="secondary" disabled={action.isPending}>
                          Onderbreking afhandelen
                        </Button>
                      </form>
                    ) : null}
                    {context.data?.events
                      .filter((event) => event.runId === r.id)
                      .map((event) => (
                        <div className="run-event" key={event.id}>
                          {event.data.tools?.length ? (
                            <code>{event.data.tools.join(" · ")}</code>
                          ) : null}
                          {event.data.text ? <p className="preserve">{event.data.text}</p> : null}
                        </div>
                      ))}
                  </section>
                ))}
                <ol className="timeline">
                  {task.activity.toReversed().map((a) => (
                    <li key={a.id}>
                      <span className="timeline-dot" />
                      <div>
                        {a.text}
                        <time>{relativeDate(a.createdAt)}</time>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {editingPlan ? (
        <Dialog
          open
          onClose={() => setEditingPlan(false)}
          title={plan ? `Plan v${plan.version + 1}` : "Nieuw plan"}
          description="Elke wijziging maakt een nieuwe versie die opnieuw moet worden goedgekeurd."
        >
          <form
            className="dialog-body stack"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              const lines = (name: string) =>
                String(form.get(name))
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean);
              send(
                {
                  type: "plan",
                  plan: {
                    summary: String(form.get("summary")),
                    steps: lines("steps"),
                    criteria: lines("criteria"),
                  },
                },
                () => setEditingPlan(false),
              );
            }}
          >
            <Field label="Samenvatting">
              <textarea name="summary" defaultValue={plan?.summary} required rows={3} />
            </Field>
            <Field label="Stappen, één per regel">
              <textarea name="steps" defaultValue={plan?.steps.join("\n")} required rows={5} />
            </Field>
            <Field label="Acceptatiecriteria, één per regel">
              <textarea
                name="criteria"
                defaultValue={plan?.criteria.join("\n")}
                required
                rows={4}
              />
            </Field>
            <Button disabled={action.isPending}>Planversie opslaan</Button>
          </form>
        </Dialog>
      ) : null}
      {runMode ? (
        <Dialog
          open
          onClose={() => setRunMode(null)}
          title="Amp in een orb starten"
          description={`Actie: ${phaseLabels[runMode]}. Amp gebruikt de tools en MCP's van het gekoppelde Amp-project.`}
        >
          <form
            className="dialog-body stack"
            onSubmit={(e) => {
              e.preventDefault();
              action.mutate(
                {
                  path: `/api/tasks/${task.id}/runs`,
                  body: {
                    mode: runMode,
                    revision: task.revision,
                    instruction: String(new FormData(e.currentTarget).get("instruction")),
                  },
                },
                {
                  onSuccess: () => {
                    setRunMode(null);
                    setTab("activity");
                  },
                },
              );
            }}
          >
            <p>
              {investigation} De taakcontext, antwoorden en het actuele plan gaan mee naar Amp. De
              uitvoering loopt op de servers van Amp en kan kosten maken.
            </p>
            <Field label="Aanvullende instructie">
              <textarea
                name="instruction"
                rows={3}
                placeholder="Optioneel, bijvoorbeeld: controleer ook op een iPad…"
              />
            </Field>
            <Button disabled={action.isPending}>
              <Play size={15} />
              Start {phaseLabels[runMode].toLowerCase()}
            </Button>
          </form>
        </Dialog>
      ) : null}
    </article>
  );
}
