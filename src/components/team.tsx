import type { Member, Task } from "../../shared/domain";
import { useAction } from "../lib/api";
import { Field } from "./common";
import { Button } from "./ui/button";

export function Team({ members, tasks }: { members: Member[]; tasks: Task[] }) {
  const action = useAction();
  return (
    <div className="page-body stack">
      <section className="panel stack">
        <h2>Developers</h2>
        <p className="muted">
          Voeg je collega's toe en wijs taken aan hen toe. Dit is de teamplanning binnen deze
          werkruimte. Persoonlijke accounts en rollen volgen later.
        </p>
        {members.map((member) => (
          <div className="row" key={member.id}>
            <strong>{member.name}</strong>
            <span className="spacer" />
            <span className="badge">
              {tasks.filter((t) => t.assigneeId === member.id && t.stage !== "done").length} open
              taken
            </span>
          </div>
        ))}
        <form
          className="row wrap"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            action.mutate(
              { path: "/api/members", body: { name: String(new FormData(form).get("name")) } },
              { onSuccess: () => form.reset() },
            );
          }}
        >
          <Field label="Naam developer">
            <input name="name" required maxLength={100} placeholder="Voor- en achternaam" />
          </Field>
          <Button disabled={action.isPending}>Teamlid toevoegen</Button>
        </form>
      </section>
    </div>
  );
}
