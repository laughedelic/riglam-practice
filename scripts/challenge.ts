// The challenges that everyone gets (docs/SERVER.md, "The challenges"): JSON files, each with a challenge, a list of them or `{challenges: [...]}`, as
// src/domain/challenge.ts reads them. This checks written ones against the app's data, shows how each question will be asked and what answers it (the data,
// or the answer a question brings), and loads them into the course_data table, all in one row, from where the Worker gives them to the devices that have the
// Magic Key. Every load is the whole set: name every challenge that is to stay, old ones too; one left out is taken away. A challenge keeps its id, and one
// that changes its questions takes a new id (devices start it again).
//
//   npm run challenge -- check <file.json>...                                 what is wrong with them, or how they will be asked
//   npm run challenge -- sql <file.json>... [out.sql]                         the statements that load them, to a file or the standard output, for loading by other means
//   npm run challenge -- publish <file.json>... [--config <file>] [--local]   load them with wrangler (production unless a config names another database; --local for `wrangler dev`)
//   npm run challenge -- sql --none [out.sql]                                 the statement that takes all of them away
//   npm run challenge -- publish --none [--config <file>] [--local]           take them away
//
// (It is TypeScript because it reads the challenge with the app's own rules; `npm run challenge` bundles it first and runs the bundle: scripts/challenge.mjs.)
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { DrillData } from "../src/ai-shared";
import { challengeReport } from "./lib/challenge-report";
import { rowStatements } from "./lib/course-sql.mjs";

const root = process.cwd();
const args = process.argv.slice(2);
const [cmd] = args;
const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const none = args.includes("--none");
/** The arguments that are neither a flag nor a flag's value: the challenges' files, and the file to write (the one that ends in .sql). */
const given = args.slice(1).filter((a, i, all) => !a.startsWith("--") && all[i - 1] !== "--config");
const files = given.filter((a) => !a.endsWith(".sql")), out = given.find((a) => a.endsWith(".sql"));

/** The report of the challenges in the files named on the command line, together, on the open data of this checkout. */
function reportOf() {
  if (!files.length) throw new Error("name the challenges' files" + (cmd === "check" ? "" : ", or --none to take them all away"));
  const read = (path: string): unknown => JSON.parse(readFileSync(resolve(root, path), "utf8"));
  const all = files.flatMap((f) => { const r = read(f); return Array.isArray(r) ? r : r && typeof r === "object" && Array.isArray((r as { challenges?: unknown }).challenges) ? (r as { challenges: unknown[] }).challenges : [r]; });
  return challengeReport(read("src/data/drill-data.json") as DrillData, all);
}
/** The statements for the command: the challenges of the files, checked, or the one that takes them all away. */
function statements(): string[] {
  if (none) return ["DELETE FROM course_data WHERE kind = 'challenge';"];
  const report = reportOf();
  console.error(report.lines.join("\n"));
  if (!report.ok || !report.body) throw new Error("the challenges were not loaded");
  return rowStatements("challenge", report.body, new Date().toISOString());
}

try {
  if (cmd === "check") {
    const report = reportOf();
    console.log(report.lines.join("\n"));
    if (!report.ok) process.exitCode = 1;
  } else if (cmd === "sql") {
    const sql = statements().join("\n") + "\n";
    if (out) writeFileSync(resolve(root, out), sql); else process.stdout.write(sql);
  } else if (cmd === "publish") {
    const config = flag("--config") ?? "wrangler.jsonc";
    const sql = statements();
    mkdirSync(join(tmpdir(), "riglam"), { recursive: true });
    const file = join(tmpdir(), "riglam", `challenge-${process.pid}.sql`);
    writeFileSync(file, sql.join("\n") + "\n", { mode: 0o600 });
    const run = spawnSync("npx", ["wrangler", "d1", "execute", "DB", args.includes("--local") ? "--local" : "--remote", "--config", config, "--file", file], { cwd: root, stdio: "inherit" });
    if (run.status !== 0) throw new Error("wrangler did not load the challenges (are the migrations applied, and are you signed in to Cloudflare?)");
    console.error(none ? "The challenges were taken away." : "The challenges are loaded: devices get them the next time their roadmap opens.");
  } else {
    throw new Error("usage: npm run challenge -- check <file.json>... | sql <file.json>... [out.sql] | publish <file.json>... [--config <file>] [--local]   (--none in place of the files takes them all away)");
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
}
