// src/domain/consequence.ts: the consequence drill. Made-up data with known classes for the rules (each of the eight situations, the
// proof of a pervasion, a conflict in the data), and the real open data for what must hold for every consequence the page can draw.
import { expect, test } from "vitest";
import { makeIndex } from "../../src/ai-shared";
import type { DrillData } from "../../src/ai-shared";
import {
  NO_PHRASE, REPLIES, SITUATIONS, consequenceOf, consequenceText, drawConsequence, gradeConsequence, pervasionConflicts,
} from "../../src/domain/consequence";
import type { Consequence, ConsequenceHistory, Reply, Situation } from "../../src/domain/consequence";
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
    { id: "ft", kind: "dudra", term: "Functional thing", labels: ["functional things"], type: "functional thing" },
    { id: "form", kind: "dudra", term: "Form", labels: ["forms"], type: "form" },
    { id: "extf", kind: "dudra", term: "External form", labels: ["external forms"], type: "external form" },
    { id: "snd", kind: "dudra", term: "Sound source", labels: ["sounds"], type: "sound" },
    { id: "cons", kind: "dudra", term: "Consciousness", labels: ["consciousnesses"], type: "consciousness" },
    { id: "red", kind: "everyday", labels: ["red things"], type: "form: objects that are red" },
    { id: "food", kind: "everyday", labels: ["food"], type: "form: things eaten as food" },
    { id: "memory", kind: "everyday", labels: ["memories"], type: "consciousness: mental consciousness remembering" },
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
  const cases: [Situation, string, string, string, Consequence["pervasion"]][] = [
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
    const c = consequenceOf(ix, subject, r, p, seeded(1));
    const why = `${subject}: ${r} > ${p}`;
    expect(c?.situation, why).toBe(sit);
    expect(c?.answer, why).toBe(SITUATIONS[sit].answer);
    expect(c?.pervasion, why).toBe(pervasion);
    expect([c?.checks.e.ok, c?.checks.t.ok], why).toEqual([SITUATIONS[sit].e, SITUATIONS[sit].t]);
    expect(c?.checks.v.ok, why).toBe(pervasion === "holds");
  }
});

test("the answer is the first check that fails: the reason, then the pervasion", () => {
  expect(consequenceOf(ix, "a banana", "red", "food")?.answer).toBe("reason"); // both fail: the reason comes first
  expect(consequenceOf(ix, "a stone", "red", "food")?.answer).toBe("reason");
  expect(consequenceOf(ix, "a tomato", "red", "food")?.answer).toBe("pervasion"); // the thesis is true, the reason does not prove it
  expect(consequenceOf(ix, "the memory of tea", "memory", "cons")?.answer).toBe("accept");
});

test("a pervasion holds only by the term chain, the same class or a stated pair; an item can only disprove it", () => {
  // memory is a consciousness by the kind of the category; a sound is an external form by the chain
  const mem = consequenceOf(ix, "the memory of tea", "memory", "cons");
  expect(mem?.checks.v.line).toBe(`Whatever is a memory is ${mem?.predicate}.`);
  expect(consequenceOf(ix, "a song", "snd", "extf")?.checks.v.line).toBe("Whatever is a sound is an external form.");
  const form = consequenceOf(ix, "a song", "snd", "form");
  expect(form?.checks.v.line).toBe(`Whatever is a sound is ${form?.predicate}, since it is an external form, which is a form.`);
  // red things and food overlap without either holding the other: an item that is the reason and not the predicate shows the pervasion fails
  const fails = consequenceOf(ix, "a tomato", "red", "food");
  expect(fails?.checks.v.line).toBe(`A red ball is red and is not ${fails?.predicate}, so not everything that is red is ${fails?.predicate}.`);
  const back = consequenceOf(ix, "a tomato", "food", "red");
  expect(back?.checks.v.line).toBe(`A banana is ${back?.reason} and is not red, so not everything that is ${back?.reason} is red.`);
});

test("the pervasion is opposite when the term chains exclude each other, and the line says why", () => {
  const c = consequenceOf(ix, "a tomato", "red", "cons");
  expect(c?.situation).toBe(4);
  expect(c?.pervasion).toBe("opposite");
  expect(c?.checks.v.line).toContain(`The pervasion is even opposite: whatever is red is a form, whatever is ${c?.predicate} is a consciousness, and nothing is both.`);
  // items alone never prove an opposite: red and food share nothing in a made-up world where no tomato exists, and it still only fails
  const lone = makeIndex({ ...data(), items: data().items.filter((i) => i.n !== "a tomato") });
  expect(consequenceOf(lone, "a red ball", "red", "food")?.pervasion).toBe("fails");
});

test("a reason that is the same class as the predicate gives the textbook's valid consequences, and the same words are never drawn twice", () => {
  for (let seed = 1; seed < 20; seed++) {
    const c = consequenceOf(ix, "a tomato", "food", "food", seeded(seed));
    expect(c?.situation).toBe(1);
    expect(c?.reason).not.toBe(c?.predicate);
  }
  expect(consequenceOf(ix, "a stone", "food", "food")?.situation).toBe(6); // a stone is not food, so the reason is not established
  expect(consequenceOf(ix, "a tomato", "red", "red")).toBeNull(); // red has one label: no pair of its own words
});

test("the data must agree with itself: a pervasion the chain proves and an item contradicts is reported and never drawn", () => {
  expect(pervasionConflicts(ix)).toEqual([]);
  const bad = makeIndex(data([{ n: "a hum", t: "Sound source", c: ["ft", "snd"] }])); // a sound that is not an external form
  expect(pervasionConflicts(bad)).toContain("snd>extf");
  expect(consequenceOf(bad, "a song", "snd", "extf")).toBeNull();
  const st = { hist: [], recent: [] as string[], rng: seeded(9) };
  for (let i = 0; i < 200; i++) expect(drawConsequence(bad, st).id.startsWith("snd|extf|")).toBe(false);
});

test("a non-existent is never the subject, and a pair of categories the data cannot settle is never drawn", () => {
  expect(consequenceOf(ix, "the horn of a rabbit", "red", "food")).toBeNull();
  expect(consequenceOf(ix, "a tomato", "red", "nothing")).toBeNull();
  const st = { hist: [], recent: [] as string[], rng: seeded(3) };
  for (let i = 0; i < 300; i++) expect(drawConsequence(ix, st).subject).not.toBe("the horn of a rabbit");
});

test("two wordings of the same consequence", () => {
  const c = consequenceOf(ix, "a tomato", "red", "food") as Consequence;
  expect(consequenceText(c)).toBe(`Take a tomato. It follows it is ${c.predicate} because it is red.`);
  expect(consequenceText(c, "textbook")).toBe(`It follows that the subject, a tomato, is ${c.predicate} because of being red.`);
});

test("grading: only the answer from the three checks is right, and a wrong reply says what was mixed up", () => {
  for (const sit of [1, 2, 3, 4, 5, 6, 7, 8] as Situation[]) {
    const [subject, r, p] = {
      1: ["the memory of tea", "memory", "cons"], 2: ["a tomato", "red", "food"], 3: ["a red ball", "red", "food"], 4: ["a tomato", "red", "cons"],
      5: ["a thought", "memory", "cons"], 6: ["a tomato", "memory", "cons"], 7: ["a banana", "red", "food"], 8: ["a stone", "red", "food"],
    }[sit];
    const c = consequenceOf(ix, subject, r, p) as Consequence;
    for (const said of REPLIES) {
      const g = gradeConsequence(c, said);
      const why = `situation ${sit}, said ${said}`;
      expect(g.correct, why).toBe(said === c.answer);
      expect(g.grade, why).toBe(said === c.answer ? "ok" : "bad");
      expect(g.expected, why).toBe(c.answer);
      expect(g.confusion === "", why).toBe(g.correct);
      // naming the pervasion when the reason fails first is wrong, but it found a fault that is there
      expect(g.missedPoint, why).toBe(said === "pervasion" && (sit === 7 || sit === 8));
    }
  }
  const c = consequenceOf(ix, "a banana", "red", "food") as Consequence;
  expect(gradeConsequence(c, "pervasion").confusion).toBe("You are not wrong that the pervasion fails, but you missed the point: the reason comes first, and a banana is not red.");
  expect(gradeConsequence(c, "accept").confusion).toBe("You accepted because the conclusion is true, but the reason has to prove it, and a banana is not red.");
  const d = consequenceOf(ix, "a tomato", "red", "food") as Consequence;
  expect(gradeConsequence(d, "reason").confusion).toBe(`A tomato is red, so the reason is established; what fails is the step from red to ${d.predicate}.`);
  expect(gradeConsequence(d, "accept").confusion).toBe(`You accepted because the conclusion is true, but the reason has to prove it, and it is false that whatever is red is ${d.predicate}.`);
});

test("the proofs say why the subject is not the reason, by the classes that exclude each other", () => {
  const c = consequenceOf(ix, "a tomato", "memory", "cons") as Consequence;
  expect(c.checks.e).toEqual({
    ok: false, line: "A tomato is not a memory. A tomato is a form, and whatever is a memory is a consciousness, but nothing is both.",
  });
});

test("a consequence carries its proofs: it is plain data, and grading needs no index", () => {
  const c = consequenceOf(ix, "a tomato", "red", "food") as Consequence;
  expect(JSON.parse(JSON.stringify(c))).toEqual(c);
});

test("the draw is the same for the same random numbers, and does not repeat what was drawn lately", () => {
  const run = (seed: number) => {
    const st = { hist: [] as ConsequenceHistory[], recent: [] as string[], rng: seeded(seed) };
    return Array.from({ length: 30 }, () => drawConsequence(ix, st).id);
  };
  expect(run(4)).toEqual(run(4));
  expect(run(4)).not.toEqual(run(5));
});

test("the draw asks the answer asked lately less, and brings back the categories the learner missed", () => {
  const share = (hist: ConsequenceHistory[], pick: (c: Consequence) => boolean) => {
    const st = { hist, recent: [] as string[], rng: seeded(11) };
    let n = 0;
    for (let i = 0; i < 400; i++) if (pick(drawConsequence(real, { ...st, recent: [] }))) n++;
    return n / 400;
  };
  const asked = Array.from({ length: 6 }, (): ConsequenceHistory => ({ answer: "reason", grade: "ok" }));
  expect(share(asked, (c) => c.answer === "reason")).toBeLessThan(share([], (c) => c.answer === "reason") - 0.1);
  const missed = Array.from({ length: 6 }, (): ConsequenceHistory => ({ answer: "accept", grade: "bad", catA: "plant", catB: "furn" }));
  const about = (c: Consequence) => [c.catR, c.catP].some((id) => id === "plant" || id === "furn");
  expect(share(missed, about)).toBeGreaterThan(share([], about) + 0.05);
});

// ---- the real open data ----

test("every category of the open data has the words a consequence needs, or is named as left out", () => {
  const sample = Object.keys(real.CAT).filter((id) => !NO_PHRASE.includes(id));
  // a category without words would silently never be drawn: a change of the data that adds one must add its words
  const drawn = new Set<string>();
  const st = { hist: [] as ConsequenceHistory[], recent: [] as string[], rng: seeded(21) };
  for (let i = 0; i < 4000; i++) { const c = drawConsequence(real, st); drawn.add(c.catR); drawn.add(c.catP); }
  const never = sample.filter((id) => !drawn.has(id));
  expect(never, "categories never drawn").toEqual([]);
  for (const id of NO_PHRASE) expect(real.CAT[id], id).toBeTruthy();
});

test("the term data and the items of the open data do not contradict each other", () => {
  expect(pervasionConflicts(real)).toEqual([]);
});

test("the rows of the note's table, on the open data", () => {
  const rows: [Situation, string, string, string][] = [
    [1, "a song", "snd", "ft"],
    [2, "a tomato", "red", "food"],
    [3, "a metal table", "square", "green"],
    [4, "a glass of water", "liquid", "thought"],
    [5, "the sound of rain", "col", "ft"],
    [6, "a metal key", "memory", "cons"],
    [7, "a banana", "white", "food"],
    [8, "a red ball", "square", "plant"],
  ];
  for (const [sit, subject, r, p] of rows) {
    const c = consequenceOf(real, subject, r, p);
    expect(c?.situation, `${subject} ${r} ${p}`).toBe(sit);
  }
});

test("every drawn consequence is what the items and the term data say, checked again by brute force", () => {
  const st = { hist: [] as ConsequenceHistory[], recent: [] as string[], rng: seeded(31) };
  const items = real.DATA.items;
  const seen = new Set<Situation>();
  for (let i = 0; i < 1500; i++) {
    const c = drawConsequence(real, st);
    seen.add(c.situation);
    const why = JSON.stringify(c);
    const item = items.find((x) => x.n === c.subject);
    expect(item, why).toBeTruthy();
    if (!item) continue;
    expect(item.ne, why).toBeFalsy();
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
    expect(c.level, why).toBe(real.CAT[c.catR].kind === "everyday" && real.CAT[c.catP].kind === "everyday" ? 1 : 2);
    expect(consequenceText(c), why).toContain(c.subject);
  }
  expect([...seen].sort(), "every situation turns up").toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
});

test("level 1 draws only everyday things and properties, and still gives all three answers", () => {
  const st = { hist: [] as ConsequenceHistory[], recent: [] as string[], level: 1 as const, rng: seeded(41) };
  const answers = new Set<Reply>();
  for (let i = 0; i < 400; i++) {
    const c = drawConsequence(real, st);
    answers.add(c.answer);
    expect(c.level).toBe(1);
    expect(real.CAT[c.catR].kind + real.CAT[c.catP].kind).toBe("everydayeveryday");
  }
  expect([...answers].sort()).toEqual([...REPLIES].sort());
});

test("the draw keeps most consequences sensible: a few have nothing linking their parts, none are repeated at once", () => {
  const st = { hist: [] as ConsequenceHistory[], recent: [] as string[], rng: seeded(51) };
  const n = 2000, drawn: Consequence[] = [];
  for (let i = 0; i < n; i++) drawn.push(drawConsequence(real, st));
  const unlinked = drawn.filter((c) => c.links === 0).length / n;
  expect(unlinked).toBeGreaterThan(0.05);
  expect(unlinked).toBeLessThan(0.15); // about one in ten
  expect(drawn.filter((c) => c.links <= 1).length / n).toBeLessThan(0.35);
  const answers = REPLIES.map((a) => drawn.filter((c) => c.answer === a).length / n);
  for (const share of answers) expect(share).toBeGreaterThan(0.2); // all three answers turn up often
  let again = 0;
  for (const [i, c] of drawn.entries()) if (drawn.slice(Math.max(0, i - 10), i).some((x) => x.id === c.id)) again++;
  expect(again / n).toBeLessThan(0.02);
  // plenty of different consequences, from plenty of different pairs of categories
  expect(new Set(drawn.map((c) => c.id)).size).toBeGreaterThan(n * 0.7);
  expect(new Set(drawn.map((c) => c.catR + "|" + c.catP)).size).toBeGreaterThan(300);
});
