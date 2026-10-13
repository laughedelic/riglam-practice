// The tutor's kit (worker/kit.ts): what it makes from the data files, and that it gives away nothing it should not.
// Most tests use a few invented terms; the last block runs on the real files when the data key is there (CI has it).
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateKey, seal, split } from "../../src/data/course.js";
import { GUIDE } from "../../src/ai-shared";
import { createApp } from "../../worker/app";
import { kitFrom, loadKit, type Sources } from "../../worker/kit";
import { files, readKey, readOpen } from "../../scripts/lib/course-files.mjs";
import { NOW, ask, events, fakeAnthropic, setup } from "./support";

const FULL = {
  terms: {
    Form: { name: "Form", ch: "III", ru: "рупа", d: "SECRET-DEF that which is suitable as form.", d_ru: "SECRET-RU", note: "SECRET-NOTE see [[Terms/Form|the Form note]].", contra: ["Consciousness"], mi: ["Matter"] },
    Consciousness: { name: "Consciousness", ch: "II", d: "Clear and knowing.", aliases: ["Mind"], parent: "Functional thing" },
  },
  chains: { Form: ["Form", "Functional thing", "Existent"], Consciousness: ["Consciousness", "Functional thing", "Existent"] },
  cats: [
    { id: "form", kind: "dudra", term: "Form", labels: ["forms"], type: "form" },
    { id: "round", kind: "everyday", labels: ["round things"], type: "form" },
  ],
  items: [{ n: "a ball", t: "Form", c: ["form", "round"] }],
  bodySkip: [],
  notes: { form: ["A person is not form; the body is.", "Sound is form."], round: ["Sound is form.", "A ball is round."] },
};

async function sources(key: string, full: typeof FULL = FULL): Promise<Sources> {
  const parts = split(full);
  return { open: parts.open, definitions: await seal(key, "definitions", JSON.stringify(parts.definitions)), notes: await seal(key, "notes", JSON.stringify(parts.notes)) };
}

beforeEach(() => void vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

describe("kitFrom", () => {
  it("has the shared instructions and the two lookup tools in the form the model API takes", async () => {
    const key = generateKey();
    const ok = await kitFrom(key, await sources(key));
    expect(ok.guide).toBe(GUIDE);
    expect(ok.tools.map((t) => t.name)).toEqual(["lookup_term", "classify_example"]);
    for (const t of ok.tools) {
      expect(t.description.length).toBeGreaterThan(20);
      expect(t.input_schema.type).toBe("object");
      expect(t).not.toHaveProperty("inputSchema");
      expect(t).not.toHaveProperty("execute");
    }
  });

  it("looks a term up with the definition and the note that only the full data has", async () => {
    const key = generateKey();
    const kit = await kitFrom(key, await sources(key));
    const hit = kit.run("lookup_term", { name: "form" }) as Record<string, unknown>;
    expect(hit).toMatchObject({ found: true, term: "Form", definition: expect.stringContaining("SECRET-DEF"), definition_ru: "SECRET-RU", mutually_inclusive: ["Matter"], contradictory: ["Consciousness"] });
    expect(hit.kb_note).toBe("SECRET-NOTE see the Form note.");
    expect(kit.run("lookup_term", { name: "Mind" })).toMatchObject({ found: true, term: "Consciousness" });
    expect(kit.run("lookup_term", { name: "nothing like it" })).toEqual({ found: false, close: [] });
  });

  it("classifies an example from the practice list", async () => {
    const key = generateKey();
    const kit = await kitFrom(key, await sources(key));
    expect(kit.run("classify_example", { thing: "a ball" })).toMatchObject({ found: true, dudra_type: "Form", categories: ["forms", "round things"] });
    expect(kit.run("classify_example", { thing: "a unicorn" })).toEqual({ found: false });
  });

  it("throws for an unknown tool or an input the tool cannot use, so that the model sees an error result", async () => {
    const key = generateKey();
    const kit = await kitFrom(key, await sources(key));
    expect(() => kit.run("rm_rf", {})).toThrow("unknown tool: rm_rf");
    expect(() => kit.run("constructor", {})).toThrow("unknown tool");
    expect(() => kit.run("__proto__", {})).toThrow("unknown tool");
    expect(() => kit.run("lookup_term", {})).toThrow("empty name");
    expect(() => kit.run("lookup_term", null)).toThrow("empty name");
  });

  it("gives the notes of the pair's categories once each, in order", async () => {
    const key = generateKey();
    const kit = await kitFrom(key, await sources(key));
    expect(kit.finePoints(["form", "round"])).toEqual(["A person is not form; the body is.", "Sound is form.", "A ball is round."]);
    expect(kit.finePoints(["round"])).toEqual(["Sound is form.", "A ball is round."]);
    expect(kit.finePoints(["nothing", "form"])).toEqual(["A person is not form; the body is.", "Sound is form."]);
    expect(kit.finePoints([])).toEqual([]);
  });

  it("finds no note for a category id that is not the data's own", async () => {
    const key = generateKey();
    const kit = await kitFrom(key, await sources(key));
    for (const id of ["__proto__", "constructor", "toString", "hasOwnProperty", "length", ""]) expect(kit.finePoints([id])).toEqual([]);
  });

  it("works when the data has no notes at all", async () => {
    const key = generateKey();
    const bare: Partial<typeof FULL> = structuredClone(FULL);
    delete bare.notes;
    const kit = await kitFrom(key, await sources(key, bare as typeof FULL));
    expect(kit.finePoints(["form"])).toEqual([]);
    expect(kit.run("lookup_term", { name: "Form" })).toMatchObject({ found: true });
  });

  it("refuses data that another key sealed, and data in the wrong slot", async () => {
    const key = generateKey();
    const s = await sources(key);
    await expect(kitFrom(generateKey(), s)).rejects.toThrow("the key does not open this data");
    await expect(kitFrom(key, { ...s, definitions: s.notes, notes: s.definitions })).rejects.toThrow("the key does not open this data");
    await expect(kitFrom(key, { ...s, notes: new Uint8Array(40) })).rejects.toThrow("not a course data file");
  });

  it("takes the files as ArrayBuffers too, which is how the bundle hands them over", async () => {
    const key = generateKey();
    const s = await sources(key);
    const buf = (b: ArrayBuffer | Uint8Array) => (b instanceof Uint8Array ? b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) : b);
    const kit = await kitFrom(key, { ...s, definitions: buf(s.definitions) as ArrayBuffer, notes: buf(s.notes) as ArrayBuffer });
    expect(kit.run("lookup_term", { name: "Form" })).toMatchObject({ found: true });
  });
});

describe("loadKit", () => {
  const env = (key?: string) => ({ RIGLAM_DATA_KEY: key }) as never;

  it("is null without a data key, or with something that is not one", async () => {
    const key = generateKey();
    const s = await sources(key);
    expect(await loadKit(env(undefined), s)).toBeNull();
    expect(await loadKit(env(""), s)).toBeNull();
    expect(await loadKit(env("not a key"), s)).toBeNull();
  });

  it("makes the kit once per key and data, and again for another key", async () => {
    const key = generateKey();
    const s = await sources(key);
    const a = await loadKit(env(key), s);
    expect(a).not.toBeNull();
    expect(await loadKit(env(key), s)).toBe(a);
    const other = generateKey();
    const b = await loadKit(env(other), await sources(other));
    expect(b).not.toBeNull();
    expect(b).not.toBe(a);
  });

  it("is null, and says so without quoting any text, when the key does not open the data", async () => {
    const s = await sources(generateKey());
    const wrong = generateKey();
    expect(await loadKit(env(wrong), s)).toBeNull();
    const logged = vi.mocked(console.error).mock.calls.flat().join(" ");
    expect(logged).toContain("the key does not open this data");
    expect(logged).not.toContain(wrong);
    expect(logged).not.toContain("SECRET");
  });

  it("does not quote decrypted text when it is not JSON", async () => {
    const key = generateKey();
    const s: Sources = { open: split(FULL).open, definitions: await seal(key, "definitions", "SECRET-DEF {not json"), notes: await seal(key, "notes", "{}") };
    expect(await loadKit(env(key), s)).toBeNull();
    const logged = vi.mocked(console.error).mock.calls.flat().join(" ");
    expect(logged).toContain("the data is not JSON");
    expect(logged).not.toContain("SECRET");
  });
});

describe("the kit in the tutor route", () => {
  it("answers a lookup from the full data, adds the notes to the first turn, and sends neither to the page", async () => {
    const s = await setup();
    const data = await sources(s.key);
    const model = fakeAnthropic([
      { tool: { id: "t1", name: "lookup_term", input: { name: "Form" } }, text: ["Let me check. "] },
      { text: ["Form is ", "suitable as form."], usage: { input: 900, output: 30 } },
    ]);
    const app = createApp({ kit: (env) => loadKit(env, data), fetch: model.fetch, now: () => NOW, retries: 0 });
    const res = await app.request("/api/tutor", { method: "POST", headers: s.headers(), body: ask({ cats: ["form", "round"] }) }, s.env);
    expect(res.status).toBe(200);
    const shown = JSON.stringify(await events(res));
    expect(shown).toContain("suitable as form");
    // what the model got: the shared guide, the two tools, the notes after the card, and the definition as a tool result
    const [first, second] = model.calls.map((c) => c.body);
    expect(JSON.stringify(first.system)).toContain(GUIDE.slice(0, 80));
    expect(first.tools.map((t: { name: string }) => t.name)).toEqual(["lookup_term", "classify_example"]);
    expect(first.messages[0].content).toContain("- A person is not form; the body is.");
    expect(JSON.stringify(second.messages)).toContain("SECRET-DEF");
    // what the page got: only the answer
    expect(shown).not.toContain("SECRET");
    expect(shown).not.toContain("A person is not form");
  });
});

// The real files. They need the key, which CI and a checkout with .data-key have.
const key = readKey();
describe.skipIf(!key)("the real course data", () => {
  const real = (): Sources => ({ open: readOpen(), definitions: readFileSync(files.definitions), notes: readFileSync(files.notes) });

  it("makes a kit whose tools know the course", async () => {
    const kit = await kitFrom(key!, real());
    const open = readOpen();
    const name = Object.keys(open.terms)[0];
    const hit = kit.run("lookup_term", { name }) as { found: boolean; definition?: string; chain: string };
    expect(hit.found).toBe(true);
    expect(hit.definition?.length).toBeGreaterThan(10);
    expect(hit.definition).not.toMatch(/^Locked/);
    expect(hit.chain).toContain(name);
  });

  it("has notes for the categories that have them in the data, and only those", async () => {
    const kit = await kitFrom(key!, real());
    const open = readOpen();
    const cats: string[] = open.cats.map((c: { id: string }) => c.id);
    const withNotes = cats.filter((c) => kit.finePoints([c]).length);
    expect(withNotes.length).toBeGreaterThan(0);
    const all = kit.finePoints(cats);
    expect(new Set(all).size).toBe(all.length);
    expect(new Set(all)).toEqual(new Set(cats.flatMap((c) => kit.finePoints([c]))));
  });

  it("holds nothing in the open file that the kit adds", async () => {
    const open = readOpen();
    expect(open.notes).toBeUndefined();
    expect(Object.values(open.terms).some((t) => (t as { d?: string; note?: string }).d || (t as { note?: string }).note)).toBe(false);
  });
});
