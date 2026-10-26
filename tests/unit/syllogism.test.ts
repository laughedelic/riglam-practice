// src/domain/syllogism.ts: the syllogism drill. Made-up data with known classes for the rules (each of the eight situations, the
// proof of a pervasion, a conflict in the data), and the real open data for what must hold for every syllogism the page can draw.
import { expect, test } from "vitest";
import { makeIndex } from "../../src/ai-shared";
import type { DrillData } from "../../src/ai-shared";
import {
  REPLIES, SITUATIONS, syllogismOf, syllogismPieces, syllogismText, drawSyllogism, gradeSyllogism, gradeTimeout, gradeExample, pervasionConflicts, widest, withoutPhrases,
} from "../../src/domain/syllogism";
import type { Syllogism, SyllogismHistory, Reply, Situation } from "../../src/domain/syllogism";
import { inUniverse } from "../../src/domain/universe";
import openData from "../../src/data/drill-data.json";

/** A small deterministic random source (mulberry32), so a test draws the same numbers every time. */
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// ---- made-up data with known classes ----
//   form and consciousness exclude each other; a sound is an external form, which is a form; a memory is a consciousness;
//   red things and food overlap (a tomato) without either containing the other.
const term = (name: string, parent?: string, contra?: string[]) => ({ name, ch: "", parent, contra });
const data = (extra: DrillData["items"] = []): DrillData => ({
  terms: {
    Existent: term("Existent"),
    "Functional thing": term("Functional thing", "Existent"),
    Form: term("Form", "Functional thing", ["Consciousness"]),
    Consciousness: term("Consciousness", "Functional thing", ["Form"]),
    "External form": term("External form", "Form"),
    "Sound source": term("Sound source", "External form"),
  },
  chains: {},
  cats: [
    { id: "ft", kind: "dudra", term: "Functional thing", labels: ["functional things"], type: "functional thing", phrases: ["impermanent", "a product", "a functional thing"] },
    { id: "form", kind: "dudra", term: "Form", labels: ["forms"], type: "form", phrases: ["a form", "matter"] },
    { id: "extf", kind: "dudra", term: "External form", labels: ["external forms"], type: "external form", phrases: ["an external form"] },
    { id: "snd", kind: "dudra", term: "Sound source", labels: ["sounds"], type: "sound", phrases: ["a sound"] },
    { id: "cons", kind: "dudra", term: "Consciousness", labels: ["consciousnesses"], type: "consciousness", phrases: ["a consciousness", "a mind"] },
    { id: "red", kind: "everyday", labels: ["red things"], type: "form: objects that are red", phrases: ["red"] },
    { id: "food", kind: "everyday", labels: ["food"], type: "form: things eaten as food", phrases: ["food", "something you can eat"] },
    { id: "memory", kind: "everyday", labels: ["memories"], type: "consciousness: mental consciousness remembering", phrases: ["a memory"], within: ["cons"] },
  ],
  items: [
    { n: "a tomato", t: "External form", c: ["ft", "form", "extf", "red", "food"] },
    { n: "a red ball", t: "External form", c: ["ft", "form", "extf", "red"] },
    { n: "a banana", t: "External form", c: ["ft", "form", "extf", "food"] },
    { n: "a song", t: "Sound source", c: ["ft", "form", "extf", "snd"] },
    { n: "a stone", t: "External form", c: ["ft", "form", "extf"] },
    { n: "a thought", t: "Consciousness", c: ["ft", "cons"] },
    { n: "the memory of tea", t: "Consciousness", c: ["ft", "cons", "memory"] },
    { n: "the horn of a rabbit", t: "Non-existent", c: [], ne: true },
    ...extra,
  ],
  bodySkip: [],
  aliases: {},
});
const ix = makeIndex(data());
const real = makeIndex(openData as unknown as DrillData);

test("each of the eight situations: the subject's cell, the pervasion, and the answer follow from the three checks", () => {
  const cases: [Situation, string, string, string, Syllogism["pervasion"]][] = [
    // situation, subject, reason's category, predicate's category, the pervasion
    [1, "the memory of tea", "memory", "cons", "holds"],
    [2, "a tomato", "red", "food", "fails"],
    [3, "a red ball", "red", "food", "fails"],
    [4, "a tomato", "red", "cons", "opposite"],
    [5, "a thought", "memory", "cons", "holds"],
    [6, "a tomato", "memory", "cons", "holds"],
    [7, "a banana", "red", "food", "fails"],
    [8, "a stone", "red", "food", "fails"],
  ];
  for (const [sit, subject, r, p, pervasion] of cases) {
    const c = syllogismOf(ix, subject, r, p, seeded(1));
    const why = `${subject}: ${r} > ${p}`;
    expect(c?.situation, why).toBe(sit);
    expect(c?.answer, why).toBe(SITUATIONS[sit].answer);
    expect(c?.pervasion, why).toBe(pervasion);
    expect([c?.checks.e.ok, c?.checks.t.ok], why).toEqual([SITUATIONS[sit].e, SITUATIONS[sit].t]);
    expect(c?.checks.v.ok, why).toBe(pervasion === "holds");
  }
});

test("the answer is the first check that fails: the reason, then the pervasion", () => {
  expect(syllogismOf(ix, "a banana", "red", "food")?.answer).toBe("reason"); // both fail: the reason comes first
  expect(syllogismOf(ix, "a stone", "red", "food")?.answer).toBe("reason");
  expect(syllogismOf(ix, "a tomato", "red", "food")?.answer).toBe("pervasion"); // the thesis is true, the reason does not prove it
  expect(syllogismOf(ix, "the memory of tea", "memory", "cons")?.answer).toBe("accept");
});

test("a pervasion holds only by the term chain, the same class or a stated pair; an item can only disprove it", () => {
  // memory is a consciousness by the kind of the category; a sound is an external form by the chain
  const mem = syllogismOf(ix, "the memory of tea", "memory", "cons");
  expect(mem?.checks.v.line).toBe(`Whatever is a memory is ${mem?.predicate}.`);
  expect(syllogismOf(ix, "a song", "snd", "extf")?.checks.v.line).toBe("Whatever is a sound is an external form.");
  const form = syllogismOf(ix, "a song", "snd", "form");
  expect(form?.checks.v.line).toBe(`Whatever is a sound is ${form?.predicate}, since it is an external form, which is a form.`);
  // red things and food overlap without either holding the other: the pervasion fails, and the line is the class's phrase (the counter-example is kept for the tutor, not shown)
  const fails = syllogismOf(ix, "a tomato", "red", "food");
  expect(fails?.checks.v.line).toBe(`Just because it is red, doesn't necessarily mean that it is ${fails?.predicate}.`);
  expect(fails?.witness).toBe("a red ball");
  const back = syllogismOf(ix, "a tomato", "food", "red");
  expect(back?.checks.v.line).toBe(`Just because it is ${back?.reason}, doesn't necessarily mean that it is red.`);
  expect(back?.witness).toBe("a banana");
});

test("the pervasion is opposite when the term chains exclude each other", () => {
  const c = syllogismOf(ix, "a tomato", "red", "cons");
  expect(c?.situation).toBe(4);
  expect(c?.pervasion).toBe("opposite");
  expect(c?.checks.v.line).toBe(`Just because it is red, doesn't necessarily mean that it is ${c?.predicate}.`);
  // items alone never prove an opposite: red and food share nothing in a made-up world where no tomato exists, and it still only fails
  const lone = makeIndex({ ...data(), items: data().items.filter((i) => i.n !== "a tomato") });
  expect(syllogismOf(lone, "a red ball", "red", "food")?.pervasion).toBe("fails");
});

test("a reason that is the same class as the predicate gives the textbook's valid syllogisms, and the same words are never drawn twice", () => {
  for (let seed = 1; seed < 20; seed++) {
    const c = syllogismOf(ix, "a tomato", "food", "food", seeded(seed));
    expect(c?.situation).toBe(1);
    expect(c?.reason).not.toBe(c?.predicate);
  }
  expect(syllogismOf(ix, "a stone", "food", "food")?.situation).toBe(6); // a stone is not food, so the reason is not established
  expect(syllogismOf(ix, "a tomato", "red", "red")).toBeNull(); // red has one label: no pair of its own words
});

test("the data must agree with itself: a pervasion the chain proves and an item contradicts is reported and never drawn", () => {
  expect(pervasionConflicts(ix)).toEqual([]);
  const bad = makeIndex(data([{ n: "a hum", t: "Sound source", c: ["ft", "snd"] }])); // a sound that is not an external form
  expect(pervasionConflicts(bad)).toContain("snd>extf");
  expect(syllogismOf(bad, "a song", "snd", "extf")).toBeNull();
  const st = { hist: [], recent: [] as string[], rng: seeded(9) };
  for (let i = 0; i < 200; i++) expect(drawSyllogism(bad, st).id.startsWith("snd|extf|")).toBe(false);
});

test("a non-existent is never the subject, and a pair of categories the data cannot settle is never drawn", () => {
  expect(syllogismOf(ix, "the horn of a rabbit", "red", "food")).toBeNull();
  expect(syllogismOf(ix, "a tomato", "red", "nothing")).toBeNull();
  const st = { hist: [], recent: [] as string[], rng: seeded(3) };
  for (let i = 0; i < 300; i++) expect(drawSyllogism(ix, st).subject).not.toBe("the horn of a rabbit");
});

test("two wordings of the same syllogism", () => {
  const c = syllogismOf(ix, "a tomato", "red", "food") as Syllogism;
  expect(syllogismText(c)).toBe(`Take a tomato. It follows it is ${c.predicate} because it is red.`);
  expect(syllogismText(c, "formal")).toBe(`It follows that the subject, a tomato, is ${c.predicate} because of being red.`);
});

test("a wording is also said in pieces, so that the page can set the three parts apart; the pieces read as the sentence", () => {
  const c = syllogismOf(ix, "a tomato", "red", "food") as Syllogism;
  for (const w of ["take", "formal"] as const) {
    const pieces = syllogismPieces(c, w);
    expect(pieces.map((x) => (typeof x === "string" ? x : x.text)).join("")).toBe(syllogismText(c, w));
    expect(pieces.filter((x) => typeof x !== "string")).toEqual([
      { part: "subject", text: "a tomato" }, { part: "predicate", text: c.predicate }, { part: "reason", text: "red" },
    ]);
  }
});

test("a counter-example has to be the reason without being the predicate; a thing the data does not know is not checked", () => {
  const c = syllogismOf(ix, "a tomato", "red", "food") as Syllogism; // whatever is red is food: no
  expect(gradeExample(ix, c, "a red ball")).toMatchObject({ v: "ok", line: `A red ball is red and is not ${c.predicate}, so there is no pervasion.` });
  expect(gradeExample(ix, c, " a red ball. ").v).toBe("ok");
  // the subject itself is no answer, even when it is the reason without being the predicate (it is on the card already): the page asks for another thing
  const own = syllogismOf(ix, "a red ball", "red", "food") as Syllogism; // the subject is red and is not food
  expect(own.checks.e.ok && !own.checks.t.ok).toBe(true);
  expect(gradeExample(ix, own, "a red ball")).toMatchObject({ v: "self", line: `That is the subject itself. Name another thing that is red and is not ${own.predicate}.` });
  expect(gradeExample(ix, own, "the red ball").v).toBe("self");
  expect(gradeExample(ix, own, "red balls.").v).toBe("self");
  expect(gradeExample(ix, c, "a tomato").v).toBe("self"); // the subject of the first syllogism
  // another thing is graded as before
  expect(gradeExample(ix, own, "a tomato")).toMatchObject({ v: "bad", line: `A tomato is red, but it is also ${own.predicate}, so it is no counter-example.` });
  expect(gradeExample(ix, c, "a banana")).toMatchObject({ v: "bad", line: expect.stringContaining("A banana is not red") });
  expect(gradeExample(ix, c, "a thing the course knows nothing of").v).toBe("cmp");
  expect(gradeExample(ix, c, "   ").v).toBe("cmp");
});

test("a counter-example whose name leaves the reason open is asked to say it; one that is the predicate is no counter-example, whatever the rest of it is", () => {
  const vix = makeIndex(data([
    { n: "a ball", t: "External form", c: ["ft", "form", "extf"], may: ["red"] },
    { n: "an apple", t: "External form", c: ["ft", "form", "extf", "food"], may: ["red"] },
  ]));
  const c = syllogismOf(vix, "a tomato", "red", "food") as Syllogism; // whatever is red is food: no
  expect(gradeExample(vix, c, "a ball")).toEqual({ v: "cmp", line: "“A ball” leaves open whether it is red: name it, as in “a red ball”." });
  expect(gradeExample(vix, c, "an apple")).toEqual({ v: "bad", line: `An apple is ${c.predicate}, whatever the rest of it is.` });
  expect(gradeExample(vix, c, "a red ball").v).toBe("ok");
});

test("the line on a counter-example names the thing as the data does, not as it was typed, and the one thing said as \"you\" takes \"are\"", () => {
  const c = syllogismOf(ix, "a tomato", "red", "food") as Syllogism;
  expect(gradeExample(ix, c, "RED  balls").line).toBe(`A red ball is red and is not ${c.predicate}, so there is no pervasion.`);
  const you = syllogismOf(real, "a tomato", "pers", "food", () => 0) as Syllogism;
  expect(gradeExample(real, you, "you")).toEqual({ v: "ok", line: "You are a person and are not food, so there is no pervasion." });
});

test("an exclusion worded as the reason itself does not say that whatever is X is X", () => {
  const c = syllogismOf(real, "the squareness of a box", "col", "vis", () => 0) as Syllogism;
  expect(c.checks.e.line).toBe("The squareness of a box is not a color. The squareness of a box is a shape, and nothing is both a shape and a color.");
  // and for every syllogism the real data can draw, no line says that what is the reason is the reason
  const st = { hist: [] as SyllogismHistory[], recent: [] as string[], rng: seeded(21) };
  for (let i = 0; i < 1500; i++) {
    const d = drawSyllogism(real, st);
    expect(d.checks.e.line, d.id).not.toMatch(/whatever is (.+) is \1,/);
  }
});

test("grading: only the answer from the three checks is right, and a wrong reply says what was mixed up", () => {
  for (const sit of [1, 2, 3, 4, 5, 6, 7, 8] as Situation[]) {
    const [subject, r, p] = {
      1: ["the memory of tea", "memory", "cons"], 2: ["a tomato", "red", "food"], 3: ["a red ball", "red", "food"], 4: ["a tomato", "red", "cons"],
      5: ["a thought", "memory", "cons"], 6: ["a tomato", "memory", "cons"], 7: ["a banana", "red", "food"], 8: ["a stone", "red", "food"],
    }[sit];
    const c = syllogismOf(ix, subject, r, p) as Syllogism;
    for (const said of REPLIES) {
      const g = gradeSyllogism(c, said);
      const why = `situation ${sit}, said ${said}`;
      expect(g.correct, why).toBe(said === c.answer);
      expect(g.grade, why).toBe(said === c.answer ? "ok" : "bad");
      expect(g.expected, why).toBe(c.answer);
      expect(g.confusion === "", why).toBe(g.correct);
      // naming the pervasion when the reason fails first is wrong, but it found a fault that is there
      expect(g.missedPoint, why).toBe(said === "pervasion" && (sit === 7 || sit === 8));
    }
  }
  const c = syllogismOf(ix, "a banana", "red", "food") as Syllogism;
  expect(gradeSyllogism(c, "pervasion").confusion).toBe("You are not wrong that the pervasion fails, but you missed the point: the reason comes first, and a banana is not red.");
  expect(gradeSyllogism(c, "accept").confusion).toBe("You accepted because the thesis is true, but the reason has to prove it, and a banana is not red.");
  const d = syllogismOf(ix, "a tomato", "red", "food") as Syllogism;
  expect(gradeSyllogism(d, "reason").confusion).toBe(`A tomato is red, so the reason is established; what fails is the step from red to ${d.predicate}.`);
  expect(gradeSyllogism(d, "accept").confusion).toBe(`You accepted because the thesis is true, but the reason has to prove it, and it is false that whatever is red is ${d.predicate}.`);
});

test("when the time runs out (Blitz) there is no reply: wrong, the right reply named, nothing said about a mix-up", () => {
  for (const [subject, r, p] of [["a tomato", "red", "food"], ["a banana", "red", "food"], ["the memory of tea", "memory", "cons"]]) {
    const c = syllogismOf(ix, subject, r, p) as Syllogism;
    expect(gradeTimeout(c)).toEqual({ grade: "bad", correct: false, said: null, expected: c.answer, missedPoint: false, confusion: "" });
  }
});

test("the proofs say why the subject is not the reason, by the classes that exclude each other", () => {
  const c = syllogismOf(ix, "a tomato", "memory", "cons") as Syllogism;
  expect(c.checks.e).toEqual({
    ok: false, line: "A tomato is not a memory. A tomato is a form, and whatever is a memory is a consciousness, but nothing is both.",
  });
});

test("a syllogism carries its proofs: it is plain data, and grading needs no index", () => {
  const c = syllogismOf(ix, "a tomato", "red", "food") as Syllogism;
  expect(JSON.parse(JSON.stringify(c))).toEqual(c);
});

test("the draw is the same for the same random numbers, and another seed draws another run", () => {
  const run = (seed: number) => {
    const st = { hist: [] as SyllogismHistory[], recent: [] as string[], rng: seeded(seed) };
    return Array.from({ length: 30 }, () => drawSyllogism(ix, st).id);
  };
  expect(run(4)).toEqual(run(4));
  expect(run(4)).not.toEqual(run(5));
});

test("the one just shown is not drawn again as the next, at either level, when the pool has another", () => {
  for (const level of [1, 2] as const) {
    const st = { hist: [] as SyllogismHistory[], recent: [] as string[], level, rng: seeded(8 + level) };
    let last = "";
    for (let i = 0; i < 3000; i++) {
      const c = drawSyllogism(real, st);
      expect(c.id, `level ${level}, draw ${i}`).not.toBe(last);
      last = c.id;
    }
  }
});

test("a thing only the course's terms name is no subject of the everyday level, and may be one at the next", () => {
  const d = data(); d.items = d.items.map((i) => (i.n === "a tomato" ? { ...i, dudraOnly: true } : i));
  const dx = makeIndex(d);
  const subjects = (level: 1 | 2) => {
    const st = { hist: [] as SyllogismHistory[], recent: [] as string[], level, rng: seeded(31) };
    return new Set(Array.from({ length: 600 }, () => drawSyllogism(dx, st)).map((c) => c.subject));
  };
  expect(subjects(1).has("a tomato")).toBe(false);
  expect(subjects(2).has("a tomato")).toBe(true);
  expect(syllogismOf(dx, "a tomato", "red", "food", seeded(1))?.level).toBe(2); // asked for by name, it says what level it needs
});

test("the draw asks the answer asked lately less, and brings back the categories the learner missed", () => {
  const share = (hist: SyllogismHistory[], pick: (c: Syllogism) => boolean) => {
    const st = { hist, recent: [] as string[], rng: seeded(11) };
    let n = 0;
    for (let i = 0; i < 400; i++) if (pick(drawSyllogism(real, { ...st, recent: [] }))) n++;
    return n / 400;
  };
  const asked = Array.from({ length: 6 }, (): SyllogismHistory => ({ answer: "reason", grade: "ok" }));
  expect(share(asked, (c) => c.answer === "reason")).toBeLessThan(share([], (c) => c.answer === "reason") - 0.1);
  const missed = Array.from({ length: 6 }, (): SyllogismHistory => ({ answer: "accept", grade: "bad", catA: "plant", catB: "furn" }));
  const about = (c: Syllogism) => [c.catR, c.catP].some((id) => id === "plant" || id === "furn");
  expect(share(missed, about)).toBeGreaterThan(share([], about) + 0.05);
});

// ---- the real open data ----

test("every category of the open data has the words a syllogism needs, or is named as left out", () => {
  // a category without words would silently never be drawn: a change of the data that adds one must add its words (items.py in the knowledge base)
  expect(withoutPhrases(real)).toEqual(["hid"]); // the existent in the data: it would make every syllogism trivial
  const sample = Object.keys(real.CAT).filter((id) => !withoutPhrases(real).includes(id));
  const drawn = new Set<string>();
  const st = { hist: [] as SyllogismHistory[], recent: [] as string[], rng: seeded(21) };
  for (let i = 0; i < 4000; i++) { const c = drawSyllogism(real, st); drawn.add(c.catR); drawn.add(c.catP); }
  const never = sample.filter((id) => !drawn.has(id));
  expect(never, "categories never drawn").toEqual([]);
});

test("what the drill says and takes for granted comes from the data: the words, the stated pervasions, the kinds that are mixed up, the subjects that are not taken", () => {
  // the words: a changed phrase is what is said, and a category with no phrase is never drawn
  const changed = data(); changed.cats = changed.cats.map((c) => (c.id === "red" ? { ...c, phrases: ["crimson"] } : c.id === "food" ? { ...c, phrases: undefined } : c));
  expect(withoutPhrases(makeIndex(changed))).toEqual(["food"]);
  const seen = new Set<string>();
  const st = { hist: [] as SyllogismHistory[], recent: [] as string[], rng: seeded(5) };
  const mi = makeIndex(changed);
  for (let i = 0; i < 300; i++) { const c = drawSyllogism(mi, st); seen.add(c.reason); seen.add(c.predicate); expect([c.catR, c.catP]).not.toContain("food"); }
  expect(seen.has("crimson")).toBe(true);
  expect(seen.has("red")).toBe(false);
  // a pervasion stated in the data holds; the same data without it does not make the pair hold by itself
  const everyday = (within?: string[]) => { const d = data(); d.cats = d.cats.map((c) => (c.id === "food" ? { ...c, within } : c)); d.items = d.items.map((i) => (i.n === "a banana" || i.n === "a tomato" ? { ...i, c: [...i.c, "red"] } : i)); return d; };
  // the term chain cannot show that food is red (neither is a term); the data states it, and the items agree (a banana and a tomato are both red here)
  expect(syllogismOf(makeIndex(everyday(["red"])), "a tomato", "food", "red", seeded(1))?.pervasion).toBe("holds");
  expect(syllogismOf(makeIndex(everyday(undefined)), "a tomato", "food", "red", seeded(1))).toBeNull();
  // a subject the data marks is never taken, however many categories it is in
  const marked = data(); marked.items = marked.items.map((i) => (i.n === "a tomato" ? { ...i, nosubject: true } : i));
  const mk = makeIndex(marked), st2 = { hist: [] as SyllogismHistory[], recent: [] as string[], rng: seeded(9) };
  for (let i = 0; i < 300; i++) expect(drawSyllogism(mk, st2).subject).not.toBe("a tomato");
  // kinds that are mixed up make near misses; none are made without them
  expect(widest(real)).toEqual(new Set(["Existent", "Functional thing"])); // not named in the code: the terms most categories share
  expect(real.DATA.confusable?.length).toBeGreaterThan(0);
});

test("the term data and the items of the open data do not contradict each other", () => {
  expect(pervasionConflicts(real)).toEqual([]);
});

test("the rows of the note's table, on the open data", () => {
  const rows: [Situation, string, string, string][] = [
    [1, "a song", "snd", "ft"],
    [2, "a tomato", "red", "food"],
    [3, "a red box", "square", "green"],
    [4, "a glass of water", "liquid", "thought"],
    [5, "the sound of rain", "col", "ft"],
    [6, "a metal key", "memory", "cons"],
    [7, "a banana", "white", "food"],
    [8, "a red ball", "square", "plant"],
  ];
  for (const [sit, subject, r, p] of rows) {
    const c = syllogismOf(real, subject, r, p);
    expect(c?.situation, `${subject} ${r} ${p}`).toBe(sit);
  }
});

test("a subject whose name leaves the reason or the predicate open is not settled, and is never drawn with them", () => {
  const chair = real.DATA.items.find((i) => i.n === "a chair")!;
  expect(chair.may).toContain("wooden");
  expect(syllogismOf(real, "a chair", "wooden", "furn")).toBeNull();
  expect(syllogismOf(real, "a chair", "furn", "wooden")).toBeNull();
  expect(syllogismOf(real, "a chair", "furn", "form")?.situation).toBe(1);
});

test("every drawn syllogism is what the items and the term data say, checked again by brute force", () => {
  const st = { hist: [] as SyllogismHistory[], recent: [] as string[], rng: seeded(31) };
  const items = real.DATA.items;
  const seen = new Set<Situation>();
  for (let i = 0; i < 1500; i++) {
    const c = drawSyllogism(real, st);
    seen.add(c.situation);
    const why = JSON.stringify(c);
    const item = items.find((x) => x.n === c.subject);
    expect(item, why).toBeTruthy();
    if (!item) continue;
    expect(item.ne, why).toBeFalsy();
    expect((item.may ?? []).filter((x) => x === c.catR || x === c.catP), why).toEqual([]); // its name settles both
    const e = item.c.includes(c.catR), t = item.c.includes(c.catP);
    expect(c.checks.e.ok, why).toBe(e);
    expect(c.checks.t.ok, why).toBe(t);
    const inR = items.filter((x) => x.c.includes(c.catR) && inUniverse(real, x, c.catR, c.catP));
    const counter = inR.filter((x) => !x.c.includes(c.catP));
    if (c.pervasion === "holds") expect(counter.map((x) => x.n), why).toEqual([]);
    else {
      // fails or opposite: a thing that is the reason and is not the predicate
      const w = items.find((x) => x.n === c.witness);
      expect(w?.c.includes(c.catR) && !w.c.includes(c.catP), why).toBe(true);
      expect(counter.length, why).toBeGreaterThan(0);
    }
    if (c.pervasion === "opposite") expect(inR.filter((x) => x.c.includes(c.catP)), why).toEqual([]);
    // the answer is the first check that fails
    expect(c.answer, why).toBe(!e ? "reason" : c.pervasion !== "holds" ? "pervasion" : "accept");
    expect(c.answer, why).toBe(SITUATIONS[c.situation].answer);
    expect(c.reason, why).not.toBe(c.predicate);
    const everyday = real.CAT[c.catR].kind === "everyday" && real.CAT[c.catP].kind === "everyday" && !real.DATA.items.find((i) => i.n === c.subject)?.dudraOnly;
    expect(c.level, why).toBe(everyday ? 1 : 2); // the course's terms in the reason, the predicate or the subject make it level 2
    expect(syllogismText(c), why).toContain(c.subject);
  }
  expect([...seen].sort(), "every situation turns up").toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
});

test("level 1 draws only everyday things and properties, and still gives all three answers", () => {
  const st = { hist: [] as SyllogismHistory[], recent: [] as string[], level: 1 as const, rng: seeded(41) };
  const answers = new Set<Reply>();
  for (let i = 0; i < 400; i++) {
    const c = drawSyllogism(real, st);
    answers.add(c.answer);
    expect(c.level).toBe(1);
    expect(real.CAT[c.catR].kind + real.CAT[c.catP].kind).toBe("everydayeveryday");
    expect(real.DATA.items.find((i) => i.n === c.subject)?.dudraOnly, c.subject).toBeFalsy(); // the subject is an everyday thing too
  }
  expect([...answers].sort()).toEqual([...REPLIES].sort());
});

test("the draw keeps most syllogisms sensible: a few have nothing linking their parts, none are repeated at once", () => {
  const st = { hist: [] as SyllogismHistory[], recent: [] as string[], rng: seeded(51) };
  const n = 2000, drawn: Syllogism[] = [];
  for (let i = 0; i < n; i++) drawn.push(drawSyllogism(real, st));
  const unlinked = drawn.filter((c) => c.links === 0).length / n;
  expect(unlinked).toBeGreaterThan(0.05);
  expect(unlinked).toBeLessThan(0.15); // about one in ten
  expect(drawn.filter((c) => c.links <= 1).length / n).toBeLessThan(0.35);
  const answers = REPLIES.map((a) => drawn.filter((c) => c.answer === a).length / n);
  for (const share of answers) expect(share).toBeGreaterThan(0.2); // all three answers turn up often
  let again = 0;
  for (const [i, c] of drawn.entries()) if (drawn.slice(Math.max(0, i - 10), i).some((x) => x.id === c.id)) again++;
  expect(again / n).toBeLessThan(0.02);
  // plenty of different syllogisms, from plenty of different pairs of categories
  expect(new Set(drawn.map((c) => c.id)).size).toBeGreaterThan(n * 0.7);
  expect(new Set(drawn.map((c) => c.catR + "|" + c.catP)).size).toBeGreaterThan(300);
});
