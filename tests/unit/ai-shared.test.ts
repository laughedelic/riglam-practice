// src/ai-shared: the tutor's card, instructions and lookup tools as functions of the term data. Made-up data, plus
// checks of the real open data and of the rule that the code stays free of the page and the browser.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { expect, test } from "vitest";
import {
  CELL_NAME, DEBATE_ASK, FIRST_ASK, GUIDE, american, cardBody, cardNotes, catByLabel, classNames, catFacts, explainAsk, finePoints, makeIndex, matchItem, norm, pairCats, qPlain, termFacts, tutorCard, tutorTools, upChain,
} from "../../src/ai-shared";
import type { AnswerView, DrillData, PairLike } from "../../src/ai-shared";
import { state } from "../../src/app/state.js";
import openData from "../../src/data/drill-data.json";

const data = (): DrillData => ({
  terms: {
    Form: { name: "Form", ch: "III", wylie: "gzugs", ru: "рупа", d: "(Made up) the first term", d_ru: "(выдумано) первый термин", mi: ["Matter"], contra: ["Mind"], note: "See [[Matter|matter]] and [[Mind]]." },
    Matter: { name: "Matter", ch: "III", aliases: ["Stuff"], overlaps: ["Mind"], included_in: ["Form"] },
    Mind: { name: "Mind", ch: "V", ru: "ум" },
    Color: { name: "Color", ch: "III", aliases: ["Hue term"] },
    "Odor source": { name: "Odor source", ch: "III" },
  },
  chains: { Form: ["Form", "Thing"], Mind: ["Mind", "Thing"] },
  cats: [
    { id: "form", kind: "dudra", term: "Form", labels: ["forms", "bodies of matter"], type: "form" },
    { id: "mind", kind: "dudra", term: "Mind", labels: ["minds"], type: "mind" },
    { id: "wood", kind: "everyday", labels: ["wooden things"], type: "form: things made of wood" },
    { id: "col", kind: "dudra", term: "Color", labels: ["colors", "hues"], type: "color (visible form)" },
    { id: "odr", kind: "dudra", term: "Odor source", labels: ["smells", "odors"], type: "odor (form)" },
  ],
  items: [
    { n: "a wooden chair", t: "Form", c: ["form", "wood"] },
    { n: "your neighbor", t: "Person", c: [] },
    { n: "the aging of a body", t: "Non-associated compositional factor", c: [] },
    { n: "a gray stone", t: "Form", c: ["form"] },
    { n: "the horn of a rabbit", t: "Non-existent", c: [], ne: true },
  ],
  bodySkip: [],
  aliases: { chair: "a wooden chair", "wooden chair": "your neighbor" },
  notes: { form: ["A fine point about forms."], wood: ["Another fine point."] },
});
const ix = makeIndex(data());

const pair = (extra: Partial<PairLike> = {}): PairLike => ({
  a: "forms", b: "minds", catA: "form", catB: "mind", typeA: "form", typeB: "mind", relation: "con",
  ex: { both: null, anb: "a wooden chair", bna: "the horn of a rabbit", nei: null }, why: { both: "Nothing is both." }, note: "No common locus.", ...extra,
});
const noRes = (v: [string, string, string, string]) => ({ cells: { both: { v: v[0] }, anb: { v: v[1] }, bna: { v: v[2] }, nei: { v: v[3] } } });
const practice = (extra: Partial<AnswerView> = {}): AnswerView => ({
  rel: "con", cells: { both: { t: "", none: true }, anb: { t: "Wooden Chair!" }, bna: { t: "a dragon" }, nei: { t: " " } }, res: noRes(["ok", "ok", "cmp", "bad"]), ...extra,
});
const debate = (extra: Partial<AnswerView> = {}): AnswerView => ({
  debate: true, rel: "con", cells: { both: { t: "", none: true }, anb: { t: "a wooden chair" }, bna: { t: "" }, nei: { t: "", none: true } },
  ans: [{ say: "accept" }, { say: "why", text: "a wooden chair" }, { say: "why", text: "" }, { say: "accept", timeout: true }],
  res: { implied: "3ab", ...noRes(["ok", "bad", "cmp", "ok"]) }, ...extra,
});

test("the index finds items with or without an article, in the plural, and never lets an alias shadow an item", () => {
  expect(matchItem(ix, "A Wooden Chair!")?.n).toBe("a wooden chair");
  expect(matchItem(ix, "wooden chair")?.n).toBe("a wooden chair"); // the item's own name, not the alias of that name
  expect(matchItem(ix, "your neighbor")?.n).toBe("your neighbor");
  expect(matchItem(ix, "neighbor")?.n).toBe("your neighbor");
  expect(matchItem(ix, "")).toBeNull();
  expect(matchItem(ix, null)).toBeNull();
  expect(matchItem(ix, "a table")).toBeNull();
});

test("the British spellings of the words the data has find the American item, label and term", () => {
  expect(american("colours, odour, neighbour, ageing, grey, greys, greyish")).toBe("colors, odor, neighbor, aging, gray, grays, grayish");
  expect(american("greyhound")).toBe("greyhound");
  expect(matchItem(ix, "Your Neighbour!")?.n).toBe("your neighbor");
  expect(matchItem(ix, "neighbour")?.n).toBe("your neighbor");
  expect(matchItem(ix, "the ageing of a body")?.n).toBe("the aging of a body");
  expect(matchItem(ix, "a grey stone", true)?.n).toBe("a gray stone");
  expect(catByLabel(ix, "colours")).toBe("col");
  expect(catByLabel(ix, "Colour")).toBe("col");
  expect(catByLabel(ix, "odours")).toBe("odr");
  expect(pairCats(ix, { a: "colours", b: "odours", relation: "con" })).toEqual(["col", "odr"]);
  const term = (name: string) => tutorTools(ix)[0].execute({ name }) as Record<string, unknown>;
  expect(term("Colour")).toMatchObject({ found: true, term: "Color" });
  expect(term("odour source")).toMatchObject({ found: true, term: "Odor source" });
});

test("an alias names an item only when aliases are allowed", () => {
  expect(matchItem(ix, "chair")?.n).toBe("a wooden chair");
  expect(matchItem(ix, "chairs")?.n).toBe("a wooden chair");
  expect(matchItem(ix, "chair", true)).toBeNull();
});

test("words that are names of Object methods find nothing", () => {
  for (const w of ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"]) {
    expect(matchItem(ix, w), w).toBeNull();
    expect(catByLabel(ix, w), w).toBeNull();
    expect(ix.CAT[w], w).toBeUndefined();
  }
});

test("category labels are found in the singular and plural, and a pair resolves its categories", () => {
  expect(catByLabel(ix, "Forms")).toBe("form");
  expect(catByLabel(ix, "form")).toBe("form");
  expect(catByLabel(ix, "wooden thing")).toBe("wood");
  expect(catByLabel(ix, "bodies of matter")).toBe("form");
  expect(catByLabel(ix, "nothing")).toBeNull();
  expect(pairCats(ix, pair())).toEqual(["form", "mind"]);
  expect(pairCats(ix, { a: "forms", b: "wooden things", relation: "4" })).toEqual(["form", "wood"]);
  expect(pairCats(ix, { a: "forms", b: "bodies of matter", relation: "mi" })).toEqual([null, null]); // the same category twice
  expect(pairCats(ix, { a: "forms", b: "unknown", relation: "4" })).toEqual([null, null]);
});

test("the page's state has the fields of the index, so it can be passed as one", () => {
  expect(Object.keys(state)).toEqual(expect.arrayContaining(Object.keys(ix)));
});

test("norm drops quotes and punctuation, case and extra spaces", () => {
  expect(norm("  “The  Horn,  of a Rabbit.” ")).toBe("the horn of a rabbit");
  expect(norm(undefined)).toBe("");
});

test("term facts keep what the data states and clean the wiki links of the note", () => {
  expect(termFacts(ix, "Form")).toEqual({
    term: "Form", definition: "(Made up) the first term", chapter: "III", chain: "Form > Thing", definition_ru: "(выдумано) первый термин",
    mutually_inclusive: ["Matter"], contradictory: ["Mind"], kb_note: "See matter and Mind.", wylie: "gzugs",
  });
  expect(termFacts(ix, "Matter")).toMatchObject({ three_possibilities_included_in: ["Form"], four_possibilities_with: ["Mind"], chain: "" });
  expect(termFacts(ix, "Nope")).toBeNull();
});

test("category facts: a Dudra category carries its term's facts, an everyday one only its mapping", () => {
  expect(catFacts(ix, "form", "forms")).toMatchObject({ label: "forms", type: "form", term: "Form", wylie: "gzugs" });
  expect(catFacts(ix, "wood", "wooden things")).toEqual({ label: "wooden things", everyday_category: true, maps_to: "form: things made of wood" });
  expect(catFacts(ix, "nope", "x")).toBeNull();
});

test("the practice card names the cells, what the learner wrote, the reference and the page's verdict", () => {
  const card = tutorCard(ix, pair(), practice());
  expect(card.startsWith(GUIDE)).toBe(true);
  expect(card).toContain('"A":{"label":"forms","type":"form","term":"Form"');
  expect(card).toContain("Correct relation: Mutually exclusive. Learner chose: Mutually exclusive.");
  expect(card).toContain("Reference note: No common locus.");
  expect(card).toContain("- both: learner wrote NONE; reference EMPTY (Nothing is both.); page verdict ok");
  expect(card).toContain('- forms, not minds: learner wrote "Wooden Chair!" [in the practice list as: a wooden chair, type Form]; reference "a wooden chair"; page verdict ok');
  expect(card).toContain('- minds, not forms: learner wrote "a dragon"; reference "the horn of a rabbit"; page verdict cmp');
  expect(card).toContain("- neither: learner wrote (blank); reference \"the horn of a rabbit\"; page verdict bad"); // the neither cell always has a reference
  expect(card).toContain("Fine points (from the sources; apply them):\n- A fine point about forms.");
  expect(card).not.toContain("Another fine point."); // only the notes of the two categories of the pair
});

test("the card is the instructions, the body and the fine points, which a server can take apart", () => {
  for (const u of [practice(), debate()]) {
    for (const p of [pair(), pair({ catA: "form", catB: "wood", b: "wooden things" }), pair({ a: "unknown a", b: "unknown b", catA: null, catB: null })]) {
      expect(tutorCard(ix, p, u)).toBe(GUIDE + "\n\n" + cardBody(ix, p, u) + cardNotes(ix, p));
    }
  }
  const body = cardBody(ix, pair(), practice());
  expect(body.startsWith("CARD (from the course booklet's term data;")).toBe(true);
  expect(body).toContain("page verdict cmp");
  expect(body).not.toContain("Fine points");
  expect(body).not.toContain(GUIDE.slice(0, 60));
  expect(cardNotes(ix, pair())).toBe("\nFine points (from the sources; apply them):\n- A fine point about forms.");
  expect(cardNotes(ix, pair({ catA: "form", catB: "wood", b: "wooden things" }))).toBe("\nFine points (from the sources; apply them):\n- A fine point about forms.\n- Another fine point.");
  expect(cardNotes(ix, pair({ a: "unknown a", b: "unknown b", catA: null, catB: null }))).toBe("");
});

test("the fine points of categories are the notes of each, in order, without repeats; unknown ids add nothing", () => {
  expect(finePoints(ix, ["form", "wood"])).toEqual(["A fine point about forms.", "Another fine point."]);
  expect(finePoints(ix, ["wood", "form", "wood"])).toEqual(["Another fine point.", "A fine point about forms."]);
  expect(finePoints(ix, ["mind", null, undefined, "nope"])).toEqual([]);
  expect(finePoints(makeIndex({ ...data(), notes: { a: ["Same."], b: ["Same.", "Other."] } }), ["a", "b"])).toEqual(["Same.", "Other."]);
  expect(finePoints(makeIndex({ ...data(), notes: undefined }), ["form"])).toEqual([]); // the open data has no notes
  // ids that come from a request: only the data's own keys, and only lists
  expect(finePoints(ix, ["__proto__", "constructor", "toString", "hasOwnProperty"])).toEqual([]);
  expect(finePoints(makeIndex({ ...data(), notes: { a: "not a list" as unknown as string[], b: ["Fine."] } }), ["a", "b"])).toEqual(["Fine."]);
});

test("the practice card says when time ran out", () => {
  expect(tutorCard(ix, pair(), practice({ late: true, exLate: true }))).toContain(
    "Learner chose: nothing (time ran out; the page then showed the right relation). Time ran out on the examples: cells the learner had not reached are blank.",
  );
});

test("the card of a pair whose categories are unknown falls back to the labels", () => {
  const card = tutorCard(ix, pair({ a: "unknown a", b: "unknown b", catA: null, catB: null, typeA: "ta", typeB: "tb" }), practice());
  expect(card).toContain('{"A":{"label":"unknown a","type":"ta"},"B":{"label":"unknown b","type":"tb"}}');
  expect(card).not.toContain("Fine points");
});

test("the debate card lists the four questions and what the learner's answers imply", () => {
  const card = tutorCard(ix, pair({ relation: "4" }), debate());
  expect(card).toContain("This is the four-questions debate mode.");
  expect(card).toContain('A = "forms", B = "minds".');
  expect(card).toContain("Correct relation: Four possibilities. The learner's Q1 to Q3 answers give: Three possibilities, A in B. Learner chose: Mutually exclusive.");
  expect(card).toContain(`- Q1 (${qPlain(0)}) counter-example cell: both; learner said ACCEPT; reference EMPTY (Nothing is both.); page verdict ok`);
  expect(card).toContain('learner said WHY with the example "a wooden chair" [in the practice list as: a wooden chair, type Form]');
  expect(card).toContain("learner said WHY without an example");
  expect(card).toContain("learner said ACCEPT (time ran out, which counts as accepting)");
  expect(debate({ res: { implied: "bad", ...noRes(["ok", "ok", "ok", "ok"]) } }) && tutorCard(ix, pair(), debate({ res: { implied: "bad", ...noRes(["ok", "ok", "ok", "ok"]) } }))).toContain("give: a self-contradiction.");
  expect(tutorCard(ix, pair(), debate({ res: { implied: null, ...noRes(["ok", "ok", "ok", "ok"]) } }))).toContain("give: nothing (time ran out).");
});

test("the canonical wording of the four questions", () => {
  expect([0, 1, 2, 3].map(qPlain)).toEqual([
    "If it is A, it follows it is not B?",
    "If it is A, it follows it is B?",
    "If it is B, it follows it is A?",
    "If it is not A, it follows it is B?",
  ]);
});

test("the explain request is the plain one when the page checked every example, and asks for verdicts otherwise", () => {
  expect(explainAsk(practice({ res: noRes(["ok", "bad", "ok", "ok"]) }))).toBe(FIRST_ASK);
  expect(explainAsk(debate({ res: noRes(["ok", "bad", "ok", "ok"]) }))).toBe(DEBATE_ASK);
  const open = explainAsk(practice({ res: noRes(["cmp", "ok", "ok", "cmp"]) }));
  expect(open.startsWith(FIRST_ASK)).toBe(true);
  expect(open).toContain(`The page could not check the examples in: ${CELL_NAME.both}, ${CELL_NAME.nei}.`);
  expect(open).not.toContain("Q1 is the Both cell");
  const dbt = explainAsk(debate({ res: noRes(["ok", "cmp", "cmp", "ok"]) }));
  expect(dbt.startsWith(DEBATE_ASK)).toBe(true);
  expect(dbt).toContain("The page could not check the examples in: Q2, Q3.");
  expect(dbt).toContain("Q1 is the Both cell, Q2 A not B, Q3 B not A, Q4 Neither.");
});

// The tutor states two facts about an example (is it A, is it B) and the reason for each; the page writes the consequences and draws
// the conclusion (src/domain/verdict.ts), so the requests ask for the reason only.
test("the explain requests ask for the two facts about an example and the reason for each, in one form, and for no conclusion", () => {
  expect(FIRST_ASK).toContain('Both: "the example" | class: Taste source | A yes: it is ... | B no: it is ...');
  expect(DEBATE_ASK).toContain('Q2: "the example" | class: Taste source | A yes: it is ... | B no: it is ...');
  for (const ask of [FIRST_ASK, DEBATE_ASK]) {
    expect(ask).toContain('the words after "because" in "Take the example: it follows it is (not) A, because ..."');
    expect(ask).toContain("write no conclusion, do not name the term again and do not add its definition");
    expect(ask).toContain("from which the term follows (or is excluded)");
    expect(ask).toContain("never the term in other words");
    expect(ask).toContain("never its negation");
    expect(ask).toContain("the most specific class in the card's list of classes that the example is");
    expect(ask).toContain("the page adds the steps above the class");
    expect(ask).toContain("when one reason serves both terms, write it on both sides;");
    expect(ask).toContain('add "; pervasion: " and one sentence on why only when it is not plain');
    expect(ask).toContain("Never for everyday differences such as two colors or two shapes");
    expect(ask).toContain("never the example's own name");
    expect(ask).toContain("Start from the term and say what class it is in");
    expect(ask).toContain('do not write "only"');
    expect(ask).toContain("never answer against your own reason");
    expect(ask).toContain('A feature the example\'s name does not fix, such as the color of "an apple"');
    expect(ask).not.toContain("so it fits");
    expect(ask).not.toContain("=> yes");
  }
  expect(DEBATE_ASK).not.toContain("You accepted");
  expect(DEBATE_ASK).toContain("for a wrong Accept or a timeout the reference counter-example in the card, or one you name when the card has none");
  expect(FIRST_ASK).toContain("for a cell marked wrong without one, the reference example in the card");
  expect(GUIDE).toContain("everyday facts such as a thing's color, shape or material need no source and no remark");
  expect(GUIDE).toContain("call it the reference, never the card");
  expect(DEBATE_ASK).toContain("Do not say what the right answer to the question was");
  expect(DEBATE_ASK).toContain("A and B are mutually inclusive, so whatever is B is A");
});

test("the lookup tools: terms by name, alias, Russian name or part of the name, and examples from the practice list", () => {
  const tools = tutorTools(ix);
  expect(tools.map((t) => t.name)).toEqual(["lookup_term", "classify_example"]);
  for (const t of tools) expect(t.description.length).toBeGreaterThan(20);
  const term = (name: unknown) => tools[0].execute({ name }) as Record<string, unknown>;
  expect(term("form")).toMatchObject({ found: true, term: "Form" });
  expect(term("Stuff")).toMatchObject({ found: true, term: "Matter" });
  expect(term("ум")).toMatchObject({ found: true, term: "Mind" });
  expect(term("Mat")).toMatchObject({ found: true, term: "Matter" });
  expect(term("constructor")).toEqual({ found: false, close: [] });
  expect(() => term("")).toThrow("empty name");
  expect(() => tools[0].execute(null)).toThrow("empty name");
  const thing = (t: unknown) => tools[1].execute({ thing: t }) as Record<string, unknown>;
  expect(thing("a Wooden chair")).toEqual({ found: true, item: "a wooden chair", existent: true, dudra_type: "Form", chain: "Form > Thing", categories: ["forms", "wooden things"] });
  expect(thing("the horn of a rabbit")).toMatchObject({ found: true, existent: false, categories: [] });
  expect(thing("a table")).toEqual({ found: false });
  expect(tools[1].execute(undefined)).toEqual({ found: false });
});

// ---- the real open data ----

const real = openData as unknown as DrillData;
const rix = makeIndex(real);

test("in the real data every category label and item name finds its own category or item", () => {
  for (const c of real.cats) for (const l of c.labels) expect(catByLabel(rix, l), l).toBeTruthy();
  for (const it of real.items) expect(matchItem(rix, it.n, true)?.n, it.n).toBe(it.n);
  for (const it of real.items) for (const c of it.c) expect(rix.CAT[c], `${it.n}: ${c}`).toBeDefined();
  for (const c of real.cats) if (c.kind === "dudra") expect(real.terms[c.term ?? ""], c.id).toBeDefined();
});

// The tutor names an example's class from the data's "is a" tree, and every type a listed example has is one of them.
test("the card lists the classes of the real data's tree, which hold every listed example's type", () => {
  const cls = classNames(rix);
  expect(cls).toEqual(expect.arrayContaining(["Form", "External form", "Taste source", "Consciousness", "Mental factor", "Person", "Permanent"]));
  expect(cls).not.toContain("Existent");
  expect(cls).not.toContain("Matter");
  expect(cls).not.toContain("Hidden phenomenon"); // not in the tree under Existent
  for (const it of real.items) if (!["Expressive sound", "Non-existent"].includes(it.t)) expect(cls, it.n).toContain(it.t);
  expect(cardBody(rix, { a: "forms", b: "minds", catA: "form", catB: "cons", relation: "con" }, practice())).toContain('Classes (the booklet\'s "is a" tree, for "class:"): Form, External form,');
  expect(upChain(rix, "Taste source")).toEqual(["Taste source", "External form", "Form", "Functional thing", "Existent"]);
});

test("the real data is spelled the American way, in labels, item names and term names", () => {
  const words = [
    ...real.cats.flatMap((c) => c.labels),
    ...real.items.map((i) => i.n),
    ...Object.keys(real.aliases ?? {}),
    ...Object.values(real.aliases ?? {}),
    ...Object.values(real.terms).flatMap((t) => [t.name, ...(t.aliases ?? [])]),
  ];
  expect(words.filter((w) => american(w.toLowerCase()) !== w.toLowerCase())).toEqual([]);
});

test("a card for every pair of categories of the real data is complete text", () => {
  const ids = real.cats.map((c) => c.id);
  for (const a of ids) {
    for (const b of ids) {
      if (a === b) continue;
      const p: PairLike = { a: rix.CAT[a].labels[0], b: rix.CAT[b].labels[0], catA: a, catB: b, typeA: "x", typeB: "y", relation: "4", ex: { both: "a stone" } };
      for (const u of [practice(), debate()]) {
        const card = tutorCard(rix, p, u);
        expect(card, `${a} ${b}`).not.toMatch(/undefined|NaN|\[object/);
      }
    }
  }
});

// ---- the code stays free of the page and the browser ----

const here = resolve(__dirname, "../../src/ai-shared");
const sources = readdirSync(here).filter((f) => f.endsWith(".ts")).map((f) => join(here, f));

test("src/ai-shared imports only itself and touches nothing of the page or the browser", () => {
  expect(sources.length).toBeGreaterThan(5);
  for (const f of sources) {
    const text = readFileSync(f, "utf8");
    for (const m of text.matchAll(/^(?:import|export)\s[^;]*?from\s+["']([^"']+)["']/gm)) {
      expect(m[1].startsWith("./"), `${f} imports ${m[1]}`).toBe(true);
      expect(resolve(dirname(f), m[1]).startsWith(here), `${f} imports ${m[1]}`).toBe(true);
    }
    const code = text.replace(/\/\/.*$/gm, "").replace(/\/\*[^]*?\*\//g, "");
    expect(code, f).not.toMatch(/\b(window|document|localStorage|sessionStorage|navigator|fetch|XMLHttpRequest|process)\b/);
  }
});
