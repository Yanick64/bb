import { useState } from "react";
import type { Project, Task } from "../../shared/domain";
import { useAction } from "../lib/api";
import { Field } from "./common";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
export function NewTask({
  projects,
  projectId,
  onClose,
  onCreated,
}: {
  projects: Project[];
  projectId?: string;
  onClose: () => void;
  onCreated: (task: Task) => void;
}) {
  const action = useAction();
  const [project, setProject] = useState(projectId ?? "");
  return (
    <Dialog
      open
      onClose={onClose}
      title="Nieuwe taak"
      description="Een klantvraag, onderzoek of wijziging. Code is niet altijd het eindresultaat."
    >
      <form
        className="dialog-body stack"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          action.mutate(
            {
              path: "/api/tasks",
              body: {
                title: form.get("title"),
                description: form.get("description"),
                projectId: project || null,
                kind: form.get("kind"),
                priority: form.get("priority"),
              },
            },
            {
              onSuccess: (task) => {
                onCreated(task as Task);
                onClose();
              },
            },
          );
        }}
      >
        <Field label="Wat moet er gebeuren?">
          <input
            autoFocus
            name="title"
            required
            maxLength={240}
            placeholder="Bijvoorbeeld: checkout werkt niet op mobiel"
          />
        </Field>
        <Field label="Context">
          <textarea
            name="description"
            rows={5}
            placeholder="Wat is de aanleiding? Wat verwacht de klant?"
          />
        </Field>
        <Field label="Project">
          <select value={project} onChange={(e) => setProject(e.target.value)}>
            <option value="">Later kiezen, naar de algemene inbox</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="form-grid">
          <Field label="Type">
            <select name="kind">
              <option value="feature">Nieuwe functionaliteit</option>
              <option value="bug">Bug</option>
              <option value="question">Klantvraag</option>
              <option value="investigation">Onderzoek</option>
              <option value="maintenance">Onderhoud</option>
            </select>
          </Field>
          <Field label="Prioriteit">
            <select name="priority" defaultValue="normal">
              <option value="low">Laag</option>
              <option value="normal">Normaal</option>
              <option value="high">Hoog</option>
              <option value="urgent">Urgent</option>
            </select>
          </Field>
        </div>
        <footer className="form-footer">
          <Button type="button" variant="ghost" onClick={onClose}>
            Annuleren
          </Button>
          <Button disabled={action.isPending}>Taak aanmaken</Button>
        </footer>
      </form>
    </Dialog>
  );
}
