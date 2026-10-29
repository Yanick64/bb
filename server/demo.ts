import { projectInput } from "../shared/domain";
import { activity, type Store } from "./store";
import { addEvidence, addPlan, addQuestion, approve } from "./workflow";

export function seedDemo(store: Store) {
  const existing = store.projects().find((p) => p.demo);
  if (existing) return existing;
  const project = store.saveProject(
    projectInput.parse({
      name: "Studio Noord",
      description:
        "Voorbeeldproject met fictieve klantvragen. Gebruik dit board om BB te ontdekken.",
      color: "orange",
      qualityCommands: "bun run check",
    }),
    undefined,
    true,
  );
  const tasks = [
    {
      title: "Checkout past niet op een mobiel scherm",
      description:
        "Op een iPhone valt de betaalknop buiten beeld. De klant wil dat het bestelproces bruikbaar blijft op 375px breedte.",
      kind: "bug",
      priority: "high",
    },
    {
      title: "Wie mag de zakelijke korting gebruiken?",
      description:
        "De klant vraagt om zakelijke korting, maar heeft nog niet beschreven hoe een zakelijke klant wordt herkend.",
      kind: "question",
      priority: "normal",
    },
    {
      title: "Bevestigingsmail na een bestelling",
      description:
        "De bestelbevestiging moet de leverdatum tonen. Onderzoek waar deze datum beschikbaar is.",
      kind: "feature",
      priority: "normal",
    },
    {
      title: "TypeError bij een leeg zoekresultaat",
      description:
        "Fictieve Sentry-melding: de zoekpagina probeert een eigenschap van een ontbrekend resultaat te lezen.",
      kind: "bug",
      priority: "high",
    },
    {
      title: "Nieuwe contactpagina",
      description: "Een aanvraag voor een contactformulier en contactgegevens.",
      kind: "feature",
      priority: "low",
    },
  ];
  for (const [index, input] of tasks.entries()) {
    const task = store.createTask(
      { ...input, projectId: project.id },
      index === 3 ? "sentry" : index === 1 ? "orbit" : "manual",
      true,
    );
    store.update(task.id, (t) => {
      if (index === 0) {
        t.summary =
          "De checkout heeft een vaste minimumbreedte. Vervang die door een responsieve layout en controleer de betaalactie op mobiel.";
        addPlan(t, {
          summary: "Maak de checkout bruikbaar op mobiel.",
          steps: [
            "Reproduceer de overflow op 375px.",
            "Pas de layout aan zonder de desktopweergave te veranderen.",
            "Controleer het bestelproces en lever screenshots aan.",
          ],
          criteria: ["De betaalknop is zichtbaar op 375px breedte."],
        });
        approve(t, 1);
        t.stage = "review";
        addEvidence(t, {
          title: "Mobiele checkout, huidige situatie",
          kind: "document",
          notes:
            "DEMO: dit is fictief reviewbewijs, geen uitgevoerde test. Voeg zelf een screenshot toe om annotaties te proberen.",
          revision: "demo-v1",
          criterion: "De betaalknop is zichtbaar op 375px breedte.",
        });
      } else if (index === 1) {
        t.stage = "planning";
        t.summary = "Eerst moet duidelijk worden wie recht heeft op korting.";
        addQuestion(t, {
          question:
            "Geldt de korting voor alle accounts met een bedrijfsnaam, of alleen voor goedgekeurde zakelijke accounts?",
          reason: "Dit bepaalt hoe we de prijs berekenen en misbruik voorkomen.",
          recipient: "client",
          blocks: "implementation",
          suggestion: "Alleen voor vooraf goedgekeurde zakelijke accounts.",
        });
      } else if (index === 2) {
        addPlan(t, {
          summary: "Voeg de verwachte leverdatum toe aan de bestelbevestiging.",
          steps: [
            "Onderzoek het ordermodel en de e-mailtemplate.",
            "Voeg de datum toe met een fallback voor onbekende datums.",
            "Controleer een voorbeeldmail.",
          ],
          criteria: [
            "Een beschikbare leverdatum staat in de bevestiging.",
            "Zonder leverdatum blijft de mail leesbaar.",
          ],
        });
      } else if (index === 3) {
        t.stage = "triage";
      }
      activity(t, "Fictieve voorbeeldtaak, geen klantdata of actieve Amp-uitvoering");
    });
  }
  return project;
}
