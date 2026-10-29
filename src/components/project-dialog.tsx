import { useQuery } from "@tanstack/react-query";
import { Check, Link2, Search, X } from "lucide-react";
import { useState } from "react";
import type { SourceProject } from "../../server/connectors";
import type { Project, ProjectInput } from "../../shared/domain";
import { api, useAction, useToast } from "../lib/api";
import { Field } from "./common";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";

export function ProjectDialog({ project, onClose }: { project?: Project; onClose: () => void }) {
  const [form, setForm] = useState<ProjectInput>(
    project ?? {
      name: "",
      description: "",
      color: "orange",
      ampProject: "",
      repository: "",
      qualityCommands: "",
      mappings: [],
    },
  );
  const [provider, setProvider] = useState<"orbit" | "sentry">("orbit");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const action = useAction();
  const toast = useToast();
  const sources = useQuery({
    queryKey: ["sources", provider, search, page],
    queryFn: () =>
      api<{ projects: SourceProject[]; hasMore: boolean }>(
        `/api/sources/${provider}/projects?q=${encodeURIComponent(search ?? "")}&page=${page}`,
      ),
    enabled: search !== null,
    retry: false,
  });
  function change<K extends keyof ProjectInput>(key: K, value: ProjectInput[K]) {
    setForm((old) => ({ ...old, [key]: value }));
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={project ? "Projectinstellingen" : "Nieuw project"}
      description="Een eigen board met de bronnen die jij kiest."
      wide
    >
      <form
        className="dialog-body stack"
        onSubmit={(event) => {
          event.preventDefault();
          action.mutate(
            {
              path: project ? `/api/projects/${project.id}` : "/api/projects",
              body: form,
              method: project ? "PUT" : "POST",
            },
            {
              onSuccess: () => {
                toast("Project opgeslagen");
                onClose();
              },
            },
          );
        }}
      >
        <div className="form-grid">
          <Field label="Projectnaam">
            <input
              required
              value={form.name}
              maxLength={120}
              onChange={(e) => change("name", e.target.value)}
              placeholder="Bijvoorbeeld: Klantplatform"
            />
          </Field>
          <Field label="Kleur">
            <select
              value={form.color}
              onChange={(e) => change("color", e.target.value as ProjectInput["color"])}
            >
              <option value="orange">Oranje</option>
              <option value="blue">Blauw</option>
              <option value="purple">Paars</option>
              <option value="green">Groen</option>
              <option value="rose">Roze</option>
            </select>
          </Field>
        </div>
        <Field label="Beschrijving">
          <textarea
            rows={2}
            value={form.description}
            onChange={(e) => change("description", e.target.value)}
          />
        </Field>
        <div className="form-grid">
          <Field label="Amp-project" hint="Het project dat Amp in de orb moet openen.">
            <input
              value={form.ampProject}
              onChange={(e) => change("ampProject", e.target.value)}
              placeholder="namespace/project"
            />
          </Field>
          <Field label="Repository">
            <input
              type="url"
              value={form.repository}
              onChange={(e) => change("repository", e.target.value)}
              placeholder="https://github.com/organisatie/repo"
            />
          </Field>
        </div>
        <Field
          label="Kwaliteitscontroles"
          hint="Deze opdrachten krijgt Amp als projectcontext mee."
        >
          <textarea
            rows={2}
            value={form.qualityCommands}
            onChange={(e) => change("qualityCommands", e.target.value)}
            placeholder="bun run lint&#10;bun test&#10;bun run build"
          />
        </Field>
        <section className="section-divider">
          <h3>
            <Link2 size={16} /> Gekoppelde bronnen
          </h3>
          <p className="muted">
            Selecteer Orbit-projecten van één of meerdere klanten. Nieuwe taken komen op dit board.
          </p>
          <div className="mapped-sources">
            {form.mappings.map((m) => (
              <div className="mapping" key={`${m.provider}:${m.externalId}`}>
                <span>
                  <strong>{m.name}</strong>
                  <small>
                    {m.provider === "orbit" ? "Orbit" : "Sentry"} · {m.client || m.externalId}
                  </small>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Ontkoppel ${m.name}`}
                  onClick={() =>
                    change(
                      "mappings",
                      form.mappings.filter((x) => x !== m),
                    )
                  }
                >
                  <X size={15} />
                </Button>
              </div>
            ))}
          </div>
          <div className="source-search">
            <select
              aria-label="Bron"
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value as "orbit" | "sentry");
                setSearch(null);
                setPage(1);
              }}
            >
              <option value="orbit">Teamleader Orbit</option>
              <option value="sentry">Sentry</option>
            </select>
            <input
              aria-label="Zoek externe projecten"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Zoek project of klant…"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setSearch(query);
                setPage(1);
              }}
            >
              <Search size={15} />
              Zoeken
            </Button>
          </div>
          {sources.isFetching ? <p className="muted">Projecten ophalen…</p> : null}
          {sources.error ? <p className="inline-error">{sources.error.message}</p> : null}
          <div className="source-results">
            {sources.data?.projects.map((p) => {
              const selected = form.mappings.some(
                (m) => m.provider === p.provider && m.externalId === p.externalId,
              );
              return (
                <button
                  type="button"
                  className="source-result"
                  key={p.externalId}
                  disabled={selected}
                  onClick={() => change("mappings", [...form.mappings, p])}
                >
                  <span>
                    <strong>{p.name}</strong>
                    <small>{p.client}</small>
                  </span>
                  {selected ? <Check size={16} /> : <span className="muted">Koppelen</span>}
                </button>
              );
            })}
          </div>
          {sources.data && !sources.data.projects.length ? (
            <p className="muted">Geen projecten gevonden.</p>
          ) : null}
          {sources.data ? (
            <div className="row">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={page === 1 || sources.isFetching}
                onClick={() => setPage((p) => p - 1)}
              >
                Vorige
              </Button>
              <small>Pagina {page}</small>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={!sources.data.hasMore || sources.isFetching}
                onClick={() => setPage((p) => p + 1)}
              >
                Volgende
              </Button>
            </div>
          ) : null}
        </section>
        <footer className="form-footer">
          <Button type="button" variant="ghost" onClick={onClose}>
            Annuleren
          </Button>
          <Button disabled={action.isPending}>
            {action.isPending ? "Opslaan…" : "Project opslaan"}
          </Button>
        </footer>
      </form>
    </Dialog>
  );
}
