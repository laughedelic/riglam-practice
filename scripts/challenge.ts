// The challenge that everyone gets (docs/SERVER.md, "The challenge"): one JSON file, as src/domain/challenge.ts reads it. This checks a written one against
// the app's data, shows how each question will be asked and what answers it (the data, or the answer a question brings), and loads it into the course_data table, from where the Worker gives
// it to the devices that have the Magic Key. Loading another one replaces it; a challenge that changes its questions takes a new id.
//
//   npm run challenge -- check <challenge.json>                                 what is wrong with it, or how it will be asked
//   npm run challenge -- sql <challenge.json> [out.sql]                         the statements that load it, to a file or the standard output, for loading by other means
//   npm run challenge -- publish <challenge.json> [--config <file>] [--local]   load it with wrangler (production unless a config names another database; --local for `wrangler dev`)
//   npm run challenge -- sql --none [out.sql]                                   the statement that takes the current challenge away
//   npm run challenge -- publish --none [--config <file>] [--local]             take it away
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
/** The arguments that are neither a flag nor a flag's value: the challenge's file, then the file to write. */
const files = args.slice(1).filter((a, i, all) => !a.startsWith("--") && all[i - 1] !== "--config");

/** The report of the challenge in the file named on the command line, on the open data of this checkout. */
function reportOf() {
  const file = files[0];
  if (!file) throw new Error("name the challenge's file" + (cmd === "check" ? "" : ", or --none to take the current one away"));
  const read = (path: string): unknown => JSON.parse(readFileSync(resolve(root, path), "utf8"));
  return challengeReport(read("src/data/drill-data.json") as DrillData, read(file));
}
/** The statements for the command: the challenge of the file, checked, or the one that takes the current challenge away. */
function statements(): string[] {
  if (none) return ["DELETE FROM course_data WHERE kind = 'challenge';"];
  const report = reportOf();
  console.error(report.lines.join("\n"));
  if (!report.ok || !report.body) throw new Error("the challenge was not loaded");
  return rowStatements("challenge", report.body, new Date().toISOString());
}

try {
  if (cmd === "check") {
    const report = reportOf();
    console.log(report.lines.join("\n"));
    if (!report.ok) process.exitCode = 1;
  } else if (cmd === "sql") {
    const out = files[none ? 0 : 1], sql = statements().join("\n") + "\n";
    if (out) writeFileSync(resolve(root, out), sql); else process.stdout.write(sql);
  } else if (cmd === "publish") {
    const config = flag("--config") ?? "wrangler.jsonc";
    const sql = statements();
    mkdirSync(join(tmpdir(), "riglam"), { recursive: true });
    const file = join(tmpdir(), "riglam", `challenge-${process.pid}.sql`);
    writeFileSync(file, sql.join("\n") + "\n", { mode: 0o600 });
    const run = spawnSync("npx", ["wrangler", "d1", "execute", "DB", args.includes("--local") ? "--local" : "--remote", "--config", config, "--file", file], { cwd: root, stdio: "inherit" });
    if (run.status !== 0) throw new Error("wrangler did not load the challenge (are the migrations applied, and are you signed in to Cloudflare?)");
    console.error(none ? "The challenge was taken away." : "The challenge is loaded: devices get it the next time their roadmap opens.");
  } else {
    throw new Error("usage: npm run challenge -- check <challenge.json> | sql <challenge.json> [out.sql] | publish <challenge.json> [--config <file>] [--local]   (--none in place of the file takes the current challenge away)");
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
}
