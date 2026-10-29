import { expect, test } from "bun:test";
import { buildPrompt } from "../server/amp";
import { Store } from "../server/store";
import { phaseLabels, projectInput } from "../shared/domain";

test("stored projects without guidance remain editable and retain mappings and metadata", () => {
  const store = new Store();
  try {
    const project = store.saveProject(
      projectInput.parse({
        name: "Legacy",
        mappings: [{ provider: "sentry", externalId: "example", name: "Example" }],
      }),
    );
    const { guidance: _, ...legacy } = project;
    store.db.query("UPDATE projects SET data=? WHERE id=?").run(JSON.stringify(legacy), project.id);
    const loaded = store.project(project.id);
    expect(loaded.guidance.context).toBe("");
    expect(loaded.guidance.phases.review).toBe("");
    expect(loaded.createdAt).toBe(project.createdAt);
    expect(loaded.mappings).toEqual(project.mappings);
    store.saveProject(
      { ...loaded, guidance: { ...loaded.guidance, communication: "Dutch, concise" } },
      loaded.id,
    );
    expect(store.project(project.id).guidance.communication).toBe("Dutch, concise");
  } finally {
    store.db.close();
  }
});
test.each(Object.keys(phaseLabels) as (keyof typeof phaseLabels)[])(
  "%s prompt carries project guidance and only its active phase",
  (mode) => {
    const store = new Store();
    try {
      const project = store.saveProject(
        projectInput.parse({
          name: "Studio Noord",
          guidance: {
            context: "Tablet-first customer portal",
            communication: "Dutch, informal, short paragraphs",
            phases: Object.fromEntries(
              Object.keys(phaseLabels).map((phase) => [phase, `unique-instruction-${phase}`]),
            ),
          },
        }),
      );
      const task = store.createTask({ title: "Improve search", projectId: project.id });
      const prompt = buildPrompt(task, project, mode, "Check keyboard navigation");
      expect(prompt).toContain(project.guidance.context);
      expect(prompt).toContain(project.guidance.communication);
      expect(prompt).toContain(`unique-instruction-${mode}`);
      for (const phase of Object.keys(phaseLabels))
        if (phase !== mode) expect(prompt).not.toContain(`unique-instruction-${phase}`);
      expect(prompt).toContain("Check keyboard navigation");
      expect(prompt).toContain("do not waive plan approval");
    } finally {
      store.db.close();
    }
  },
);
