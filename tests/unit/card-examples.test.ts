// The examples on a term's definition (src/domain/card-examples.ts), on the real open data: everyday things of the practice list come first,
// a spread of kinds, and the reference examples fill only what the list lacks. The reference examples here are invented.
import { expect, test } from "vitest";
import { makeIndex, sameNames, spelled, stripDet, upChain } from "../../src/ai-shared";
import type { DrillData, Example } from "../../src/ai-shared";
import { cardExamples } from "../../src/domain";
import openData from "../../src/data/drill-data.json";

const ix = makeIndex(openData as unknown as DrillData);
const listed = (n: string) => ix.ITEMIDX[stripDet(spelled(n))]!;
const names = (term: string, ref?: Example[]) => cardExamples(ix, ref, term).map((x) => x.n);
const sample = (n: string, term: string, extra: Partial<Example> = {}): Example => ({ n, cls: [term], lv: 1, cf: "confirmed", gloss: `Why ${n} is a good one.`, ...extra });

test("a person is shown by a simple animal first, and a neighbor beside it, never only animals", () => {
  const got = names("Person");
  expect(got[0]).toBe("a dog");
  expect(got).toHaveLength(3);
  expect(got.filter((n) => listed(n).c.includes("human")), "one of the people the list has").toHaveLength(1);
  expect(got, "'you' is said to the learner, not shown as a person").not.toContain("you");
});

test("the card of a person is drawn by hand: a dog, a neighbor and an ant, which are all persons in the list", () => {
  expect(names("Person"), "if the list loses one of them, the card in card-examples.ts needs a new pick").toEqual(["a dog", "your neighbor", "an ant"]);
  expect(listed("an ant").t).toBe("Person");
  expect(cardExamples(ix, null, "Person", 2).map((x) => x.n)).toEqual(["a dog", "your neighbor"]);
  expect(cardExamples(ix, null, "Person", 4).map((x) => x.n).slice(0, 3), "the rule fills what is asked beyond the picks").toEqual(["a dog", "your neighbor", "an ant"]);
  expect(names("Non-associated compositional factor").slice(1), "the picks are for the term itself").not.toContain("an ant");
});

test("a quality is shown by three different qualities of everyday things, not three of one", () => {
  for (const term of ["Shape", "Taste source", "Sound source"]) {
    const got = names(term);
    expect(got, term).toHaveLength(3);
    expect(new Set(got.map((n) => n.split(" of ")[0])).size, term + ": " + got.join(", ")).toBe(3);
  }
  expect(names("Shape")[0]).toBe("the roundness of a ball");
  expect(names("Odor source").slice(0, 2), "the list has only a smell and a scent, so the third repeats one").toEqual(["the smell of coffee", "the scent of a rose"]);
  expect(names("Color").map((n) => listed(n).t), "the term's own, then the colors below it").toEqual(["Color", "Primary color", "Secondary color"]);
});

test("a broad term is shown by a thing of each branch below it", () => {
  const got = names("Functional thing").map((n) => { const up = upChain(ix, listed(n).t); return up[up.indexOf("Functional thing") - 1]; });
  expect(got).toEqual(["Form", "Consciousness", "Non-associated compositional factor"]);
});

test("the term's own examples come first, what the course's words alone name last", () => {
  const nacf = names("Non-associated compositional factor");
  expect(listed(nacf[0]!).t).toBe("Non-associated compositional factor");
  expect(nacf.slice(1).map((n) => listed(n).t)).toEqual(["Person", "Person"]);
  const perm = names("Permanent");
  expect(perm.map((n) => !!listed(n).dudraOnly), "there are others to show").toEqual([false, false, false]);
  expect(listed(perm[0]!).st, "the plainest first").toBe(5);
  expect(names("Sense power"), "only the course's words name the sense powers: then those are shown").toEqual(["the eye sense power", "the ear sense power", "the nose sense power"]);
});

test("every course term has examples, and each is of the term or of a term mutually inclusive with it", () => {
  const empty: string[] = [];
  for (const cat of ix.DATA.cats) {
    if (cat.kind !== "dudra" || !cat.term) continue;
    const got = cardExamples(ix, null, cat.term), same = sameNames(ix, cat.term);
    if (!got.length) empty.push(cat.term);
    for (const x of got) expect(upChain(ix, listed(x.n).t).some((n) => same.has(n)), cat.term + ": " + x.n).toBe(true);
  }
  expect(empty).toEqual([]);
});

test("a hidden phenomenon, the same as an existent, is shown by a form, a permanent thing and a mind", () => {
  const top = (n: string) => upChain(ix, listed(n).t).at(-2);
  const got = names("Hidden phenomenon");
  expect(got.map(top), got.join(", ")).toEqual(["Functional thing", "Permanent", "Functional thing"]);
  expect(got.map((n) => upChain(ix, listed(n).t).at(-3) ?? "")).toEqual(["Form", "", "Consciousness"]);
});

test("the reference examples fill what the list lacks, once, and never repeat a name", () => {
  const ref = [sample("an eye of a person", "Eye sense power"), sample("the eye sense power", "Eye sense power"), sample("a mental sample", "Mental sense power", { lv: 2, cn: "low" })];
  expect(cardExamples(ix, ref, "Eye sense power")).toEqual([{ n: "the eye sense power", st: 6 }, { n: "an eye of a person", st: 8, gloss: "Why an eye of a person is a good one." }]);
  expect(cardExamples(ix, ref, "Mental sense power"), "the list has no thing of it").toEqual([{ n: "a mental sample", st: 9, gloss: "Why a mental sample is a good one.", cn: "low" }]);
  expect(cardExamples(ix, ref, "Person").map((x) => x.n), "three things of the list leave no room").toEqual(names("Person"));
  expect(cardExamples(ix, [], "Mental sense power")).toEqual([]);
  expect(cardExamples(ix, ref, "Not a term")).toEqual([]);
});

test("the same data gives the same examples, up to the number asked for", () => {
  expect(names("Form")).toEqual(names("Form"));
  expect(cardExamples(ix, null, "Form", 2)).toHaveLength(2);
  expect(cardExamples(ix, null, "Form", 5).map((x) => x.n).slice(0, 3)).toEqual(names("Form"));
});
