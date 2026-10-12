// The format of the encrypted course data (src/data/course.js), with throwaway keys and made-up data.
import test from "node:test";
import assert from "node:assert/strict";
import { generateKey, parseKey, seal, open, split, merge, lock, LOCKED_TEXT } from "../../src/data/course.js";

const sample = () => ({
  built: "2026-01-01",
  terms: {
    Form: { name: "Form", wylie: "gzugs", d: "an invented definition for the first sample term", d_ru: "придуманное определение первого образца", ru: "образец", note: "A note.", parent: "Thing" },
    Thing: { name: "Thing", wylie: "dngos po", d: "(Sample) an invented definition for the second sample term", ru: "вещь" },
    Bare: { name: "Bare", wylie: "x" },
  },
  chains: { Form: ["Form", "Thing"] },
  notes: { extf: ["a group note"] },
});

test("a key is 43 characters of base64url, and a new one differs each time", () => {
  const a = generateKey();
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a, generateKey());
});

test("parseKey takes a bare key, a fragment or a whole link, and nothing else", () => {
  const k = generateKey();
  assert.equal(parseKey(k), k);
  assert.equal(parseKey(`  ${k}\n`), k);
  assert.equal(parseKey(`#k=${k}`), k);
  assert.equal(parseKey(`https://riglam.example/#k=${k}`), k);
  assert.equal(parseKey(`https://riglam.example/?a=1#x=2&k=${k}`), k);
  for (const bad of [null, undefined, "", "k=short", `${k}x`, `#k=${k}x`, "x".repeat(43) + "!", "not a key"]) assert.equal(parseKey(bad), null, String(bad));
});

test("text survives the round trip, including non-Latin characters, and the file is not readable", async () => {
  const key = generateKey();
  const text = JSON.stringify({ a: "придуманное определение", b: "色", c: "x".repeat(5000) });
  const bytes = await seal(key, "definitions", text);
  assert.equal(await open(key, "definitions", bytes), text);
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), "RGL1");
  assert.ok(!new TextDecoder("latin1").decode(bytes).includes("xxxxxxxxxx"), "the text does not appear in the clear");
});

test("sealing the same text twice gives different files (random IV)", async () => {
  const key = generateKey();
  const [a, b] = [await seal(key, "notes", "same"), await seal(key, "notes", "same")];
  assert.notDeepEqual(a, b);
});

test("a wrong key, the other kind, a changed byte or a truncated file are refused", async () => {
  const key = generateKey();
  const bytes = await seal(key, "definitions", "secret");
  await assert.rejects(open(generateKey(), "definitions", bytes), /does not open/);
  await assert.rejects(open(key, "notes", bytes), /does not open/);
  const changed = bytes.slice();
  changed[changed.length - 1] ^= 1;
  await assert.rejects(open(key, "definitions", changed), /does not open/);
  await assert.rejects(open(key, "definitions", bytes.slice(0, 20)), /not a course data file/);
  await assert.rejects(open(key, "definitions", new TextEncoder().encode("plain text, long enough to pass the length check")), /not a course data file/);
});

test("split takes definitions and notes out of the open data, and merge puts them back", () => {
  const full = sample();
  const { open: openPart, definitions, notes } = split(full);
  assert.deepEqual(Object.keys(openPart.terms.Form).sort(), ["name", "parent", "wylie"].concat("ru").sort());
  assert.ok(!("notes" in openPart));
  assert.deepEqual(definitions, { Form: { d: full.terms.Form.d, d_ru: full.terms.Form.d_ru }, Thing: { d: full.terms.Thing.d } });
  assert.deepEqual(notes, { terms: { Form: "A note." }, groups: { extf: ["a group note"] } });
  assert.deepEqual(merge(openPart, definitions, notes), sample());
  assert.equal(JSON.stringify(full), JSON.stringify(sample()), "split leaves its input alone");
});

test("without the notes the merged data has none; without definitions it has none", () => {
  const { open: openPart, definitions } = split(sample());
  const m = merge(openPart, definitions);
  assert.ok(!("notes" in m) && !("note" in m.terms.Form));
  assert.equal(m.terms.Thing.d, sample().terms.Thing.d);
  assert.ok(!("d" in merge(openPart, null).terms.Form));
});

test("lock replaces every definition with the notice and drops nothing else", () => {
  const { open: openPart } = split(sample());
  const locked = lock(openPart);
  for (const t of Object.values(locked.terms)) assert.equal(t.d, LOCKED_TEXT);
  assert.equal(locked.terms.Form.wylie, "gzugs");
  assert.ok(!("d" in openPart.terms.Form), "lock leaves its input alone");
});
