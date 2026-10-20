// src/ai-shared/syllogism.ts: what the tutor is told about a syllogism. The card is made from drawn syllogisms of the real open data and the page's own grading, so it says what
// the page says; the fine points come from made-up notes.
import { expect, test } from "vitest";
import { GUIDE, makeIndex } from "../../src/ai-shared";
import type { DrillData } from "../../src/ai-shared";
import { SYLLOGISM_ASK, SYLLOGISM_NOTE, syllogismBody, syllogismCard, syllogismCats, syllogismNotes } from "../../src/ai-shared/syllogism";
import type { SyllogismAnswerView } from "../../src/ai-shared/syllogism";
import { drawSyllogism, gradeSyllogism, gradeTimeout, syllogismText } from "../../src/domain/syllogism";
import type { Reply, Syllogism } from "../../src/domain/syllogism";
import openData from "../../src/data/drill-data.json";

const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const real = makeIndex(openData as unknown as DrillData);

/** The first syllogism of the real data that fits, from a fixed sequence of draws. */
function find(fits: (c: Syllogism) => boolean): Syllogism {
  const rng = seeded(7);
  for (let i = 0; i < 2000; i++) {
    const c = drawSyllogism(real, { hist: [], recent: [], level: 2, rng });
    if (fits(c)) return c;
  }
  throw new Error("no such syllogism in the draw");
}
const answered = (c: Syllogism, said: Reply | null, extra: Partial<SyllogismAnswerView> = {}): SyllogismAnswerView => ({
  sentence: syllogismText(c), grade: said ? gradeSyllogism(c, said) : gradeTimeout(c), ...extra,
});

test("the card gives the parts, the three checks with the page's lines, the right reply and the learner's reply", () => {
  const c = find((x) => x.answer === "reason" && x.checks.v.ok);
  const wrong: Reply = "accept";
  const body = syllogismBody(real, c, answered(c, wrong));
  expect(body.startsWith(SYLLOGISM_NOTE)).toBe(true);
  expect(body).toContain("CARD (from the course booklet's term data; S is the subject, R the reason, P the predicate):");
  expect(body).toContain(`"S":{"label":${JSON.stringify(c.subject)}`);
  expect(body).toContain(`Syllogism: ${JSON.stringify(syllogismText(c))}`);
  expect(body).toContain(`1 Reason (is S the reason?): NOT ESTABLISHED. The page's line: ${JSON.stringify(c.checks.e.line)}`);
  expect(body).toContain("2 Pervasion (is whatever is the reason also the predicate?): HOLDS.");
  expect(body).toContain(`3 Thesis (is S the predicate?): ${c.checks.t.ok ? "TRUE" : "FALSE"}.`);
  expect(body).toContain('Right reply: "The reason is not established". Learner replied: "Accept", which is wrong.');
  expect(body).toContain("What the page says was mixed up: " + gradeSyllogism(c, wrong).confusion);
});

test("a pervasion that fails comes with the counter-example the page keeps; an opposite one says so", () => {
  const c = find((x) => x.pervasion === "fails" && !!x.witness && x.answer === "pervasion");
  const body = syllogismBody(real, c, answered(c, "pervasion"));
  expect(body).toContain("2 Pervasion (is whatever is the reason also the predicate?): DOES NOT HOLD: some things that are the reason are not the predicate; the counter-example kept for you: " + JSON.stringify(c.witness));
  expect(body).toContain('Right reply: "There is no pervasion". Learner replied: "There is no pervasion", which is right.');
  expect(body).not.toContain("What the page says was mixed up");
  const o = find((x) => x.pervasion === "opposite");
  const opp = syllogismBody(real, o, answered(o, "accept"));
  expect(opp).toContain("DOES NOT HOLD: it is the opposite, nothing that is the reason is the predicate (the term chain shows it)");
  expect(opp).not.toContain("the counter-example kept for you");
});

test("a pervasion that holds names no counter-example, and an accepted syllogism has all three checks holding", () => {
  const c = find((x) => x.answer === "accept");
  const body = syllogismBody(real, c, answered(c, "accept"));
  expect(body).toContain("1 Reason (is S the reason?): ESTABLISHED.");
  expect(body).toContain("HOLDS. The page's line:");
  expect(body).toContain("3 Thesis (is S the predicate?): TRUE.");
  expect(body).not.toContain("kept for you");
});

test("time running out is said as no reply, and the learner's counter-example is quoted, cut, and given the page's verdict", () => {
  const c = find((x) => x.answer === "pervasion");
  expect(syllogismBody(real, c, answered(c, null))).toContain("Learner replied: nothing (time ran out), which is wrong.");
  const long = "x".repeat(500);
  const ex = (v: "ok" | "bad" | "cmp") => syllogismBody(real, c, answered(c, "pervasion", { ex: { text: v === "cmp" ? long : 'a "quoted" thing', v } }));
  expect(ex("ok")).toContain(`The learner's counter-example: "a \\"quoted\\" thing"; page verdict ok (it is the reason and is not the predicate).`);
  expect(ex("bad")).toContain("page verdict bad (it is not the reason, or it is the predicate too)");
  expect(ex("cmp")).toContain(`"${"x".repeat(200)}"; page verdict cmp (the page does not know it well enough to say).`);
  expect(ex("cmp")).not.toContain("x".repeat(201));
  expect(syllogismBody(real, c, answered(c, "pervasion"))).not.toContain("The learner's counter-example");
});

test("the card is the instructions, the body and the fine points, which a server can take apart", () => {
  const c = find((x) => x.answer === "pervasion");
  const withNotes = makeIndex({ ...(openData as unknown as DrillData), notes: { [c.catR]: ["A note on the reason."], [c.catP]: ["A note on the predicate."], elsewhere: ["Another note."] } });
  const a = answered(c, "reason");
  expect(syllogismCard(withNotes, c, a)).toBe(GUIDE + "\n\n" + syllogismBody(withNotes, c, a) + syllogismNotes(withNotes, c));
  const tail = syllogismNotes(withNotes, c);
  expect(tail).toContain("Fine points (from the sources; apply them):\n- A note on the reason.");
  expect(tail).toContain("- A note on the predicate.");
  expect(tail).not.toContain("Another note.");
  expect(syllogismNotes(real, c)).toBe(""); // the open data has no notes
  expect(syllogismBody(withNotes, c, a)).not.toContain("Fine points"); // a server adds them itself, from the categories
});

test("the categories for the fine points are the reason's and the predicate's, the same one once", () => {
  expect(syllogismCats({ catR: "a", catP: "b" })).toEqual(["a", "b"]);
  expect(syllogismCats({ catR: "a", catP: "a" })).toEqual(["a"]);
});

test("the request asks for the lines in the order of the checks and for no machine-readable verdict", () => {
  const order = ["Reason:", "Pervasion:", "Thesis:", "Counter-example:", "Explanation:", "Misconception:"].map((l) => SYLLOGISM_ASK.indexOf(`"${l}"`));
  expect(order.every((i) => i > 0)).toBe(true);
  expect([...order].sort((x, y) => x - y)).toEqual(order);
  expect(SYLLOGISM_ASK).not.toContain("=>");
});

test("every syllogism the real data draws gets a complete card", () => {
  const rng = seeded(11);
  for (let i = 0; i < 300; i++) {
    const c = drawSyllogism(real, { hist: [], recent: [], level: 2, rng });
    for (const said of ["reason", "pervasion", "accept"] as Reply[]) {
      const body = syllogismBody(real, c, answered(c, said));
      expect(body).not.toMatch(/undefined|\[object/);
      expect(body).toContain(JSON.stringify(c.checks.v.line));
    }
  }
});
