// The reference examples (docs/DATA.md): the knowledge base's example notes, each with the classes it is an instance of and is
// not, a level from 1 to 4, its kind and how well the sources confirm it. They are course tier, like the definitions: kept on the
// server (the rows `examples` and `examples_device` of the D1 table course_data) and in the git-ignored folder data-private/, never
// in the repository. The knowledge base's exporter writes the full part; the device part, which a device with the Magic Key may
// fetch, is made from it here, so the two cannot drift apart.
// This module is the one implementation of the format. It is plain JavaScript with no dependencies, like course.js, so the
// scripts and the tests use it as they are; the types the page and the Worker read it with are in src/ai-shared/examples.ts.

export const FORMAT = "riglam-examples";
export const DEVICE_FORMAT = "riglam-examples-device";
export const VERSION = 2;

/** What only the server keeps: the places in the sources, the web links, the base of an example and the members of a combination. */
const SERVER_ONLY = ["src", "web", "base", "mem"];
/** The app reads English and Russian: aliases in Chinese or Tibetan script stay on the server (the whole Han script, the extensions and compatibility forms too). */
const OTHER_SCRIPTS = /[\p{Script=Han}\p{Script=Tibetan}]/u;

/** The form in which two names count as the same: lower case, single spaces, no leading article. */
export const sameName = (s) => String(s).trim().toLowerCase().replace(/\s+/g, " ").replace(/^(a|an|the) /, "");

/**
 * The device part of the full examples: each item without what only the server keeps and without aliases in other scripts, with
 * `s`, the ids of the sources it is in. The sources of the `course` tier, the booklets, are left out of `s` and of the table of
 * sources: their ids stay on the server. `built` is the stamp of the open data it was checked against (drill-data.json), so a device
 * can tell a part made for another release.
 */
export function deviceExamples(full, built) {
  const sources = full.sources ?? {};
  const published = Object.fromEntries(Object.entries(sources).filter(([, v]) => v?.tier !== "course"));
  const items = full.items.map((it) => {
    const d = Object.fromEntries(Object.entries(it).filter(([k]) => !SERVER_ONLY.includes(k)));
    if (d.al) {
      d.al = d.al.filter((a) => !OTHER_SCRIPTS.test(a));
      if (!d.al.length) delete d.al;
    }
    d.s = [...new Set((it.src ?? []).map(([id]) => id).filter((id) => Object.hasOwn(published, id)))].sort();
    return d;
  });
  return { format: DEVICE_FORMAT, version: VERSION, ...(built ? { built } : {}), sources: published, items };
}

const isText = (v) => typeof v === "string" && v.trim().length > 0;
const isTexts = (v) => Array.isArray(v) && v.every(isText);
/** The optional fields the page and the tutor read, by type (src/ai-shared/examples.ts reads the same ones: an item wrong in one of them is dropped there, so the import must refuse it here). */
const TEXT_FIELDS = ["k", "f", "cf", "cn", "bg", "gloss"];
const FLAG_FIELDS = ["ne", "inc"];

/**
 * What is wrong with the full examples against the open data, as sentences (none when it is usable): the format, the fields of each
 * item and their types, classes that are not terms of the open data, source ids missing from the table, and two items with the same name.
 */
export function examplesProblems(full, open) {
  if (!full || typeof full !== "object" || Array.isArray(full)) return ["the examples file is not a JSON object"];
  if (full.format !== FORMAT || full.version !== VERSION) return [`the examples file is not ${FORMAT} version ${VERSION} (format ${JSON.stringify(full.format)}, version ${JSON.stringify(full.version)})`];
  if (!Array.isArray(full.items) || !full.items.length) return ["the examples file has no items"];
  const sources = full.sources && typeof full.sources === "object" ? full.sources : {};
  const problems = [];
  const names = new Map();
  full.items.forEach((it, i) => {
    const what = isText(it?.n) ? JSON.stringify(it.n) : `item ${i}`;
    if (!isText(it?.n)) return void problems.push(`${what} has no name`);
    if (![1, 2, 3, 4].includes(it.lv)) problems.push(`${what} has the level ${JSON.stringify(it.lv)}, not 1 to 4`);
    for (const f of ["al", "cls", "not"]) if (it[f] !== undefined && !isTexts(it[f])) problems.push(`${what} has a ${f} that is not a list of names`);
    for (const f of ["cls", "not"]) for (const c of isTexts(it[f]) ? it[f] : []) if (!Object.hasOwn(open.terms, c)) problems.push(`${what} names ${JSON.stringify(c)} in ${f}, which is not a term of the open data`);
    for (const f of TEXT_FIELDS) if (it[f] !== undefined && typeof it[f] !== "string") problems.push(`${what} has a ${f} that is not text`);
    for (const f of FLAG_FIELDS) if (it[f] !== undefined && typeof it[f] !== "boolean") problems.push(`${what} has a ${f} that is not true or false`);
    if (it.sc !== undefined && typeof it.sc !== "number") problems.push(`${what} has an sc that is not a number`);
    if (!Array.isArray(it.src) || !it.src.length) problems.push(`${what} has no source`);
    else for (const s of it.src) if (!Array.isArray(s) || !isText(s[0]) || !Object.hasOwn(sources, s[0])) problems.push(`${what} names a source that is not in the table: ${JSON.stringify(s)}`);
    const key = sameName(it.n);
    if (names.has(key)) problems.push(`${what} has the same name as ${JSON.stringify(names.get(key))}`);
    else names.set(key, it.n);
  });
  return problems;
}
