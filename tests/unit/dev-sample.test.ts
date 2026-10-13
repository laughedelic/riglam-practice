// The stand-in for the model that `npm run dev` uses (src/pwa/dev-sample.ts): its replies must be in the shape the page reads.
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { DEV_MARK, devSample } from "../../src/pwa/dev-sample";

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

/** Runs a call to its end (the stand-in waits and streams on timers). */
async function done<T>(p: Promise<T>): Promise<T> {
  const settled = p.then((v) => ({ v }), (e) => ({ e }));
  await vi.runAllTimersAsync();
  const r = await settled;
  if ("e" in r) throw r.e;
  return r.v;
}

// the page's first turn is its instructions and the card, then the question after a blank line
const CARD = "You are a terse debate tutor.\n\nCARD (from the course booklet's term data):\n{}\nCells:\n- Both: learner wrote \"x\"";
const explainAsk = (open: string) => `${CARD}\n\nExplain this answer. Use these lines, in this order:\n- ...\nThe page could not check the examples in: ${open}. End each of those cell lines with " => yes" if ...`;
// the page's reading of a verdict line (src/app/ai/tutor.js, applyVerify)
const VERDICT_LINE = /^(both|a not b|b not a|neither|q[1-4])\s*:\s*(.*?)\s*=>\s*(yes|no|unsure)\W*$/i;

test("an explanation has the lines the page reads, and a verdict for each cell it could not check", async () => {
  const r = await done(devSample()([{ role: "user", content: explainAsk("Both, A not B, Neither") }]));
  const lines = r.text.split("\n");
  const verdicts = lines.map((l) => VERDICT_LINE.exec(l)).filter((m) => m !== null);
  expect(verdicts.map((m) => m[1])).toEqual(["Both", "A not B", "Neither"]);
  expect(new Set(verdicts.map((m) => m[3]))).toEqual(new Set(["yes", "no", "unsure"]));
  for (const label of ["Common locus:", "Pervasion:", "Explanation:", "Misconception:"]) expect(lines.some((l) => l.startsWith(label)), label).toBe(true);
  expect(r.truncated).toBe(false);
});

test("an explanation of a debate names the relation instead of a common locus, and no cell lines when none are open", async () => {
  const r = await done(devSample()([{ role: "user", content: `${CARD}\n\nExplain this debate. Use these lines, in this order:\n- ...` }]));
  expect(r.text).toMatch(/^Relation:/m);
  expect(r.text).not.toMatch(/Common locus:/);
  expect(r.text.split("\n").filter((l) => VERDICT_LINE.test(l))).toEqual([]);
});

test("a question in the chat gets a reply that says no model was asked and quotes the question, not the card", async () => {
  const first = await done(devSample()([{ role: "user", content: `${CARD}\n\nWhy is wood not a sense object?` }]));
  expect(first.text).toContain(DEV_MARK);
  expect(first.text).toContain("Why is wood not a sense object?");
  expect(first.text).not.toContain("terse debate tutor");
  const later = await done(devSample()([{ role: "user", content: CARD }, { role: "assistant", content: "a" }, { role: "user", content: "And what about a song?" }]));
  expect(later.text).toContain("And what about a song?");
});

test("the text arrives in growing pieces and ends as the whole reply", async () => {
  const seen: string[] = [];
  const r = await done(devSample()([{ role: "user", content: "hello there" }], { onText: ({ text }) => seen.push(text) }));
  expect(seen.length).toBeGreaterThan(3);
  for (let i = 1; i < seen.length; i++) expect(seen[i].startsWith(seen[i - 1])).toBe(true);
  expect(seen.at(-1)).toBe(r.text);
});

test("stopping the call keeps what has arrived and says it was cancelled", async () => {
  const ctl = new AbortController();
  let last = "";
  const p = devSample()([{ role: "user", content: "a question with enough words to be cut in the middle of the reply" }], { signal: ctl.signal, onText: ({ text }) => { last = text; if (text.length > 40) ctl.abort(); } });
  const err = await done(p).catch((e) => e);
  expect(err.code).toBe("cancelled");
  expect(err.text).toBe(last);
  expect(err.text.length).toBeGreaterThan(40);
});

test("the check lab gets JSON for the things it listed, from the model it asked for", async () => {
  const prompt = 'Check these.\nThings:\n1. "a clay pot"\n2. "the horn of a rabbit"\n';
  const r = await done(devSample()(prompt, { model: "some-model", modelTier: "fast" }));
  expect(r.modelApplied).toBe("some-model");
  expect(r.modelTierApplied).toBe("fast");
  const parsed = JSON.parse(r.text);
  expect(parsed.things.map((t: { thing: string }) => t.thing)).toEqual(["a clay pot", "the horn of a rabbit"]);
  expect(parsed.things[0]).toMatchObject({ inA: true, inB: true, exists: true, unsure: false });
  expect(parsed.things[0].right).toBeUndefined();

  const judged = JSON.parse((await done(devSample()(`You are the judge.\n${prompt}`, { model: "judge-model" }))).text);
  expect(judged.things[0]).toMatchObject({ right: [1, 2, 3] });
});

test("?ai=rate_limited and ?ai=error fail with the codes the page has messages for", async () => {
  const turns = [{ role: "user", content: "hi" }];
  expect((await done(devSample("rate_limited")(turns)).catch((e) => e)).code).toBe("rate_limited");
  expect((await done(devSample("error")(turns)).catch((e) => e)).code).toBe("error");
});

test("Stop while the call waits is a cancel, also in the failure modes", async () => {
  const turns = [{ role: "user", content: "hi" }];
  for (const mode of [null, "rate_limited", "error"]) {
    const ctl = new AbortController();
    const p = devSample(mode)(turns, { signal: ctl.signal });
    ctl.abort();
    const err = await done(p).catch((e) => e);
    expect(err.code, String(mode)).toBe("cancelled");
    expect(err.text, String(mode)).toBe("");
  }
});
