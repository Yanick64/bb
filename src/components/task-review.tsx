import {
  Camera,
  Check,
  CheckCircle2,
  ExternalLink as ExternalIcon,
  MapPin,
  Plus,
  RotateCcw,
  Upload,
} from "lucide-react";
import { useState } from "react";
import { currentPlan, type Evidence, type Task } from "../../shared/domain";
import { api, useToast } from "../lib/api";
import { Empty, ExternalLink, Field } from "./common";
import type { SendCommand } from "./task-detail";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
export function ReviewPanel({
  task,
  send,
  pending,
  onRevise,
  onReview,
}: {
  task: Task;
  send: SendCommand;
  pending: boolean;
  onRevise: () => void;
  onReview: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<Evidence["kind"]>("screenshot");
  const [uploading, setUploading] = useState(false);
  const toast = useToast();
  const [selectedRevision, setSelectedRevision] = useState("");
  const [annotation, setAnnotation] = useState<{
    evidence: Evidence;
    x?: number;
    y?: number;
  } | null>(null);
  const plan = currentPlan(task);
  const current = task.evidence.filter(
    (e) => e.planVersion === plan?.version && e.reviewCycle === task.reviewCycle,
  );
  const versions = [...new Set(current.map((e) => e.revision))].reverse();
  const revision = versions.includes(selectedRevision) ? selectedRevision : (versions[0] ?? "");
  const evidence = current.filter((e) => e.revision === revision);
  const stale = task.evidence.filter(
    (e) => e.planVersion !== plan?.version || e.reviewCycle !== task.reviewCycle,
  );
  async function add(form: HTMLFormElement) {
    const data = new FormData(form);
    let url = String(data.get("url") ?? "");
    const file = data.get("file");
    setUploading(true);
    try {
      if (file instanceof File && file.size) {
        const body = new FormData();
        body.set("file", file);
        url = (await api<{ url: string }>("/api/uploads", body)).url;
      }
      send(
        {
          type: "evidence",
          evidence: {
            title: String(data.get("title")),
            kind,
            url,
            notes: String(data.get("notes")),
            revision: String(data.get("revision")),
            side: data.get("side") as Evidence["side"],
            criterion: String(data.get("criterion")),
            checkStatus: (data.get("checkStatus") ?? "not_run") as Evidence["checkStatus"],
          },
        },
        () => setAdding(false),
      );
    } catch (error) {
      toast(error instanceof Error ? error.message : "Upload mislukt", true);
    } finally {
      setUploading(false);
    }
  }
  return (
    <div className="stack">
      <div className="section-heading">
        <div>
          <h2>Review</h2>
          <p className="muted">Beoordeel wat er werkelijk is gemaakt.</p>
        </div>
        <div className="row wrap">
          {task.stage === "review" ? (
            <Button size="sm" variant="secondary" disabled={pending} onClick={onReview}>
              Technische review met Amp
            </Button>
          ) : null}
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)} disabled={pending}>
            <Plus size={14} />
            Bewijs toevoegen
          </Button>
        </div>
      </div>
      {plan ? (
        <section className="panel stack">
          <div className="row">
            <h3>Acceptatiecriteria</h3>
            <span className="badge">Plan v{plan.version}</span>
          </div>
          <ul className="criteria">
            {plan.criteria.map((criterion) => {
              const checked = evidence.some(
                (e) => e.criterion === criterion && e.review === "accepted",
              );
              return (
                <li key={criterion}>
                  <CheckCircle2 size={17} className={checked ? "text-green" : "text-faint"} />
                  <span>
                    {criterion}
                    <small className="criterion-status">
                      {checked
                        ? "Bewijs geaccepteerd"
                        : evidence.some((e) => e.criterion === criterion)
                          ? "Bewijs wacht op beoordeling"
                          : "Nog geen bewijs voor deze versie"}
                    </small>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <p className="notice">
          Maak eerst een plan met acceptatiecriteria. Je kunt alvast bewijs verzamelen.
        </p>
      )}
      {versions.length ? (
        <div className="row">
          <Field label="Code- of documentversie">
            <select value={revision} onChange={(e) => setSelectedRevision(e.target.value)}>
              {versions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <span className="spacer" />
          <span className="muted small">
            {evidence.filter((e) => e.review === "accepted").length}/{evidence.length} beoordeeld
          </span>
        </div>
      ) : (
        <Empty title="Maak het resultaat controleerbaar">
          <p>
            Voeg screenshots, een preview, testresultaten of een antwoordconcept toe. Elk bewijsstuk
            hoort bij een versie.
          </p>
        </Empty>
      )}
      <div className="evidence-grid">
        {evidence.map((e) => (
          <section className={`panel evidence-card evidence-${e.review}`} key={e.id}>
            <div className="row">
              <span className="badge">
                {e.kind === "screenshot"
                  ? e.side === "before"
                    ? "Voor"
                    : e.side === "after"
                      ? "Na"
                      : "Screenshot"
                  : e.kind === "preview"
                    ? "Preview"
                    : e.kind === "test"
                      ? "Controle"
                      : e.kind === "pull_request"
                        ? "Pull request"
                        : "Document"}
              </span>
              <span className="spacer" />
              <span className={`review-status ${e.review}`}>
                {e.review === "accepted"
                  ? "Geaccepteerd"
                  : e.review === "changes_requested"
                    ? "Aanpassing gevraagd"
                    : "Te beoordelen"}
              </span>
            </div>
            <h3>{e.title}</h3>
            {e.kind === "screenshot" && e.url ? (
              <div className="screenshot-wrap">
                <button
                  className="screenshot-button"
                  type="button"
                  aria-label={`Plaats een opmerking op ${e.title}`}
                  onClick={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    setAnnotation({
                      evidence: e,
                      ...(event.detail
                        ? {
                            x: ((event.clientX - rect.left) / rect.width) * 100,
                            y: ((event.clientY - rect.top) / rect.height) * 100,
                          }
                        : {}),
                    });
                  }}
                >
                  <img src={e.url} alt={e.title} loading="lazy" />
                  {e.comments.map((comment, i) =>
                    comment.x !== undefined && comment.y !== undefined ? (
                      <span
                        className="annotation-pin"
                        key={comment.id}
                        style={{ left: `${comment.x}%`, top: `${comment.y}%` }}
                        title={comment.text}
                      >
                        {i + 1}
                      </span>
                    ) : null,
                  )}
                </button>
                <small>
                  <MapPin size={12} />
                  Klik op de afbeelding om een opmerking te plaatsen
                </small>
              </div>
            ) : null}
            {e.url && e.kind !== "screenshot" ? (
              <ExternalLink href={e.url}>
                <ExternalIcon size={14} />
                Open {e.kind === "preview" ? "preview" : "bewijs"}
              </ExternalLink>
            ) : null}
            {e.kind === "test" ? (
              <span
                className={`badge ${e.checkStatus === "passed" ? "badge-green" : "badge-orange"}`}
              >
                {
                  {
                    passed: "Geslaagd",
                    failed: "Mislukt",
                    running: "Bezig",
                    not_run: "Niet uitgevoerd",
                    not_configured: "Niet geconfigureerd",
                  }[e.checkStatus]
                }
              </span>
            ) : null}
            {e.notes ? <p className="preserve evidence-notes">{e.notes}</p> : null}
            {e.criterion ? <small className="muted">Criterium: {e.criterion}</small> : null}
            {e.comments.map((comment, i) => (
              <div className="review-comment" key={comment.id}>
                <span>{i + 1}</span>
                <p>{comment.text}</p>
              </div>
            ))}
            <div className="row wrap">
              <Button
                size="sm"
                variant="secondary"
                disabled={pending || e.review === "accepted"}
                onClick={() =>
                  send({
                    type: "review_evidence",
                    evidenceId: e.id,
                    decision: "accepted",
                    comment: "",
                  })
                }
              >
                <Check size={14} />
                Akkoord
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => setAnnotation({ evidence: e })}
              >
                Feedback geven
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending || e.review === "changes_requested"}
                onClick={() =>
                  send({
                    type: "review_evidence",
                    evidenceId: e.id,
                    decision: "changes_requested",
                    comment: "",
                  })
                }
              >
                Aanpassing nodig
              </Button>
            </div>
          </section>
        ))}
      </div>
      {evidence.length ? (
        <section className="review-footer">
          <p className="muted">
            Acceptatie geldt voor plan v{plan?.version} en versie <code>{revision}</code>.
          </p>
          <div className="row wrap">
            <Button variant="secondary" onClick={onRevise} disabled={pending || !plan?.approvedAt}>
              <RotateCcw size={15} />
              Stuur feedback naar Amp
            </Button>
            <Button
              onClick={() => send({ type: "accept_review", revision })}
              disabled={
                pending || !plan?.approvedAt || evidence.some((e) => e.review !== "accepted")
              }
            >
              <CheckCircle2 size={16} />
              Review accepteren
            </Button>
          </div>
        </section>
      ) : null}
      {stale.length ? (
        <details className="panel">
          <summary>Bewijs bij eerdere plannen · {stale.length}</summary>
          {stale.map((e) => (
            <p key={e.id}>
              Plan v{e.planVersion ?? "?"} · {e.title} · {e.revision}
            </p>
          ))}
        </details>
      ) : null}
      {adding ? (
        <Dialog
          open
          onClose={() => setAdding(false)}
          title="Reviewbewijs toevoegen"
          description="Gebruik de exacte commit of documentversie. Een link alleen bewijst niet dat een controle is geslaagd."
        >
          <form
            className="dialog-body stack"
            onSubmit={(e) => {
              e.preventDefault();
              void add(e.currentTarget);
            }}
          >
            <div className="form-grid">
              <Field label="Soort">
                <select value={kind} onChange={(e) => setKind(e.target.value as Evidence["kind"])}>
                  <option value="screenshot">Screenshot</option>
                  <option value="preview">Preview</option>
                  <option value="test">Test of controle</option>
                  <option value="pull_request">Pull request</option>
                  <option value="document">Document / antwoordconcept</option>
                </select>
              </Field>
              <Field label="Titel">
                <input name="title" required placeholder="Bijvoorbeeld: mobiele checkout" />
              </Field>
            </div>
            {kind === "screenshot" ? (
              <Field label="Afbeelding uploaden">
                <input name="file" type="file" accept="image/png,image/jpeg,image/webp" />
                <small>
                  <Upload size={12} />
                  PNG, JPEG of WebP, maximaal 10 MB.
                </small>
              </Field>
            ) : null}
            <Field label="URL, optioneel bij een upload of tekstbewijs">
              <input name="url" type="url" placeholder="https://…" />
            </Field>
            <div className="form-grid">
              <Field label="Commit of documentversie">
                <input
                  name="revision"
                  required
                  defaultValue={revision}
                  placeholder="Bijvoorbeeld: a1b2c3d of antwoord-v2"
                />
              </Field>
              <Field label="Voor / na">
                <select name="side" defaultValue="other">
                  <option value="other">Niet van toepassing</option>
                  <option value="before">Voor</option>
                  <option value="after">Na</option>
                </select>
              </Field>
            </div>
            <Field label="Acceptatiecriterium">
              <select name="criterion">
                <option value="">Algemeen bewijs</option>
                {plan?.criteria.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            {kind === "test" ? (
              <Field label="Werkelijke status">
                <select name="checkStatus" defaultValue="not_run">
                  <option value="not_run">Niet uitgevoerd</option>
                  <option value="not_configured">Niet geconfigureerd</option>
                  <option value="running">Bezig</option>
                  <option value="passed">Geslaagd</option>
                  <option value="failed">Mislukt</option>
                </select>
              </Field>
            ) : null}
            <Field label="Toelichting of resultaat">
              <textarea
                name="notes"
                rows={4}
                placeholder="Opdracht, exitcode, testresultaat, URL en viewport, of de inhoud van het antwoordconcept…"
              />
            </Field>
            <Button disabled={pending || uploading}>
              <Camera size={15} />
              {uploading ? "Uploaden…" : "Bewijs opslaan"}
            </Button>
          </form>
        </Dialog>
      ) : null}
      {annotation ? (
        <Dialog
          open
          onClose={() => setAnnotation(null)}
          title="Reviewopmerking"
          description={annotation.evidence.title}
        >
          <form
            className="dialog-body stack"
            onSubmit={(e) => {
              e.preventDefault();
              send(
                {
                  type: "annotate",
                  evidenceId: annotation.evidence.id,
                  comment: String(new FormData(e.currentTarget).get("comment")),
                  x: annotation.x,
                  y: annotation.y,
                },
                () => setAnnotation(null),
              );
            }}
          >
            <Field label="Wat moet hier anders of nader bekeken worden?">
              <textarea name="comment" required rows={4} />
            </Field>
            <Button disabled={pending}>Opmerking plaatsen</Button>
          </form>
        </Dialog>
      ) : null}
    </div>
  );
}
