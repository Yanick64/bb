import { billingLabels, type Member, type Task, type TimeEntry } from "../../shared/domain";
import { Field } from "./common";
import type { SendCommand } from "./task-detail";
import { Button } from "./ui/button";

export function TaskTime({
  task,
  members,
  send,
  pending,
}: {
  task: Task;
  members: Member[];
  send: SendCommand;
  pending: boolean;
}) {
  const total = task.timeEntries.reduce((sum, entry) => sum + entry.minutes, 0);
  return (
    <div className="stack">
      <div>
        <h2>Tijdregistratie</h2>
        <p className="muted">
          Alle bestede tijd vastleggen. Boekingen blijven in BB; er gaat nog niets naar Orbit of een
          factuur.
        </p>
      </div>
      <div className="row wrap">
        <span className="badge">{total} minuten totaal</span>
        <span className="badge">
          {task.timeEntries
            .filter((e) => e.billing === "unclassified")
            .reduce((sum, e) => sum + e.minutes, 0)}{" "}
          minuten te beoordelen
        </span>
      </div>
      <form
        className="panel stack"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          send(
            {
              type: "log_time",
              entry: {
                memberId: "self",
                date: String(data.get("date")),
                minutes: Number(data.get("minutes")),
                description: String(data.get("description")),
                billing: String(data.get("billing")) as TimeEntry["billing"],
                agreement: String(data.get("agreement")),
              },
            },
            () => form.reset(),
          );
        }}
      >
        <div className="form-grid">
          <Field label="Datum">
            <input
              name="date"
              type="date"
              required
              defaultValue={new Date().toLocaleDateString("sv-SE")}
            />
          </Field>
          <Field label="Minuten">
            <input name="minutes" type="number" min={1} max={1440} required />
          </Field>
          <Field label="Toerekening">
            <select name="billing" defaultValue="unclassified">
              {Object.entries(billingLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Wat heb je gedaan?">
          <textarea name="description" rows={2} required maxLength={2000} />
        </Field>
        <Field label="Afspraak of onderbouwing">
          <textarea
            name="agreement"
            rows={2}
            maxLength={2000}
            placeholder="Bij betaalde voorbereiding: welke afspraak is gemaakt?"
          />
        </Field>
        <p className="muted small">
          Een nieuwe opdracht kan intern vallen, ook bij een bestaande klant. Uitbreidingen en
          lopende levering zijn klantwerk. Bij twijfel kies je 'Nog te beoordelen'. Amp-looptijd
          telt niet automatisch als developeruren.
        </p>
        <Button disabled={pending}>Mijn tijd vastleggen</Button>
      </form>
      {task.timeEntries.toReversed().map((entry) => (
        <section className="panel" key={entry.id}>
          <div className="row wrap">
            <strong>
              {entry.minutes} min ·{" "}
              {entry.memberId === "self"
                ? "Jij"
                : (members.find((m) => m.id === entry.memberId)?.name ?? "Eerdere registratie")}
            </strong>
            <time>{entry.date}</time>
            <span className="badge">{billingLabels[entry.billing]}</span>
          </div>
          <p className="preserve">{entry.description}</p>
          {entry.agreement ? <p className="muted preserve">{entry.agreement}</p> : null}
        </section>
      ))}
    </div>
  );
}
