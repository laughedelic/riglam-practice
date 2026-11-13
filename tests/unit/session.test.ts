// src/domain/session.ts: the plan of a session of mixed practice. Made-up data with known classes and stages for the rules of a round, and the
// open data for what must hold for every plan: each step is a question the data can make for the learner, and no question comes twice.
import { expect, test } from "vitest";
import { makeIndex } from "../../src/ai-shared";
import type { DrillData } from "../../src/ai-shared";
import { givenQuestion } from "../../src/domain/given";
import { SESSION_EXERCISES, SESSION_MIX, SESSION_QUESTIONS, SESSION_ROUNDS, comeBacks, pairRound, planSession, sessionFrom, sessionMiss, sessionMisses, sessionMix, sessionSize, sessionTally, sessionTerm, stepKey, termRound, roundName } from "../../src/domain/session";
import type { SessionExercise, SessionOptions, SessionPlan, SessionStep } from "../../src/domain/session";
import { STAGES, poolAt, topStage } from "../../src/domain/stages";
import { buildPool } from "../../src/domain/universe";
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
const steps = (p: SessionPlan): SessionStep[] => p.rounds.flatMap((t) => t.steps);
const exercises = (ss: readonly SessionStep[]) => ss.map((s) => s.given.exercise);

// ---- a round on one pair ----

test("pairRound: one example, the two terms, a reason, all on the same two categories", () => {
  const t = pairRound(ix, "red", "round", { stages: [0], rng: seeded(1), first: "categories", two: "practice" })!;
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
  // the other exercises of the first two steps
  const other = pairRound(ix, "red", "round", { stages: [0], rng: seeded(1), first: "instance", two: "debate" })!;
  expect(exercises(other.steps)).toEqual(["instance", "debate", "syllogism"]);
  expect(other.steps[0].given).toEqual({ exercise: "instance", cats: ["red", "round"] });
  expect(other.steps[1].tie).toBe("The same two terms, now as a pair.");
  // Find a pair is not in the mix unless it is added: asked for without it, the round closes with a reason
  expect(exercises(pairRound(ix, "red", "round", { stages: [0], rng: seeded(1), first: "instance", two: "debate", last: "find" })!.steps)).toEqual(["instance", "debate", "syllogism"]);
});

test("pairRound: the thing of the first step returns as the subject when the reply allows, and the tie says so", () => {
  let back = 0;
  for (let s = 1; s <= 40; s++) {
    const t = pairRound(ix, "food", "fruit", { stages: [0], rng: seeded(s), first: "categories" })!;
    const thing = (t.steps[0].given as { thing: string }).thing, subject = (t.steps[2].given as { subject: string }).subject;
    expect(t.steps[2].tie.startsWith(thing[0].toUpperCase() + thing.slice(1) + " comes back as the subject. ")).toBe(subject === thing);
    if (subject === thing) back++;
  }
  expect(back).toBeGreaterThan(20);
});

test("pairRound: null for what the data cannot make for the learner", () => {
  expect(pairRound(ix, "red", "red", { stages: [0], rng: seeded(1) })).toBeNull();
  expect(pairRound(ix, "red", "nowhere", { stages: [0], rng: seeded(1) })).toBeNull();
  expect(pairRound(ix, "col", "red", { stages: ALL, rng: seeded(1) })).toBeNull();                          // a pair the data does not judge
  expect(pairRound(ix, "form", "cons", { stages: [0, 1, 2], rng: seeded(1) })).toBeNull();                  // Consciousness opens at stage 3
  expect(pairRound(ix, "form", "cons", { stages: [0, 1, 2, 3], rng: seeded(1) })).not.toBeNull();
  expect(pairRound(ix, "form", "cons", { stages: [0, 1, 2, 3], words: { unmet: new Set(["cons"]) }, rng: seeded(1) })).toBeNull();
});

// ---- a round on one term ----

test("termRound: the term from several sides, each time beside another partner", () => {
  const t = termRound(ix, "form", { stages: upTo(5), rng: seeded(2) })!;
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
  // a short round keeps its ends: a thing first, a reason last
  const short = termRound(ix, "form", { stages: upTo(5), rng: seeded(2), steps: 3 })!;
  expect(short.steps.length).toBe(3);
  expect(short.steps[0].given.exercise).toBe("categories");
  expect(short.steps[2].given.exercise).toBe("syllogism");
  // not for a term the learner has not met, or one the data lacks
  expect(termRound(ix, "form", { stages: upTo(5), words: { unmet: new Set(["form"]) }, rng: seeded(2) })).toBeNull();
  expect(termRound(ix, "nowhere", { stages: upTo(5), rng: seeded(2) })).toBeNull();
});

// ---- the session ----

test("planSession: a term round first where the learner has met a term, then pairs about other categories", () => {
  const plan = planSession(ix, { stages: upTo(5), rng: seeded(4) });
  expect(plan.rounds[0].kind).toBe("term");
  expect(plan.rounds[0].steps.length).toBe(3);
  for (const t of plan.rounds.slice(1)) expect(t.kind).toBe("pair");
  // no category of one round is in another
  const seen = new Set<string>();
  for (const t of plan.rounds) { const cats = new Set(t.steps.flatMap((s) => s.cats)); for (const x of cats) { expect(seen.has(x)).toBe(false); seen.add(x); } }
  // at stage 0 there is no course term: pairs only, and by turns the two exercises of the example and of the two terms
  const zero = planSession(ix, { stages: [0], rng: seeded(4), rounds: 2 });
  expect(zero.rounds.map((t) => t.kind)).toEqual(["pair", "pair"]);
  expect(exercises(zero.rounds[0].steps).slice(1)).toEqual(["practice", "syllogism"]);
  expect(exercises(zero.rounds[1].steps).slice(1)).toEqual(["debate", "syllogism"]);
  // an open term comes before the others, a term not met is in no step
  for (let s = 1; s <= 10; s++) {
    expect(planSession(ix, { stages: upTo(5), words: { open: new Set(["cons"]) }, rng: seeded(s) }).rounds[0].cats).toEqual(["cons"]);
    const cats = steps(planSession(ix, { stages: upTo(5), words: { unmet: new Set(["form", "ft"]) }, rng: seeded(s) })).flatMap((x) => x.cats);
    expect(cats).not.toContain("form");
    expect(cats).not.toContain("ft");
  }
  // the same numbers, the same plan; nothing asked for, nothing planned
  expect(planSession(ix, { stages: upTo(5), rng: seeded(9) })).toEqual(planSession(ix, { stages: upTo(5), rng: seeded(9) }));
  expect(planSession(ix, { stages: upTo(5), rng: seeded(9), rounds: 0 })).toEqual({ rounds: [] });
});

test("planSession: the categories of the sessions before wait while the data has others", () => {
  for (let s = 1; s <= 10; s++) {
    const cats = steps(planSession(ix, { stages: [0], rng: seeded(s), rounds: 1, avoid: new Set(["red", "round"]) })).flatMap((x) => x.cats);
    expect(cats).not.toContain("red");
    expect(cats).not.toContain("round");
  }
  // with everything to avoid, a plan is still made
  const all = new Set(DATA.cats.map((c) => c.id));
  expect(planSession(ix, { stages: [0], rng: seeded(1), rounds: 1, avoid: all }).rounds.length).toBe(1);
});

// ---- a miss comes back ----

test("comeBacks: a missed step returns as another exercise on the same categories, one the session has not had", () => {
  const o: SessionOptions = { stages: [0], rng: seeded(3) };
  const plan: SessionPlan = { rounds: [pairRound(ix, "red", "round", { ...o, first: "categories", two: "practice" })!] };
  const [one, two, three] = plan.rounds[0].steps;
  const back = (s: SessionStep) => comeBacks(ix, plan, new Set([stepKey(s)]), { stages: [0], rng: seeded(5) });
  // nothing missed, nothing back
  expect(comeBacks(ix, plan, new Set(), o)).toEqual([]);
  // a missed Categories comes back as a thing to name
  expect(back(one)).toEqual([{ given: { exercise: "instance", cats: ["red", "round"] }, cats: ["red", "round"], tie: "Two terms you missed earlier. This time you name the thing.", again: true }]);
  // a missed relation has had its syllogism in the round: it comes back as a thing to name
  expect(back(two)).toMatchObject([{ given: { exercise: "instance" }, again: true }]);
  // a missed syllogism comes back as its reason and predicate statement by statement, Relations having been asked
  expect(back(three)).toMatchObject([{ given: { exercise: "debate" }, tie: "The reason and the predicate of the syllogism you missed, statement by statement.", again: true }]);
  // a round brings one question back however many of its steps were missed: for its first miss
  const both = comeBacks(ix, plan, new Set([stepKey(one), stepKey(two)]), { stages: [0], rng: seeded(5) });
  expect(exercises(both)).toEqual(["instance"]);
  expect(comeBacks(ix, plan, new Set(plan.rounds[0].steps.map(stepKey)), { stages: [0], rng: seeded(5) })).toEqual(both);
  // what came back before stands with the plan as asked: a later miss on the same pair takes the next side that is left
  const after: SessionPlan = { rounds: [{ kind: "pair", cats: [], steps: both }, ...plan.rounds] };
  expect(exercises(comeBacks(ix, after, new Set([stepKey(two)]), { stages: [0], rng: seeded(5) }))).toEqual(["debate"]);
});

test("how a session went: a miss is a wrong or a partly right answer, and the tally counts each step once", () => {
  expect(["ok", "part", "bad", "pend", "skip", "", null, undefined].map(sessionMiss)).toEqual([false, true, true, false, false, false, false, false]);
  expect(sessionTally(["ok", "ok", "part", "bad", "pend", "skip", "", null])).toEqual({ n: 8, right: 2, partly: 1, wrong: 1, waiting: 1, skipped: 3 });
  expect(sessionTally([])).toEqual({ n: 0, right: 0, partly: 0, wrong: 0, waiting: 0, skipped: 0 });
  expect(SESSION_QUESTIONS).toBe(9);
});

test("roundName: a round is called by its term, or by its two terms", () => {
  const o: SessionOptions = { stages: upTo(5), rng: seeded(2) };
  expect(roundName(ix, termRound(ix, "form", { ...o, steps: 3 })!)).toBe("Form");
  expect(roundName(ix, pairRound(ix, "red", "round", { stages: [0], rng: seeded(3) })!)).toBe("Red things · Round things");
  expect(roundName(ix, { cats: ["nowhere"] })).toBe("Nowhere");
});

test("comeBacks: a missed step of a term round, and one term alone", () => {
  const o: SessionOptions = { stages: upTo(5), rng: seeded(2) };
  const plan: SessionPlan = { rounds: [termRound(ix, "form", { ...o, steps: 3 })!] };
  for (const s of plan.rounds[0].steps) {
    const back = comeBacks(ix, plan, new Set([stepKey(s)]), { stages: upTo(5), rng: seeded(6) });
    expect(back.length).toBe(1);
    expect(back[0].again).toBe(true);
    expect(back[0].cats).toContain("form");
    expect(plan.rounds[0].steps.map(stepKey)).not.toContain(stepKey(back[0]));
    expect(back[0].tie).toMatch(s.given.exercise === "syllogism" ? /^The reason and the predicate of the syllogism you missed/ : s.cats.length === 1 ? /^A term you missed earlier/ : /^Two terms you missed earlier/);
  }
});

// ---- what a session is made of: the mix, and what it is drawn from ----

test("the mix and what a session is drawn from, as they are kept", () => {
  expect(SESSION_MIX).toEqual(["practice", "debate", "syllogism", "categories", "instance"]);
  expect(sessionMix(null)).toEqual(SESSION_MIX);
  expect(sessionMix(undefined)).toEqual(SESSION_MIX);
  expect(sessionMix("categories,practice")).toEqual(["practice", "categories"]);
  expect(sessionMix(SESSION_EXERCISES.join(","))).toEqual(SESSION_EXERCISES);
  // a name that is no exercise is passed over; fewer than two are no mix
  expect(sessionMix("find,nowhere,practice")).toEqual(["practice", "find"]);
  expect(sessionMix("practice")).toEqual(SESSION_MIX);
  expect(sessionMix("")).toEqual(SESSION_MIX);
  expect(sessionMix("constructor,__proto__")).toEqual(SESSION_MIX);
  expect(["all", "new", "missed", "", "newest", null, undefined].map(sessionFrom)).toEqual(["all", "new", "missed", "all", "all", "all", "all"]);
  // how long a session is: three to a round while the mix has three exercises for it
  expect(sessionSize()).toBe(SESSION_QUESTIONS);
  expect(sessionSize(SESSION_EXERCISES)).toBe(9);
  expect(sessionSize(["categories", "instance", "practice"])).toBe(9);
  expect(sessionSize(["practice", "debate"])).toBe(6);
  expect(sessionSize(["syllogism", "find"])).toBe(6);
  expect(sessionSize(["practice", "debate", "find"])).toBe(8);     // the term round has no step of Find a pair
  expect(sessionSize(SESSION_MIX, 1)).toBe(3);
  // a session that cannot open with a term round has pair rounds only
  expect(sessionSize(["practice", "debate", "find"], SESSION_ROUNDS, false)).toBe(9);
  expect(sessionSize(["practice", "debate"], SESSION_ROUNDS, false)).toBe(6);
  expect(sessionSize(SESSION_MIX, SESSION_ROUNDS, false)).toBe(SESSION_QUESTIONS);
  // it can open with one once the learner has met a course term of their stages: none at the first stage, none while every term waits for its stop
  expect(sessionTerm(ix, { stages: [0] })).toBe(false);
  expect(sessionTerm(ix, { stages: upTo(1) })).toBe(true);
  expect(sessionTerm(ix, { stages: upTo(5), words: { unmet: new Set(["ft", "form", "cons", "col"]) } })).toBe(false);
  expect(sessionTerm(ix, { stages: upTo(5), words: { unmet: new Set(["ft", "form", "cons"]) } })).toBe(true);
  // and the count is the plan's: at the first stage, a mix whose term round would be shorter than its pair rounds
  const mix: SessionExercise[] = ["practice", "debate", "find"];
  for (let s = 1; s <= 5; s++) {
    const zero = planSession(ix, { stages: [0], mix, rounds: 2, rng: seeded(s) });
    expect(zero.rounds.map((t) => t.kind)).toEqual(["pair", "pair"]);
    expect(steps(zero).length).toBe(sessionSize(mix, 2, sessionTerm(ix, { stages: [0] })));
  }
});

test("pairRound: the round is walked by the exercises of the mix, the other of a place stepping in for a place that has none", () => {
  const walk = (mix: SessionExercise[], o: object = {}) => pairRound(ix, "red", "round", { stages: [0], rng: seeded(1), first: "categories", two: "practice", ...o, mix });
  // with Find a pair in the mix a round can close with it: the relation was said in the step before, so the line may say that it is the same
  const found = walk([...SESSION_EXERCISES], { last: "find" })!;
  expect(exercises(found.steps)).toEqual(["categories", "practice", "find"]);
  expect(found.steps[2]).toEqual({ given: { exercise: "find", relation: "4" }, cats: ["red", "round"], tie: "The same relation, the other way round: you name another pair that has it." });
  expect(exercises(walk([...SESSION_EXERCISES])!.steps)).toEqual(["categories", "practice", "syllogism"]);
  // without the exercise asked for, the other of its place
  expect(exercises(walk(["instance", "debate", "find"])!.steps)).toEqual(["instance", "debate", "find"]);
  // a place the mix has nothing for: the second exercise of another place, the relation said before it is walked statement by statement
  const terms = walk(["categories", "instance", "practice", "debate"], { two: "debate" })!;
  expect(exercises(terms.steps)).toEqual(["categories", "practice", "debate"]);
  expect(terms.steps[2].tie).toBe("The same pair, now statement by statement.");
  expect(exercises(walk(["practice", "debate", "syllogism"])!.steps)).toEqual(["practice", "debate", "syllogism"]);
  // the thing is named before a thing is judged
  const things = walk(["categories", "instance", "syllogism"])!;
  expect(exercises(things.steps)).toEqual(["instance", "categories", "syllogism"]);
  expect(things.steps[1].tie).toBe("The same two terms are now among the categories you judge a thing by.");
  // a mix of two is a round of two, and its first step carries nothing over
  for (const mix of [["practice", "debate"], ["categories", "instance"], ["syllogism", "find"], ["instance", "find"], ["categories", "syllogism"], ["debate", "find"]] as SessionExercise[][]) {
    const t = walk(mix)!;
    expect(exercises(t.steps).sort(), mix.join()).toEqual([...mix].sort());
    expect(t.steps[0].tie, mix.join()).toBe("");
    expect(t.steps[1].tie, mix.join()).not.toBe("");
  }
  // the relation of the pair is not told by the line before it was asked
  expect(walk(["instance", "find"])!.steps[1].tie).toBe("Now the other way round: you are given a relation, and name a pair that has it.");
  expect(walk(["debate", "find"])!.steps[1].tie).toMatch(/^The same relation/);
  // one exercise is no round
  expect(walk(["practice"])).toBeNull();
  expect(walk([])).toBeNull();
});

test("termRound: only the exercises of the mix, two steps at the least", () => {
  const o = { stages: upTo(5), rng: seeded(2) };
  const two = termRound(ix, "form", { ...o, mix: ["practice", "debate"] })!;
  expect(exercises(two.steps)).toEqual(["practice", "debate"]);
  expect(two.steps[0].tie).toBe("");
  expect(two.steps[1].tie).toMatch(/^Form again/);
  const three = termRound(ix, "form", { ...o, steps: 3, mix: ["instance", "practice", "debate", "find"] })!;
  expect(exercises(three.steps)).toEqual(["instance", "practice", "debate"]);
  expect(three.steps[0].tie).toBe("");
  // Find a pair has no step in it: with one other exercise there is no round
  expect(termRound(ix, "form", { ...o, mix: ["syllogism", "find"] })).toBeNull();
});

test("planSession: rounds added to a session under way are pair rounds, and go on taking turns", () => {
  const o: SessionOptions = { stages: upTo(5), rng: seeded(4), rounds: 2 };
  expect(planSession(ix, o).rounds[0].kind).toBe("term");
  const odd = planSession(ix, { ...o, rng: seeded(4), turn: 1 });
  expect(odd.rounds.map((t) => t.kind)).toEqual(["pair", "pair"]);
  expect(exercises(odd.rounds[0].steps).slice(1)).toEqual(["debate", "syllogism"]);
  expect(exercises(odd.rounds[1].steps).slice(1)).toEqual(["practice", "syllogism"]);
  // with Find a pair in the mix, every other pair round closes with it
  const found = planSession(ix, { stages: [0], rng: seeded(4), rounds: 2, mix: SESSION_EXERCISES });
  expect(found.rounds.map((t) => t.steps[2].given.exercise)).toEqual(["syllogism", "find"]);
});

test("planSession: drawn from the newest stage, the pairs are new at it while there are any", () => {
  const stages = upTo(3), top = topStage(stages), at = new Map(poolAt(ix, buildPool(ix), stages).map((e) => [[e.a, e.b].sort().join("|"), e.st]));
  const stageOf = (p: SessionPlan) => at.get([...p.rounds[0].cats].sort().join("|"));
  let other = 0;
  for (let s = 1; s <= 20; s++) {
    expect(stageOf(planSession(ix, { stages, rng: seeded(s), rounds: 1, from: "new" })), "seed " + s).toBe(top);
    if (stageOf(planSession(ix, { stages, rng: seeded(s), rounds: 1 })) !== top) other++;
  }
  expect(other).toBeGreaterThan(0);
  // its terms come first too, before an open term of another stage
  for (let s = 1; s <= 10; s++) expect(planSession(ix, { stages, rng: seeded(s), from: "new", words: { open: new Set(["form"]) } }).rounds[0].cats).toEqual(["cons"]);
  // at a stage with nothing new of its own, a plan is still made
  expect(planSession(ix, { stages: upTo(4), rng: seeded(1), from: "new" }).rounds.length).toBe(SESSION_ROUNDS);
});

test("planSession: drawn from what was missed, the missed pairs come first, then the pairs with a missed category", () => {
  const o: SessionOptions = { stages: [0], rounds: 1, from: "missed" };
  for (let s = 1; s <= 10; s++) {
    // the pair itself, also when it was in the session before
    expect([...planSession(ix, { ...o, rng: seeded(s), missed: [["food", "fruit"]], avoid: new Set(["food", "fruit"]) }).rounds[0].cats].sort()).toEqual(["food", "fruit"]);
    // a category missed by itself, or with what is no pair: a pair that has it
    expect(planSession(ix, { ...o, rng: seeded(s), missed: [["wooden"]] }).rounds[0].cats).toContain("wooden");
    expect(planSession(ix, { ...o, rng: seeded(s), missed: [["wooden", "nowhere", "red"]] }).rounds[0].cats.some((x) => x === "wooden" || x === "red")).toBe(true);
    // with nothing missed, as from everything; and what was missed is not read unless the session is drawn from it
    expect(planSession(ix, { ...o, rng: seeded(s), missed: [] })).toEqual(planSession(ix, { stages: [0], rounds: 1, rng: seeded(s) }));
    expect(planSession(ix, { stages: [0], rounds: 1, rng: seeded(s), missed: [["food", "fruit"]] })).toEqual(planSession(ix, { stages: [0], rounds: 1, rng: seeded(s) }));
  }
  // a round added to a session passes over what the session has had, also what was missed, while the data has other pairs
  for (let s = 1; s <= 10; s++) {
    const more = planSession(ix, { ...o, rng: seeded(s), missed: [["food", "fruit"], ["red", "round"]], turn: 1, had: new Set(["food", "fruit"]) });
    expect([...more.rounds[0].cats].sort()).toEqual(["red", "round"]);
    const cats = planSession(ix, { stages: [0], rounds: 1, rng: seeded(s), turn: 1, had: new Set(["red", "round", "wooden"]) }).rounds[0].cats;
    for (const x of ["red", "round", "wooden"]) expect(cats).not.toContain(x);
  }
  expect(planSession(ix, { ...o, rng: seeded(1), turn: 1, had: new Set(DATA.cats.map((c) => c.id)) }).rounds.length).toBe(1);
  // a term missed by itself opens the session, after the open terms; the terms of a missed pair are left for the round on that pair
  for (let s = 1; s <= 10; s++) {
    expect(planSession(ix, { stages: upTo(5), rng: seeded(s), from: "missed", missed: [["cons"]], avoid: new Set(["cons"]) }).rounds[0].cats).toEqual(["cons"]);
    expect(planSession(ix, { stages: upTo(5), rng: seeded(s), from: "missed", missed: [["form"]], words: { open: new Set(["cons"]) } }).rounds[0].cats).toEqual(["cons"]);
    const pair = planSession(ix, { stages: upTo(5), rng: seeded(s), from: "missed", missed: [["red", "round"]], avoid: new Set(["red", "round"]) });
    expect(pair.rounds[0].kind).toBe("term");
    expect(pair.rounds.filter((t) => t.kind === "pair").map((t) => [...t.cats].sort().join("|")), "seed " + s).toContain("red|round");
  }
  // a term of a missed pair is kept for the round on that pair, open or not: the term round is not about it and none of its steps is beside it
  const rounds = (plan: SessionPlan, kind: "term" | "pair") => plan.rounds.filter((t) => t.kind === kind);
  for (let s = 1; s <= 10; s++) {
    const plan = planSession(ix, { stages: upTo(5), rng: seeded(s), from: "missed", missed: [["form", "red"]], words: { open: new Set(["form"]) } });
    const opening = rounds(plan, "term").flatMap((t) => t.steps.flatMap((x) => x.cats));
    expect(opening, "seed " + s).not.toContain("form");
    expect(opening, "seed " + s).not.toContain("red");
    expect(rounds(plan, "pair").map((t) => [...t.cats].sort().join("|")), "seed " + s).toContain("form|red");
    // where it is the only term the learner has met, the session has no term round, and the pair has its round
    const only = planSession(ix, { stages: upTo(5), rng: seeded(s), from: "missed", missed: [["form", "red"]], words: { unmet: new Set(["ft", "cons", "col"]) } });
    expect(rounds(only, "term"), "seed " + s).toEqual([]);
    expect(rounds(only, "pair").map((t) => [...t.cats].sort().join("|")), "seed " + s).toContain("form|red");
    // a missed pair the learner cannot be asked holds nothing back: the open term opens the session as ever
    expect(planSession(ix, { stages: upTo(5), rng: seeded(s), from: "missed", missed: [["form", "nowhere"]], words: { open: new Set(["form"]) } }).rounds[0].cats, "seed " + s).toEqual(["form"]);
  }
});

test("sessionMisses: of each question the last answer counts, the newest miss first", () => {
  const misses = sessionMisses([
    { at: "2026-01-05", catA: "red", catB: "round", grade: "bad" },
    { at: "2026-01-01", catA: "food", catB: "fruit", grade: "bad" },
    { at: "2026-01-02", mode: "debate", catA: "fruit", catB: "food", grade: "ok" },                    // put right since, by another exercise
    { at: "2026-01-03", mode: "syllogism", catA: "form", catB: "cons", grade: "part", correct: true },
    { at: "2026-01-04", mode: "instance", cats: ["wooden", "round"], grade: "bad" },
    { at: "2026-01-06", mode: "instance", cats: ["red", "food"], grade: "pend" },                       // waiting for a check is no miss
    { at: "2026-01-07", mode: "categories", grade: "part", rows: [{ cat: "col", yes: true, said: false }, { cat: "form", yes: true, said: true }] },
    { at: "2026-01-08", catA: "ft", catB: null, correct: false },                                       // one category alone says nothing of a pair
    { at: "2026-01-09", mode: "find", catA: "ft", catB: "form", correct: false },                       // an older answer has no grade
  ]);
  expect(misses).toEqual([["form", "ft"], ["col"], ["red", "round"], ["round", "wooden"], ["cons", "form"]]);
  expect(sessionMisses([])).toEqual([]);
  // the newest forty
  const many = sessionMisses(Array.from({ length: 60 }, (_, i) => ({ at: "2026-02-" + String(i).padStart(3, "0"), catA: "a" + i, catB: "b", grade: "bad" })));
  expect(many.length).toBe(40);
  expect(many[0]).toEqual(["a59", "b"]);
});

test("comeBacks: a miss comes back only as an exercise of the mix", () => {
  const o: SessionOptions = { stages: [0], rng: seeded(3), mix: ["categories", "practice", "syllogism"] };
  const plan: SessionPlan = { rounds: [pairRound(ix, "red", "round", { ...o, first: "categories", two: "practice" })!] };
  const [one, two, three] = plan.rounds[0].steps;
  const back = (s: SessionStep, mix: SessionExercise[]) => exercises(comeBacks(ix, plan, new Set([stepKey(s)]), { stages: [0], rng: seeded(5), mix }));
  // the mix has had its three exercises on the pair: nothing more to ask of it
  for (const s of [one, two, three]) expect(back(s, ["categories", "practice", "syllogism"])).toEqual([]);
  // with one more in the mix, that one
  expect(back(one, ["categories", "practice", "syllogism", "debate"])).toEqual(["debate"]);
  expect(back(three, ["categories", "practice", "syllogism", "instance"])).toEqual(["instance"]);
});

// ---- the open data ----

test("on the open data, a session of any mix asks only its exercises, three to a round while the mix has them", () => {
  const mixes: SessionExercise[][] = [
    [...SESSION_EXERCISES], ["practice", "debate"], ["categories", "instance"], ["syllogism", "find"], ["practice", "find"], ["categories", "syllogism"],
    ["instance", "debate", "find"], ["practice", "debate", "syllogism"], ["categories", "instance", "syllogism"], ["debate", "syllogism", "categories", "instance"],
  ];
  for (const mix of mixes) for (const top of [0, 5]) for (let seed = 1; seed <= 2; seed++) {
    const o: SessionOptions = { stages: upTo(top), rng: seeded(seed * 17 + top), mix };
    const plan = planSession(real, o), all = steps(plan), at = mix.join() + ", stage " + top + ", seed " + seed;
    expect(plan.rounds.length, at).toBe(SESSION_ROUNDS);
    const inTerm = mix.filter((x) => x !== "find").length;
    for (const t of plan.rounds) {
      expect(t.steps.length, at).toBe(Math.min(3, t.kind === "pair" ? mix.length : inTerm));
      expect(t.steps[0].tie, at).toBe("");
      for (const s of t.steps.slice(1)) expect(s.tie, at).not.toBe("");
    }
    if (plan.rounds[0].kind === "term") expect(all.length, at).toBe(sessionSize(mix));
    for (const s of all) expect(mix, at).toContain(s.given.exercise);
    expect(new Set(all.map(stepKey)).size, at).toBe(all.length);
    for (const s of all) expect(givenQuestion(real, s.given, { stages: o.stages, rng: seeded(seed) }), at + ": " + stepKey(s)).not.toBeNull();
    // what comes back is of the mix too, and no question the session has had
    const keys = new Set(all.map(stepKey));
    for (const s of comeBacks(real, plan, keys, { stages: o.stages, rng: seeded(seed), mix })) {
      expect(mix, at).toContain(s.given.exercise);
      expect(keys.has(stepKey(s)), at).toBe(false);
      expect(givenQuestion(real, s.given, { stages: o.stages, rng: seeded(seed) }), at + ": " + stepKey(s)).not.toBeNull();
    }
  }
}, 15_000); // forty plans over the open data: a second here, several on a busy machine

test("on the open data, every step of a plan is a question the data makes for the learner, and none comes twice", () => {
  for (const top of [0, 1, 3, 5, 9, ALL[ALL.length - 1]]) for (let seed = 1; seed <= 6; seed++) {
    const o: SessionOptions = { stages: upTo(top), rng: seeded(seed * 31 + top) };
    const plan = planSession(real, o), all = steps(plan), at = "stage " + top + ", seed " + seed;
    expect(plan.rounds.length, at).toBe(SESSION_ROUNDS);
    for (const t of plan.rounds) {
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
    // with everything missed, one question comes back for each round, and none of them twice
    const every = comeBacks(real, plan, keys, { stages: o.stages, rng: seeded(seed) }).map(stepKey);
    expect(every.length, at).toBe(plan.rounds.length);
    expect(new Set([...keys, ...every]).size, at).toBe(keys.size + every.length);
  }
}, 15_000); // thirty-six plans over the open data, each step and what comes back for it made: a second here, several on a busy machine

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
