// src/ai-shared/syllogism.ts: what the tutor is told about a syllogism. The card is made from drawn syllogisms of the real open data and the page's own grading, so it says what
// the page says; the fine points come from made-up notes.
import { expect, test } from "vitest";
import { GUIDE, makeIndex } from "../../src/ai-shared";
import type { DrillData } from "../../src/ai-shared";
import { CARRIED_SYLLOGISM, SYLLOGISM_ASK, SYLLOGISM_NOTE, syllogismBody, syllogismCard, syllogismCats, syllogismNotes } from "../../src/ai-shared/syllogism";
import type { SyllogismAnswerView } from "../../src/ai-shared/syllogism";
import { challengeQuestion, readChallenge } from "../../src/domain/challenge";
import type { Challenge } from "../../src/domain/challenge";
import { drawSyllogism, gradeExample, gradeSyllogism, gradeThesisWhy, gradeTimeout, syllogismText, thesisText } from "../../src/domain/syllogism";
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

test("the card gives the parts, the three checks with the app's lines, the right reply and the learner's reply", () => {
  const c = find((x) => x.answer === "reason" && x.checks.v.ok);
  const wrong: Reply = "accept";
  const body = syllogismBody(real, c, answered(c, wrong));
  expect(body.startsWith(SYLLOGISM_NOTE)).toBe(true);
  expect(body).toContain("CARD (from the reference's term data; S is the subject, R the reason, P the predicate):");
  expect(body).toContain(`"S":{"label":${JSON.stringify(c.subject)}`);
  expect(body).toContain(`Syllogism: ${JSON.stringify(syllogismText(c))}`);
  expect(body).toContain(`1 Reason (is S the reason?): NOT ESTABLISHED. The app's line: ${JSON.stringify(c.checks.e.line)}`);
  expect(body).toContain("2 Pervasion (is whatever is the reason also the predicate?): HOLDS.");
  expect(body).toContain(`3 Thesis (is S the predicate?): ${c.checks.t.ok ? "TRUE" : "FALSE"}.`);
  expect(body).toContain('Right reply: "The reason is not established". Learner replied: "Accept", which is wrong.');
  expect(body).toContain("What the app says was mixed up: " + gradeSyllogism(c, wrong).confusion);
});

test("a pervasion that fails comes with the counter-example the app keeps; an opposite one says so", () => {
  const c = find((x) => x.pervasion === "fails" && !!x.witness && x.answer === "pervasion");
  const body = syllogismBody(real, c, answered(c, "pervasion"));
  expect(body).toContain("2 Pervasion (is whatever is the reason also the predicate?): DOES NOT HOLD: some things that are the reason are not the predicate; the counter-example kept for you: " + JSON.stringify(c.witness));
  expect(body).toContain('Right reply: "There is no pervasion". Learner replied: "There is no pervasion", which is right.');
  expect(body).not.toContain("What the app says was mixed up");
  const o = find((x) => x.pervasion === "opposite");
  const opp = syllogismBody(real, o, answered(o, "accept"));
  expect(opp).toContain("DOES NOT HOLD: it is the opposite, nothing that is the reason is the predicate (the term chain shows it)");
  expect(opp).not.toContain("the counter-example kept for you");
});

test("a pervasion that holds names no counter-example, and an accepted syllogism has all three checks holding", () => {
  const c = find((x) => x.answer === "accept");
  const body = syllogismBody(real, c, answered(c, "accept"));
  expect(body).toContain("1 Reason (is S the reason?): ESTABLISHED.");
  expect(body).toContain("HOLDS. The app's line:");
  expect(body).toContain("3 Thesis (is S the predicate?): TRUE.");
  expect(body).not.toContain("kept for you");
});

test("time running out is said as no reply, and the learner's counter-example is quoted, cut, and given the app's verdict", () => {
  const c = find((x) => x.answer === "pervasion");
  expect(syllogismBody(real, c, answered(c, null))).toContain("The learner gave no reply: the time ran out (Sprint), so nothing was mixed up.");
  expect(syllogismBody(real, c, answered(c, null))).not.toContain("Learner replied");
  expect(SYLLOGISM_ASK).toContain("never when the time ran out");
  const long = "x".repeat(500);
  const ex = (v: "ok" | "bad" | "cmp") => syllogismBody(real, c, answered(c, "pervasion", { ex: { text: v === "cmp" ? long : 'a "quoted" thing', v } }));
  expect(ex("ok")).toContain(`The learner's counter-example: "a \\"quoted\\" thing"; app verdict ok (it is the reason and is not the predicate).`);
  expect(ex("bad")).toContain("app verdict bad (it is not the reason, or it is the predicate too)");
  expect(ex("cmp")).toContain(`"${"x".repeat(200)}"; app verdict cmp (the app does not know it well enough to say).`);
  expect(ex("cmp")).not.toContain("x".repeat(201));
  expect(syllogismBody(real, c, answered(c, "pervasion"))).not.toContain("The learner's counter-example");
});

test("thesis first: the card says how the thesis was replied to, and an attempt that ended there asks for the thesis alone", () => {
  const t = find((x) => x.checks.t.ok && x.answer === "pervasion");
  // I accept to a true thesis: right, and the reason was never shown
  const acc = syllogismBody(real, t, { sentence: thesisText(t), grade: gradeSyllogism(t, "accept", "accept"), thesis: { said: "accept", ended: true } });
  expect(acc).toContain(`Syllogism: ${JSON.stringify(thesisText(t))}`);
  expect(acc).toContain('Learner\'s reply to the thesis: "I accept", which is right. Right reply to the thesis: "I accept".');
  expect(acc).toContain('The attempt ended at the thesis, so the learner never saw the reason: write only a "Thesis:" line');
  expect(acc).not.toContain("Right reply:");
  expect(acc).not.toContain("Learner replied");
  // Why? to a true thesis: wrong, and what was mixed up is said
  const why = syllogismBody(real, t, { sentence: thesisText(t), grade: gradeThesisWhy(t), thesis: { said: "why", ended: true } });
  expect(why).toContain('Learner\'s reply to the thesis: "Why?", which is wrong.');
  expect(why).toContain("What the app says was mixed up: " + gradeThesisWhy(t).confusion);
  // Why? to a false thesis and then a denial: the plain card, with the thesis reply before the checks are read
  const f = find((x) => !x.checks.t.ok && x.answer === "reason");
  const went = syllogismBody(real, f, { sentence: syllogismText(f), grade: gradeSyllogism(f, "reason", "why"), thesis: { said: "why", ended: false } });
  expect(went).toContain('Right reply: "The reason is not established". Learner replied: "The reason is not established", which is right.');
  expect(went).toContain('Learner\'s reply to the thesis: "Why?", which is right.');
  expect(went).not.toContain("The attempt ended at the thesis");
  // the time ran out on the thesis
  const late = syllogismBody(real, f, { sentence: thesisText(f), grade: gradeTimeout(f, null), thesis: { said: null, ended: true } });
  expect(late).toContain('The time ran out on the thesis (Sprint), so nothing was mixed up. Right reply to the thesis: "Why?".');
  // without thesis first none of it is said
  expect(syllogismBody(real, f, answered(f, "reason"))).not.toContain("thesis first");
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

test("the categories for the fine points are the reason's and the predicate's, the same one once, and none for a part without a category", () => {
  expect(syllogismCats({ catR: "a", catP: "b" })).toEqual(["a", "b"]);
  expect(syllogismCats({ catR: "a", catP: "a" })).toEqual(["a"]);
  expect(syllogismCats({ catR: "", catP: "" })).toEqual([]);
  expect(syllogismCats({ catR: "", catP: "b" })).toEqual(["b"]);
});

test("the card of a syllogism that came with its answer says where the checks are from, and gives its parts by their words", () => {
  const says = { subject: "a bat", predicate: "a bird", reason: "something that flies" };
  const made = (answer: object): Syllogism => {
    const ch = readChallenge({ id: "outside-the-data", date: "2026-11-11", title: "Outside the data", items: [{ exercise: "syllogism", says, answer }] }) as Challenge;
    return (challengeQuestion(real, ch, 0) as { syllogism: Syllogism }).syllogism;
  };
  const c = made({ reason: true, pervasion: false, thesis: false, witness: "a dragonfly" });
  const body = syllogismBody(real, c, answered(c, "reason", { ex: { text: "an airplane", v: gradeExample(real, c, "an airplane").v as "cmp" } }));
  expect(body.startsWith(SYLLOGISM_NOTE + "\nCARD (" + CARRIED_SYLLOGISM + "; S is the subject, R the reason, P the predicate):\n")).toBe(true);
  expect(body).not.toContain("CARD (from the reference's term data");
  expect(body).toContain('"R":{"label":"something that flies"},"P":{"label":"a bird"}');
  expect(body).toContain("Checks (they came with the task):");
  expect(body).not.toContain("Checks (the app settled them):");
  expect(body).toContain('1 Reason (is S the reason?): ESTABLISHED. The app\'s line: "A bat is something that flies."');
  expect(body).toContain('2 Pervasion (is whatever is the reason also the predicate?): DOES NOT HOLD: some things that are the reason are not the predicate; the counter-example kept for you: "a dragonfly".');
  expect(body).toContain('3 Thesis (is S the predicate?): FALSE. The app\'s line: "A bat is not a bird."');
  expect(body).toContain('Right reply: "There is no pervasion". Learner replied: "The reason is not established", which is wrong.');
  expect(body).toContain('The learner\'s counter-example: "an airplane"; app verdict cmp (the app does not know it well enough to say).');
  expect(body).not.toMatch(/undefined|NaN|\[object/);
  // an opposite pervasion that was written, not found in the term chain
  const opp = syllogismBody(real, made({ reason: true, pervasion: "opposite", thesis: false }), answered(made({ reason: true, pervasion: "opposite", thesis: false }), "pervasion"));
  expect(opp).toContain("DOES NOT HOLD: it is the opposite, nothing that is the reason is the predicate. The app's line:");
  expect(opp).not.toContain("the term chain shows it");
  // no categories, so no fine points: the card is the instructions and the body
  expect(syllogismNotes(real, c)).toBe("");
  expect(syllogismCard(real, c, answered(c, "pervasion"))).toBe(GUIDE + "\n\n" + syllogismBody(real, c, answered(c, "pervasion")));
  // a syllogism of the data keeps its heading
  const drawn = find((x) => x.answer === "pervasion");
  expect(syllogismBody(real, drawn, answered(drawn, "pervasion"))).toContain("CARD (from the reference's term data; S is the subject");
  expect(syllogismBody(real, drawn, answered(drawn, "pervasion"))).toContain("Checks (the app settled them):");
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
