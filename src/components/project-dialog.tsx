import { useQuery } from "@tanstack/react-query";
import { Check, Link2, Search, X } from "lucide-react";
import { useState } from "react";
import type { AmpProject } from "../../server/amp-projects";
import type { SourceProject } from "../../server/connectors";
import { type Project, type ProjectInput, phaseLabels, projectInput } from "../../shared/domain";
import { api, useAction, useToast } from "../lib/api";
import { Field } from "./common";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";

export function ProjectDialog({ project, onClose }: { project?: Project; onClose: () => void }) {
  const [form, setForm] = useState<ProjectInput>(
    () => project ?? { ...projectInput.parse({ name: "Nieuw project" }), name: "" },
  );
  const [provider, setProvider] = useState<"orbit" | "sentry">("orbit");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [mailSenders, setMailSenders] = useState(() => project?.mailSenders.join("\n") ?? "");
  const action = useAction();
  const toast = useToast();
  const ampProjects = useQuery({
    queryKey: ["amp-projects"],
    queryFn: () => api<{ projects: AmpProject[] }>("/api/amp/projects"),
    retry: false,
    staleTime: 60000,
  });
  const sources = useQuery({
    queryKey: ["sources", provider, search, page],
    queryFn: async () => {
      const result = await api<{
        projects?: SourceProject[];
        clients?: SourceProject[];
        hasMore: boolean;
        snapshotAt?: string;
      }>(
        `/api/sources/${provider}/${provider === "orbit" ? "clients" : "projects"}?q=${encodeURIComponent(search ?? "")}&page=${page}`,
      );
      return { ...result, items: result.clients ?? result.projects ?? [] };
    },
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
              body: {
                ...form,
                mailSenders: mailSenders
                  .split(/[\n,;]+/)
                  .map((value) => value.trim())
                  .filter(Boolean),
              },
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
          <div className="stack">
            <Field label="Amp-project" hint="Het project dat Amp in de orb moet openen.">
              <select
                value={form.ampProject}
                disabled={ampProjects.isPending}
                onChange={(e) => {
                  const value = e.target.value;
                  const selected = ampProjects.data?.projects.find(
                    (p) => `${p.namespace}/${p.name}` === value,
                  );
                  setForm((old) => ({
                    ...old,
                    ampProject: value,
                    repository: selected?.repositoryURL || old.repository,
                  }));
                }}
              >
                <option value="">
                  {ampProjects.isPending ? "Projecten ophalen…" : "Zonder repository onderzoeken"}
                </option>
                {form.ampProject &&
                !ampProjects.data?.projects.some(
                  (p) => `${p.namespace}/${p.name}` === form.ampProject,
                ) ? (
                  <option value={form.ampProject}>{form.ampProject} · niet geverifieerd</option>
                ) : null}
                {ampProjects.data?.projects.map((p) => (
                  <option key={p.id} value={`${p.namespace}/${p.name}`}>
                    {p.namespace}/{p.name}
                  </option>
                ))}
              </select>
            </Field>
            {ampProjects.error ? (
              <span className="inline-error">{ampProjects.error.message}</span>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={ampProjects.isFetching}
              onClick={() => void ampProjects.refetch()}
            >
              Projecten opnieuw ophalen
            </Button>
          </div>
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
        <section className="section-divider stack">
          <h3>Google Mail</h3>
          <Field
            label="E-mailadressen en domeinen"
            hint="Eén per regel. Gebruik contact@klant.nl voor één afzender of @klant.nl voor het hele domein."
          >
            <textarea
              rows={3}
              value={mailSenders}
              onChange={(event) => setMailSenders(event.target.value)}
              placeholder={"contact@klant.nl\n@klant.nl"}
            />
          </Field>
          <p className="muted">
            Bij Maak taak herkent de werkplek het project aan de afzender. Een exact e-mailadres
            gaat voor een domein. Je kunt de bestemming in Google Mail aanpassen.
          </p>
        </section>
        <section className="section-divider">
          <h3>AI-context</h3>
          <p className="muted">Deze afspraken gaan mee bij elke Amp-uitvoering in dit project.</p>
          <div className="stack">
            <Field
              label="Projectkennis en afspraken"
              hint="Product, gebruikers, technische keuzes en beperkingen."
            >
              <textarea
                rows={4}
                maxLength={12000}
                value={form.guidance.context}
                onChange={(e) => change("guidance", { ...form.guidance, context: e.target.value })}
                placeholder="Bijvoorbeeld: de klant gebruikt het portaal vooral op tablets. Behoud bestaande URL's."
              />
            </Field>
            <Field
              label="Klantcommunicatie"
              hint="Taal, toon, aanspreekvorm en gewenste hoeveelheid uitleg."
            >
              <textarea
                rows={3}
                maxLength={6000}
                value={form.guidance.communication}
                onChange={(e) =>
                  change("guidance", { ...form.guidance, communication: e.target.value })
                }
                placeholder="Bijvoorbeeld: schrijf in het Nederlands, spreek aan met je en vat het resultaat kort samen. Vermijd technische termen."
              />
            </Field>
            <details className="phase-guidance">
              <summary>
                Extra instructies per stap <span className="muted">· optioneel</span>
              </summary>
              <p className="muted">
                Amp krijgt alleen de instructies voor de stap die op dat moment loopt. Goedkeuring
                en review blijven nodig.
              </p>
              <div className="stack">
                {Object.entries(phaseLabels).map(([key, label]) => {
                  const phase = key as keyof typeof phaseLabels;
                  return (
                    <Field key={phase} label={label}>
                      <textarea
                        rows={2}
                        maxLength={4000}
                        value={form.guidance.phases[phase]}
                        onChange={(e) =>
                          change("guidance", {
                            ...form.guidance,
                            phases: { ...form.guidance.phases, [phase]: e.target.value },
                          })
                        }
                        placeholder={`Aanvullende afspraken voor ${label.toLowerCase()}…`}
                      />
                    </Field>
                  );
                })}
              </div>
            </details>
          </div>
        </section>
        <section className="section-divider">
          <h3>
            <Link2 size={16} /> Gekoppelde bronnen
          </h3>
          <p className="muted">
            Selecteer één of meerdere Teamleader Orbit-klanten. Hun tickets komen op dit board, ook
            zonder Teamleader Orbit-project. Koppel daarnaast de Sentry-projecten die erbij horen.
          </p>
          <div className="mapped-sources">
            {form.mappings.map((m) => (
              <div className="mapping" key={`${m.provider}:${m.scope}:${m.externalId}`}>
                <span>
                  <strong>{m.name}</strong>
                  <small>
                    {m.provider === "orbit"
                      ? m.scope === "client"
                        ? "Teamleader Orbit-klant"
                        : "Teamleader Orbit-project, bestaande koppeling"
                      : "Sentry-project"}{" "}
                    · {m.externalId}
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
              <option value="orbit">Teamleader Orbit-klanten</option>
              <option value="sentry">Sentry-projecten</option>
            </select>
            <input
              aria-label={
                provider === "orbit" ? "Zoek Teamleader Orbit-klanten" : "Zoek Sentry-projecten"
              }
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={provider === "orbit" ? "Zoek klantnaam…" : "Zoek Sentry-project…"}
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
          {sources.isFetching ? (
            <p className="muted">{provider === "orbit" ? "Klanten" : "Projecten"} ophalen…</p>
          ) : null}
          {sources.data?.snapshotAt ? (
            <p className="notice">
              Lokale{" "}
              {provider === "orbit"
                ? "Teamleader Orbit-klantencatalogus"
                : "Sentry-projectcatalogus"}{" "}
              van {new Date(sources.data.snapshotAt).toLocaleDateString("nl-NL")}. Configureer de
              verbinding voor actuele {provider === "orbit" ? "tickets" : "issues"}.
            </p>
          ) : null}
          {sources.error ? <p className="inline-error">{sources.error.message}</p> : null}
          <div className="source-results">
            {sources.data?.items.map((p) => {
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
                    <small>{provider === "orbit" ? p.externalId : p.client}</small>
                  </span>
                  {selected ? <Check size={16} /> : <span className="muted">Koppelen</span>}
                </button>
              );
            })}
          </div>
          {sources.data && !sources.data.items.length ? (
            <p className="muted">Geen {provider === "orbit" ? "klanten" : "projecten"} gevonden.</p>
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
