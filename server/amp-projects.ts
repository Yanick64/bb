import { z } from "zod";
import { AppError } from "./store";

const ampProject = z.object({
  id: z.string(),
  namespace: z.string(),
  name: z.string(),
  repositoryURL: z.string().default(""),
});
export type AmpProject = z.infer<typeof ampProject>;
export async function listAmpProjects(binary = Bun.env.AMP_BIN || "amp"): Promise<AmpProject[]> {
  let process: Bun.Subprocess<"ignore", "pipe", "pipe">;
  try {
    process = Bun.spawn([binary, "projects", "list", "--json"], {
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
    });
  } catch {
    throw new AppError("Amp CLI niet gevonden. Controleer AMP_BIN en meld de CLI aan.", 503);
  }
  const timer = setTimeout(() => process.kill(), 15000);
  try {
    const [output, , code] = await Promise.all([
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
      process.exited,
    ]);
    if (code !== 0)
      throw new AppError(
        "Amp-projecten niet bereikbaar. Controleer de CLI-login en probeer opnieuw.",
        502,
      );
    return z.array(ampProject).parse(JSON.parse(output));
  } finally {
    clearTimeout(timer);
  }
}
export async function validateAmpProject(reference: string) {
  if (!reference) return;
  const projects = await listAmpProjects();
  if (
    !projects.some(
      (p) =>
        p.id === reference ||
        `${p.namespace}/${p.name}` === reference.replace(/^@/, "") ||
        p.repositoryURL === reference,
    )
  )
    throw new AppError(
      `Amp-project "${reference}" is niet toegankelijk. Kies een beschikbaar project via Projectinstellingen.`,
      409,
    );
}
