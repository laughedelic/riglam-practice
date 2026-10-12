// Reads and writes the term data files for the Node side: the data script, the artifact build and the tests.
// The format itself is in src/data/course.js.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { open, seal, split, merge, parseKey } from "../../src/data/course.js";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const files = {
  open: resolve(root, "src/data/drill-data.json"),
  definitions: resolve(root, "src/data/course-definitions.enc"),
  notes: resolve(root, "src/data/course-notes.enc"),
  keyFile: resolve(root, ".data-key"),
};

/** The data key from RIGLAM_DATA_KEY or the git-ignored file .data-key; null when there is none. */
export function readKey() {
  const fromEnv = parseKey(process.env.RIGLAM_DATA_KEY);
  if (fromEnv) return fromEnv;
  if (process.env.RIGLAM_DATA_KEY) throw new Error("RIGLAM_DATA_KEY is set but is not a key (43 characters, base64url)");
  return existsSync(files.keyFile) ? parseKey(readFileSync(files.keyFile, "utf8")) : null;
}

export const requireKey = (what) => {
  const key = readKey();
  if (!key) throw new Error(`${what} needs the data key: set RIGLAM_DATA_KEY or put the key in .data-key (docs/DATA.md)`);
  return key;
};

export const readOpen = () => JSON.parse(readFileSync(files.open, "utf8"));

/** The full data (open data with definitions and notes put back) from the files in the repo. */
export async function readFull(key) {
  const definitions = JSON.parse(await open(key, "definitions", readFileSync(files.definitions)));
  const notes = JSON.parse(await open(key, "notes", readFileSync(files.notes)));
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

/** Writes an encrypted part unless the file already holds the same text (a new random IV would otherwise change the file for nothing). */
async function writePart(key, kind, path, value) {
  const plain = JSON.stringify(value);
  if (existsSync(path)) {
    try {
      if ((await open(key, kind, readFileSync(path))) === plain) return false;
    } catch { /* a different key or a damaged file: write it again */ }
  }
  writeFileSync(path, await seal(key, kind, plain));
  return true;
}

/** Splits the full data and writes the three files. Returns what changed. */
export async function writeFull(key, full) {
  const parts = split(full);
  const openText = formatOpen(parts.open);
  const changed = [];
  if (!existsSync(files.open) || readFileSync(files.open, "utf8") !== openText) (writeFileSync(files.open, openText), changed.push("drill-data.json"));
  if (await writePart(key, "definitions", files.definitions, parts.definitions)) changed.push("course-definitions.enc");
  if (await writePart(key, "notes", files.notes, parts.notes)) changed.push("course-notes.enc");
  return { changed, parts };
}
