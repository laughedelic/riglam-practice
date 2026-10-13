// The format of the encrypted course data (src/data/course.js), with throwaway keys and made-up data.
import { expect, test } from "vitest";
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
  expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(a).not.toBe(generateKey());
});

test("parseKey takes a bare key, a fragment or a whole link, and nothing else", () => {
  const k = generateKey();
  expect(parseKey(k)).toBe(k);
  expect(parseKey(`  ${k}\n`)).toBe(k);
  expect(parseKey(`#k=${k}`)).toBe(k);
  expect(parseKey(`https://riglam.example/#k=${k}`)).toBe(k);
  expect(parseKey(`https://riglam.example/?a=1#x=2&k=${k}`)).toBe(k);
  for (const bad of [null, undefined, "", "k=short", `${k}x`, `#k=${k}x`, "x".repeat(43) + "!", "not a key"]) expect(parseKey(bad), String(bad)).toBeNull();
});

test("text survives the round trip, including non-Latin characters, and the file is not readable", async () => {
  const key = generateKey();
  const text = JSON.stringify({ a: "придуманное определение", b: "色", c: "x".repeat(5000) });
  const bytes = await seal(key, "definitions", text);
  expect(await open(key, "definitions", bytes)).toBe(text);
  expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("RGL1");
  expect(new TextDecoder("latin1").decode(bytes), "the text does not appear in the clear").not.toContain("xxxxxxxxxx");
});

test("sealing the same text twice gives different files (random IV)", async () => {
  const key = generateKey();
  const [a, b] = [await seal(key, "notes", "same"), await seal(key, "notes", "same")];
  expect(a).not.toEqual(b);
});

test("a wrong key, the other kind, a changed byte or a truncated file are refused", async () => {
  const key = generateKey();
  const bytes = await seal(key, "definitions", "secret");
  await expect(open(generateKey(), "definitions", bytes)).rejects.toThrow(/does not open/);
  await expect(open(key, "notes", bytes)).rejects.toThrow(/does not open/);
  const changed = bytes.slice();
  changed[changed.length - 1] ^= 1;
  await expect(open(key, "definitions", changed)).rejects.toThrow(/does not open/);
  await expect(open(key, "definitions", bytes.slice(0, 20))).rejects.toThrow(/not a course data file/);
  await expect(open(key, "definitions", new TextEncoder().encode("plain text, long enough to pass the length check"))).rejects.toThrow(/not a course data file/);
});

test("split takes definitions and notes out of the open data, and merge puts them back", () => {
  const full = sample();
  const { open: openPart, definitions, notes } = split(full);
  expect(Object.keys(openPart.terms.Form).sort()).toEqual(["name", "parent", "wylie"].concat("ru").sort());
  expect("notes" in openPart).toBe(false);
  expect(definitions).toEqual({ Form: { d: full.terms.Form.d, d_ru: full.terms.Form.d_ru }, Thing: { d: full.terms.Thing.d } });
  expect(notes).toEqual({ terms: { Form: "A note." }, groups: { extf: ["a group note"] } });
  expect(merge(openPart, definitions, notes)).toEqual(sample());
  expect(JSON.stringify(full), "split leaves its input alone").toBe(JSON.stringify(sample()));
});

test("without the notes the merged data has none; without definitions it has none", () => {
  const { open: openPart, definitions } = split(sample());
  const m = merge(openPart, definitions);
  expect("notes" in m || "note" in m.terms.Form).toBe(false);
  expect(m.terms.Thing.d).toBe(sample().terms.Thing.d);
  expect("d" in merge(openPart, null).terms.Form).toBe(false);
});

test("lock replaces every definition with the notice and drops nothing else", () => {
  const { open: openPart } = split(sample());
  const locked = lock(openPart);
  for (const t of Object.values<{ d: string }>(locked.terms)) expect(t.d).toBe(LOCKED_TEXT);
  expect(locked.terms.Form.wylie).toBe("gzugs");
  expect("d" in openPart.terms.Form, "lock leaves its input alone").toBe(false);
});
