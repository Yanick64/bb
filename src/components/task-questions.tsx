import { Check, Copy, MessageCircle, Plus } from "lucide-react";
import { useState } from "react";
import type { Task } from "../../shared/domain";
import { useToast } from "../lib/api";
import { Empty, Field, relativeDate } from "./common";
import type { SendCommand } from "./task-detail";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";

const blockLabels = {
  none: "Niet blokkerend",
  planning: "Blokkeert planning",
  implementation: "Blokkeert uitvoering",
  delivery: "Blokkeert oplevering",
};
export function QuestionsPanel({
  task,
  send,
  pending,
  ampEnabled,
}: {
  task: Task;
  send: SendCommand;
  pending: boolean;
  ampEnabled: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const toast = useToast();
  const open = task.questions.filter((q) => !q.answer);
  return (
    <div className="stack">
      <div className="section-heading">
        <div>
          <h2>Vragen & beslissingen</h2>
          <p className="muted">
            {ampEnabled && task.runs.at(-1)?.status === "succeeded"
              ? "Na het laatste blokkerende antwoord gaat Amp automatisch verder. Een gewijzigd plan vraagt opnieuw jouw goedkeuring."
              : "Maak onduidelijkheden concreet voordat het werk verdergaat."}
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setAdding(true)} disabled={pending}>
          <Plus size={14} />
          Vraag toevoegen
        </Button>
      </div>
      {open.some((q) => q.recipient === "client") ? (
        <Button
          variant="secondary"
          onClick={() =>
            setDraft(
              open
                .filter((q) => q.recipient === "client")
                .map((q, i) => `${i + 1}. ${q.question}`)
                .join("\n\n"),
            )
          }
        >
          <MessageCircle size={15} />
          Klantbericht samenstellen
        </Button>
      ) : null}
      {!task.questions.length ? (
        <Empty title="Nog geen open vragen">
          <p>Voeg een vraag toe of laat Amp de aanvraag onderzoeken.</p>
        </Empty>
      ) : null}
      {task.questions.map((q) => (
        <section
          className={`panel question-card ${q.answer ? "question-answered" : ""}`}
          key={q.id}
        >
          <div className="row wrap">
            <span
              className={`badge ${q.answer ? "badge-green" : q.recipient === "client" ? "badge-orange" : "badge-blue"}`}
            >
              {q.answer ? "Beantwoord" : q.recipient === "client" ? "Aan de klant" : "Aan jou"}
            </span>
            <span className="muted small">{blockLabels[q.blocks]}</span>
          </div>
          <h3>{q.question}</h3>
          {q.reason ? <p className="muted">{q.reason}</p> : null}
          {q.suggestion ? (
            <div className="suggestion">
              <small>Voorgesteld antwoord, nog niet bevestigd</small>
              <p>{q.suggestion}</p>
            </div>
          ) : null}
          {q.answer ? (
            <div className="answer">
              <Check size={15} />
              <div>
                <p className="preserve">{q.answer}</p>
                <small>
                  {q.answeredBy === "client" ? "Klantantwoord vastgelegd" : "Door jou beantwoord"} ·{" "}
                  {q.answeredAt ? relativeDate(q.answeredAt) : ""}
                </small>
              </div>
            </div>
          ) : (
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                send({
                  type: "answer",
                  questionId: q.id,
                  answer: String(form.get("answer")),
                  answeredBy: form.get("answeredBy") as "operator" | "client",
                });
              }}
            >
              <Field label="Antwoord">
                <textarea
                  name="answer"
                  required
                  rows={3}
                  placeholder="Vul je antwoord in of leg het antwoord van de klant vast…"
                />
              </Field>
              <div className="row wrap">
                <select
                  aria-label="Wie heeft dit antwoord gegeven?"
                  name="answeredBy"
                  defaultValue={q.recipient}
                >
                  <option value="operator">Ik beantwoord dit zelf</option>
                  <option value="client">Dit is het antwoord van de klant</option>
                </select>
                <Button size="sm" disabled={pending}>
                  Antwoord vastleggen
                </Button>
              </div>
            </form>
          )}
        </section>
      ))}
      {adding ? (
        <Dialog open onClose={() => setAdding(false)} title="Verduidelijkingsvraag">
          <form
            className="dialog-body stack"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              send(
                {
                  type: "question",
                  question: {
                    question: String(form.get("question")),
                    reason: String(form.get("reason")),
                    suggestion: String(form.get("suggestion")),
                    recipient: form.get("recipient") as "operator" | "client",
                    blocks: form.get("blocks") as "implementation",
                  },
                },
                () => setAdding(false),
              );
            }}
          >
            <Field label="De concrete vraag">
              <textarea name="question" required rows={2} />
            </Field>
            <Field label="Waarom is dit antwoord nodig?">
              <textarea name="reason" rows={2} />
            </Field>
            <div className="form-grid">
              <Field label="Wie kan antwoorden?">
                <select name="recipient">
                  <option value="operator">Ikzelf</option>
                  <option value="client">De klant</option>
                </select>
              </Field>
              <Field label="Wat wacht hierop?">
                <select name="blocks" defaultValue="implementation">
                  {Object.entries(blockLabels).map(([key, value]) => (
                    <option key={key} value={key}>
                      {value}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Voorgesteld antwoord, optioneel">
              <textarea name="suggestion" rows={2} />
            </Field>
            <Button disabled={pending}>Vraag opslaan</Button>
          </form>
        </Dialog>
      ) : null}
      {draft !== null ? (
        <Dialog
          open
          onClose={() => setDraft(null)}
          title="Concept voor de klant"
          description="Pas het bericht aan en kopieer het naar e-mail of Teamleader Orbit."
        >
          <div className="dialog-body stack">
            <textarea
              aria-label="Klantbericht"
              rows={12}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <Button
              onClick={() => {
                void navigator.clipboard.writeText(draft).then(
                  () => toast("Klantbericht gekopieerd"),
                  () => toast("Kopiëren lukt niet. Selecteer de tekst en kopieer handmatig.", true),
                );
              }}
            >
              <Copy size={15} />
              Kopieer bericht
            </Button>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
