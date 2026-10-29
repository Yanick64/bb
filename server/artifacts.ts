import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentReport } from "../shared/domain";
import { AppError, id } from "./store";

export function imageExtension(bytes: Uint8Array): "png" | "jpg" | "webp" {
  if (!bytes.length || bytes.length > 10 * 1024 * 1024)
    throw new AppError("Afbeelding moet kleiner dan 10 MB zijn");
  if (bytes.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10") return "png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "jpg";
  if (
    new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
  )
    return "webp";
  throw new AppError("Ongeldig afbeeldingsformaat. Gebruik PNG, JPEG of WebP.");
}
export async function saveImage(dataDir: string, bytes: Uint8Array) {
  const extension = imageExtension(bytes);
  const filename = `${id()}.${extension}`;
  mkdirSync(join(dataDir, "uploads"), { recursive: true, mode: 0o700 });
  await Bun.write(join(dataDir, "uploads", filename), bytes);
  return `/uploads/${filename}`;
}
export async function archiveAmpScreenshots(report: AgentReport, dataDir: string, binary: string) {
  for (const evidence of report.evidence ?? []) {
    if (evidence.kind !== "screenshot" || !evidence.url.startsWith("https://ampcode.com/"))
      continue;
    const folder = mkdtempSync(join(tmpdir(), "bb-attachment-"));
    try {
      const path = join(folder, "attachment");
      const process = Bun.spawn([binary, "files", "get", evidence.url, "--output", path], {
        stdin: "ignore",
        stdout: "ignore",
        stderr: "ignore",
      });
      const timeout = setTimeout(() => process.kill(), 30000);
      const exitCode = await process.exited;
      clearTimeout(timeout);
      if (exitCode !== 0) throw new Error("Amp-bijlage kon niet worden opgehaald");
      const file = Bun.file(path);
      if (file.size > 10 * 1024 * 1024) throw new Error("Amp-bijlage is groter dan 10 MB");
      evidence.url = await saveImage(dataDir, new Uint8Array(await file.arrayBuffer()));
    } catch {
      evidence.notes =
        `BB kon deze private bijlage niet lokaal opslaan. Open de Amp-thread of upload de afbeelding handmatig.\n${evidence.notes}`.slice(
          0,
          20000,
        );
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  }
  return report;
}
