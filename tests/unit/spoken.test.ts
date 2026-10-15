// Reading spoken answers (src/domain/spoken.ts) and the nearest-item match under it (src/ai-shared/lookup.ts): what a
// speech recognizer's guesses turn into. The guesses below are the kind the Voice lab saw from Chrome's recognizer.
// Also the switch that keeps voice off until it is turned on for a device (src/ui/features.ts).
import { expect, test } from "vitest";
import { makeIndex, nearestItem, similarity } from "../../src/ai-shared";
import { lettersDirection, spokenConfirm, spokenDirection, spokenExample, spokenRelation, spokenReply } from "../../src/domain";
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

const T = { a: "functional things", b: "products" };
const T2 = { a: "things able to perform a function", b: "impermanent things" };

test("the relation said as what is written under the option, with the pair's own terms", () => {
  // Three possibilities: the term named first is the one inside
  expect(spokenRelation(["All functional things are products, not the reverse"], ORDER, T)).toBe("3ab");
  expect(spokenRelation(["all functional things are products but not the reverse"], ORDER, T)).toBe("3ab");
  expect(spokenRelation(["All products are functional things, not the reverse."], ORDER, T)).toBe("3ba");
  expect(spokenRelation(["every product is a functional thing but not vice versa"], ORDER, T)).toBe("3ba");
  expect(spokenRelation(["functional things are included in products, not the reverse"], ORDER, T)).toBe("3ab");
  expect(spokenRelation(["products contain functional things"], ORDER, T)).toBe("3ab");
  expect(spokenRelation(["a product is a kind of functional thing"], ORDER, T)).toBe("3ba");
  expect(spokenRelation(["all things able to perform a function are impermanent things, not the reverse"], ORDER, T2)).toBe("3ab");
  // recognized a little off: plural for singular, a letter slipped
  expect(spokenRelation(["all functional thing are product not the reverse"], ORDER, T)).toBe("3ab");
  expect(spokenRelation(["all funtional things are products, not the reverse"], ORDER, T)).toBe("3ab");
  // only one term was recognized
  expect(spokenRelation(["all functional things are probes, not the reverse"], ORDER, T)).toBe("3ab");
  expect(spokenRelation(["all probes are functional things, not the reverse"], ORDER, T)).toBe("3ba");
  // the other options
  expect(spokenRelation(["All functional things are products, and all products are functional things"], ORDER, T)).toBe("mi");
  expect(spokenRelation(["all products are functional things and vice versa"], ORDER, T)).toBe("mi");
  expect(spokenRelation(["Nothing is both"], ORDER, T)).toBe("con");
  expect(spokenRelation(["nothing is both a product and a functional thing"], ORDER, T)).toBe("con");
  expect(spokenRelation(["no product is a functional thing"], ORDER, T)).toBe("con");
  expect(spokenRelation(["They overlap; neither contains the other"], ORDER, T)).toBe("4");
  expect(spokenRelation(["they overlap"], ORDER)).toBe("4");
  // other talk about the terms is no relation
  expect(spokenRelation(["functional things and products"], ORDER, T)).toBeNull();
  expect(spokenRelation(["good morning"], ORDER, T)).toBeNull();
});

test("three possibilities and its direction, however the recognizer writes \"A in B\"", () => {
  for (const s of ["three possibilities ANB", "3 possibilities A & B", "three possibilities a n b", "three possibilities a b", "three possibilities A and B"])
    expect(spokenRelation([s], ORDER), s).toBe("3ab");
  for (const s of ["three possibilities BNA", "3 possibilities B & A", "three possibilities b a"]) expect(spokenRelation([s], ORDER), s).toBe("3ba");
  expect(spokenRelation(["three possibilities"], ORDER)).toBe("3");
  for (const s of ["ANB", "A & B", "a n b", "A in B", "a and b", "A B"]) expect(spokenDirection([s], T), s).toBe("3ab");
  for (const s of ["BNA", "B & A", "b in a", "b a"]) expect(spokenDirection([s], T), s).toBe("3ba");
  // the term that is inside, first or second, the whole phrase
  expect(spokenDirection(["functional things"], T)).toBe("3ab");
  expect(spokenDirection(["the products"], T)).toBe("3ba");
  expect(spokenDirection(["a product"], T)).toBe("3ba");
  expect(spokenDirection(["products inside"], T)).toBe("3ba");
  expect(spokenDirection(["the first"], T)).toBe("3ab");
  expect(spokenDirection(["second in first"], T)).toBe("3ba");
  expect(spokenDirection(["first contains second"], T)).toBe("3ba");
  expect(spokenDirection(["all products are functional things, not the reverse"], T)).toBe("3ba");
  expect(spokenDirection(["good morning"], T)).toBeNull();
  expect(spokenDirection(["four possibilities"], T)).toBeNull();
  expect(lettersDirection("a a")).toBeNull();
});

test("yes and no to an answer that waits to be confirmed", () => {
  for (const s of ["yes", "Yeah.", "okay", "confirm", "That's right", "go on", "next"]) expect(spokenConfirm([s]), s).toBe("yes");
  for (const s of ["no", "Wrong", "change", "cancel", "that's wrong", "try again"]) expect(spokenConfirm([s]), s).toBe("no");
  expect(spokenConfirm(["four possibilities"])).toBeNull();
  expect(spokenConfirm(["why a gold ring"])).toBeNull();
  expect(spokenConfirm(["good morning", "yes"])).toBe("yes");
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
