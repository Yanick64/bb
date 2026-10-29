import { useQuery } from "@tanstack/react-query";
import { Cable, Copy, KeyRound, RefreshCw, Webhook } from "lucide-react";
import { useState } from "react";
import type { Receipt } from "../../server/webhooks";
import { api, type State, useAction, useToast } from "../lib/api";
import { Field, relativeDate } from "./common";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
export function Connections({ state }: { state: State }) {
  const action = useAction();
  const toast = useToast();
  const [token, setToken] = useState<{ token: string; endpoint: string } | null>(null);
  const receipts = useQuery({
    queryKey: ["receipts"],
    queryFn: () => api<Receipt[]>("/api/webhook-receipts"),
  });
  const cards = [
    {
      name: "Amp Orbs",
      subtitle: "Onderzoek en uitvoering op afstand",
      ready: state.connections.amp,
      text: "Meld de Amp CLI aan op de BB-server en zet BB_AMP_ENABLED=true. Koppel daarna per BB-project het Amp-project. MCP's en orb-secrets beheer je in Amp.",
      code: "amp login\nBB_AMP_ENABLED=true",
    },
    {
      name: "Teamleader Orbit",
      subtitle: "Projectselectie en ticketinvoer",
      ready: state.connections.orbit,
      text: "Gebruik de Streamable HTTP MCP-URL van jouw Orbit-tenant. Deze verbinding staat los van de MCP-toegang van je coding assistant. Taken worden alleen uit jouw gekozen projecten opgehaald.",
      code: "ORBIT_MCP_URL=https://…\nORBIT_MCP_TOKEN=…",
    },
    {
      name: "Sentry",
      subtitle: "Issues naar het juiste project",
      ready: state.connections.sentry,
      text: "Gebruik een token met leestoegang tot je Sentry-projecten en issues. Kies daarna per BB-project welke Sentry-projecten erbij horen.",
      code: "SENTRY_AUTH_TOKEN=…\nSENTRY_ORG=…",
    },
    {
      name: "Orbit-webhook",
      subtitle: "Nieuwe tickets direct ontvangen",
      ready: state.connections.webhook,
      text: "Laat Orbit of je bestaande ontvanger JSON doorsturen naar dit endpoint. Gebruik Authorization: Bearer met het webhookgeheim, of X-BB-Signature met sha256=HMAC van de ongewijzigde requestbody.",
      code: "POST /api/webhooks/orbit\nBB_ORBIT_WEBHOOK_SECRET=…",
    },
  ];
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
                {card.ready ? "Geconfigureerd" : "Configuratie nodig"}
              </span>
            </div>
            <h2>{card.name}</h2>
            <p className="muted">{card.subtitle}</p>
            <p>{card.text}</p>
            <pre>{card.code}</pre>
          </section>
        ))}
      </div>
      {state.connections.orbitCatalog ? (
        <p className="notice">
          Er staan {state.connections.orbitCatalog.count} echte Orbit-projecten in de lokale
          catalogus, opgehaald op {relativeDate(state.connections.orbitCatalog.capturedAt)}.
          Selecteer ze bij Projectinstellingen. Deze momentopname bevat projectnamen en klanten; er
          zijn nog geen klanttickets geïmporteerd.
        </p>
      ) : null}
      <p className="notice">
        Zet verbindingsgegevens in het lokale <code>.env</code>-bestand en herstart BB. Geheimen
        worden niet in Git opgeslagen. E-mailinvoer en routingregels volgen later.
      </p>
      <section className="panel stack">
        <div className="section-heading">
          <div>
            <h2>
              <KeyRound size={18} /> BB MCP voor Amp
            </h2>
            <p className="muted">
              Laat Amp taakcontext lezen, vragen stellen en bewijs toevoegen. Iedere sleutel geeft
              toegang tot één BB-project.
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
          menselijke acties in BB.
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
        {!receipts.data?.length ? <p className="muted">Nog geen webhooks ontvangen.</p> : null}
        {receipts.data?.map((receipt) => (
          <details className="webhook-receipt" key={receipt.id}>
            <summary>
              <span className="badge">{receipt.status}</span> {relativeDate(receipt.receivedAt)}{" "}
              <code>{receipt.id.slice(0, 10)}</code>
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
                  <Field label="Orbit ticket-api_id">
                    <input name="ticketId" required pattern="TC[A-Z0-9]{13}" placeholder="TC…" />
                  </Field>
                  <Button size="sm" disabled={action.isPending}>
                    Koppelen
                  </Button>
                </form>
              </div>
            ) : (
              <p className="text-green">Verwerkt naar een BB-taak.</p>
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
