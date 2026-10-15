// Reads and writes the term data files for the Node side: the data script, the artifact build and the tests.
// The open data is committed (src/data/drill-data.json). The course part (definitions and notes) is kept in the
// git-ignored folder data-private/ and on the server (docs/DATA.md). The format itself is in src/data/course.js.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { split, merge } from "../../src/data/course.js";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const files = {
  open: resolve(root, "src/data/drill-data.json"),
  privateDir: resolve(root, "data-private"),
  definitions: resolve(root, "data-private/definitions.json"),
  notes: resolve(root, "data-private/notes.json"),
};

export const readOpen = () => JSON.parse(readFileSync(files.open, "utf8"));

/** Whether this checkout has the course part (data-private/ is not in git; `npm run data:import` or `data:pull` makes it). */
export const hasCourse = () => existsSync(files.definitions) && existsSync(files.notes);

/** The two course parts as objects. */
export function readParts() {
  if (!hasCourse()) throw new Error("the course data is missing: data-private/ has no definitions.json and notes.json (docs/DATA.md)");
  return { definitions: JSON.parse(readFileSync(files.definitions, "utf8")), notes: JSON.parse(readFileSync(files.notes, "utf8")) };
}

/** The full data (open data with definitions and notes put back). */
export function readFull() {
  const { definitions, notes } = readParts();
  return merge(readOpen(), definitions, notes);
}

// One top-level key per line, and one term, item or category per line inside, so a change to the data shows up as a few lines in a diff.
export function formatOpen(open) {
  const lines = Object.entries(open).map(([k, v]) => {
    const inner = Array.isArray(v) && v.length && typeof v[0] === "object" ? v.map((x) => JSON.stringify(x)).join(",\n")
      : v && typeof v === "object" && !Array.isArray(v) && Object.values(v).some((x) => x && typeof x === "object")
        ? Object.entries(v).map(([ik, iv]) => `${JSON.stringify(ik)}:${JSON.stringify(iv)}`).join(",\n")
        : null;
    if (inner === null) return `${JSON.stringify(k)}:${JSON.stringify(v)}`;
    return Array.isArray(v) ? `${JSON.stringify(k)}:[\n${inner}\n]` : `${JSON.stringify(k)}:{\n${inner}\n}`;
  });
  return `{\n${lines.join(",\n")}\n}\n`;
}

function writeIfChanged(path, text) {
  if (existsSync(path) && readFileSync(path, "utf8") === text) return false;
  writeFileSync(path, text);
  return true;
}

/** Splits the full data and writes the open file and the two course files. Returns what changed. */
export function writeFull(full) {
  const parts = split(full);
  mkdirSync(files.privateDir, { recursive: true });
  const changed = [];
  if (writeIfChanged(files.open, formatOpen(parts.open))) changed.push("src/data/drill-data.json");
  if (writeIfChanged(files.definitions, JSON.stringify(parts.definitions))) changed.push("data-private/definitions.json");
  if (writeIfChanged(files.notes, JSON.stringify(parts.notes))) changed.push("data-private/notes.json");
  return { changed, parts };
}
