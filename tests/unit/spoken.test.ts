// Reading spoken answers (src/domain/spoken.ts) and the nearest-item match under it (src/ai-shared/lookup.ts): what a
// speech recognizer's guesses turn into. The guesses below are the kind the Voice lab saw from Chrome's recognizer.
// Also the default of the Voice switch (src/ui/speech.ts).
import { expect, test } from "vitest";
import { makeIndex, nearestItem, similarity } from "../../src/ai-shared";
import { lettersDirection, spokenConfirm, spokenDontKnow, spokenDirection, spokenExample, spokenRelation, spokenReply } from "../../src/domain";
import type { DrillData, RelKey } from "../../src/ai-shared";
import openData from "../../src/data/drill-data.json";
import { voiceOn } from "../../src/ui/speech";

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

test("four possibilities without neither is four possibilities, and there is no sixth answer to pick by number", () => {
  for (const s of ["four possibilities without neither", "Four possibilities, without there being something which is neither."]) expect(spokenRelation([s], ORDER), s).toBe("4");
  expect(spokenRelation(["six"], ORDER)).toBeNull();
  expect(spokenRelation(["number six"], ORDER)).toBeNull();
});

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
  // one term inside the other: the longer is the one said
  const T3 = { a: "physical things", b: "physical things outside a person's continuum" };
  expect(spokenRelation(["all physical things outside a person's continuum are physical things, but not the reverse"], ORDER, T3)).toBe("3ba");
  expect(spokenRelation(["all physical things are physical things outside a person's continuum, but not the reverse"], ORDER, T3)).toBe("3ab");
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
  expect(spokenExample(ix, ["key"])?.item?.n).toBe("a metal key");
  expect(spokenExample(ix, ["a gold ring because it is both"])).toMatchObject({ text: "a gold ring" });
  expect(spokenExample(ix, ["for example a red ball"])).toMatchObject({ text: "a red ball" });
  expect(spokenExample(ix, ["a medal table"])).toMatchObject({ text: "a metal table", heard: "a medal table" });
  expect(spokenExample(ix, ["the sound of a conch"])).toMatchObject({ text: "the sound of a conch", item: null });
  for (const s of ["nothing", "None.", "nothing exists"]) expect(spokenExample(ix, [s])?.none, s).toBe(true);
  expect(spokenExample(ix, ["", "  "])).toBeNull();
});

test("the Voice switch: the device's own choice wins, else a Preview has it on and the real app off", () => {
  expect(voiceOn(null, false)).toBe(false);
  expect(voiceOn(null, true)).toBe(true);
  expect(voiceOn("1", false)).toBe(true);
  expect(voiceOn("0", true)).toBe(false);
  expect(voiceOn("", true)).toBe(true);   // not a choice
});

test("\"I don't know\" in its usual wordings, and not inside an answer", () => {
  for (const t of ["I don't know", "I don't know.", "I do not know", "I dunno", "don't know", "Hmm, I don't know", "I really don't know", "no idea", "I have no idea", "I'm not sure", "not sure", "I don't know, sorry", "no clue", "I give up"]) {
    expect(spokenDontKnow([t]), t).toBe(true);
  }
  expect(spokenDontKnow(["I'm not sure", "I am sure"])).toBe(true);   // any of the guesses
  for (const t of ["Why? A wooden table", "no", "I accept", "nothing", "a gold ring", "I know", "I don't know why a wooden table", "four possibilities", "yes"]) {
    expect(spokenDontKnow([t]), t).toBe(false);
  }
});

// ---- the other four exercises ----
import { spokenCategories, spokenCounter, spokenPair, spokenSyllogism, spokenThing, spokenYesNo, termPhrase } from "../../src/domain";
import type { SylReply } from "../../src/domain";

const SYL_ORDER: SylReply[] = ["reason", "pervasion", "accept"];

test("a reply to a syllogism: its three sentences, the keys, and the recognizer's slips", () => {
  for (const s of ["I accept", "accept", "Except", "Yes", "I agree"]) expect(spokenSyllogism([s], SYL_ORDER), s).toBe("accept");
  for (const s of ["There is no pervasion", "no pervasion", "pervasion", "there is no persuasion", "The pervasion fails"]) expect(spokenSyllogism([s], SYL_ORDER), s).toBe("pervasion");
  for (const s of ["The reason is not established", "reason is not established", "not established", "the reason isn't established", "S is not R", "no reason"]) expect(spokenSyllogism([s], SYL_ORDER), s).toBe("reason");
  // by number, as the keys 1, 2, 3 stand on the page
  expect(spokenSyllogism(["one"], SYL_ORDER)).toBe("reason");
  expect(spokenSyllogism(["number two"], SYL_ORDER)).toBe("pervasion");
  expect(spokenSyllogism(["3"], SYL_ORDER)).toBe("accept");
  // the second guess may be the one that reads
  expect(spokenSyllogism(["the weather is nice", "there is no pervasion"], SYL_ORDER)).toBe("pervasion");
  expect(spokenSyllogism(["the weather is nice"], SYL_ORDER)).toBeNull();
});

test("a counter-example can be left out by saying so", () => {
  for (const s of ["skip", "no counter-example", "Without a counter example", "leave it empty", "nothing"]) expect(spokenCounter(ix, [s])?.none, s).toBe(true);
  expect(spokenCounter(ix, ["a gold pot"])).toMatchObject({ none: false });
  expect(spokenCounter(ix, ["a gold pot"])?.text).toBeTruthy();
});

test("a thing for Find an instance, or that nothing is", () => {
  for (const s of ["nothing", "none", "there is none", "nothing is both", "Nothing can be all of them", "no such thing"]) expect(spokenThing(ix, [s])?.none, s).toBe(true);
  expect(spokenThing(ix, ["a wooden table"])).toMatchObject({ none: false, text: "a wooden table" });
});

test("two phenomena in one breath, split at the right 'and'", () => {
  expect(spokenPair(ix, ["wood and fire"])).toMatchObject({ a: "wood", b: "fire" });
  expect(spokenPair(ix, ["a wooden table and a metal table"])).toMatchObject({ a: "a wooden table", b: "a metal table" });
  expect(spokenPair(ix, ["Both a wooden table and a metal table."])).toMatchObject({ a: "a wooden table", b: "a metal table" });
  // two "and"s: one split is taken, and the words are all kept
  const p = spokenPair(ix, ["a gold pot and a wooden table and a metal table"]);
  expect(p).not.toBeNull();
  expect(p!.a.length).toBeGreaterThan(0);
  expect(p!.b.length).toBeGreaterThan(0);
  expect(p!.a + " and " + p!.b).toBe("a gold pot and a wooden table and a metal table");
  expect(spokenPair(ix, ["a wooden table"])).toBeNull();
  expect(spokenPair(ix, ["and fire"])).toBeNull();
});

const ROWS = [
  { cat: "ft", phrase: "a functional thing" }, { cat: "form", phrase: "a form" }, { cat: "extf", phrase: "an external form" },
  { cat: "col", phrase: "a color" }, { cat: "wood", phrase: "made of wood" }, { cat: "perm", phrase: "a permanent phenomenon" },
];
test("the categories a thing is in, by their words, by number, or none or all", () => {
  expect(spokenCategories(["a color and an external form"], ROWS)?.cats).toEqual(["extf", "col"]);
  // the longer phrase is read first, so "external form" does not also tick "form"
  expect(spokenCategories(["external form"], ROWS)?.cats).toEqual(["extf"]);
  expect(spokenCategories(["form"], ROWS)?.cats).toEqual(["form"]);
  expect(spokenCategories(["it is a functional thing, a form and color"], ROWS)?.cats).toEqual(["ft", "form", "col"]);
  expect(spokenCategories(["wooden"], ROWS)?.cats).toEqual(["wood"]);
  expect(spokenCategories(["permanent"], ROWS)?.cats).toEqual(["perm"]);
  expect(spokenCategories(["one and four"], ROWS)?.cats).toEqual(["ft", "col"]);
  expect(spokenCategories(["none of these"], ROWS)?.cats).toEqual([]);
  expect(spokenCategories(["nothing"], ROWS)?.cats).toEqual([]);
  expect(spokenCategories(["all of them"], ROWS)?.cats).toHaveLength(ROWS.length);
  expect(spokenCategories(["the weather is nice"], ROWS)).toBeNull();
  // a later guess may be the one that reads
  expect(spokenCategories(["collar", "a color"], ROWS)?.cats).toEqual(["col"]);
});

test("yes or no to a question, not to a confirmation", () => {
  for (const s of ["yes", "Yeah", "correct", "it is"]) expect(spokenYesNo([s]), s).toBe("yes");
  for (const s of ["no", "Nope", "it is not", "it isn't"]) expect(spokenYesNo([s]), s).toBe("no");
  for (const s of ["back", "undo", "change it", "maybe"]) expect(spokenYesNo([s]), s).toBeNull();
});

test("categories: what it is not is not ticked, a word that only looks like another is not it, and the sixth is said by its digit", () => {
  const rows = [...ROWS, { cat: "imp", phrase: "an impermanent phenomenon" }];
  // "impermanent" is close to "permanent" as letters, and the opposite of it
  expect(spokenCategories(["it is impermanent"], ROWS)).toBeNull();
  expect(spokenCategories(["impermanent"], rows)?.cats).toEqual(["imp"]);
  // a guess that says what it is not names no category it is in
  expect(spokenCategories(["a non-functional thing"], ROWS)).toBeNull();
  expect(spokenCategories(["it is not a color"], ROWS)).toBeNull();
  expect(spokenCategories(["a form but not a color"], ROWS)).toBeNull();
  // "none of these" is still the way to say none
  expect(spokenCategories(["none of these"], ROWS)?.cats).toEqual([]);
  // a digit above five
  expect(spokenCategories(["one and 6"], ROWS)?.cats).toEqual(["ft", "perm"]);
  expect(spokenCategories(["6"], ROWS)?.cats).toEqual(["perm"]);
});

test("categories: every real row phrase said alone ticks itself among other rows, and the words of an opposite do not tick it", () => {
  type Cat = { id: string; term?: string; phrases?: string[]; labels: string[] };
  const cats = (openData as unknown as { cats: Cat[] }).cats;
  const phrases = cats.map((c) => ({ cat: c.id, phrase: c.term ? termPhrase(c.term) : (c.phrases?.[0] ?? c.labels[0]) }));
  // rows of six, the one asked among five others in a fixed order (no randomness: a failure must come back the same)
  phrases.forEach((row, n) => {
    const others = [1, 7, 13, 29, 41].map((k) => phrases[(n + k) % phrases.length]).filter((r) => r.cat !== row.cat);
    const rows = [...others, row];
    expect(spokenCategories([row.phrase], rows)?.cats, row.phrase).toEqual([row.cat]);
    expect(spokenCategories(["it is " + row.phrase], rows)?.cats, "it is " + row.phrase).toEqual([row.cat]);
  });
  // a row with the same word twice, and one whose own word is a negation
  const rows = [{ cat: "body", phrase: "a body or a body part" }, { cat: "non", phrase: "a non-associated compositional factor" }, { cat: "col", phrase: "a color" }];
  expect(spokenCategories(["a body or a body part"], rows)?.cats).toEqual(["body"]);
  expect(spokenCategories(["a color and a non-associated compositional factor"], rows)?.cats).toEqual(["non", "col"]);
  expect(spokenCategories(["non-associated"], rows)?.cats).toEqual(["non"]);
  expect(spokenCategories(["not a non-associated compositional factor"], rows)).toBeNull();
  // "impermanent phenomenon" shares "phenomenon" with a permanent one and is still not it
  const perm = [{ cat: "perm", phrase: "a permanent phenomenon" }, { cat: "col", phrase: "a color" }];
  for (const s of ["impermanent phenomena", "an impermanent phenomenon", "it is an impermanent phenomenon"]) expect(spokenCategories([s], perm), s).toBeNull();
  expect(spokenCategories(["a permanent phenomenon"], perm)?.cats).toEqual(["perm"]);
});

test("a refusal is not taken as the example", () => {
  for (const s of ["no", "Nope", "no, nothing", "there isn't one", "there is none", "there aren't any"]) {
    expect(spokenThing(ix, [s]), s).toMatchObject({ none: true });
    expect(spokenCounter(ix, [s]), s).toMatchObject({ none: true });
  }
});

test("a yes or no to a question may carry the words of the question", () => {
  for (const s of ["yes it is", "Yes, it does", "yeah"]) expect(spokenYesNo([s]), s).toBe("yes");
  for (const s of ["no it's not", "no it isn't", "No, it does not"]) expect(spokenYesNo([s]), s).toBe("no");
});
