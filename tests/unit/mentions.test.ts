// termMentions: finding the Dudra terms a text names, for the underlined terms of the tutor's notes. Made-up data, plus the real open data.
import { expect, test } from "vitest";
import { makeIndex, namesTerm, termMentions } from "../../src/ai-shared";
import type { DrillData } from "../../src/ai-shared";
import openData from "../../src/data/drill-data.json";

const data = (): DrillData => ({
  terms: {
    Form: { name: "Form", ch: "III" },
    "External form": { name: "External form", ch: "III" },
    Matter: { name: "Matter", ch: "III" },
    Phenomenon: { name: "Phenomenon", ch: "I" },
    "Object of knowledge": { name: "Object of knowledge", ch: "I", aliases: ["Knowable"] },
    "Non-existent": { name: "Non-existent", ch: "I" },
    Existent: { name: "Existent", ch: "I" },
    Consciousness: { name: "Consciousness", ch: "V" },
    "Functional thing": { name: "Functional thing", ch: "II", aliases: ["Functioning thing", "Thing"] },
    One: { name: "One", ch: "VII" },
    "One entity": { name: "One entity", ch: "VII" },
  },
  chains: {},
  cats: [],
  items: [],
  bodySkip: [],
});
/** The text with each mention bracketed as [words=Term]. */
const marked = (text: string, d: DrillData = data()) => {
  let out = "", at = 0;
  for (const m of termMentions(makeIndex(d), text)) { out += text.slice(at, m.start) + "[" + text.slice(m.start, m.end) + "=" + m.term + "]"; at = m.end; }
  return out + text.slice(at);
};

test("the longest name wins, in any case, and plurals count", () => {
  expect(marked("An external form is a form. Forms are matter.")).toBe("An [external form=External form] is a [form=Form]. [Forms=Form] are [matter=Matter].");
  expect(marked("Phenomena and objects of knowledge; consciousnesses.")).toBe("[Phenomena=Phenomenon] and [objects of knowledge=Object of knowledge]; [consciousnesses=Consciousness].");
  expect(marked("Every knowable thing is a functioning thing.")).toBe("Every [knowable=Object of knowledge] thing is a [functioning thing=Functional thing].");
});

test("a hyphen and a space are one, and a name inside a longer word or hyphenated name is not a mention", () => {
  expect(marked("A non-existent is not an existent; a non existent either.")).toBe("A [non-existent=Non-existent] is not an [existent=Existent]; a [non existent=Non-existent] either.");
  expect(marked("Formal, informative, matters, preformed.")).toBe("Formal, informative, matters, preformed.");
});

test("everyday words are not taken for terms, but the longer names that contain them are", () => {
  expect(marked("One of them is a thing, the other one entity.")).toBe("One of them is a thing, the other [one entity=One entity].");
});

test("words in quotation marks are the learner's example, not the tutor's terms", () => {
  expect(marked('"a form of matter" is a form, so it fits.')).toBe('"a form of matter" is a [form=Form], so it fits.');
  expect(marked("“the matter” is matter.")).toBe("“the matter” is [matter=Matter].");
});

test("a text that quotes its terms on purpose can ask for them", () => {
  const quoted = (text: string) => termMentions(makeIndex(data()), text, { quoted: true }).map((m) => text.slice(m.start, m.end));
  expect(quoted('"form" and "matter" pick out the same class: form.')).toEqual(["form", "matter", "form"]);
});

test("a label is the name of a term when it is worded as the term is, even an everyday word", () => {
  const ix = makeIndex(data());
  expect(namesTerm(ix, "External form", "External forms")).toBe(true);
  expect(namesTerm(ix, "External form", "physical things outside a person's continuum")).toBe(false);
  expect(namesTerm(ix, "Form", "form")).toBe(true);
  expect(namesTerm(ix, "Nothing", "form")).toBe(false);
});

test("nothing to find in an empty text or with no terms", () => {
  expect(termMentions(makeIndex(data()), "")).toEqual([]);
  expect(termMentions(makeIndex({ ...data(), terms: {} }), "a form")).toEqual([]);
});

test("on the real open data, a typical note names the terms a learner would look up", () => {
  const d = openData as unknown as DrillData;
  expect(marked('"a chair" is an external form, so it fits. A chair is matter, and it is impermanent.', d))
    .toBe('"a chair" is an [external form=External form], so it fits. A chair is [matter=Matter], and it is [impermanent=Impermanent].');
  expect(marked("Functioning things and impermanent phenomena are mutually inclusive; there is no common locus of a person and a pot.", d))
    .toBe("[Functioning things=Functional thing] and [impermanent phenomena=Impermanent] are [mutually inclusive=Mutually inclusive]; there is no [common locus=Common locus] of a [person=Person] and a [pot=Pot].");
  expect(marked("For instance, one of the two is different; by definition the reason is clear. Keep it in mind.", d)).toBe("For instance, one of the two is different; by definition the reason is clear. Keep it in mind.");
  // every mention names a term of the data
  for (const m of termMentions(makeIndex(d), Object.values(d.terms).map((t) => t.name).join(". "))) expect(d.terms[m.term]).toBeDefined();
});
