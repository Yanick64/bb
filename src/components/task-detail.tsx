import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  ClipboardList,
  FileText,
  History,
  MessageCircle,
  Play,
  Send,
} from "lucide-react";
import { useState } from "react";
import type { TaskCommand } from "../../server/workflow";
import {
  activeRun,
  currentPlan,
  nextAction,
  type Project,
  type Run,
  type Signal,
  stageLabels,
  stages,
  type Task,
} from "../../shared/domain";
import { api, useAction, useToast } from "../lib/api";
import { ExternalLink, Field, Priority, relativeDate, SourceBadge } from "./common";
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
}: {
  task: Task;
  projects: Project[];
  ampEnabled: boolean;
  onClose: () => void;
}) {
  const action = useAction();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("overview");
  const [editingPlan, setEditingPlan] = useState(false);
  const [runMode, setRunMode] = useState<Run["mode"] | null>(null);
  const plan = currentPlan(task);
  const run = activeRun(task);
  const next = nextAction(task);
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
      { onSuccess },
    );
  function requestRun(mode: Run["mode"]) {
    if (!ampEnabled) {
      toast("Amp is nog niet verbonden. Zie Verbindingen voor de instellingen.", true);
      return;
    }
    setRunMode(mode);
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={`BB-${String(task.number).padStart(3, "0")}`}
      description={projects.find((p) => p.id === task.projectId)?.name ?? "Algemene inbox"}
      sheet
    >
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
        <h1>{task.title}</h1>
        <button
          type="button"
          className={`next-action next-${next.owner}`}
          onClick={() => setTab(next.tab)}
        >
          <span className="next-symbol">
            <ArrowRight size={18} />
          </span>
          <span>
            <small>
              {next.owner === "amp"
                ? "Amp is aan zet"
                : next.owner === "client"
                  ? "Wacht op de klant"
                  : next.owner === "none"
                    ? "Afgerond"
                    : "Jouw volgende actie"}
            </small>
            <strong>{next.label}</strong>
            <span>{next.detail}</span>
          </span>
          <ArrowRight size={16} />
        </button>
      </div>
      <div className="task-tabs" role="tablist" aria-label="Taakonderdelen">
        {(
          [
            ["overview", "Overzicht", FileText],
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
            className={tab === key ? "active" : ""}
            key={key}
            onClick={() => setTab(key)}
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
                <Field label="Kies het BB-project">
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
            <section className="panel">
              <h3>Aanvraag</h3>
              <p className="preserve">
                {task.description || "Er is nog geen aanvullende omschrijving."}
              </p>
              {context.data?.signals.map((s) => (
                <div className="source-reference" key={s.id}>
                  <SourceBadge source={s.provider} />
                  <span>{s.client}</span>
                  {s.url ? (
                    <ExternalLink href={s.url}>Originele bron</ExternalLink>
                  ) : (
                    <code>{s.externalId}</code>
                  )}
                </div>
              ))}
            </section>
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
                <h3>Triage</h3>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={Boolean(run) || action.isPending}
                  onClick={() => requestRun("triage")}
                >
                  <Play size={13} />
                  Laat Amp onderzoeken
                </Button>
              </div>
              <textarea
                name="summary"
                key={task.summary}
                defaultValue={task.summary}
                rows={5}
                placeholder="Wat is het probleem, wat is de impact en wat moet het resultaat zijn?"
              />
              <div className="row end">
                <Button size="sm" variant="secondary" disabled={Boolean(run) || action.isPending}>
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
                <p className="muted">Leg vast wat je hebt geleverd, aan wie en via welk kanaal.</p>
                <textarea
                  name="note"
                  required
                  rows={3}
                  placeholder="Bijvoorbeeld: wijziging live gezet en klant geïnformeerd via Orbit-ticket…"
                />
                <Button disabled={action.isPending}>
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
          <QuestionsPanel task={task} send={send} pending={action.isPending || Boolean(run)} />
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
              <section className="panel empty-inline">
                <ClipboardList size={28} />
                <h3>Van aanvraag naar een concrete aanpak</h3>
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
              </section>
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
          <ReviewPanel
            task={task}
            send={send}
            pending={action.isPending || Boolean(run)}
            onRevise={() => requestRun("revise")}
          />
        ) : null}
        {tab === "activity" ? (
          <div className="stack">
            <h2>Uitvoering & geschiedenis</h2>
            {task.runs.toReversed().map((r) => (
              <section className="panel stack" key={r.id}>
                <div className="row">
                  <strong>Amp · {r.mode}</strong>
                  <span
                    className={`badge ${r.status === "running" ? "badge-blue" : r.status === "failed" || r.status === "interrupted" ? "badge-orange" : ""}`}
                  >
                    {r.status}
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
                      Controleer eerst in Amp dat de remote uitvoering is gestopt. BB start deze
                      taak pas daarna opnieuw.
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
          description={`Actie: ${runMode}. Amp gebruikt de tools en MCP's van het gekoppelde Amp-project.`}
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
              De taakcontext, antwoorden en het actuele plan gaan mee naar Amp. De uitvoering loopt
              op de servers van Amp en kan kosten maken.
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
              Start {runMode}
            </Button>
          </form>
        </Dialog>
      ) : null}
    </Dialog>
  );
}
