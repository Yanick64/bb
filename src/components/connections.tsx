import { useQuery } from "@tanstack/react-query";
import { Cable, Copy, KeyRound, RefreshCw, Trash2, Webhook } from "lucide-react";
import { useState } from "react";
import type { Receipt } from "../../server/webhooks";
import { api, type State, useAction, useToast } from "../lib/api";
import { Field, relativeDate } from "./common";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
export function Connections({
  state,
  onOpenTask,
}: {
  state: State;
  onOpenTask: (id: string) => void;
}) {
  const action = useAction();
  const toast = useToast();
  const [token, setToken] = useState<{ token: string; endpoint: string } | null>(null);
  const [checking, setChecking] = useState<string | null>(null);
  const [checks, setChecks] = useState<Record<string, { ok: boolean; message: string }>>({});
  async function check(id: string, path: string) {
    setChecking(id);
    try {
      await api(path, {});
      setChecks((old) => ({
        ...old,
        [id]: {
          ok: true,
          message: `Verbinding gecontroleerd om ${new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit" }).format(new Date())}`,
        },
      }));
    } catch (error) {
      setChecks((old) => ({
        ...old,
        [id]: { ok: false, message: error instanceof Error ? error.message : "Controle mislukt" },
      }));
    } finally {
      setChecking(null);
    }
  }
  const receipts = useQuery({
    queryKey: ["receipts"],
    queryFn: () => api<Receipt[]>("/api/webhook-receipts"),
  });
  const cards = [
    {
      id: "amp",
      check: "/api/connections/amp/check",
      name: "Amp Orbs",
      subtitle: "Onderzoek en uitvoering op afstand",
      ready: state.connections.amp,
      text: "Koppel per project het Amp-project. De controle leest de beschikbare projecten via je CLI-login. Tools en orb-secrets beheer je in Amp.",
      code: "amp login\nBB_AMP_ENABLED=true",
    },
    {
      id: "orbit",
      check: "/api/sources/orbit/check",
      oauth: state.connections.orbitOAuth,
      name: "Teamleader Orbit",
      subtitle: "Klantselectie en ticketinvoer",
      ready: state.connections.orbit,
      text: "Meld je aan met je Teamleader Orbit-account. Selecteer daarna de klanten bij je project om hun tickets op te halen.",
      code: "ORBIT_MCP_URL=https://api.orbit.teamleader.eu/mcp",
    },
    {
      id: "sentry",
      check: "/api/connections/sentry/check",
      oauth: state.connections.sentryMcp,
      name: "Sentry",
      subtitle: "Issues naar het juiste project",
      ready: state.connections.sentry,
      text: "Kies de Sentry-projecten bij je projectinstellingen. De import haalt onopgeloste issues uit de afgelopen zeven dagen op.",
      code: "SENTRY_MCP_URL=https://mcp.sentry.dev/mcp\nSENTRY_ORG=…",
    },
    {
      id: "mail",
      check: "/api/connections/mail/check",
      name: "Google Mail",
      subtitle: state.connections.googleMail.email || "Gesprekken omzetten naar taken",
      ready: state.connections.googleMail.configured,
      text: "Zoek een gesprek en maak er een taak van. De verbinding gebruikt je bestaande Google Workspace MCP-aanmelding en leest alleen berichten.",
      code: "GOOGLE_WORKSPACE_CONFIG=./data/google-workspace.json\nGOOGLE_WORKSPACE_EMAIL=…",
    },
    {
      id: "webhook",
      check: "/api/connections/webhook/check",
      name: "Teamleader Orbit-webhook",
      subtitle: "Nieuwe tickets direct ontvangen",
      ready: state.connections.webhook,
      text: "Laat Teamleader Orbit of je bestaande ontvanger meldingen doorsturen. De controle test de publieke route met het lokale webhookgeheim, zonder een taak aan te maken.",
      code: `POST ${state.connections.webhookUrl || "/api/webhooks/orbit"}\nAuthorization: Bearer <BB_ORBIT_WEBHOOK_SECRET>`,
    },
  ].map((card) => ({ ...card, removed: state.connections.removed.includes(card.id) }));
  return (
    <div className="page-body stack">
      <div className="connections-grid">
        {cards.map((card) => (
          <section className="panel connection-card" key={card.name}>
            <div className="row">
              <span className="connection-icon">
                <Cable size={20} />
              </span>
              <span className={`badge ${card.ready ? "badge-green" : ""}`}>
                {card.removed ? "Verwijderd" : card.ready ? "Geconfigureerd" : "Configuratie nodig"}
              </span>
            </div>
            <h2>{card.name}</h2>
            <p className="muted">{card.subtitle}</p>
            <p>{card.text}</p>
            <details>
              <summary>Configuratie</summary>
              <pre>{card.code}</pre>
            </details>
            <div className="connection-controls">
              {card.removed ? (
                <Button
                  variant="secondary"
                  disabled={action.isPending}
                  onClick={() =>
                    action.mutate(
                      { path: `/api/connections/${card.id}/connect`, body: {} },
                      {
                        onSuccess: (data) => {
                          const { url } = data as { url: string | null };
                          if (url) window.location.assign(url);
                          else toast(`${card.name} opnieuw gekoppeld`);
                        },
                      },
                    )
                  }
                >
                  Opnieuw verbinden
                </Button>
              ) : (
                <div className="connection-check-row">
                  <Button
                    variant="secondary"
                    disabled={checking !== null || action.isPending}
                    onClick={() => void check(card.id, card.check)}
                  >
                    <RefreshCw size={15} className={checking === card.id ? "spin" : ""} />
                    {checking === card.id ? "Verbinding controleren…" : "Verbinding controleren"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="connection-remove"
                    aria-label={`${card.name} verwijderen`}
                    title={`${card.name} verwijderen`}
                    disabled={action.isPending || checking !== null}
                    onClick={() =>
                      action.mutate(
                        { path: `/api/connections/${card.id}`, method: "DELETE", body: {} },
                        {
                          onSuccess: () => {
                            setChecks((old) => {
                              const updated = { ...old };
                              delete updated[card.id];
                              return updated;
                            });
                            toast(`${card.name} verwijderd uit de werkplek`);
                          },
                        },
                      )
                    }
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              )}
              {card.oauth && !card.removed && !card.ready ? (
                <Button
                  variant="ghost"
                  disabled={action.isPending || checking !== null}
                  onClick={() =>
                    action.mutate(
                      { path: `/api/${card.id}/oauth/start`, body: {} },
                      {
                        onSuccess: (data) => {
                          const { url } = data as { url: string | null };
                          if (url) window.location.assign(url);
                          else toast(`${card.name} is verbonden`);
                        },
                      },
                    )
                  }
                >
                  Aanmelden
                </Button>
              ) : null}
            </div>
            {checks[card.id] ? (
              <p role="status" className={checks[card.id].ok ? "text-green small" : "inline-error"}>
                {checks[card.id].message}
              </p>
            ) : null}
          </section>
        ))}
      </div>
      {state.connections.orbitCatalog ? (
        <p className="notice">
          Er staan {state.connections.orbitCatalog.count} Teamleader Orbit-klanten in de lokale
          catalogus, opgehaald op {relativeDate(state.connections.orbitCatalog.capturedAt)}.
          Selecteer ze bij Projectinstellingen. Deze momentopname bevat alleen klantnamen en ID's.
        </p>
      ) : null}
      <p className="notice">
        Zet verbindingsgegevens in het lokale <code>.env</code>-bestand en herstart de werkplek.
        Geheimen worden niet in Git opgeslagen.
      </p>
      <section className="panel stack">
        <div className="section-heading">
          <div>
            <h2>
              <KeyRound size={18} /> Taaktoegang voor Amp
            </h2>
            <p className="muted">
              Laat Amp taakcontext lezen, vragen stellen en bewijs toevoegen. Iedere sleutel geeft
              toegang tot één project.
            </p>
          </div>
        </div>
        <p>
          Gebruik een HTTPS-adres dat vanuit de orb bereikbaar is als <code>BB_PUBLIC_URL</code>.
          Een alleen via Tailscale bereikbaar adres is niet automatisch bereikbaar vanuit Amp.
        </p>
        {state.projects.map((project) => (
          <div className="row" key={project.id}>
            <strong>{project.name}</strong>
            <span className="spacer" />
            <Button
              size="sm"
              variant="secondary"
              disabled={action.isPending}
              onClick={() =>
                action.mutate(
                  { path: `/api/projects/${project.id}/mcp-token`, body: {} },
                  { onSuccess: (data) => setToken(data as { token: string; endpoint: string }) },
                )
              }
            >
              Nieuwe sleutel maken
            </Button>
          </div>
        ))}
        <small className="muted">
          Een nieuwe sleutel vervangt de vorige. Plannen goedkeuren en taken afronden blijven
          menselijke acties in deze werkplek.
        </small>
      </section>
      <section className="panel stack">
        <div className="section-heading">
          <div>
            <h2>
              <Webhook size={18} /> Ontvangen webhooks
            </h2>
            <p className="muted">
              Iedere melding wordt eerst opgeslagen. Herhaalde ticket-ID's leveren geen dubbele
              taken op.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Webhooks verversen"
            onClick={() => {
              void receipts.refetch();
            }}
          >
            <RefreshCw size={16} />
          </Button>
        </div>
        {receipts.error ? <p className="inline-error">{receipts.error.message}</p> : null}
        {receipts.isPending ? (
          <p className="muted" role="status">
            Webhooks ophalen…
          </p>
        ) : !receipts.error && !receipts.data?.length ? (
          <p className="muted">Nog geen webhooks ontvangen.</p>
        ) : null}
        {receipts.data?.map((receipt) => (
          <details className="webhook-receipt" key={receipt.id}>
            <summary>
              <span className="badge">
                {
                  {
                    pending: "Wacht op verwerking",
                    processed: "Verwerkt",
                    needs_mapping: "Ticket koppelen",
                    failed: "Mislukt",
                  }[receipt.status]
                }
              </span>{" "}
              {relativeDate(receipt.receivedAt)} <code>{receipt.id.slice(0, 10)}</code>
            </summary>
            {receipt.error ? <p className="inline-error">{receipt.error}</p> : null}
            <pre>{JSON.stringify(receipt.payload, null, 2)}</pre>
            {receipt.status !== "processed" ? (
              <div className="stack">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={action.isPending}
                  onClick={() =>
                    action.mutate({ path: `/api/webhook-receipts/${receipt.id}/process`, body: {} })
                  }
                >
                  Opnieuw verwerken
                </Button>
                <form
                  className="row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    action.mutate({
                      path: `/api/webhook-receipts/${receipt.id}/map`,
                      body: { ticketId: new FormData(e.currentTarget).get("ticketId") },
                    });
                  }}
                >
                  <Field label="Teamleader Orbit ticket-api_id">
                    <input name="ticketId" required pattern="TC[A-Z0-9]{13}" placeholder="TC…" />
                  </Field>
                  <Button size="sm" disabled={action.isPending}>
                    Koppelen
                  </Button>
                </form>
              </div>
            ) : (
              <div className="row wrap">
                <p className="text-green">Verwerkt naar een taak.</p>
                {receipt.taskId ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      if (receipt.taskId) onOpenTask(receipt.taskId);
                    }}
                  >
                    Taak openen
                  </Button>
                ) : null}
              </div>
            )}
          </details>
        ))}
      </section>
      {token ? (
        <Dialog
          open
          onClose={() => setToken(null)}
          title="Projectgebonden MCP-sleutel"
          description="Bewaar deze sleutel in de remote MCP-instellingen van het juiste Amp-project."
        >
          <div className="dialog-body stack">
            <Field label="Endpoint">
              <input readOnly value={token.endpoint} />
            </Field>
            <Field label="Bearer-token, één keer zichtbaar">
              <input readOnly value={token.token} />
            </Field>
            <Button
              onClick={() => {
                void navigator.clipboard.writeText(token.token).then(
                  () => toast("Token gekopieerd"),
                  () => toast("Kopieer de sleutel handmatig", true),
                );
              }}
            >
              <Copy size={15} />
              Token kopiëren
            </Button>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
