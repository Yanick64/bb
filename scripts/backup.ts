import { Database } from "bun:sqlite";
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(Bun.env.BB_DATA_DIR ?? "./data");
const source = join(root, "bb.sqlite");
if (!existsSync(source)) throw new Error("No BB database found. Start BB first.");
const target = join(root, "backups", new Date().toISOString().replaceAll(":", "-"));
mkdirSync(target, { recursive: true, mode: 0o700 });
const database = new Database(source);
try {
  database.exec("PRAGMA busy_timeout=10000");
  database.query("VACUUM INTO ?").run(join(target, "bb.sqlite"));
} finally {
  database.close();
}
// Screenshots are immutable. Copying after the consistent DB snapshot includes
// every image referenced by that snapshot, even while new uploads arrive.
if (existsSync(join(root, "uploads")))
  cpSync(join(root, "uploads"), join(target, "uploads"), { recursive: true });
console.log(`Database and screenshots backed up to ${target}`);
