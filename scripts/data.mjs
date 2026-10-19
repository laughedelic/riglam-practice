#!/usr/bin/env node
// The term data tool (docs/DATA.md). The open data is in the repository; the course part (definitions and notes) is in the
// git-ignored folder data-private/ and on the server (the D1 table course_data).
//   key                       print a new Magic Key: four random words (does not touch any file)
//   import <full.json>        split the knowledge base export into src/data/drill-data.json (open) and data-private/
//   import-examples <examples.json>  check the knowledge base's reference examples against the open data and write them, and the part a device may fetch, into data-private/
//   export [out.json]         write the full data (definitions and notes put back) to a file, or to the standard output
//   check                     verify that the open file holds no definitions or notes and that data-private/ matches it (a definition for every term, none for a term that is not there; examples whose classes are terms, and a device part made from them)
//   publish [--config <file>] [--local]  load data-private/ into the course_data table with wrangler (production unless a config names another database; --local for `wrangler dev`); the examples too, when data-private/ has them
//   sql [out.sql]             write the statements publish runs to a file (or the standard output), for loading by other means
//   fixture [--replace]       write made-up definitions, notes and examples into data-private/ (CI and anyone without the real data use this); refuses to replace files that are there unless --replace
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { files, readExamples, readFull, readOpen, readParts, writeFull, writeIfChanged, hasAnyExamples, hasCourse, hasAnyCourse, hasExamples, root } from "./lib/course-files.mjs";
import { WORDS } from "./lib/wordlist.mjs";
import { madeUpCourse, madeUpExamples } from "./lib/made-up-course.mjs";
import { deviceExamples, examplesProblems } from "../src/data/examples.js";

const args = process.argv.slice(2);
const [cmd, arg] = args;
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

/** The number of words in a Magic Key: 4 words from a list of 7772 are about 52 bits. The server limits wrong guesses per caller and hour. */
const KEY_WORDS = 4;

/** `n` random words from the list, each equally likely (no modulo bias). */
function randomWords(n) {
  const limit = Math.floor(2 ** 32 / WORDS.length) * WORDS.length;
  const out = [];
  while (out.length < n) {
    const [x] = crypto.getRandomValues(new Uint32Array(1));
    if (x < limit) out.push(WORDS[x % WORDS.length]);
  }
  return out.join("-");
}

const q = (text) => `'${text.replaceAll("'", "''")}'`;

/** The statements that put the parts into the course_data table (the examples when there are any); a part that did not change keeps its version. */
function statements(now = new Date().toISOString()) {
  const { definitions, notes } = readParts();
  const examples = readExamples();
  const rows = [["definitions", definitions], ["notes", notes], ...(examples ? [["examples", examples.full], ["examples_device", examples.device]] : [])];
  return rows.map(([kind, value]) =>
    `INSERT INTO course_data (kind, body, updated_at) VALUES (${q(kind)}, ${q(JSON.stringify(value))}, ${q(now)}) ` +
    `ON CONFLICT (kind) DO UPDATE SET updated_at = CASE WHEN body = excluded.body THEN updated_at ELSE excluded.updated_at END, body = excluded.body;`);
}

/** The terms of the open data that have no entry in definitions.json: every term has a definition, so a gap means an incomplete import. */
function missingDefinitions(open, definitions) {
  const missing = Object.keys(open.terms).filter((k) => !definitions[k]);
  if (!missing.length) return;
  throw new Error(`${missing.length} of ${Object.keys(open.terms).length} terms of the open data have no definition in data-private/definitions.json (${missing.slice(0, 3).join(", ")}${missing.length > 3 ? ", ..." : ""}): the import was incomplete`);
}

/** The examples files against the open data: usable, and the device part made from the full one for this open data. Throws otherwise. */
function checkExamples(open) {
  if (!hasExamples()) throw new Error("data-private/ holds only one of examples.json and examples-device.json (an interrupted import, or a file that was deleted)");
  const { full, device } = readExamples();
  const problems = examplesProblems(full, open);
  if (problems.length) throw new Error(`data-private/examples.json does not fit the open data (${problems.length}):\n  ${problems.slice(0, 10).join("\n  ")}`);
  if (JSON.stringify(device) !== JSON.stringify(deviceExamples(full, open.built)))
    throw new Error("data-private/examples-device.json was not made from examples.json for this open data: npm run data:import-examples -- data-private/examples.json makes it again");
  return full.items.length;
}

/** Writes the two examples files when they changed. Returns the names of those that did. */
function writeExamples(full, open) {
  mkdirSync(files.privateDir, { recursive: true });
  const changed = [];
  if (writeIfChanged(files.examples, JSON.stringify(full))) changed.push("data-private/examples.json");
  if (writeIfChanged(files.examplesDevice, JSON.stringify(deviceExamples(full, open.built)))) changed.push("data-private/examples-device.json");
  return changed;
}

function main() {
  if (cmd === "key") {
    console.log(randomWords(KEY_WORDS));
  } else if (cmd === "import") {
    if (!arg) throw new Error("usage: npm run data:import -- <full.json>");
    const { changed } = writeFull(JSON.parse(readFileSync(arg, "utf8")));
    console.log(changed.length ? `written: ${changed.join(", ")}` : "nothing changed");
  } else if (cmd === "import-examples") {
    if (!arg) throw new Error("usage: npm run data:import-examples -- <examples.json>");
    const full = JSON.parse(readFileSync(arg, "utf8"));
    const open = readOpen();
    const problems = examplesProblems(full, open);
    if (problems.length) throw new Error(`the examples do not fit the open data (${problems.length}):\n  ${problems.slice(0, 10).join("\n  ")}`);
    const changed = writeExamples(full, open);
    console.log(changed.length ? `written: ${changed.join(", ")} (${full.items.length} examples)` : "nothing changed");
  } else if (cmd === "export") {
    const text = JSON.stringify(readFull());
    if (arg) (writeFileSync(arg, text), console.error(`written: ${arg} (${text.length} bytes)`));
    else process.stdout.write(text);
  } else if (cmd === "check") {
    const open = readOpen();
    const leaked = Object.values(open.terms).filter((t) => "d" in t || "d_ru" in t || "note" in t).length + ("notes" in open ? 1 : 0);
    if (leaked) throw new Error(`${files.open} holds definitions or notes in the clear`);
    const examples = hasAnyExamples() ? `, ${checkExamples(open)} examples` : "";
    if (hasAnyCourse() && !hasCourse()) throw new Error("data-private/ holds only one of definitions.json and notes.json (an interrupted import, or a file that was deleted)");
    if (!hasCourse()) {
      console.log(`ok: open file clean${examples} (no definitions or notes in data-private/, so the course part was not checked)`);
      return;
    }
    const { definitions, notes } = readParts();
    const stray = [...Object.keys(definitions), ...Object.keys(notes.terms ?? {})].filter((k) => !open.terms[k]);
    if (stray.length) throw new Error(`data-private/ has entries for terms that are not in the open data: ${stray.slice(0, 5).join(", ")}`);
    missingDefinitions(open, definitions);
    console.log(`ok: ${Object.keys(open.terms).length} terms, ${Object.keys(definitions).length} definitions${examples}, open file clean`);
  } else if (cmd === "sql") {
    const text = statements().join("\n") + "\n";
    if (arg) (writeFileSync(arg, text), console.error(`written: ${arg} (${text.length} bytes)`));
    else process.stdout.write(text);
  } else if (cmd === "publish") {
    const config = flag("--config") ?? "wrangler.jsonc";
    mkdirSync(join(tmpdir(), "riglam"), { recursive: true });
    missingDefinitions(readOpen(), readParts().definitions);
    if (hasAnyExamples()) checkExamples(readOpen());
    const sql = join(tmpdir(), "riglam", `course-${process.pid}.sql`);
    writeFileSync(sql, statements().join("\n") + "\n", { mode: 0o600 });
    const run = spawnSync("npx", ["wrangler", "d1", "execute", "DB", args.includes("--local") ? "--local" : "--remote", "--config", config, "--file", sql], { cwd: root, stdio: "inherit" });
    if (run.status !== 0) throw new Error("wrangler did not load the course data (are the migrations applied, and are you signed in to Cloudflare?)");
  } else if (cmd === "fixture") {
    if ((hasAnyCourse() || hasAnyExamples()) && !args.includes("--replace")) throw new Error("data-private/ already holds course data; npm run data:fixture -- --replace overwrites it with made-up text");
    const open = readOpen();
    const { definitions, notes } = madeUpCourse(open);
    const examples = madeUpExamples(open);
    mkdirSync(files.privateDir, { recursive: true });
    writeFileSync(files.definitions, JSON.stringify(definitions));
    writeFileSync(files.notes, JSON.stringify(notes));
    writeExamples(examples, open);
    console.log(`written: made-up definitions for ${Object.keys(definitions).length} terms, notes for ${Object.keys(notes.terms).length} terms and ${Object.keys(notes.groups).length} categories, and ${examples.items.length} examples, in data-private/`);
  } else {
    throw new Error("usage: node scripts/data.mjs key | import <full.json> | import-examples <examples.json> | export [out.json] | check | publish [--config <file>] [--local] | sql [out.sql] | fixture [--replace]");
  }
}

try {
  main();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
