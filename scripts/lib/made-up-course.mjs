// Made-up course data: definitions and notes for every term of the open data, with the same shape and about the same lengths as the
// real ones but invented words. CI and anyone without the real data (data-private/, docs/DATA.md) use it, so the real text never has to
// be in a secret, a log or a test report. It is a function of the open data alone: the same input gives the same output.

/** FNV-1a, 32 bits: a stable number for a string. */
function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** A small deterministic random source (mulberry32) seeded from a string. */
function source(seed) {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LATIN = { consonants: "bdfgklmnprstvz", vowels: "aeiou" };
const CYRILLIC = { consonants: "бвгдклмнпрстфх", vowels: "аеиоуя" };

function word(next, alphabet) {
  const syllables = 1 + Math.floor(next() * 3);
  let w = "";
  for (let i = 0; i < syllables; i++) w += alphabet.consonants[Math.floor(next() * alphabet.consonants.length)] + alphabet.vowels[Math.floor(next() * alphabet.vowels.length)];
  return w;
}

/** Invented prose of about `length` characters (never more, ends with a full stop), as one or more sentences. */
function prose(seed, length, alphabet) {
  const next = source(seed);
  let out = "";
  let start = true;
  let untilStop = 4 + Math.floor(next() * 8);
  for (;;) {
    let w = word(next, alphabet);
    if (start) w = w[0].toUpperCase() + w.slice(1);
    const stop = --untilStop === 0;
    const piece = (out ? " " : "") + w + (stop ? "." : "");
    if (out.length + piece.length + 1 > length) break;
    out += piece;
    start = stop;
    if (stop) untilStop = 4 + Math.floor(next() * 8);
  }
  if (!out) return "Ab.".slice(0, Math.max(length, 1));
  return /[.]$/.test(out) ? out : out + ".";
}

/** A length between `min` and `max`, mostly short (as the real definitions are), with now and then the shortest and the longest. */
function lengthFor(key, index, min, max) {
  if (index % 40 === 7) return max;
  if (index % 25 === 3) return min;
  const r = source("length:" + key)();
  return Math.round(min + (max - min) * r ** 3);
}

/**
 * Definitions and notes for the terms and categories of `open` (the open data, src/data/drill-data.json), in the shape
 * `readParts()` returns and `split()` produces: { definitions: { term: { d, d_ru? } }, notes: { terms: { term: string }, groups: { category: string[] } } }.
 */
export function madeUpCourse(open) {
  const definitions = {};
  const notes = { terms: {}, groups: {} };
  Object.keys(open.terms).forEach((key, i) => {
    definitions[key] = {
      d: i % 30 === 11 ? "(no definition in the booklet)" : prose("d:" + key, lengthFor("d:" + key, i, 24, 417), LATIN),
    };
    if (i % 7 !== 5) definitions[key].d_ru = prose("ru:" + key, lengthFor("ru:" + key, i, 20, 155), CYRILLIC);
    if (i % 4 === 1) notes.terms[key] = prose("n:" + key, 150 + Math.floor(source("nl:" + key)() * 400), LATIN);
  });
  (open.cats ?? []).forEach((cat, i) => {
    if (i % 3 === 0) notes.groups[cat.id] = [prose("g:" + cat.id, 120 + Math.floor(source("gl:" + cat.id)() * 290), LATIN)];
  });
  return { definitions, notes };
}

/** The sources of the made-up examples: three published works and one course booklet, whose id a device must never get. */
export const MADE_UP_SOURCES = { MA: { tier: "open" }, MB: { tier: "open" }, MC: { tier: "open" }, MX: { tier: "course" } };
const KINDS = ["thing", "thing", "thing", "representation", "relation", "negation"];
const CONFIRMATIONS = ["confirmed", "textbook", "commentator"];

/**
 * Reference examples in the format of the knowledge base's exporter (src/data/examples.js), with invented names: classes are terms of
 * `open`, picked at random, so they say nothing true. Every field of the format occurs, aliases in Chinese and Tibetan script and
 * places in a course booklet included, so that what the device part leaves out is tested too.
 */
export function madeUpExamples(open, count = 80) {
  const terms = Object.keys(open.terms);
  const pickTerm = (next) => terms[Math.floor(next() * terms.length)];
  const items = [];
  const seen = new Set();
  for (let i = 0; items.length < count; i++) {
    const next = source("ex:" + i);
    const n = `a ${word(next, LATIN)} ${word(next, LATIN)}${i % 9 === 4 ? " " + word(next, LATIN) : ""}`;
    if (seen.has(n)) continue;
    seen.add(n);
    const it = { n };
    if (i % 3 === 0) it.al = [`${word(next, LATIN)} ${word(next, LATIN)}`, word(next, CYRILLIC)];
    if (i % 11 === 2) (it.al ??= []).push(String.fromCharCode(0x4e00 + Math.floor(next() * 500)), String.fromCharCode(0x0f40 + Math.floor(next() * 30)));
    if (i % 17 === 8 && open.terms["Non-existent"]) {
      it.cls = ["Non-existent"];
      it.ne = true;
    } else {
      it.cls = [pickTerm(next)];
      if (i % 8 === 5) it.cls.push(pickTerm(next));
      it.cls = [...new Set(it.cls)];
    }
    if (i % 6 === 1) it.not = [pickTerm(next)];
    it.lv = 1 + Math.floor(next() * 4);
    it.sc = it.lv - 1;
    it.k = KINDS[Math.floor(next() * KINDS.length)];
    if (it.k === "relation" && i % 2 === 0 && items.length >= 2) {
      it.f = "combination";
      it.mem = [items[items.length - 1].n, items[items.length - 2].n];
    }
    it.cf = CONFIRMATIONS[Math.floor(next() * CONFIRMATIONS.length)];
    if (i % 5 === 2) {
      it.bg = "glossed";
      it.gloss = prose("gloss:" + i, 60 + Math.floor(next() * 100), LATIN);
      if (i % 10 === 2) it.cn = "medium";
    }
    if (i % 7 === 3 && items.length) it.base = items[0].n;
    if (i % 10 === 7) it.web = [`https://example.org/${word(next, LATIN)}`];
    const ids = Object.keys(MADE_UP_SOURCES);
    it.src = Array.from({ length: 1 + Math.floor(next() * 4) }, () => {
      const at = 1 + Math.floor(next() * 300);
      return [ids[Math.floor(next() * ids.length)], `${at}-${at + Math.floor(next() * 5)}`];
    });
    items.push(it);
  }
  items.sort((a, b) => a.n.localeCompare(b.n));
  return { format: "riglam-examples", version: 2, sources: MADE_UP_SOURCES, items };
}
