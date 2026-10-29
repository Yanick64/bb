import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Member, Project, ProjectInput, Signal, Task } from "../shared/domain";
import { projectInput, signalInput, taskInput } from "../shared/domain";

export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const now = () => new Date().toISOString();
export const id = () => crypto.randomUUID();
export function activity(task: Task, text: string) {
  task.activity.push({ id: id(), text, createdAt: now() });
}
function normalizeTask(data: string): Task {
  return { assigneeId: null, timeEntries: [], deliveryDraft: null, ...JSON.parse(data) };
}
export class Store {
  db: Database;
  listeners = new Set<() => void>();
  constructor(path = ":memory:") {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new Database(path, { create: true });
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS tasks (number INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS signals (id TEXT PRIMARY KEY, provider TEXT NOT NULL, external_id TEXT NOT NULL, task_id TEXT NOT NULL REFERENCES tasks(id), data TEXT NOT NULL, UNIQUE(provider,external_id));
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS run_events (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL REFERENCES tasks(id), run_id TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL);
      PRAGMA user_version=1;`);
  }
  changed() {
    for (const listener of this.listeners) listener();
  }
  projects(): Project[] {
    return this.db
      .query<{ data: string }, []>("SELECT data FROM projects ORDER BY rowid")
      .all()
      .map((r) => {
        const project = JSON.parse(r.data) as Project;
        return { ...project, ...projectInput.parse(project) };
      });
  }
  tasks(): Task[] {
    return this.db
      .query<{ data: string }, []>("SELECT data FROM tasks ORDER BY number DESC")
      .all()
      .map((r) => normalizeTask(r.data));
  }
  task(taskId: string): Task {
    const row = this.db
      .query<{ data: string }, [string]>("SELECT data FROM tasks WHERE id=?")
      .get(taskId);
    if (!row) throw new AppError("Taak niet gevonden", 404);
    return normalizeTask(row.data);
  }
  project(projectId: string): Project {
    const project = this.projects().find((p) => p.id === projectId);
    if (!project) throw new AppError("Project niet gevonden", 404);
    return project;
  }
  saveProject(input: ProjectInput, projectId?: string, demo = false) {
    const existing = projectId ? this.project(projectId) : null;
    for (const mapping of input.mappings) {
      const conflict = this.projects().find(
        (p) =>
          p.id !== projectId &&
          p.mappings.some(
            (m) =>
              m.provider === mapping.provider &&
              m.scope === mapping.scope &&
              m.externalId === mapping.externalId,
          ),
      );
      if (conflict) throw new AppError(`Deze bron is al gekoppeld aan ${conflict.name}`, 409);
    }
    const project: Project = {
      ...input,
      id: existing?.id ?? id(),
      createdAt: existing?.createdAt ?? now(),
      demo: existing?.demo ?? demo,
    };
    this.db
      .query(
        "INSERT INTO projects (id,data) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
      )
      .run(project.id, JSON.stringify(project));
    this.changed();
    return project;
  }
  createTask(input: unknown, source: Task["source"] = "manual", demo = false) {
    const data = taskInput.parse(input);
    if (data.projectId) this.project(data.projectId);
    return this.db.transaction(() => {
      const task: Task = {
        ...data,
        assigneeId: null,
        timeEntries: [],
        deliveryDraft: null,
        id: id(),
        number: 0,
        stage: "inbox",
        summary: "",
        revision: 1,
        source,
        demo,
        createdAt: now(),
        updatedAt: now(),
        questions: [],
        plans: [],
        evidence: [],
        runs: [],
        messages: [],
        activity: [],
        review: null,
        reviewCycle: 0,
        delivery: null,
      };
      const result = this.db.query("INSERT INTO tasks (id,data) VALUES (?,?)").run(task.id, "{}");
      task.number = Number(result.lastInsertRowid);
      activity(task, "Taak ontvangen");
      this.db.query("UPDATE tasks SET data=? WHERE id=?").run(JSON.stringify(task), task.id);
      this.changed();
      return task;
    })();
  }
  update(taskId: string, mutate: (task: Task) => void, revision?: number): Task {
    const task = this.db.transaction(() => {
      const task = this.task(taskId);
      if (revision !== undefined && task.revision !== revision)
        throw new AppError("De taak is intussen gewijzigd. Ververs en probeer opnieuw.", 409);
      mutate(task);
      task.revision++;
      task.updatedAt = now();
      this.db.query("UPDATE tasks SET data=? WHERE id=?").run(JSON.stringify(task), taskId);
      return task;
    })();
    this.changed();
    return task;
  }
  signals(taskId?: string): Signal[] {
    const rows = taskId
      ? this.db
          .query<{ data: string }, [string]>("SELECT data FROM signals WHERE task_id=?")
          .all(taskId)
      : this.db.query<{ data: string }, []>("SELECT data FROM signals").all();
    return rows.map((r) => {
      const signal = JSON.parse(r.data) as Signal;
      return { ...signal, ...signalInput.parse(signal) };
    });
  }
  setting(key: string) {
    return this.db
      .query<{ value: string }, [string]>("SELECT value FROM settings WHERE key=?")
      .get(key)?.value;
  }
  members(): Member[] {
    return JSON.parse(this.setting("members") ?? "[]");
  }
  member(memberId: string) {
    if (memberId === "self") return { id: "self", name: "Jij" };
    const member = this.members().find((m) => m.id === memberId);
    if (!member) throw new AppError("Teamlid niet gevonden", 404);
    return member;
  }
  addMember(name: string): Member {
    const members = this.members();
    if (members.some((m) => m.name.toLocaleLowerCase() === name.toLocaleLowerCase()))
      throw new AppError("Dit teamlid bestaat al", 409);
    const member = { id: id(), name };
    this.setSetting("members", JSON.stringify([...members, member]));
    this.changed();
    return member;
  }
  setSetting(key: string, value: string) {
    this.db
      .query(
        "INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(key, value);
  }
  event(taskId: string, runId: string, data: unknown) {
    this.db
      .query("INSERT INTO run_events (task_id,run_id,data,created_at) VALUES (?,?,?,?)")
      .run(taskId, runId, JSON.stringify(data), now());
    this.changed();
  }
  events(taskId: string) {
    return this.db
      .query<{ id: number; run_id: string; data: string; created_at: string }, [string]>(
        "SELECT * FROM (SELECT id,run_id,data,created_at FROM run_events WHERE task_id=? ORDER BY id DESC LIMIT 200) ORDER BY id",
      )
      .all(taskId)
      .map((r) => ({
        id: r.id,
        runId: r.run_id,
        data: JSON.parse(r.data) as unknown,
        createdAt: r.created_at,
      }));
  }
}
