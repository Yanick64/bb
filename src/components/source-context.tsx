import { Paperclip, RefreshCw } from "lucide-react";
import type { Signal, Task } from "../../shared/domain";
import { ExternalLink, relativeDate, SourceBadge } from "./common";
import { Button } from "./ui/button";

export function SourceContext({
  task,
  signals,
  loading,
  error,
  refresh,
  pending,
}: {
  task: Task;
  signals: Signal[];
  loading: boolean;
  error?: string;
  refresh: () => void;
  pending: boolean;
}) {
  return (
    <section className="source-document stack">
      <div className="section-heading">
        <h2>{task.source === "sentry" ? "Foutmelding" : "Oorspronkelijke aanvraag"}</h2>
        {signals.length ? (
          <Button size="sm" variant="ghost" disabled={pending} onClick={refresh}>
            <RefreshCw size={15} className={pending ? "spin" : ""} />
            {pending ? "Ophalen…" : "Verversen"}
          </Button>
        ) : null}
      </div>
      {loading ? (
        <p role="status" className="muted">
          Broncontext laden…
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="inline-error">
          {error}
        </p>
      ) : null}
      {!signals.length ? (
        <p className="preserve reading-text">
          {task.description ||
            "Er is nog geen omschrijving. Voeg hieronder context toe voordat je onderzoek start."}
        </p>
      ) : null}
      {signals.map((signal) => (
        <article className="source-entry stack" key={signal.id}>
          <div className="source-reference">
            <SourceBadge source={signal.provider} />
            <span>{signal.client}</span>
            {signal.url ? (
              <ExternalLink href={signal.url}>
                Open in {signal.provider === "orbit" ? "Orbit" : "Sentry"}
              </ExternalLink>
            ) : (
              <span className="muted">Bronlink ontbreekt · {signal.externalId}</span>
            )}
          </div>
          <p className="preserve reading-text">
            {signal.body ||
              "Deze bron heeft geen beschrijving. Ververs de context om de conversatie op te halen."}
          </p>
          {signal.fetchedAt ? (
            <p className="muted small">Opgehaald {relativeDate(signal.fetchedAt)}</p>
          ) : (
            <p className="context-notice">
              Alleen de eerste melding is beschikbaar. Haal de volledige context op voor onderzoek.
            </p>
          )}
          {signal.contextWarning ? (
            <p className="context-notice" role="status">
              {signal.contextWarning} De eerder opgehaalde inhoud blijft beschikbaar.
            </p>
          ) : null}
          {signal.attachments.length ? (
            <div className="source-files">
              <h3>Bijlagen</h3>
              <p className="muted small">
                Orbit-downloadlinks verlopen na enkele minuten. Ververs de context voor nieuwe links
                of open het ticket in Orbit.
              </p>
              {signal.attachments.map((file) => (
                <div className="row wrap" key={file.id}>
                  <Paperclip size={16} />
                  {file.url && Date.now() - Date.parse(signal.fetchedAt) < 9 * 60000 ? (
                    <ExternalLink href={file.url}>{file.name}</ExternalLink>
                  ) : (
                    <span>{file.name}</span>
                  )}
                  {file.size ? (
                    <span className="muted small">{Math.ceil(file.size / 1024)} kB</span>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
          {signal.details ? (
            <details className="source-technical">
              <summary>
                {signal.provider === "orbit"
                  ? "Ticketgegevens"
                  : "Technische context en recente gebeurtenissen"}
              </summary>
              <pre>{signal.details}</pre>
            </details>
          ) : null}
          {signal.comments.length ? (
            <div className="source-conversation">
              <h3>
                Ticketgesprek <span className="muted">· {signal.comments.length} berichten</span>
              </h3>
              {signal.comments.map((comment) => (
                <section
                  className={`source-comment ${comment.internal ? "source-internal" : ""}`}
                  key={comment.id}
                >
                  <div className="row wrap">
                    <strong>{comment.author}</strong>
                    <span className="badge">
                      {comment.internal ? "Interne notitie" : "Klantzichtbaar"}
                    </span>
                    <time>{comment.date}</time>
                  </div>
                  {comment.text === signal.body ? (
                    <p className="muted small">Oorspronkelijke aanvraag, hierboven weergegeven.</p>
                  ) : (
                    <p className="preserve reading-text">{comment.text}</p>
                  )}
                </section>
              ))}
            </div>
          ) : null}
        </article>
      ))}
      {signals.length &&
      task.description &&
      !signals.some((s) => s.body.slice(0, 20000) === task.description) ? (
        <section className="stack">
          <h3>Eigen omschrijving</h3>
          <p className="preserve reading-text">{task.description}</p>
        </section>
      ) : null}
    </section>
  );
}
