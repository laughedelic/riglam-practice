// src/domain/session.ts: the plan of a session of mixed practice. Made-up data with known classes and stages for the rules of a thread, and the
// open data for what must hold for every plan: each step is a question the data can make for the learner, and no question comes twice.
import { expect, test } from "vitest";
import { makeIndex } from "../../src/ai-shared";
import type { DrillData } from "../../src/ai-shared";
import { givenQuestion } from "../../src/domain/given";
import { SESSION_QUESTIONS, SESSION_THREADS, comeBacks, pairThread, planSession, sessionMiss, sessionTally, stepKey, termThread, threadName } from "../../src/domain/session";
import type { SessionOptions, SessionPlan, SessionStep } from "../../src/domain/session";
import { STAGES } from "../../src/domain/stages";
import openData from "../../src/data/drill-data.json";

/** A small deterministic random source (mulberry32), so a test draws the same numbers every time. */
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

//   Existent > Functional thing > Form > Color; Functional thing > Consciousness. Form and Consciousness exclude each other. Form opens at
//   stage 1, Color at 2, Consciousness at 3, Functional thing at 5; the everyday categories are there from the start.
const term = (name: string, parent?: string, contra?: string[]) => ({ name, ch: "I", parent, contra });
const DATA = {
  terms: {
    Existent: term("Existent"),
    "Functional thing": term("Functional thing", "Existent"),
    Form: term("Form", "Functional thing", ["Consciousness"]),
    Consciousness: term("Consciousness", "Functional thing", ["Form"]),
    Color: term("Color", "Form"),
  },
  chains: {},
  cats: [
    { id: "ft", kind: "dudra", term: "Functional thing", labels: ["functional things"], type: "functional thing", phrases: ["a functional thing"], st: 5 },
    { id: "form", kind: "dudra", term: "Form", labels: ["forms"], type: "form", phrases: ["a form"], st: 1 },
    { id: "cons", kind: "dudra", term: "Consciousness", labels: ["consciousnesses"], type: "consciousness", phrases: ["a consciousness"], st: 3 },
    { id: "col", kind: "dudra", term: "Color", labels: ["colors"], type: "color", phrases: ["a color"], sense: true, st: 2 },
    { id: "red", kind: "everyday", labels: ["red things"], type: "form: red things", phrases: ["red"] },
    { id: "round", kind: "everyday", labels: ["round things"], type: "form: round things", phrases: ["round"] },
    { id: "food", kind: "everyday", labels: ["food"], type: "form: things eaten as food", phrases: ["food"] },
    { id: "fruit", kind: "everyday", labels: ["fruit"], type: "form: fruit", phrases: ["a fruit"], within: ["food"] },
    { id: "wooden", kind: "everyday", labels: ["wooden things"], type: "form: things made of wood", phrases: ["made of wood"] },
    { id: "emotion", kind: "everyday", labels: ["emotions"], type: "consciousness: emotions", phrases: ["an emotion"], within: ["cons"] },
  ],
  items: [
    { n: "a tomato", t: "Form", c: ["ft", "form", "red", "round", "food", "fruit"], comp: true },
    { n: "a red apple", t: "Form", c: ["ft", "form", "red", "round", "food", "fruit"], comp: true },
    { n: "a banana", t: "Form", c: ["ft", "form", "food", "fruit"], comp: true },
    { n: "a loaf of bread", t: "Form", c: ["ft", "form", "food"], comp: true },
    { n: "a red brick", t: "Form", c: ["ft", "form", "red"], comp: true },
    { n: "a wooden ball", t: "Form", c: ["ft", "form", "round", "wooden"], comp: true },
    { n: "a wooden spoon", t: "Form", c: ["ft", "form", "wooden"], comp: true },
    { n: "a glass marble", t: "Form", c: ["ft", "form", "round"], comp: true },
    { n: "the red of a rose", t: "Color", c: ["ft", "form", "col", "red"], st: 2 },
    { n: "the blue of the sky", t: "Color", c: ["ft", "form", "col"], st: 2 },
    { n: "anger", t: "Consciousness", c: ["ft", "cons", "emotion"], st: 3 },
    { n: "joy", t: "Consciousness", c: ["ft", "cons", "emotion"], st: 3 },
    { n: "a memory of home", t: "Consciousness", c: ["ft", "cons"], st: 3 },
  ],
  aliases: {},
  bodySkip: [],
} as unknown as DrillData;
const ix = makeIndex(DATA);
const real = makeIndex(openData as unknown as DrillData);
const ALL = STAGES.map((s) => s.n);
const upTo = (n: number) => ALL.filter((s) => s <= n);
const steps = (p: SessionPlan): SessionStep[] => p.threads.flatMap((t) => t.steps);
const exercises = (ss: readonly SessionStep[]) => ss.map((s) => s.given.exercise);

// ---- a thread on one pair ----

test("pairThread: one example, the two terms, a reason, all on the same two categories", () => {
  const t = pairThread(ix, "red", "round", { stages: [0], rng: seeded(1), first: "categories", two: "practice" })!;
  expect(t).toMatchObject({ kind: "pair", cats: ["red", "round"] });
  expect(exercises(t.steps)).toEqual(["categories", "practice", "syllogism"]);
  const [one, two, three] = t.steps;
  // the thing is one that tells the pair apart or is both, and the rows have both categories
  expect(one.given).toMatchObject({ exercise: "categories", cats: ["red", "round"] });
  const thing = (one.given as { thing: string }).thing;
  expect(["a tomato", "a red apple", "a red brick", "a wooden ball", "a glass marble"]).toContain(thing);
  expect(two.given).toEqual({ exercise: "practice", a: "red", b: "round" });
  expect([["red", "round"], ["round", "red"]]).toContainEqual([(three.given as { reason: string }).reason, (three.given as { predicate: string }).predicate]);
  // the ties say what is carried over
  expect(one.tie).toBe("");
  expect(two.tie).toBe("Two of the categories you just judged " + thing + " by, now side by side.");
  expect(three.tie).toMatch(/The same two terms: one is now the reason for the other\.$/);
  // the other exercises of the first two steps, and a fourth step on request
  const other = pairThread(ix, "red", "round", { stages: [0], rng: seeded(1), first: "instance", two: "debate", find: true })!;
  expect(exercises(other.steps)).toEqual(["instance", "debate", "syllogism", "find"]);
  expect(other.steps[0].given).toEqual({ exercise: "instance", cats: ["red", "round"] });
  expect(other.steps[1].tie).toBe("The same two terms, now as a pair.");
  expect(other.steps[3].given).toEqual({ exercise: "find", relation: "4" });
});

test("pairThread: the thing of the first step returns as the subject when the reply allows, and the tie says so", () => {
  let back = 0;
  for (let s = 1; s <= 40; s++) {
    const t = pairThread(ix, "food", "fruit", { stages: [0], rng: seeded(s), first: "categories" })!;
    const thing = (t.steps[0].given as { thing: string }).thing, subject = (t.steps[2].given as { subject: string }).subject;
    expect(t.steps[2].tie.startsWith(thing[0].toUpperCase() + thing.slice(1) + " comes back as the subject. ")).toBe(subject === thing);
    if (subject === thing) back++;
  }
  expect(back).toBeGreaterThan(20);
});

test("pairThread: null for what the data cannot make for the learner", () => {
  expect(pairThread(ix, "red", "red", { stages: [0], rng: seeded(1) })).toBeNull();
  expect(pairThread(ix, "red", "nowhere", { stages: [0], rng: seeded(1) })).toBeNull();
  expect(pairThread(ix, "col", "red", { stages: ALL, rng: seeded(1) })).toBeNull();                          // a pair the data does not judge
  expect(pairThread(ix, "form", "cons", { stages: [0, 1, 2], rng: seeded(1) })).toBeNull();                  // Consciousness opens at stage 3
  expect(pairThread(ix, "form", "cons", { stages: [0, 1, 2, 3], rng: seeded(1) })).not.toBeNull();
  expect(pairThread(ix, "form", "cons", { stages: [0, 1, 2, 3], words: { unmet: new Set(["cons"]) }, rng: seeded(1) })).toBeNull();
});

// ---- a thread on one term ----

test("termThread: the term from several sides, each time beside another partner", () => {
  const t = termThread(ix, "form", { stages: upTo(5), rng: seeded(2) })!;
  expect(t).toMatchObject({ kind: "term", cats: ["form"] });
  expect(t.steps.length).toBeGreaterThanOrEqual(3);
  expect(t.steps[0].given).toMatchObject({ exercise: "categories", cats: ["form"] });
  expect(t.steps[t.steps.length - 1].given.exercise).toBe("syllogism");
  for (const s of t.steps) expect(s.cats).toContain("form");
  // the partner changes: no two steps before the reason are about the same pair
  const partners = t.steps.slice(1, -1).map((s) => s.cats.find((x) => x !== "form"));
  expect(new Set(partners).size).toBe(partners.length);
  // every tie names the term and none the relation
  for (const s of t.steps.slice(1)) { expect(s.tie).toMatch(/^Form again/); expect(s.tie).not.toMatch(/wider|narrower|excludes|crosses|possibilities|exclusive|inclusive/); }
  // a short thread keeps its ends: a thing first, a reason last
  const short = termThread(ix, "form", { stages: upTo(5), rng: seeded(2), steps: 3 })!;
  expect(short.steps.length).toBe(3);
  expect(short.steps[0].given.exercise).toBe("categories");
  expect(short.steps[2].given.exercise).toBe("syllogism");
  // not for a term the learner has not met, or one the data lacks
  expect(termThread(ix, "form", { stages: upTo(5), words: { unmet: new Set(["form"]) }, rng: seeded(2) })).toBeNull();
  expect(termThread(ix, "nowhere", { stages: upTo(5), rng: seeded(2) })).toBeNull();
});

// ---- the session ----

test("planSession: a term thread first where the learner has met a term, then pairs about other categories", () => {
  const plan = planSession(ix, { stages: upTo(5), rng: seeded(4) });
  expect(plan.threads[0].kind).toBe("term");
  expect(plan.threads[0].steps.length).toBe(3);
  for (const t of plan.threads.slice(1)) expect(t.kind).toBe("pair");
  // no category of one thread is in another
  const seen = new Set<string>();
  for (const t of plan.threads) { const cats = new Set(t.steps.flatMap((s) => s.cats)); for (const x of cats) { expect(seen.has(x)).toBe(false); seen.add(x); } }
  // at stage 0 there is no course term: pairs only, and by turns the two exercises of the example and of the two terms
  const zero = planSession(ix, { stages: [0], rng: seeded(4), threads: 2 });
  expect(zero.threads.map((t) => t.kind)).toEqual(["pair", "pair"]);
  expect(exercises(zero.threads[0].steps).slice(1)).toEqual(["practice", "syllogism"]);
  expect(exercises(zero.threads[1].steps).slice(1)).toEqual(["debate", "syllogism"]);
  // an open term comes before the others, a term not met is in no step
  for (let s = 1; s <= 10; s++) {
    expect(planSession(ix, { stages: upTo(5), words: { open: new Set(["cons"]) }, rng: seeded(s) }).threads[0].cats).toEqual(["cons"]);
    const cats = steps(planSession(ix, { stages: upTo(5), words: { unmet: new Set(["form", "ft"]) }, rng: seeded(s) })).flatMap((x) => x.cats);
    expect(cats).not.toContain("form");
    expect(cats).not.toContain("ft");
  }
  // the same numbers, the same plan; nothing asked for, nothing planned
  expect(planSession(ix, { stages: upTo(5), rng: seeded(9) })).toEqual(planSession(ix, { stages: upTo(5), rng: seeded(9) }));
  expect(planSession(ix, { stages: upTo(5), rng: seeded(9), threads: 0 })).toEqual({ threads: [] });
});

test("planSession: the categories of the sessions before wait while the data has others", () => {
  for (let s = 1; s <= 10; s++) {
    const cats = steps(planSession(ix, { stages: [0], rng: seeded(s), threads: 1, avoid: new Set(["red", "round"]) })).flatMap((x) => x.cats);
    expect(cats).not.toContain("red");
    expect(cats).not.toContain("round");
  }
  // with everything to avoid, a plan is still made
  const all = new Set(DATA.cats.map((c) => c.id));
  expect(planSession(ix, { stages: [0], rng: seeded(1), threads: 1, avoid: all }).threads.length).toBe(1);
});

// ---- a miss comes back ----

test("comeBacks: a missed step returns as another exercise on the same categories, one the session has not had", () => {
  const o: SessionOptions = { stages: [0], rng: seeded(3) };
  const plan: SessionPlan = { threads: [pairThread(ix, "red", "round", { ...o, first: "categories", two: "practice" })!] };
  const [one, two, three] = plan.threads[0].steps;
  const back = (s: SessionStep) => comeBacks(ix, plan, new Set([stepKey(s)]), { stages: [0], rng: seeded(5) });
  // nothing missed, nothing back
  expect(comeBacks(ix, plan, new Set(), o)).toEqual([]);
  // a missed Categories comes back as a thing to name
  expect(back(one)).toEqual([{ given: { exercise: "instance", cats: ["red", "round"] }, cats: ["red", "round"], tie: "Two terms you missed earlier. This time you name the thing.", again: true }]);
  // a missed relation has had its syllogism in the thread: it comes back as a thing to name
  expect(back(two)).toMatchObject([{ given: { exercise: "instance" }, again: true }]);
  // a missed syllogism comes back as its reason and predicate statement by statement, Relations having been asked
  expect(back(three)).toMatchObject([{ given: { exercise: "debate" }, tie: "The reason and the predicate of the syllogism you missed, statement by statement.", again: true }]);
  // a thread brings one question back however many of its steps were missed: for its first miss
  const both = comeBacks(ix, plan, new Set([stepKey(one), stepKey(two)]), { stages: [0], rng: seeded(5) });
  expect(exercises(both)).toEqual(["instance"]);
  expect(comeBacks(ix, plan, new Set(plan.threads[0].steps.map(stepKey)), { stages: [0], rng: seeded(5) })).toEqual(both);
  // what came back before stands with the plan as asked: a later miss on the same pair takes the next side that is left
  const after: SessionPlan = { threads: [{ kind: "pair", cats: [], steps: both }, ...plan.threads] };
  expect(exercises(comeBacks(ix, after, new Set([stepKey(two)]), { stages: [0], rng: seeded(5) }))).toEqual(["debate"]);
});

test("how a session went: a miss is a wrong or a partly right answer, and the tally counts each step once", () => {
  expect(["ok", "part", "bad", "pend", "skip", "", null, undefined].map(sessionMiss)).toEqual([false, true, true, false, false, false, false, false]);
  expect(sessionTally(["ok", "ok", "part", "bad", "pend", "skip", "", null])).toEqual({ n: 8, right: 2, partly: 1, wrong: 1, waiting: 1, skipped: 3 });
  expect(sessionTally([])).toEqual({ n: 0, right: 0, partly: 0, wrong: 0, waiting: 0, skipped: 0 });
  expect(SESSION_QUESTIONS).toBe(9);
});

test("threadName: a thread is called by its term, or by its two terms", () => {
  const o: SessionOptions = { stages: upTo(5), rng: seeded(2) };
  expect(threadName(ix, termThread(ix, "form", { ...o, steps: 3 })!)).toBe("Form");
  expect(threadName(ix, pairThread(ix, "red", "round", { stages: [0], rng: seeded(3) })!)).toBe("Red things · Round things");
  expect(threadName(ix, { cats: ["nowhere"] })).toBe("Nowhere");
});

test("comeBacks: a missed step of a term thread, and one term alone", () => {
  const o: SessionOptions = { stages: upTo(5), rng: seeded(2) };
  const plan: SessionPlan = { threads: [termThread(ix, "form", { ...o, steps: 3 })!] };
  for (const s of plan.threads[0].steps) {
    const back = comeBacks(ix, plan, new Set([stepKey(s)]), { stages: upTo(5), rng: seeded(6) });
    expect(back.length).toBe(1);
    expect(back[0].again).toBe(true);
    expect(back[0].cats).toContain("form");
    expect(plan.threads[0].steps.map(stepKey)).not.toContain(stepKey(back[0]));
    expect(back[0].tie).toMatch(s.given.exercise === "syllogism" ? /^The reason and the predicate of the syllogism you missed/ : s.cats.length === 1 ? /^A term you missed earlier/ : /^Two terms you missed earlier/);
  }
});

// ---- the open data ----

test("on the open data, every step of a plan is a question the data makes for the learner, and none comes twice", () => {
  for (const top of [0, 1, 3, 5, 9, ALL[ALL.length - 1]]) for (let seed = 1; seed <= 6; seed++) {
    const o: SessionOptions = { stages: upTo(top), rng: seeded(seed * 31 + top) };
    const plan = planSession(real, o), all = steps(plan), at = "stage " + top + ", seed " + seed;
    expect(plan.threads.length, at).toBe(SESSION_THREADS);
    for (const t of plan.threads) {
      expect(t.steps.length, at).toBe(3);
      expect(t.steps[0].tie, at).toBe("");
      for (const s of t.steps.slice(1)) expect(s.tie, at).not.toBe("");
      // a pair ends in a reason; a term does where the data has one for it, else beside a partner
      if (t.kind === "pair") expect(t.steps[2].given.exercise, at).toBe("syllogism");
      else expect(["syllogism", "practice", "debate"], at).toContain(t.steps[2].given.exercise);
    }
    // a session moves between the exercises
    expect(new Set(exercises(all)).size, at).toBeGreaterThanOrEqual(4);
    expect(new Set(all.map(stepKey)).size, at).toBe(all.length);
    for (const s of all) expect(givenQuestion(real, s.given, { stages: o.stages, rng: seeded(seed) }), at + ": " + stepKey(s)).not.toBeNull();
    // every miss comes back, as such a question too: another exercise on the categories of the one missed, and none the session has had
    const keys = new Set(all.map(stepKey));
    for (const s of all) {
      const back = comeBacks(real, plan, new Set([stepKey(s)]), { stages: o.stages, rng: seeded(seed) });
      expect(back.length, at + ": " + stepKey(s)).toBe(1);
      expect(back[0].again, at).toBe(true);
      expect(back[0].tie, at).not.toBe("");
      expect(keys.has(stepKey(back[0])), at + ": " + stepKey(back[0])).toBe(false);
      for (const x of s.cats) expect(back[0].cats, at + ": " + stepKey(back[0])).toContain(x);
      expect(givenQuestion(real, back[0].given, { stages: o.stages, rng: seeded(seed) }), at + ": " + stepKey(back[0])).not.toBeNull();
    }
    // with everything missed, one question comes back for each thread, and none of them twice
    const every = comeBacks(real, plan, keys, { stages: o.stages, rng: seeded(seed) }).map(stepKey);
    expect(every.length, at).toBe(plan.threads.length);
    expect(new Set([...keys, ...every]).size, at).toBe(keys.size + every.length);
  }
});

test("on the open data, none of the three replies to a syllogism is rare over the sessions", () => {
  const said: Record<string, number> = { accept: 0, reason: 0, pervasion: 0 };
  for (let seed = 1; seed <= 20; seed++) {
    const o = { stages: upTo(5), rng: seeded(seed) };
    for (const s of steps(planSession(real, o))) {
      if (s.given.exercise !== "syllogism") continue;
      const q = givenQuestion(real, s.given, { stages: o.stages, rng: seeded(seed) });
      if (q?.exercise === "syllogism") said[q.syllogism.answer]++;
    }
  }
  // some sixty syllogisms; "I accept" needs a pervasion that holds, which fewer pairs have
  for (const k of Object.keys(said)) expect(said[k], k + " " + JSON.stringify(said)).toBeGreaterThanOrEqual(6);
});
