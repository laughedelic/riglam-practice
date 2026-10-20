// The tutor's kit (worker/kit.ts): what it makes from the open data and the course rows of the database, and that it gives away
// nothing it should not. Most tests use a few invented terms; the last block runs on the real course data when it is at hand
// (data-private/, docs/DATA.md).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { split } from "../../src/data/course.js";
import { GUIDE } from "../../src/ai-shared";
import { createApp } from "../../worker/app";
import { kitFrom, loadKit, resetKit } from "../../worker/kit";
import { hasCourse, readOpen, readParts } from "../../scripts/lib/course-files.mjs";
import { NOW, ask, events, fakeAnthropic, fakeD1, seedCourse, setup } from "./support";

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

/** Invented reference examples, as the row `examples` holds them. */
const EXAMPLES = JSON.stringify({ format: "riglam-examples", version: 2, sources: { MA: { tier: "open" } }, items: [{ n: "a vemo", cls: ["Consciousness"], lv: 2, cf: "confirmed", src: [["MA", "1"]] }] });

/** The open data and the course rows (JSON text) that `full` splits into. */
function parts(full: typeof FULL = FULL) {
  const p = split(full);
  return { open: p.open, rows: { definitions: JSON.stringify(p.definitions), notes: JSON.stringify(p.notes) } };
}

beforeEach(() => {
  resetKit();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("kitFrom", () => {
  it("has the shared instructions and the two lookup tools in the form the model API takes", async () => {
    const { open, rows } = parts();
    const ok = await kitFrom(open, rows);
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
    const { open, rows } = parts();
    const kit = await kitFrom(open, rows);
    const hit = kit.run("lookup_term", { name: "form" }) as Record<string, unknown>;
    expect(hit).toMatchObject({ found: true, term: "Form", definition: expect.stringContaining("SECRET-DEF"), definition_ru: "SECRET-RU", mutually_inclusive: ["Matter"], contradictory: ["Consciousness"] });
    expect(hit.kb_note).toBe("SECRET-NOTE see the Form note.");
    expect(kit.run("lookup_term", { name: "Mind" })).toMatchObject({ found: true, term: "Consciousness" });
    expect(kit.run("lookup_term", { name: "nothing like it" })).toEqual({ found: false, close: [] });
  });

  it("classifies an example from the practice list", async () => {
    const { open, rows } = parts();
    const kit = await kitFrom(open, rows);
    expect(kit.run("classify_example", { thing: "a ball" })).toMatchObject({ found: true, dudra_type: "Form", categories: ["forms", "round things"] });
    expect(kit.run("classify_example", { thing: "a unicorn" })).toEqual({ found: false });
  });

  it("classifies an example the practice list lacks from the reference examples, and works on without them when the row is not JSON", async () => {
    const { open, rows } = parts();
    const kit = await kitFrom(open, { ...rows, examples: EXAMPLES });
    expect(kit.run("classify_example", { thing: "a ball" })).toMatchObject({ found: true, dudra_type: "Form" });
    expect(kit.run("classify_example", { thing: "a vemo" })).toMatchObject({ found: true, source: "reference", item: "a vemo", classes: ["Consciousness"], level: 2 });
    expect(kit.tools.find((t) => t.name === "classify_example")!.description).toMatch(/reference examples/);
    expect(kit.run("examples_of", { term: "Consciousness", level: 2 })).toMatchObject({ found: true, term: "Consciousness", examples: [{ item: "a vemo", level: 2, of: "Consciousness" }] });
    const without = await kitFrom(open, { ...rows, examples: "SECRET-EX {not json" });
    expect(without.tools.map((t) => t.name)).not.toContain("examples_of");
    expect(() => without.run("examples_of", { term: "Consciousness" })).toThrow("unknown tool");
    expect(without.run("classify_example", { thing: "a vemo" })).toEqual({ found: false });
    expect(vi.mocked(console.error).mock.calls.flat().join(" ")).not.toContain("SECRET");
  });

  it("throws for an unknown tool or an input the tool cannot use, so that the model sees an error result", async () => {
    const { open, rows } = parts();
    const kit = await kitFrom(open, rows);
    expect(() => kit.run("rm_rf", {})).toThrow("unknown tool: rm_rf");
    expect(() => kit.run("constructor", {})).toThrow("unknown tool");
    expect(() => kit.run("__proto__", {})).toThrow("unknown tool");
    expect(() => kit.run("lookup_term", {})).toThrow("empty name");
    expect(() => kit.run("lookup_term", null)).toThrow("empty name");
  });

  it("gives the notes of the pair's categories once each, in order", async () => {
    const { open, rows } = parts();
    const kit = await kitFrom(open, rows);
    expect(kit.finePoints(["form", "round"])).toEqual(["A person is not form; the body is.", "Sound is form.", "A ball is round."]);
    expect(kit.finePoints(["round"])).toEqual(["Sound is form.", "A ball is round."]);
    expect(kit.finePoints(["nothing", "form"])).toEqual(["A person is not form; the body is.", "Sound is form."]);
    expect(kit.finePoints([])).toEqual([]);
  });

  it("finds no note for a category id that is not the data's own", async () => {
    const { open, rows } = parts();
    const kit = await kitFrom(open, rows);
    for (const id of ["__proto__", "constructor", "toString", "hasOwnProperty", "length", ""]) expect(kit.finePoints([id])).toEqual([]);
  });

  it("works when the data has no notes at all", async () => {
    const bare: Partial<typeof FULL> = structuredClone(FULL);
    delete bare.notes;
    const { open, rows } = parts(bare as typeof FULL);
    const kit = await kitFrom(open, rows);
    expect(kit.finePoints(["form"])).toEqual([]);
    expect(kit.run("lookup_term", { name: "Form" })).toMatchObject({ found: true });
  });

  it("refuses a row that is not JSON", async () => {
    const { open, rows } = parts();
    await expect(kitFrom(open, { ...rows, definitions: "{not json" })).rejects.toThrow(SyntaxError);
  });
});

describe("loadKit", () => {
  const withRows = async (rows?: { definitions: string; notes: string }, at?: string) => {
    const db = fakeD1();
    if (rows) await seedCourse(db.d1, rows, at);
    return { db, env: { DB: db.d1 } as never };
  };

  it("is null without a database, or while the database has no course data", async () => {
    const { open } = parts();
    expect(await loadKit({} as never, open)).toBeNull();
    expect(await loadKit((await withRows()).env, open)).toBeNull();
  });

  it("makes the kit from the rows, once, and keeps it for a minute", async () => {
    const { open, rows } = parts();
    const { env } = await withRows(rows);
    let t = 1_000;
    const a = await loadKit(env, open, () => t);
    expect(a).not.toBeNull();
    t += 59_000;
    expect(await loadKit(env, open, () => t)).toBe(a);
  });

  it("looks again after a minute and takes new course data without a deployment", async () => {
    const { open, rows } = parts();
    const { db, env } = await withRows(rows, "2026-10-13T09:00:00.000Z");
    let t = 1_000;
    const a = await loadKit(env, open, () => t);
    t += 61_000;
    expect(await loadKit(env, open, () => t), "same version, same kit").toBe(a);
    const changed = parts({ ...FULL, terms: { ...FULL.terms, Form: { ...FULL.terms.Form, d: "NEW-DEF" } } });
    await seedCourse(db.d1, changed.rows, "2026-10-14T09:00:00.000Z");
    t += 61_000;
    const b = await loadKit(env, open, () => t);
    expect(b).not.toBe(a);
    expect(b!.run("lookup_term", { name: "Form" })).toMatchObject({ definition: "NEW-DEF" });
  });

  it("takes a change of the notes alone, which leaves the definitions' version as it was", async () => {
    const { open, rows } = parts();
    const { db, env } = await withRows(rows, "2026-10-13T09:00:00.000Z");
    let t = 1_000;
    const a = await loadKit(env, open, () => t);
    expect(a!.finePoints(["form"]).join(" ")).toContain("A person is not form");
    const changed = parts({ ...FULL, notes: { ...FULL.notes, form: ["NEW-NOTE."] } });
    // as `npm run data:publish` does when only the notes changed: the definitions row keeps its time
    await db.d1.prepare("UPDATE course_data SET body = ?1, updated_at = ?2 WHERE kind = 'notes'").bind(changed.rows.notes, "2026-10-14T09:00:00.000Z").run();
    t += 61_000;
    const b = await loadKit(env, open, () => t);
    expect(b).not.toBe(a);
    expect(b!.finePoints(["form"]).join(" ")).toContain("NEW-NOTE");
  });

  it("takes new reference examples without a deployment, and works without that row", async () => {
    const { open, rows } = parts();
    const { db, env } = await withRows(rows, "2026-10-13T09:00:00.000Z");
    let t = 1_000;
    const a = await loadKit(env, open, () => t);
    expect(a!.run("classify_example", { thing: "a vemo" })).toEqual({ found: false });
    await db.d1.prepare("INSERT INTO course_data (kind, body, updated_at) VALUES ('examples', ?1, ?2)").bind(EXAMPLES, "2026-10-14T09:00:00.000Z").run();
    t += 61_000;
    const b = await loadKit(env, open, () => t);
    expect(b).not.toBe(a);
    expect(b!.run("classify_example", { thing: "a vemo" })).toMatchObject({ found: true, source: "reference" });
  });

  it("is null, and says so without quoting any text, when a row is not JSON", async () => {
    const { open, rows } = parts();
    const { env } = await withRows({ ...rows, definitions: "SECRET-DEF {not json" });
    expect(await loadKit(env, open)).toBeNull();
    const logged = vi.mocked(console.error).mock.calls.flat().join(" ");
    expect(logged).toContain("the course data is not JSON");
    expect(logged).not.toContain("SECRET");
  });
});

describe("the kit in the tutor route", () => {
  it("answers a lookup from the full data, adds the notes to the first turn, and sends neither to the page", async () => {
    const s = await setup();
    const { open, rows } = parts();
    await seedCourse(s.env.DB!, rows);
    const model = fakeAnthropic([
      { tool: { id: "t1", name: "lookup_term", input: { name: "Form" } }, text: ["Let me check. "] },
      { text: ["Form is ", "suitable as form."], usage: { input: 900, output: 30 } },
    ]);
    const app = createApp({ kit: (env) => loadKit(env, open), fetch: model.fetch, now: () => NOW, retries: 0 });
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

// The real course data (data-private/), when it is at hand.
describe.skipIf(!hasCourse())("the real course data", () => {
  const real = () => {
    const { definitions, notes } = readParts();
    return { open: readOpen(), rows: { definitions: JSON.stringify(definitions), notes: JSON.stringify(notes) } };
  };

  it("makes a kit whose tools know the course", async () => {
    const { open, rows } = real();
    const kit = await kitFrom(open, rows);
    const name = Object.keys(open.terms)[0];
    const hit = kit.run("lookup_term", { name }) as { found: boolean; definition?: string; chain: string };
    expect(hit.found).toBe(true);
    expect(hit.definition?.length).toBeGreaterThan(10);
    expect(hit.definition).not.toMatch(/^Locked/);
    expect(hit.chain).toContain(name);
  });

  it("has notes for the categories that have them in the data, and only those", async () => {
    const { open, rows } = real();
    const kit = await kitFrom(open, rows);
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
