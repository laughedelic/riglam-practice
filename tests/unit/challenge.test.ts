// src/domain/challenge.ts: a challenge as a document (what is one, and what is wrong with one that is not), its questions (the same for everybody,
// made from the open data whatever the stages) and the record a device keeps of it (what comes next, where it stands).
import { expect, test } from "vitest";
import { makeIndex } from "../../src/ai-shared";
import type { DrillData } from "../../src/ai-shared";
import { CHALLENGE_MAX, challengeQuestion, checkChallenge, dayText, freshRecord, itemLine, marked, markOf, nextItem, normRecord, readChallenge, standing, stationOf } from "../../src/domain/challenge";
import type { Challenge } from "../../src/domain/challenge";
import openData from "../../src/data/drill-data.json";

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
