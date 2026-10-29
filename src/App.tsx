import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  ArrowUpRight,
  Boxes,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  CirclePlus,
  FolderKanban,
  Inbox,
  LayoutGrid,
  ListChecks,
  LoaderCircle,
  Menu,
  Moon,
  MoreHorizontal,
  Plug,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Sun,
  Users,
  X,
} from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  activeRun,
  nextAction,
  type Project,
  stageLabels,
  stages,
  type Task,
} from "../shared/domain";
import { Empty, Field, Priority, SourceBadge } from "./components/common";
import { Connections } from "./components/connections";
import { Team } from "./components/team";
import { Button } from "./components/ui/button";
import { api, useAction, useFactory, useToast } from "./lib/api";

const TaskDetail = lazy(() =>
  import("./components/task-detail").then((m) => ({ default: m.TaskDetail })),
);
const ProjectDialog = lazy(() =>
  import("./components/project-dialog").then((m) => ({ default: m.ProjectDialog })),
);
const NewTask = lazy(() => import("./components/new-task").then((m) => ({ default: m.NewTask })));

export function App() {
  const auth = useQuery({
    queryKey: ["auth"],
    queryFn: () => api<{ required: boolean; authenticated: boolean }>("/api/auth"),
    retry: false,
  });
  const action = useAction();
  if (auth.isPending)
    return (
      <div className="loading-screen">
        <span className="brand-mark">bb</span>
        <p>Werkruimte openen…</p>
      </div>
    );
  if (auth.error)
    return (
      <div className="loading-screen">
        <h1>BB is niet bereikbaar</h1>
        <p>{auth.error.message}</p>
        <Button
          onClick={() => {
            void auth.refetch();
          }}
        >
          Opnieuw proberen
        </Button>
      </div>
    );
  if (!auth.data.authenticated)
    return (
      <div className="login-screen">
        <form
          className="panel stack"
          onSubmit={(e) => {
            e.preventDefault();
            action.mutate({
              path: "/api/login",
              body: { password: new FormData(e.currentTarget).get("password") },
            });
          }}
        >
          <span className="brand-mark">bb</span>
          <h1>Welkom terug</h1>
          <p className="muted">Log in op je software factory.</p>
          <Field label="Wachtwoord">
            <input name="password" type="password" required autoComplete="current-password" />
          </Field>
          <Button disabled={action.isPending}>
            Werkruimte openen
            <ArrowRight size={16} />
          </Button>
        </form>
      </div>
    );
  return <Factory />;
}
function Factory() {
  const { data, error, isPending, live, refetch } = useFactory();
  const action = useAction();
  const toast = useToast();
  const [view, setView] = useState(
    () => new URLSearchParams(location.search).get("view") ?? "actions",
  );
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    new URLSearchParams(location.search).get("task"),
  );
  const [newTask, setNewTask] = useState(false);
  const [editProject, setEditProject] = useState<Project | "new" | null>(null);
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("all");
  const [assignee, setAssignee] = useState("all");
  const [mobileNav, setMobileNav] = useState(false);
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("bb-theme", dark ? "dark" : "light");
  }, [dark]);
  useEffect(() => {
    const onPop = () => {
      const params = new URLSearchParams(location.search);
      setSelectedId(params.get("task"));
      setView(params.get("view") ?? "actions");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  function openTask(id: string | null) {
    setSelectedId(id);
    const url = new URL(location.href);
    if (id) url.searchParams.set("task", id);
    else url.searchParams.delete("task");
    history.pushState({}, "", url);
  }
  function navigate(next: string) {
    setView(next);
    const url = new URL(location.href);
    url.searchParams.set("view", next);
    history.pushState({}, "", url);
    setSearch("");
    setSource("all");
    setMobileNav(false);
  }
  const project = data?.projects.find((p) => view === p.id);
  const filtered = useMemo(() => {
    const query = search.toLocaleLowerCase("nl");
    return (
      data?.tasks.filter((task) => {
        if (project && task.projectId !== project.id) return false;
        if (view === "inbox" && task.stage !== "inbox") return false;
        if (view === "actions" && ["amp", "none"].includes(nextAction(task).owner)) return false;
        if (source !== "all" && task.source !== source) return false;
        if (assignee !== "all" && (task.assigneeId ?? "unassigned") !== assignee) return false;
        return (
          !query ||
          `${task.title} ${task.description} BB-${task.number} ${task.summary}`
            .toLocaleLowerCase("nl")
            .includes(query)
        );
      }) ?? []
    );
  }, [data?.tasks, project, view, source, search, assignee]);
  if (isPending)
    return (
      <div className="loading-screen">
        <span className="brand-mark">bb</span>
        <p>Je projecten ophalen…</p>
      </div>
    );
  if (error || !data)
    return (
      <div className="loading-screen">
        <h1>Werkruimte niet geladen</h1>
        <p>{error?.message}</p>
        <Button
          onClick={() => {
            void refetch();
          }}
        >
          Opnieuw proberen
        </Button>
      </div>
    );
  const activeTasks = data.tasks.filter((t) => t.stage !== "done");
  const actions = activeTasks.filter((t) => nextAction(t).owner === "operator").length;
  const waiting = activeTasks.filter((t) => nextAction(t).owner === "client").length;
  const running = data.tasks.filter((t) => {
    const r = activeRun(t);
    return r?.status === "running" || r?.status === "queued";
  }).length;
  const selected = data.tasks.find((t) => t.id === selectedId);
  const title =
    project?.name ??
    {
      actions: "Volgende acties",
      team: "Team",
      inbox: "Inbox",
      all: "Alle taken",
      projects: "Projecten",
      connections: "Verbindingen",
    }[view] ??
    "Volgende acties";
  const subtitle =
    project?.description ||
    {
      actions: "Weet wat er speelt. Kies wat er nu moet gebeuren.",
      inbox: "Nieuwe aanvragen en signalen, klaar voor triage.",
      all: "Al het werk, van eerste vraag tot oplevering.",
      projects: "Jouw projecten, met de bronnen die jij kiest.",
      connections: "Verbind de bronnen en tools van je werkruimte.",
      team: "Verdeel het werk en houd de bezetting in beeld.",
    }[view];
  const navItems = [
    { key: "actions", label: "Volgende acties", Icon: ListChecks, count: actions },
    {
      key: "inbox",
      label: "Inbox",
      Icon: Inbox,
      count: data.tasks.filter((t) => t.stage === "inbox").length,
    },
    { key: "all", label: "Alle taken", Icon: LayoutGrid },
    { key: "team", label: "Team", Icon: Users },
  ];
  return (
    <div className="app-shell">
      {mobileNav ? (
        <button
          type="button"
          className="nav-backdrop"
          aria-label="Navigatie sluiten"
          onClick={() => setMobileNav(false)}
        />
      ) : null}
      <aside id="workspace-navigation" className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate("actions");
          }}
        >
          <span className="brand-mark">bb</span>
          <div>
            <strong>BB</strong>
            <span>Software factory</span>
          </div>
        </a>
        <div className="workspace-label">
          <span className="workspace-avatar">2D</span>
          <span>2DIGITS studio</span>
          <span className="badge tiny">Development</span>
        </div>
        <nav aria-label="Hoofdnavigatie">
          <p className="nav-label">WERKRUIMTE</p>
          {navItems.map(({ key, label, Icon, count }) => (
            <button
              type="button"
              key={key}
              className={`nav-item ${view === key ? "active" : ""}`}
              onClick={() => navigate(key)}
            >
              <Icon size={17} />
              <span>{label}</span>
              {count ? <span className="nav-count">{count}</span> : null}
            </button>
          ))}
          <div className="nav-section-heading">
            <span className="nav-label">PROJECTEN</span>
            <button
              type="button"
              aria-label="Project toevoegen"
              onClick={() => setEditProject("new")}
            >
              <Plus size={15} />
            </button>
          </div>
          {data.projects.map((p) => (
            <button
              type="button"
              className={`nav-item ${view === p.id ? "active" : ""}`}
              key={p.id}
              onClick={() => navigate(p.id)}
            >
              <span className={`project-dot dot-${p.color}`} />
              <span className="truncate">{p.name}</span>
              <span className="nav-count">
                {activeTasks.filter((t) => t.projectId === p.id).length || ""}
              </span>
            </button>
          ))}
          <button
            type="button"
            className={`nav-item ${view === "projects" ? "active" : ""}`}
            onClick={() => navigate("projects")}
          >
            <FolderKanban size={16} />
            <span>Projecten beheren</span>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="runtime-status">
            <span className={`status-dot ${running ? "status-running" : ""}`} />
            <div>
              <strong>
                {running
                  ? `${running} Amp-uitvoering${running > 1 ? "en" : ""}`
                  : "Alles op jouw tempo"}
              </strong>
              <small>{running ? "Werkt door in een orb" : "Klaar voor de volgende stap"}</small>
            </div>
          </div>
          <button
            type="button"
            className={`nav-item ${view === "connections" ? "active" : ""}`}
            onClick={() => navigate("connections")}
          >
            <Plug size={17} />
            <span>Verbindingen</span>
            {!data.connections.amp ? <span className="attention-dot" /> : null}
          </button>
          <div className="sidebar-footer">
            <span>
              <span className={`connection-dot ${live ? "online" : ""}`} />
              {live ? "Live bijgewerkt" : "Opnieuw verbinden…"}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label={dark ? "Licht thema" : "Donker thema"}
              onClick={() => setDark((d) => !d)}
            >
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </Button>
          </div>
        </div>
      </aside>
      <main className="main">
        <div className="topbar">
          <Button
            variant="ghost"
            size="icon"
            className="mobile-menu"
            aria-label="Menu openen"
            aria-expanded={mobileNav}
            aria-controls="workspace-navigation"
            onClick={() => setMobileNav(true)}
          >
            <Menu size={19} />
          </Button>
          <span>Werkruimte</span>
          <ChevronRight size={13} />
          <strong>{project ? "Projectboard" : title}</strong>
          <span className="spacer" />
          <span className="topbar-date">
            {new Intl.DateTimeFormat("nl-NL", {
              weekday: "long",
              day: "numeric",
              month: "long",
            }).format(new Date())}
          </span>
          <span className="user-avatar">2D</span>
        </div>
        <header className="page-header">
          <div className="page-heading">
            <div className="eyebrow">
              {project
                ? "PROJECTBOARD"
                : view === "actions"
                  ? "HET WERK GAAT VERDER"
                  : "SOFTWARE FACTORY"}
            </div>
            <h1>
              {project ? <span className={`project-dot dot-${project.color}`} /> : null}
              {title}
              {project?.demo ? <span className="badge">Voorbeeld</span> : null}
            </h1>
            <p>{subtitle}</p>
          </div>
          <div className="row wrap">
            {project ? (
              <>
                <Button
                  variant="secondary"
                  size="icon"
                  aria-label="Projectinstellingen"
                  onClick={() => setEditProject(project)}
                >
                  <Settings2 size={17} />
                </Button>
                <Button
                  variant="secondary"
                  disabled={action.isPending || !project.mappings.length}
                  onClick={() =>
                    action.mutate(
                      { path: `/api/projects/${project.id}/sync`, body: {} },
                      {
                        onSuccess: (result) => {
                          const r = result as {
                            created: number;
                            duplicate: number;
                            limited: boolean;
                            errors: { source: string; message: string }[];
                          };
                          toast(
                            `${r.created} nieuwe taken, ${r.duplicate} al bekend.${r.limited ? " De bron begrenst deze lijst; niet alle items zijn opgehaald." : ""}${r.errors?.length ? ` ${r.errors.map((error) => `${error.source}: ${error.message}`).join(" ")}` : ""}`,
                            Boolean(r.errors?.length),
                          );
                        },
                      },
                    )
                  }
                >
                  <RefreshCw size={15} />
                  Bronnen ophalen
                </Button>
              </>
            ) : null}
            {view === "projects" ? (
              <Button onClick={() => setEditProject("new")}>
                <Plus size={16} />
                Nieuw project
              </Button>
            ) : !["connections", "team"].includes(view) ? (
              <Button onClick={() => setNewTask(true)}>
                <Plus size={16} />
                Nieuwe taak
              </Button>
            ) : null}
          </div>
        </header>
        {view === "team" ? (
          <Team members={data.members} tasks={data.tasks} />
        ) : view === "connections" ? (
          <Connections state={data} />
        ) : view === "projects" ? (
          <div className="page-body">
            <div className="project-grid">
              {data.projects.map((p) => (
                <section className="panel project-card" key={p.id}>
                  <div className="row">
                    <span className={`project-initial initial-${p.color}`}>
                      {p.name.slice(0, 1)}
                    </span>
                    <span className="spacer" />
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Instellingen ${p.name}`}
                      onClick={() => setEditProject(p)}
                    >
                      <MoreHorizontal size={18} />
                    </Button>
                  </div>
                  <h2>{p.name}</h2>
                  <p className="muted">{p.description || "Nog geen omschrijving."}</p>
                  <div className="row muted small">
                    <span>{activeTasks.filter((t) => t.projectId === p.id).length} open taken</span>
                    <span>·</span>
                    <span>{p.mappings.length} bronnen</span>
                  </div>
                  <Button variant="secondary" onClick={() => navigate(p.id)}>
                    Open board
                    <ArrowUpRight size={15} />
                  </Button>
                </section>
              ))}
              <button
                type="button"
                className="new-project-card"
                onClick={() => setEditProject("new")}
              >
                <CirclePlus size={26} />
                <strong>Nieuw project</strong>
                <span>Eigen board, eigen bronnen</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            {view === "actions" ? (
              <div className="stats-row">
                <Stat label="Team is aan zet" value={actions} Icon={ArrowRight} tone="orange" />
                <Stat label="Wacht op de klant" value={waiting} Icon={CircleHelp} tone="purple" />
                <Stat label="Amp aan het werk" value={running} Icon={Boxes} tone="blue" />
                <Stat
                  label="Klaar voor review"
                  value={data.tasks.filter((t) => t.stage === "review").length}
                  Icon={CheckCheck}
                  tone="green"
                />
              </div>
            ) : null}
            {!data.projects.length && !data.tasks.length ? (
              <div className="page-body">
                <Empty title="Van eerste vraag tot oplevering">
                  <p>
                    Maak een project aan en verzamel het werk op één board.
                    <br />
                    Vragen, plannen, Amp-uitvoering en review blijven bij de taak.
                  </p>
                  <div className="row wrap center">
                    <Button onClick={() => setEditProject("new")}>
                      <Plus size={15} />
                      Eerste project maken
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={action.isPending}
                      onClick={() =>
                        action.mutate(
                          { path: "/api/demo", body: {} },
                          { onSuccess: (p) => navigate((p as Project).id) },
                        )
                      }
                    >
                      <Sparkles size={15} />
                      Voorbeeldproject laden
                    </Button>
                  </div>
                  <small>
                    Het voorbeeld gebruikt fictieve gegevens en start geen Amp-uitvoering.
                  </small>
                </Empty>
              </div>
            ) : (
              <>
                <div className="filterbar">
                  <div className="search-field">
                    <Search size={16} />
                    <input
                      aria-label="Taken zoeken"
                      placeholder="Zoek taken…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    {search ? (
                      <button
                        type="button"
                        aria-label="Zoekopdracht wissen"
                        onClick={() => setSearch("")}
                      >
                        <X size={14} />
                      </button>
                    ) : null}
                  </div>
                  <select
                    aria-label="Filter op bron"
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                  >
                    <option value="all">Alle bronnen</option>
                    <option value="orbit">Teamleader Orbit</option>
                    <option value="sentry">Sentry</option>
                    <option value="manual">Handmatig</option>
                    <option value="email">E-mail</option>
                  </select>
                  <select
                    aria-label="Filter op developer"
                    value={assignee}
                    onChange={(e) => setAssignee(e.target.value)}
                  >
                    <option value="all">Alle developers</option>
                    <option value="unassigned">Niet toegewezen</option>
                    {data.members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <span className="spacer" />
                  <span className="muted small">{filtered.length} taken</span>
                </div>
                {project ? (
                  <section className="board" aria-label={`${project.name} kanbanboard`}>
                    {stages.map((stage) => {
                      const tasks = filtered.filter((t) => t.stage === stage);
                      return (
                        <section className={`board-column column-${stage}`} key={stage}>
                          <header>
                            <span className={`stage-dot stage-${stage}`} />
                            <h2>{stageLabels[stage]}</h2>
                            <span className="column-count">{tasks.length}</span>
                            <span className="spacer" />
                            <button
                              type="button"
                              aria-label={`Nieuwe taak voor ${project.name}`}
                              onClick={() => setNewTask(true)}
                            >
                              <Plus size={15} />
                            </button>
                          </header>
                          <div className="column-cards">
                            {tasks.map((task) => (
                              <TaskCard
                                key={task.id}
                                task={task}
                                assignee={data.members.find((m) => m.id === task.assigneeId)?.name}
                                onOpen={() => openTask(task.id)}
                              />
                            ))}
                            {!tasks.length ? (
                              <div className="column-empty">Nog geen taken</div>
                            ) : null}
                          </div>
                        </section>
                      );
                    })}
                  </section>
                ) : (
                  <div className="task-list-wrap">
                    {filtered.length ? (
                      <div className="task-list">
                        <div className="list-heading">
                          <span>TAAK</span>
                          <span>PROJECT</span>
                          <span>VOLGENDE ACTIE</span>
                          <span>STATUS</span>
                        </div>
                        {filtered.map((task) => {
                          const next = nextAction(task);
                          return (
                            <button
                              type="button"
                              className="task-row"
                              key={task.id}
                              onClick={() => openTask(task.id)}
                            >
                              <span className="task-row-title">
                                <span className="task-number">
                                  BB-{String(task.number).padStart(3, "0")}
                                </span>
                                <strong>{task.title}</strong>
                                {task.assigneeId ? (
                                  <span className="badge">
                                    {data.members.find((m) => m.id === task.assigneeId)?.name}
                                  </span>
                                ) : null}
                                <SourceBadge source={task.source} />
                              </span>
                              <span className="task-row-project">
                                {data.projects.find((p) => p.id === task.projectId)?.name ??
                                  "Nog te kiezen"}
                              </span>
                              <span className={`task-row-action owner-${next.owner}`}>
                                <span className="action-indicator" />
                                {next.label}
                              </span>
                              <span className="task-row-stage">
                                <span className={`stage-dot stage-${task.stage}`} />
                                {stageLabels[task.stage]}
                                <ChevronRight size={14} />
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <Empty
                        title={
                          view === "actions" ? "Geen acties op dit moment" : "Geen taken gevonden"
                        }
                      >
                        <p>
                          {search
                            ? "Probeer een andere zoekterm of bron."
                            : "Nieuwe taken verschijnen hier zodra er iets te doen is."}
                        </p>
                      </Empty>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
        <footer className="page-footer">
          <span>BB · Software factory</span>
          <span>Elke taak een duidelijke volgende stap.</span>
        </footer>
      </main>
      <Suspense
        fallback={
          <div className="toast" role="status">
            Onderdeel openen…
          </div>
        }
      >
        {newTask ? (
          <NewTask
            projects={data.projects}
            projectId={project?.id}
            onClose={() => setNewTask(false)}
            onCreated={(task) => openTask(task.id)}
          />
        ) : null}
        {editProject ? (
          <ProjectDialog
            project={editProject === "new" ? undefined : editProject}
            onClose={() => setEditProject(null)}
          />
        ) : null}
        {selected ? (
          <TaskDetail
            key={selected.id}
            task={selected}
            projects={data.projects}
            ampEnabled={data.connections.amp}
            members={data.members}
            onClose={() => openTask(null)}
          />
        ) : null}
      </Suspense>
    </div>
  );
}
function Stat({
  label,
  value,
  Icon,
  tone,
}: {
  label: string;
  value: number;
  Icon: typeof ArrowRight;
  tone: string;
}) {
  return (
    <div className="stat">
      <span className={`stat-icon stat-${tone}`}>
        <Icon size={17} />
      </span>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}
function TaskCard({
  task,
  assignee,
  onOpen,
}: {
  task: Task;
  assignee?: string;
  onOpen: () => void;
}) {
  const next = nextAction(task);
  const run = activeRun(task);
  const questions = task.questions.filter((q) => !q.answer).length;
  return (
    <button type="button" className="task-card" onClick={onOpen}>
      <div className="row">
        <span className="task-number">BB-{String(task.number).padStart(3, "0")}</span>
        <span className="spacer" />
        <Priority value={task.priority} />
      </div>
      <h3>{task.title}</h3>
      {task.summary ? <p className="card-summary">{task.summary}</p> : null}
      <div className="row wrap">
        <SourceBadge source={task.source} />
        {assignee ? <span className="badge">{assignee}</span> : null}
        {questions ? (
          <span className="question-count">
            <CircleHelp size={12} />
            {questions} open
          </span>
        ) : null}
      </div>
      <div className={`card-next owner-${next.owner}`}>
        {run?.status === "running" ? (
          <LoaderCircle size={13} className="spin" />
        ) : (
          <span className="action-indicator" />
        )}
        <span>{next.label}</span>
        <ArrowRight size={12} />
      </div>
    </button>
  );
}
