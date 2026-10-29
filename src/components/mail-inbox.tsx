import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Mail, RefreshCw, Search } from "lucide-react";
import { useState } from "react";
import type { MailMessage } from "../../server/google-mail";
import type { Task } from "../../shared/domain";
import { api, type State, useAction } from "../lib/api";
import { Empty, ExternalLink, Field } from "./common";
import { Button } from "./ui/button";

export function MailInbox({
  state,
  onOpenTask,
  onConnections,
}: {
  state: State;
  onOpenTask: (id: string) => void;
  onConnections: () => void;
}) {
  const [draft, setDraft] = useState("in:inbox -in:drafts");
  const [query, setQuery] = useState(draft);
  const [pages, setPages] = useState<string[]>([]);
  const [projectId, setProjectId] = useState("");
  const [importing, setImporting] = useState<string | null>(null);
  const action = useAction();
  const mail = useQuery({
    queryKey: ["mail", query, pages.at(-1)],
    queryFn: () =>
      api<{ messages: (MailMessage & { taskId: string | null })[]; nextPage: string | null }>(
        `/api/mail?${new URLSearchParams({ q: query, ...(pages.length ? { page: pages.at(-1) ?? "" } : {}) })}`,
      ),
    enabled: state.connections.googleMail.configured,
    staleTime: 60000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  if (!state.connections.googleMail.configured)
    return (
      <div className="page-body">
        <Empty title="Verbind Google Mail">
          <p>
            Gebruik je Google Workspace MCP-aanmelding om gesprekken te zoeken en als taak te
            bewaren.
          </p>
          <Button onClick={onConnections}>Naar verbindingen</Button>
        </Empty>
      </div>
    );
  return (
    <div className="page-body stack mail-workspace">
      <form
        className="mail-toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          setPages([]);
          setQuery(draft.trim() || "in:inbox -in:drafts");
        }}
      >
        <div className="mail-search">
          <Field
            label="Zoeken in Google Mail"
            hint="Gebruik bijvoorbeeld from:, subject: of newer_than:7d."
          >
            <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={1000} />
          </Field>
          <Button type="submit" variant="secondary" disabled={mail.isFetching}>
            <Search size={16} />
            Zoeken
          </Button>
        </div>
        <Field
          label="Nieuwe taken bewaren in"
          hint="Een bestaand gesprek blijft bij de eerder gekozen taak."
        >
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Algemene inbox</option>
            {state.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      </form>
      <div className="section-heading">
        <p className="muted">{state.connections.googleMail.email} · één taak per gesprek</p>
        <Button
          size="sm"
          variant="ghost"
          disabled={mail.isFetching}
          onClick={() => void mail.refetch()}
        >
          <RefreshCw size={15} className={mail.isFetching ? "spin" : ""} />
          Verversen
        </Button>
      </div>
      {mail.isPending ? (
        <p role="status">Gesprekken ophalen…</p>
      ) : mail.error ? (
        <div className="context-notice stack">
          <p className="inline-error">{mail.error.message}</p>
          <Button variant="secondary" onClick={() => void mail.refetch()}>
            Opnieuw proberen
          </Button>
        </div>
      ) : !mail.data.messages.length ? (
        <Empty title="Geen gesprekken gevonden">
          <p>Probeer een andere zoekopdracht.</p>
        </Empty>
      ) : (
        <div className="mail-list">
          {mail.data.messages.map((message) => (
            <article className="mail-row" key={message.threadId}>
              <Mail size={18} className="text-faint" />
              <div className="mail-content">
                <h2>{message.subject}</h2>
                <p className="muted">{message.from}</p>
                <div className="row wrap small muted">
                  <span>{message.date}</span>
                  <ExternalLink href={message.url}>Open in Google Mail</ExternalLink>
                </div>
              </div>
              <Button
                variant="secondary"
                disabled={action.isPending}
                onClick={() => {
                  if (message.taskId) {
                    onOpenTask(message.taskId);
                    return;
                  }
                  setImporting(message.threadId);
                  action.mutate(
                    {
                      path: "/api/mail/import",
                      body: { threadId: message.threadId, projectId: projectId || null },
                    },
                    {
                      onSuccess: (result) => onOpenTask((result as { task: Task }).task.id),
                      onSettled: () => setImporting(null),
                    },
                  );
                }}
              >
                {importing === message.threadId
                  ? "Gesprek importeren…"
                  : message.taskId
                    ? "Taak openen"
                    : "Maak taak"}
                <ArrowRight size={15} />
              </Button>
            </article>
          ))}
        </div>
      )}
      {pages.length || mail.data?.nextPage ? (
        <div className="row end">
          <Button
            variant="secondary"
            disabled={!pages.length || mail.isFetching}
            onClick={() => setPages((p) => p.slice(0, -1))}
          >
            Vorige
          </Button>
          <span className="muted small">Pagina {pages.length + 1}</span>
          <Button
            variant="secondary"
            disabled={!mail.data?.nextPage || mail.isFetching}
            onClick={() => {
              const next = mail.data?.nextPage;
              if (next) setPages((p) => [...p, next]);
            }}
          >
            Volgende
          </Button>
        </div>
      ) : null}
    </div>
  );
}
