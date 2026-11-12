// src/domain/challenge.ts: a challenge as a document (what is one, and what is wrong with one that is not), the challenges together (a set, by their
// day), its questions (the same for everybody, made from the open data whatever the stages, or from the answer a question brings for what the data does
// not have) and the record a device keeps of each (what comes next, where it stands, whether it still waits, what the roadmap's stop says).
import { expect, test } from "vitest";
import { makeIndex } from "../../src/ai-shared";
import type { DrillData } from "../../src/ai-shared";
import { CARRIED_LINE_MAX, CARRIED_WORDS_MAX, CHALLENGE_MAX, CHALLENGES_MAX, challengeQuestion, checkChallenge, checkChallenges, dayText, freshRecord, isCarried, itemAnswer, itemLine, marked, markOf, nextItem, normRecord, normRecords, readChallenge, readChallenges, standing, stationOf, stopSays, storedRecords, waits } from "../../src/domain/challenge";
import type { Challenge } from "../../src/domain/challenge";
import { grade, gradeDebate } from "../../src/domain/grading";
import { openExamples } from "../../src/domain/known";
import { gradeExample, gradeSyllogism, syllogismText } from "../../src/domain/syllogism";
import type { Syllogism } from "../../src/domain/syllogism";
import type { Pair } from "../../src/domain/types";
import openData from "../../src/data/drill-data.json";
import { challengeReport } from "../../scripts/lib/challenge-report";

const ix = makeIndex(openData as unknown as DrillData);
const WRITTEN = {
  id: "2026-11-07-colors-and-shapes", date: "2026-11-07", title: "Colors and shapes", note: " From Friday's practice. ",
  items: [
    { exercise: "debate", a: "vis", b: "col", labels: ["visible forms", "colors"] },
    { exercise: "practice", a: "col", b: "shape" },
    { exercise: "syllogism", subject: "the roundness of a coin", reason: "vis", predicate: "col" },
    { exercise: "find", relation: "3ab" },
    { exercise: "categories", thing: "the red of a rose", cats: ["col"] },
    { exercise: "instance", cats: ["col", "shape"] },
  ],
};
const CH = readChallenge(WRITTEN) as Challenge;

test("a written challenge is read with nothing in it but what the app reads", () => {
  expect(CH).toEqual({ ...WRITTEN, note: "From Friday's practice." });
  expect(readChallenge({ ...WRITTEN, format: "later", extra: 1, items: [{ exercise: "find", relation: "mi", hint: "x" }] })!.items).toEqual([{ exercise: "find", relation: "mi" }]);
  expect(readChallenge({ ...WRITTEN, note: undefined })!.note).toBe("");
  // a pair's labels are kept as a pair; one left out is drawn when the question is made
  expect(readChallenge({ ...WRITTEN, items: [{ exercise: "practice", a: "col", b: "shape", labels: ["hues"], neg: "b" }] })!.items[0]).toEqual({ exercise: "practice", a: "col", b: "shape", labels: ["hues", null], neg: "b" });
});

test("what is not a challenge says why", () => {
  expect(checkChallenge(null).problems).toEqual(["It is not an object."]);
  expect(checkChallenge([]).challenge).toBeNull();
  const bad = checkChallenge({ id: "has spaces", date: "2026-02-30", title: "", note: 3, items: [] });
  expect(bad.challenge).toBeNull();
  expect(bad.problems.map((p) => p.split(":")[0])).toEqual(["id", "date", "title", "note", "items"]);
  const items = checkChallenge({ ...WRITTEN, items: [WRITTEN.items[0], { exercise: "essay" }, { exercise: "practice", a: "col" }, { exercise: "find", relation: "5" }, { exercise: "categories", thing: "x", size: 40 }] });
  expect(items.problems).toEqual([2, 3, 4, 5].map((n) => "items: question " + n + " is not a question of an exercise."));
  expect(checkChallenge({ ...WRITTEN, items: Array(CHALLENGE_MAX + 1).fill(WRITTEN.items[1]) }).problems).toHaveLength(1);
  expect(checkChallenge({ ...WRITTEN, items: Array(CHALLENGE_MAX).fill(WRITTEN.items[1]) }).problems).toEqual([]);
});

test("its questions are made from the data, the same every time, whatever the learner's stages", () => {
  const made = CH.items.map((_, i) => challengeQuestion(ix, CH, i));
  expect(made.map((q) => q && q.exercise)).toEqual(["debate", "practice", "syllogism", "find", "categories", "instance"]);
  // the same words, references and rows the second time (a pair's id carries the time, so it is left out)
  const again = CH.items.map((_, i) => challengeQuestion(ix, CH, i));
  const plain = (q: unknown) => JSON.parse(JSON.stringify(q, (k, v) => (k === "id" ? undefined : v)));
  expect(again.map(plain)).toEqual(made.map(plain));
  expect(made.map((q) => itemLine(q!))).toEqual([
    { pair: ["visible forms", "colors"] }, { pair: [(made[1] as { pair: { a: string } }).pair.a, "shapes"] },
    { text: expect.stringMatching(/^Take the roundness of a coin\. It follows it is .+ because it is .+\.$/) },
    { text: "Three possibilities, A in B" }, { text: "The red of a rose" }, { text: expect.stringMatching(/^(colors|hues|shapes) · (colors|hues|shapes)$/) },     // Find an instance shows its categories in an order of its own
  ]);
  // what the data answers, for the one who writes the challenge: the relation of a pair, the reply to a syllogism, the rows that hold; Find a pair has no one answer
  expect(made.map((q) => itemAnswer(q!))).toEqual([
    "Three possibilities, B in A", "Mutually exclusive", "There is no pervasion", "", expect.stringMatching(/a color|colors/), expect.any(String),
  ]);
  // another challenge draws its own words: over a few ids the label of a side left open is not always the same
  const labels = new Set(["a", "b", "c", "d", "e", "f", "g", "h"].map((id) => (challengeQuestion(ix, { ...CH, id }, 1) as { pair: { a: string } }).pair.a));
  expect(labels.size).toBeGreaterThan(1);
  // what the data cannot make is null, and a place past the end too
  expect(challengeQuestion(ix, { ...CH, items: [{ exercise: "practice", a: "col", b: "nowhere" }] }, 0)).toBeNull();
  expect(challengeQuestion(ix, CH, 9)).toBeNull();
});

test("a device's record: a new challenge starts again, and the marks follow the grades", () => {
  expect(normRecord(null, CH)).toEqual(freshRecord(CH.id));
  expect(normRecord({ id: "the one before", seen: true, marks: { 0: "ok" } }, CH)).toEqual(freshRecord(CH.id));
  expect(normRecord({ id: CH.id, seen: true, marks: { 0: "ok", 1: "pend", 2: "who knows", 9: "ok", x: "ok" } }, CH)).toEqual({ id: CH.id, seen: true, marks: { 0: "ok", 1: "pend", 2: "pend" } });
  expect(normRecord({ id: CH.id, marks: { 3: "bad" } }, CH).seen).toBe(true);     // answered is seen
  expect(["ok", "part", "bad", "pend", "unk", ""].map(markOf)).toEqual(["ok", "part", "bad", "pend", "pend", "pend"]);
  const r = marked(marked(freshRecord(CH.id), 1, "part"), 1, "ok");
  expect(r).toEqual({ id: CH.id, seen: true, marks: { 1: "ok" } });
});

test("where it stands, and what its station opens", () => {
  const all = [true, true, true], fresh = freshRecord("x"), seen = { ...fresh, seen: true };
  expect(standing(fresh, all)).toBe("new");
  expect(standing(seen, all)).toBe("open");
  expect(stationOf(seen, all)).toEqual({ name: "Start", at: 0, again: false });
  const one = marked(seen, 0, "ok");
  expect(standing(one, all)).toBe("under");
  expect(stationOf(one, all)).toEqual({ name: "Continue", at: 1, again: false });
  expect(nextItem(one, all, 1)).toBe(2);
  expect(nextItem(one, all, 2)).toBe(-1);
  const done = marked(marked(one, 1, "bad"), 2, "pend");
  expect(standing(done, all)).toBe("done");
  expect(stationOf(done, all)).toEqual({ name: "Again", at: 0, again: true });
  expect(nextItem(done, all, 0, true)).toBe(1);
  // a question this device cannot ask is not waited for, and is passed over
  const some = [true, false, true];
  expect(stationOf(one, some)).toEqual({ name: "Continue", at: 2, again: false });
  expect(standing(marked(one, 2, "ok"), some)).toBe("done");
  expect(stationOf(seen, [false, false])).toEqual({ name: "Again", at: -1, again: true });
  expect(standing(seen, [false, false])).toBe("open");
});

test("the day as the page says it", () => {
  expect(dayText("2026-11-07")).toBe("7 Nov");
  expect(dayText("2027-01-31")).toBe("31 Jan");
});

/* ---------- the challenges together: they accumulate ---------- */
const LATER = { id: "2026-11-14-sounds", date: "2026-11-14", title: "Sounds", note: "", items: [{ exercise: "practice", a: "snd", b: "odr" }] };
const SAME_DAY = { ...LATER, id: "2026-11-14-smells", title: "Smells" };

test("the challenges are read as one set, by the day each was given; a challenge alone or a list of them is a set too", () => {
  const later = readChallenge(LATER) as Challenge, smells = readChallenge(SAME_DAY) as Challenge;
  // by their day, and those of one day in the order they were written
  expect(readChallenges({ challenges: [LATER, WRITTEN, SAME_DAY] })).toEqual([CH, later, smells]);
  expect(readChallenges([SAME_DAY, LATER])).toEqual([smells, later]);
  expect(readChallenges(WRITTEN)).toEqual([CH]);
  expect(checkChallenges({ challenges: [LATER, WRITTEN] })).toEqual({ challenges: [CH, later], problems: [] });
  // on a device: one that does not read is left out and the rest stay, an id is taken once, and no more than the most are kept
  expect(readChallenges({ challenges: [LATER, { id: "broken" }, { ...WRITTEN, id: LATER.id }] })).toEqual([later]);
  expect(readChallenges({ challenges: "none" })).toEqual([]);
  expect(readChallenges(null)).toEqual([]);
  const many = Array.from({ length: CHALLENGES_MAX + 5 }, (_, i) => ({ ...LATER, id: "c" + i }));
  expect(readChallenges({ challenges: many })).toHaveLength(CHALLENGES_MAX);
});

test("what keeps a set from being loaded says which challenge, by its place and its id", () => {
  expect(checkChallenges(7).problems).toEqual(["It is not a challenge, a list of them or {challenges: [...]}."]);
  const { problems } = checkChallenges({ challenges: [LATER, { ...WRITTEN, date: "soon" }, { ...SAME_DAY, id: LATER.id }] });
  expect(problems).toEqual([
    "challenge 2 (2026-11-07-colors-and-shapes): date: a day as YYYY-MM-DD.",
    "challenge 3 (2026-11-14-sounds): id: another challenge has this id.",
  ]);
  expect(checkChallenges({ challenges: Array.from({ length: CHALLENGES_MAX + 1 }, (_, i) => ({ ...LATER, id: "c" + i })) }).problems).toEqual(["challenges: at most " + CHALLENGES_MAX + "."]);
});

test("each challenge keeps its own record on a device, by its id; a challenge no longer there takes its record with it", () => {
  const later = readChallenge(LATER) as Challenge;
  const stored = { [CH.id]: { seen: true, marks: { 0: "ok", 9: "ok" } }, gone: { seen: true, marks: { 0: "bad" } }, [later.id]: "x" };
  const rs = normRecords(stored, [CH, later]);
  expect(rs).toEqual({ [CH.id]: { id: CH.id, seen: true, marks: { 0: "ok" } }, [later.id]: freshRecord(later.id) });
  expect(storedRecords(rs)).toEqual({ [CH.id]: { seen: true, marks: { 0: "ok" } }, [later.id]: { seen: false, marks: {} } });
  expect(normRecords(null, [later])).toEqual({ [later.id]: freshRecord(later.id) });
  // a record kept the way of one challenge at a time is of none of them
  expect(normRecords({ id: CH.id, seen: true, marks: { 0: "ok" } }, [CH])).toEqual({ [CH.id]: freshRecord(CH.id) });
});

test("a challenge waits until every question this device can ask has an answer, right or not; the stop says new, then how many wait", () => {
  const all = [true, true, false], r = { ...freshRecord("x"), seen: true };
  expect(waits(r, all)).toBe(true);
  expect(waits(marked(r, 0, "bad"), all)).toBe(true);
  expect(waits(marked(marked(r, 0, "bad"), 1, "pend"), all)).toBe(false);
  expect(waits(r, [false, false])).toBe(false);
  const later = readChallenge(LATER) as Challenge, one = [true];
  const list = (a: object, b: object) => [{ doc: CH, rec: { ...freshRecord(CH.id), ...a }, askable: all }, { doc: later, rec: { ...freshRecord(later.id), ...b }, askable: one }];
  expect(stopSays(list({}, {}))).toEqual({ fresh: true, text: "new", title: "Sounds" });
  expect(stopSays(list({}, { seen: true }))).toEqual({ fresh: true, text: "new", title: "Colors and shapes" });
  expect(stopSays(list({ seen: true }, { seen: true }))).toEqual({ fresh: false, text: "2 open", title: "Sounds" });
  expect(stopSays(list({ seen: true }, { seen: true, marks: { 0: "ok" } }))).toEqual({ fresh: false, text: "1 open", title: "Colors and shapes" });
  expect(stopSays(list({ seen: true, marks: { 0: "ok", 1: "bad" } }, { seen: true, marks: { 0: "ok" } }))).toEqual({ fresh: false, text: "", title: "" });
  expect(stopSays([])).toEqual({ fresh: false, text: "", title: "" });
});

test("the report of written challenges on the data: how each will be asked, what the data answers, and what cannot be loaded", () => {
  const good = challengeReport(openData as unknown as DrillData, WRITTEN);
  expect(good.ok).toBe(true);
  expect(JSON.parse(good.body!)).toEqual({ challenges: [CH] });
  expect(good.lines.slice(0, 3)).toEqual(["1 challenge, by their day:", "", "Colors and shapes (7 Nov, id 2026-11-07-colors-and-shapes)"]);
  expect(good.lines).toContain("  1  Pervasions: visible forms and colors\n       the data answers: Three possibilities, B in A");
  expect(good.lines).toContain("  4  Find a pair: Three possibilities, A in B");
  // a question the data cannot make stops the loading, and says which
  const off = challengeReport(openData as unknown as DrillData, { ...WRITTEN, items: [WRITTEN.items[1], { exercise: "practice", a: "col", b: "nowhere" }] });
  expect(off.ok).toBe(false);
  expect(off.lines.at(-1)).toMatch(/^Not ready: question 2 cannot be asked\./);
  // what is not a challenge has no body
  expect(challengeReport(openData as unknown as DrillData, { id: "x" })).toMatchObject({ ok: false, body: null });
  // several are loaded together, by their day, all in one row
  const two = challengeReport(openData as unknown as DrillData, [LATER, WRITTEN]);
  expect(two.ok).toBe(true);
  expect(JSON.parse(two.body!)).toEqual({ challenges: [CH, readChallenge(LATER)] });
  expect(two.lines[0]).toBe("2 challenges, by their day:");
  expect(two.lines).toContain("Sounds (14 Nov, id 2026-11-14-sounds)");
  // one that cannot be asked keeps them all from loading; two with one id are no set
  expect(challengeReport(openData as unknown as DrillData, [LATER, { ...WRITTEN, items: [{ exercise: "practice", a: "col", b: "nowhere" }] }]).ok).toBe(false);
  expect(challengeReport(openData as unknown as DrillData, [LATER, { ...WRITTEN, id: LATER.id }])).toMatchObject({ ok: false, body: null, lines: ["Not ready:", "  challenge 2 (2026-11-14-sounds): id: another challenge has this id."] });
});

/* ---------- questions that bring their answer: what the data does not have ---------- */
const BIRDS = {
  exercise: "debate", terms: [{ many: "birds", one: "a bird" }, { many: "things that fly", one: "something that flies" }],
  answer: { relation: "4", ex: { both: "a sparrow", anb: "a penguin", bna: "a bat", nei: "a stone" } },
};
const PENGUINS = {
  exercise: "practice", terms: [{ many: "penguins", one: "a penguin" }, { many: "birds", one: "a bird" }],
  answer: { relation: "3ab", ex: { both: "an emperor penguin", bna: "a sparrow", nei: "a stone" }, why: { anb: "Every penguin is a bird." }, note: "Penguins are birds that do not fly." },
};
const BAT = { exercise: "syllogism", says: { subject: "a bat", predicate: "a bird", reason: "something that flies" }, answer: { reason: true, pervasion: false, thesis: false, witness: "a dragonfly" } };
const CARRIED = { ...WRITTEN, id: "2026-11-11-outside-the-data", items: [BIRDS, PENGUINS, BAT, WRITTEN.items[1]] };
const CC = readChallenge(CARRIED) as Challenge;
const at = { now: () => 0 };
const pairAt = (ch: Challenge, i: number) => (challengeQuestion(ix, ch, i, at) as { pair: Pair }).pair;
const syllogismAt = (ch: Challenge, i: number) => (challengeQuestion(ix, ch, i, at) as { syllogism: Syllogism }).syllogism;
const one = (item: unknown) => checkChallenge({ ...WRITTEN, items: [item] });

test("a question that brings its answer is read whole, trimmed, with nothing in it but what the app reads", () => {
  expect(CC.items).toEqual(CARRIED.items);
  expect(CC.items.map(isCarried)).toEqual([true, true, true, false]);
  const loose = one({ ...BIRDS, hint: "x", terms: [{ many: " birds ", one: " a bird ", ru: "птицы" }, BIRDS.terms[1]], answer: { ...BIRDS.answer, ex: { ...BIRDS.answer.ex, other: "x" }, why: {}, source: "class" } });
  expect(loose.challenge!.items).toEqual([BIRDS]);
  // an empty case may be written as null or "", and a syllogism's own lines are kept
  expect(one({ ...PENGUINS, answer: { ...PENGUINS.answer, ex: { ...PENGUINS.answer.ex, anb: null } } }).challenge!.items).toEqual([PENGUINS]);
  const lines = { reason: "A bat flies at night.", thesis: "A bat is a mammal." };
  expect(one({ ...BAT, answer: { ...BAT.answer, lines } }).challenge!.items).toEqual([{ ...BAT, answer: { ...BAT.answer, lines } }]);
});

test("a carried answer that does not hang together says what is wrong with it, by its question", () => {
  const said = (item: unknown) => one(item).problems;
  const pair = (answer: object, extra: object = {}) => said({ ...BIRDS, ...extra, answer: { ...BIRDS.answer, ...answer } });
  expect(said({ exercise: "find", answer: {} })).toEqual(["items: question 1: an answer is carried by a pair (practice, debate) or a syllogism."]);
  expect(pair({}, { terms: [{ many: "birds" }, BIRDS.terms[1]] })[0]).toMatch(/^items: question 1: terms: two sides, each with `many`/);
  expect(pair({}, { terms: [BIRDS.terms[0], BIRDS.terms[0]] })).toEqual(["items: question 1: terms: the two sides are the same."]);
  expect(pair({}, { terms: [{ many: "x".repeat(CARRIED_WORDS_MAX + 1), one: "a bird" }, BIRDS.terms[1]] })[0]).toMatch(/terms: two sides/);
  expect(pair({ relation: "5" })).toEqual(["items: question 1: answer.relation: one of mi, 3ab, 3ba, 4, con."]);
  expect(pair({ ex: "a sparrow" })[0]).toMatch(/answer\.ex: an example by case/);
  expect(pair({ ex: { ...BIRDS.answer.ex, both: 3 } })[0]).toMatch(/answer\.ex: an example by case/);
  // an example for every case the relation has, Neither among them, and none for a case it leaves empty
  expect(pair({ ex: { both: "a sparrow", anb: "a penguin", nei: "a stone" } })).toEqual(["items: question 1: answer.ex: Four possibilities has something that is B not A, and no example is given."]);
  expect(pair({ ex: { both: "a sparrow", anb: "a penguin", bna: "a bat" } })[0]).toMatch(/has something that is neither, and no example is given \(what does not exist counts, such as the horn of a rabbit\)\.$/);
  expect(pair({ relation: "con" })).toEqual(["items: question 1: answer.ex: Mutually exclusive leaves both empty, and it has an example."]);
  expect(pair({ why: { both: "x" } })).toEqual(["items: question 1: answer.why: both is not empty."]);
  expect(pair({ why: { both: "x".repeat(CARRIED_LINE_MAX + 1) } })[0]).toMatch(/answer\.why: a sentence by case/);
  expect(pair({ note: 3 })[0]).toMatch(/answer\.note: a sentence/);
  // a syllogism: its parts, its three checks, and the two sets of checks that cannot be
  const syl = (answer: object, extra: object = {}) => said({ ...BAT, ...extra, answer: { ...BAT.answer, ...answer } });
  expect(syl({}, { says: { subject: "a bat", predicate: "a bird" } })[0]).toMatch(/^items: question 1: says: the subject, the predicate/);
  expect(syl({ thesis: "no" })[0]).toMatch(/answer: reason and thesis \(true or false\) and pervasion/);
  expect(syl({ pervasion: "fails" })[0]).toMatch(/answer: reason and thesis/);
  expect(syl({ pervasion: true, witness: undefined })).toEqual(["items: question 1: answer: the subject is the reason and the pervasion holds, so the thesis cannot be false."]);
  expect(syl({ pervasion: "opposite", thesis: true })).toEqual(["items: question 1: answer: the subject is the reason and nothing that is the reason is the predicate, so the thesis cannot be true."]);
  expect(syl({ witness: undefined })).toEqual(["items: question 1: answer.witness: a pervasion that fails names a thing that is the reason and is not the predicate."]);
  expect(syl({ reason: false, pervasion: true })).toEqual(["items: question 1: answer.witness: the pervasion holds, so nothing is the reason without being the predicate."]);
  expect(syl({ lines: { reason: 3 } })[0]).toMatch(/answer\.lines\.reason: a sentence/);
  expect(syl({ lines: "x" })[0]).toMatch(/answer\.lines: a sentence/);
  // the question is counted where it stands, beside one that is no question at all
  expect(checkChallenge({ ...WRITTEN, items: [BIRDS, { exercise: "essay" }, { ...BAT, answer: {} }] }).problems.map((p) => p.slice(0, 18))).toEqual(["items: question 2 ", "items: question 3:"]);
});

test("a carried pair is asked under the task's words, with the answer it brought and the plain sentences where none was written", () => {
  const birds = pairAt(CC, 0), penguins = pairAt(CC, 1);
  expect(birds).toEqual({
    id: expect.stringMatching(/^g-0[a-z0-9]{1,4}$/), a: "birds", b: "things that fly", catA: null, catB: null, relation: "4",
    ex: { both: "a sparrow", anb: "a penguin", bna: "a bat", nei: "a stone" }, why: {}, note: "Birds and things that fly overlap without either containing the other.",
    generated: true, carried: true, sing: ["a bird", "something that flies"],
  });
  expect(penguins).toMatchObject({ a: "penguins", b: "birds", relation: "3ab", ex: { both: "an emperor penguin", anb: null, bna: "a sparrow", nei: "a stone" }, why: { anb: "Every penguin is a bird." }, note: "Penguins are birds that do not fly.", sing: ["a penguin", "a bird"] });
  // the plain sentence of an empty case, and of each relation
  const bare = (relation: string, ex: object) => pairAt(readChallenge({ ...CARRIED, items: [{ ...PENGUINS, answer: { relation, ex } }] }) as Challenge, 0);
  expect(bare("3ab", PENGUINS.answer.ex)).toMatchObject({ why: { anb: "Whatever falls under \u201cpenguins\u201d also falls under \u201cbirds\u201d." }, note: "Whatever falls under \u201cpenguins\u201d also falls under \u201cbirds\u201d, but not the reverse." });
  expect(bare("3ba", { both: "x", anb: "y", nei: "z" })).toMatchObject({ why: { bna: "Whatever falls under \u201cbirds\u201d also falls under \u201cpenguins\u201d." }, note: "Whatever falls under \u201cbirds\u201d also falls under \u201cpenguins\u201d, but not the reverse." });
  expect(bare("con", { anb: "x", bna: "y", nei: "z" })).toMatchObject({ why: { both: "Nothing is both \u201cpenguins\u201d and \u201cbirds\u201d." }, note: "No common locus: nothing is both penguins and birds." });
  expect(bare("mi", { both: "x", nei: "z" })).toMatchObject({ why: { anb: expect.any(String), bna: expect.any(String) }, note: "\u201cPenguins\u201d and \u201cbirds\u201d pick out the same things." });
  // it names itself on the challenge's page by its two sides, and its answer is the relation it brought
  expect(itemLine({ exercise: "debate", pair: birds })).toEqual({ pair: ["birds", "things that fly"] });
  expect(itemAnswer({ exercise: "debate", pair: birds })).toBe("Four possibilities");
  // the same for everybody, and it needs nothing of the data: an empty index asks it too
  expect(pairAt(CC, 0)).toEqual(birds);
  expect(challengeQuestion(makeIndex({ terms: {}, chains: {}, cats: [], items: [], bodySkip: [], aliases: {}, notes: {} } as unknown as DrillData), CC, 0, at)).toEqual({ exercise: "debate", pair: birds });
});

test("the relation and the empty cases of a carried pair are checked against its answer, and a learner's example is left to the tutor", () => {
  const penguins = pairAt(CC, 1);
  const cells = { both: { t: "a king penguin" }, anb: { t: "", none: true }, bna: { t: "a sparrow" }, nei: { t: "" } };
  const right = grade(ix, penguins, { rel: "3ab", cells });
  expect(right.relOk).toBe(true);
  expect(Object.fromEntries(Object.entries(right.cells).map(([c, r]) => [c, r.v]))).toEqual({ both: "cmp", anb: "ok", bna: "cmp", nei: "bad" });
  expect(right.cells.anb.msg).toEqual(["Right, empty. ", "Every penguin is a bird."]);
  expect(right.cells.both.msg).toEqual(["Not checked. ", "Reference: an emperor penguin."]);
  expect(right.cells.nei.msg).toEqual(["Missing. For example: ", "a stone"]);
  const wrong = grade(ix, penguins, { rel: "4", cells: { ...cells, anb: { t: "a toy penguin" } } });
  expect(wrong.relOk).toBe(false);
  expect(wrong.cells.anb).toMatchObject({ v: "bad", msg: ["Nothing can go here. ", "Every penguin is a bird."] });
  // Pervasions reads the same answer
  const birds = pairAt(CC, 0);
  const debate = gradeDebate(ix, birds, { rel: "4", ans: [{ say: "why", text: "a sparrow" }, { say: "why", text: "a penguin" }, { say: "why", text: "a bat" }, { say: "why", text: "a stone" }] });
  expect(debate.relOk).toBe(true);
  expect(Object.values(debate.cells).map((r) => r.v)).toEqual(["cmp", "cmp", "cmp", "cmp"]);
  // its examples are not looked up or kept: there is no category to say them of
  expect(openExamples(birds, debate, [{ text: "a sparrow", cells: ["both"] }])).toEqual([]);
  expect(openExamples({ ...birds, carried: false }, debate, [{ text: "a sparrow", cells: ["both"] }])).toEqual([{ cell: "both", text: "a sparrow" }]);
});

test("a carried syllogism is asked with its three checks as written: the situation, the reply and the plain lines follow from them", () => {
  const bat = syllogismAt(CC, 2);
  expect(bat).toEqual({
    id: "something that flies|a bird|a bat", subject: "a bat", predicate: "a bird", reason: "something that flies", catR: "", catP: "", situation: 3, answer: "pervasion", pervasion: "fails",
    level: 2, links: 0, carried: true, witness: "a dragonfly",
    checks: {
      e: { ok: true, line: "A bat is something that flies." },
      v: { ok: false, line: "Just because it is something that flies, doesn't necessarily mean that it is a bird." },
      t: { ok: false, line: "A bat is not a bird." },
    },
  });
  expect(syllogismText(bat)).toBe("Take a bat. It follows it is a bird because it is something that flies.");
  expect(itemLine({ exercise: "syllogism", syllogism: bat })).toEqual({ text: syllogismText(bat) });
  expect(itemAnswer({ exercise: "syllogism", syllogism: bat })).toBe("There is no pervasion");
  expect(gradeSyllogism(bat, "pervasion").correct).toBe(true);
  expect(gradeSyllogism(bat, "reason")).toMatchObject({ correct: false, expected: "pervasion" });
  // every set of checks that can be has its situation and its reply
  const made = (reason: boolean, pervasion: boolean | "opposite", thesis: boolean) => {
    const answer = { reason, pervasion, thesis, ...(pervasion === true ? {} : { witness: "a dragonfly" }) };
    const s = syllogismAt(readChallenge({ ...CARRIED, items: [{ ...BAT, answer }] }) as Challenge, 0);
    return [s.situation, s.answer, s.pervasion, s.checks.e.ok, s.checks.v.ok, s.checks.t.ok];
  };
  expect(made(true, true, true)).toEqual([1, "accept", "holds", true, true, true]);
  expect(made(true, false, true)).toEqual([2, "pervasion", "fails", true, false, true]);
  expect(made(true, false, false)).toEqual([3, "pervasion", "fails", true, false, false]);
  expect(made(true, "opposite", false)).toEqual([4, "pervasion", "opposite", true, false, false]);
  expect(made(false, true, true)).toEqual([5, "reason", "holds", false, true, true]);
  expect(made(false, true, false)).toEqual([6, "reason", "holds", false, true, false]);
  expect(made(false, false, true)).toEqual([7, "reason", "fails", false, false, true]);
  expect(made(false, "opposite", true)).toEqual([7, "reason", "opposite", false, false, true]);
  expect(made(false, false, false)).toEqual([8, "reason", "fails", false, false, false]);
  // the lines that were written go in the place of the plain ones
  const own = syllogismAt(readChallenge({ ...CARRIED, items: [{ ...BAT, answer: { ...BAT.answer, lines: { pervasion: "A dragonfly flies, and it is an insect." } } }] }) as Challenge, 0);
  expect(own.checks.v.line).toBe("A dragonfly flies, and it is an insect.");
  expect(own.checks.e.line).toBe("A bat is something that flies.");
  // a counter-example is not checked by the app (there is no category to place it in), except that the subject itself is none
  expect(gradeExample(ix, bat, "an airplane.")).toEqual({ v: "cmp", line: "Not checked: the app does not know an airplane well enough to say." });
  expect(gradeExample(ix, bat, "A bat")).toEqual({ v: "self", line: "That is the subject itself. Name another thing that is something that flies and is not a bird." });
  expect(gradeExample(ix, bat, " ")).toEqual({ v: "cmp", line: "Not checked: the app does not know that well enough to say." });
});

test("the report prints a carried answer whole, and stops at one written for a pair the data has", () => {
  const r = challengeReport(openData as unknown as DrillData, CARRIED);
  expect(r.ok).toBe(true);
  expect(JSON.parse(r.body!)).toEqual({ challenges: [CC] });
  expect(r.lines).toContain([
    "  1  Pervasions: birds and things that fly", "       the challenge answers: Four possibilities",
    "         both: a sparrow", "         A not B: a penguin", "         B not A: a bat", "         neither: a stone", "         one of each: a bird · something that flies",
  ].join("\n"));
  expect(r.lines).toContain([
    "  2  Relations: penguins and birds", "       the challenge answers: Three possibilities, A in B",
    "         both: an emperor penguin", "         A not B: empty (Every penguin is a bird.)", "         B not A: a sparrow", "         neither: a stone",
    "         note: Penguins are birds that do not fly.", "         one of each: a penguin · a bird",
  ].join("\n"));
  expect(r.lines).toContain([
    "  3  Syllogisms: Take a bat. It follows it is a bird because it is something that flies.", "       the challenge answers: There is no pervasion",
    "         reason: established", "         pervasion: fails; counter-example: a dragonfly", "         thesis: false",
  ].join("\n"));
  expect(r.lines).toContain("  4  Relations: " + pairAt(CC, 3).a + " and shapes\n       the data answers: Mutually exclusive");
  // two sides the data has as categories and judges: the data answers that pair, so it is written by its categories
  const known = challengeReport(openData as unknown as DrillData, { ...CARRIED, items: [BIRDS, { exercise: "practice", terms: [{ many: "colors", one: "a color" }, { many: "shapes", one: "a shape" }], answer: { relation: "con", ex: { anb: "red", bna: "round", nei: "a sound" } } }] });
  expect(known.ok).toBe(false);
  expect(known.lines.join("\n")).toContain('the data has this pair: write it as "a": "col", "b": "shape", and the data checks the examples');
  expect(known.lines.at(-1)).toBe("Not ready: question 2 carries an answer for a pair the data has.");
});
