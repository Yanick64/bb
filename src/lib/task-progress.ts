import { activeRun, currentPlan, nextAction, type Run, type Task } from "../../shared/domain";

export const runStatusLabels: Record<Run["status"], string> = {
  queued: "In wachtrij",
  running: "Bezig",
  succeeded: "Afgerond",
  failed: "Mislukt",
  interrupted: "Verbinding onderbroken",
};

export function runProgress(task: Task, run: Run) {
  const plan = task.plans.find((plan) => plan.version === run.planVersion);
  const hasAnswers = task.questions.some(
    (question) => question.answeredAt && question.answeredAt <= run.createdAt,
  );
  switch (run.mode) {
    case "triage":
      return {
        phase: hasAnswers ? "Onderzoek met je antwoorden" : "Onderzoek",
        label: hasAnswers ? "Amp onderzoekt je antwoorden" : "Amp onderzoekt de aanvraag",
        detail: hasAnswers
          ? "Amp neemt je antwoorden mee in het onderzoek en bepaalt het vervolg."
          : "Amp leest de broncontext en onderzoekt wat nodig is om de aanvraag op te pakken.",
        after: "Daarna beoordeel jij de bevindingen, eventuele vragen en een voorgesteld plan.",
      };
    case "plan":
      return {
        phase: plan ? `Plan v${plan.version} bijwerken` : "Plan opstellen",
        label: plan ? `Amp werkt plan v${plan.version} bij` : "Amp stelt een plan op",
        detail: "Amp verwerkt de context en je antwoorden in de aanpak en acceptatiecriteria.",
        after: "Daarna beoordeel jij het plan. Uitvoeren is een aparte stap na je goedkeuring.",
      };
    case "implement":
      return {
        phase: plan ? `Plan v${plan.version} uitvoeren` : "Goedgekeurd werk uitvoeren",
        label: plan ? `Amp voert plan v${plan.version} uit` : "Amp voert het goedgekeurde werk uit",
        detail: plan?.summary ?? "Amp voert de afgesproken stappen uit en verzamelt bewijs.",
        after: "Daarna controleer jij het resultaat en het bewijs in Review.",
      };
    case "revise":
      return {
        phase: "Reviewfeedback verwerken",
        label: "Amp verwerkt de reviewfeedback",
        detail: "Amp past het resultaat aan op basis van je opmerkingen en verzamelt nieuw bewijs.",
        after: "Daarna beoordeel jij het aangepaste resultaat opnieuw in Review.",
      };
    case "review":
      return {
        phase: "Technische controle",
        label: "Amp controleert het resultaat",
        detail: "Amp controleert het uitgevoerde werk en het bewijs tegen de acceptatiecriteria.",
        after: "Daarna beslis jij in Review of het resultaat kan worden opgeleverd.",
      };
    case "delivery":
      return {
        phase: "Opleverconcept schrijven",
        label: "Amp schrijft het opleverconcept",
        detail: "Amp maakt een klantgericht concept op basis van het beoordeelde resultaat.",
        after: "Daarna controleer en verstuur jij de tekst naar de klant.",
      };
  }
}

export function taskProgress(task: Task) {
  const next = nextAction(task);
  const run = activeRun(task);
  if (run && (run.status === "queued" || run.status === "running")) {
    const progress = runProgress(task, run);
    return {
      ...next,
      label:
        run.status === "queued" ? `In wachtrij: ${progress.phase.toLowerCase()}` : progress.label,
      detail:
        run.status === "queued"
          ? "De opdracht staat klaar en wacht op een vrije uitvoerder."
          : progress.detail,
      status: `${runStatusLabels[run.status]} · ${progress.phase}`,
      after: progress.after,
    };
  }
  const plan = currentPlan(task);
  return {
    ...next,
    detail:
      next.tab === "plan" && plan
        ? plan.approvedAt
          ? `Plan v${plan.version} is goedgekeurd. Start de uitvoering via het plan wanneer je klaar bent.`
          : `Plan v${plan.version} staat klaar voor jouw beoordeling. Na goedkeuring kun je de uitvoering starten.`
        : next.detail,
    status:
      next.owner === "none"
        ? "Afgerond"
        : next.owner === "client"
          ? "Wacht op de klant"
          : "Jij bent aan zet",
    after: "",
  };
}
