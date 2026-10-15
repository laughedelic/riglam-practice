// Reading spoken answers (src/domain/spoken.ts) and the nearest-item match under it (src/ai-shared/lookup.ts): what a
// speech recognizer's guesses turn into. The guesses below are the kind the Voice lab saw from Chrome's recognizer.
// Also the switch that keeps voice off until it is turned on for a device (src/ui/features.ts).
import { expect, test } from "vitest";
import { makeIndex, nearestItem, similarity } from "../../src/ai-shared";
import { spokenExample, spokenRelation, spokenReply } from "../../src/domain";
import type { DrillData, RelKey } from "../../src/ai-shared";
import openData from "../../src/data/drill-data.json";
import { applyParam } from "../../src/ui/features";

const ix = makeIndex(openData as unknown as DrillData);
const ORDER: RelKey[] = ["mi", "3ab", "3ba", "4", "con"];

test("similarity is one minus the edit distance over the longer length", () => {
  expect(similarity("table", "table")).toBe(1);
  expect(similarity("table", "tablet")).toBeCloseTo(5 / 6);
  expect(similarity("", "")).toBe(1);
  expect(similarity("a", "")).toBe(0);
});

test("a misheard item resolves to the nearest name or alias, and an unrelated phrase to nothing", () => {
  expect(nearestItem(ix, "a wooden tablet")?.said).toBe("a wooden table");
  expect(nearestItem(ix, "a medal table")?.said).toBe("a metal table");
  expect(nearestItem(ix, "The horn of a rabit.")?.item.n).toBe("the horn of a rabbit");
  expect(nearestItem(ix, "garlic organiser")).toBeNull();
  expect(nearestItem(ix, "ab")).toBeNull();
});

test("Accept and Why? in every wording, and the recognizer's usual slips", () => {
  for (const s of ["Accept", "I accept.", "except", "Yes", "yeah", "I agree"]) expect(spokenReply(ix, [s])?.say, s).toBe("accept");
  for (const s of ["Why?", "why", "No", "nope", "Y"]) expect(spokenReply(ix, [s])?.say, s).toBe("why");
  expect(spokenReply(ix, ["nothing"])).toBeNull();
  expect(spokenReply(ix, ["the weather is nice"])).toBeNull();
});

test("an example said with Why? comes with it, from whichever guess names an item", () => {
  const r = spokenReply(ix, ["Why? A wooden table."]);
  expect(r?.say).toBe("why");
  expect(r?.example?.text).toBe("a wooden table");
  expect(r?.example?.item?.n).toBe("a wooden table");
  expect(spokenReply(ix, ["why a wooden tablet", "why a wooden table"])?.example?.text).toBe("a wooden table");
  expect(spokenReply(ix, ["Why"])?.example).toBeNull();
  // an item named alone is Why? with that example
  expect(spokenReply(ix, ["a gold ring"])).toMatchObject({ say: "why", example: { text: "a gold ring" } });
});

test("the relation by name, by number like the keys, and three possibilities only with a direction", () => {
  expect(spokenRelation(["Mutually inclusive"], ORDER)).toBe("mi");
  expect(spokenRelation(["Mitchell inclusive"], ORDER)).toBe("mi");
  expect(spokenRelation(["mutually exclusive"], ORDER)).toBe("con");
  expect(spokenRelation(["for possibilities"], ORDER)).toBe("4");
  expect(spokenRelation(["4 possibilities"], ORDER)).toBe("4");
  expect(spokenRelation(["four"], ORDER)).toBe("4");
  expect(spokenRelation(["three possibilities, A in B"], ORDER)).toBe("3ab");
  expect(spokenRelation(["3 possibilities B is in A"], ORDER)).toBe("3ba");
  expect(spokenRelation(["B contains A"], ORDER)).toBe("3ab");
  expect(spokenRelation(["being a"], ORDER)).toBe("3ba");
  expect(spokenRelation(["three possibilities"], ORDER)).toBe("3");
  expect(spokenRelation(["three"], ORDER)).toBe("3");
  expect(spokenRelation(["number three"], ORDER)).toBe("3ba");
  expect(spokenRelation(["one"], ORDER)).toBe("mi");
  expect(spokenRelation(["two"], ORDER)).toBe("3ab");
  expect(spokenRelation(["5"], ORDER)).toBe("con");
  expect(spokenRelation(["good morning"], ORDER)).toBeNull();
  // a later guess can settle it
  expect(spokenRelation(["three possibilities", "three possibilities a in b"], ORDER)).toBe("3ab");
});

test("an example: an item by its name or alias, near words snapped to it, other words kept as heard, and nothing", () => {
  expect(spokenExample(ix, ["A clay pot."])).toMatchObject({ text: "a clay pot", none: false });
  expect(spokenExample(ix, ["table"])?.item?.n).toBe("a wooden table");
  expect(spokenExample(ix, ["a gold ring because it is both"])).toMatchObject({ text: "a gold ring" });
  expect(spokenExample(ix, ["for example a red ball"])).toMatchObject({ text: "a red ball" });
  expect(spokenExample(ix, ["a medal table"])).toMatchObject({ text: "a metal table", heard: "a medal table" });
  expect(spokenExample(ix, ["the sound of a conch"])).toMatchObject({ text: "the sound of a conch", item: null });
  for (const s of ["nothing", "None.", "nothing exists"]) expect(spokenExample(ix, [s])?.none, s).toBe(true);
  expect(spokenExample(ix, ["", "  "])).toBeNull();
});

test("features on trial: the address turns one on or off, or all off, and unknown names are ignored", () => {
  expect(applyParam([], null)).toEqual([]);
  expect(applyParam([], "voice")).toEqual(["voice"]);
  expect(applyParam(["voice"], "-voice")).toEqual([]);
  expect(applyParam(["voice"], "none")).toEqual([]);
  expect(applyParam(["voice", "gone"], "")).toEqual(["voice"]);
  expect(applyParam([], " Voice , other")).toEqual(["voice"]);
});
