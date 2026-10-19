// Learned facts (worker/learned.ts): after an explain question, what the answer says of each example the page could not check is kept in example_facts,
// one row per example and category. Only where EXAMPLE_FACTS says so (the previews block), and only for the examples the page named.
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../worker/app";
import { parseRequest } from "../../worker/tutor";
import { NOW, ask, events, fakeKit, fakeModels, setup, type Round } from "./support";
import type { Env } from "../../worker/env";

type Setup = Awaited<ReturnType<typeof setup>>;

const HAIKU = "claude-haiku-5-5";
const SONNET = "claude-sonnet-5-5";
const OPUS = "claude-opus-5-5";

/** An explain line as the tutor writes it (src/domain/verdict.ts). */
const line = (cell: string, example: string, a: string, b: string) => `${cell}: "${example}" | class: a table | A ${a}: it is a form | B ${b}: it is round; pervasion: what is round`;
const text = (...lines: string[]): Round => ({ text: [lines.join("\n")], usage: { input: 1000, output: 200 } });
const TABLE = [{ cell: "both", text: "A table" }];

async function explain(s: Setup, rounds: Record<string, Round[]>, over: Record<string, unknown> = {}, env: Partial<Env> = {}) {
  const models = fakeModels(rounds);
  const app = createApp({ kit: async () => fakeKit().kit, fetch: models.fetch, now: () => NOW, retries: 0 });
  const res = await app.request("/api/tutor", { method: "POST", headers: s.headers(), body: ask({ examples: TABLE, ...over }) }, { EXAMPLE_FACTS: "record", ...s.env, ...env } as Env);
  return { res, got: await events(res), models };
}
const facts = (s: Setup) =>
  s.db.sql<Record<string, any>>("SELECT thing, cat, answer, cls, reason, state, agree, against, src, models, epoch, text, seen, first_day, last_day FROM example_facts ORDER BY thing, cat");

beforeEach(() => void vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

describe("learned facts", () => {
  it("keep, per category, what the one model's answer says of an example the page named", async () => {
    const s = await setup();
    const { got } = await explain(s, { [SONNET]: [text(line("Both", "a table", "yes", "no"), line("Neither", "a stone", "no", "no"), "Common locus: yes.")] });
    expect(got.map((e) => e.type)).toEqual(["delta", "done"]); // the learner's answer is as ever
    expect(facts(s)).toEqual([
      { thing: "table", cat: "c_form", answer: "yes", cls: "Table", reason: "it is a form", state: "candidate", agree: 1, against: 0, src: "explain", models: JSON.stringify([{ model: SONNET, answer: "yes" }]), epoch: 1, text: "A table", seen: 1, first_day: "2026-10-13", last_day: "2026-10-13" },
      { thing: "table", cat: "c_round", answer: "no", cls: "Table", reason: "it is round", state: "candidate", agree: 1, against: 0, src: "explain", models: JSON.stringify([{ model: SONNET, answer: "no" }]), epoch: 1, text: "A table", seen: 1, first_day: "2026-10-13", last_day: "2026-10-13" },
    ]);
  });

  it("read only the final answer: the words before a lookup do not count", async () => {
    const s = await setup();
    await explain(s, { [SONNET]: [{ text: [line("Both", "a table", "no", "no")], tool: { id: "t1", name: "lookup_term", input: { name: "Form" } } }, text(line("Both", "a table", "yes", "yes"))] });
    expect(facts(s).map((r) => r.answer)).toEqual(["yes", "yes"]);
  });

  it("a second answer that agrees makes a fact checked, one that does not makes it disputed", async () => {
    const s = await setup();
    await explain(s, { [SONNET]: [text(line("Both", "a table", "yes", "no"))] });
    await explain(s, { [SONNET]: [text(line("A not B", "the table", "yes", "yes"))] });
    expect(facts(s).map((r) => [r.cat, r.answer, r.state, r.agree, r.against, r.seen])).toEqual([
      ["c_form", "yes", "checked", 2, 0, 2],
      ["c_round", "no", "disputed", 1, 1, 2],
    ]);
  });

  it("take a Quorum run as one analysis: checked where every model agrees, the judge's ruling a candidate", async () => {
    const s = await setup();
    const { got } = await explain(
      s,
      {
        [HAIKU]: [text(line("Both", "a table", "yes", "no"))],
        [SONNET]: [text(line("Both", "a table", "yes", "yes"))],
        [OPUS]: [text(line("Both", "a table", "yes", "no")), text(line("Both", "a table", "yes", "no"))],
      },
      { quorum: true },
      { QUORUM: "on" },
    );
    expect(got.map((e) => e.type)).toContain("quorum");
    expect(facts(s).map((r) => [r.cat, r.answer, r.state, r.src, JSON.parse(r.models).map((m: { answer: string }) => m.answer)])).toEqual([
      ["c_form", "yes", "checked", "quorum", ["yes", "yes", "yes", "yes"]],
      ["c_round", "no", "candidate", "quorum", ["no", "yes", "no", "no"]],
    ]);
  });

  it("keep nothing where EXAMPLE_FACTS is not record or serve", async () => {
    for (const EXAMPLE_FACTS of [undefined, "", "off", "on", "yes"]) {
      const s = await setup();
      await explain(s, { [SONNET]: [text(line("Both", "a table", "yes", "no"))] }, {}, { EXAMPLE_FACTS });
      expect(facts(s)).toEqual([]);
    }
    const s = await setup();
    await explain(s, { [SONNET]: [text(line("Both", "a table", "yes", "no"))] }, {}, { EXAMPLE_FACTS: "serve" });
    expect(facts(s)).toHaveLength(2);
  });

  it("keep nothing of examples the page did not name, of a chat question, of a failed answer, or for categories the data does not have", async () => {
    const answer = { [SONNET]: [text(line("Both", "a table", "yes", "no"), line("Neither", "a stone", "no", "no"))] };
    const cases: [Record<string, unknown>, Record<string, Round[]>?][] = [
      [{ examples: undefined }],
      [{ examples: [{ cell: "nei", text: "a song" }] }],
      [{ kind: "chat" }],
      [{ cats: ["c_form", "other"] }],
      [{ cats: ["c_form", "c_form"] }],
      [{}, { [SONNET]: [{ error: { status: 500, type: "api_error" } }] }],
    ];
    for (const [over, rounds] of cases) {
      const s = await setup();
      await explain(s, rounds ?? answer, over);
      expect(facts(s), JSON.stringify(over)).toEqual([]);
    }
    const s = await setup();
    await explain(s, answer, { examples: [...TABLE, { cell: "nei", text: "x".repeat(81) }, { cell: "nei", text: "a stone" }] });
    expect(facts(s).map((r) => r.thing)).toEqual(["stone", "stone", "table", "table"]);
  });

  it("stop adding examples when the table is full, and still update those it has", async () => {
    const s = await setup();
    await explain(s, { [SONNET]: [text(line("Both", "a table", "yes", "no"))] }, {}, { EXAMPLE_FACTS_MAX_ROWS: "2" });
    await explain(s, { [SONNET]: [text(line("Both", "a table", "yes", "no"), line("Neither", "a stone", "no", "no"))] }, { examples: [...TABLE, { cell: "nei", text: "a stone" }] }, { EXAMPLE_FACTS_MAX_ROWS: "2" });
    expect(facts(s).map((r) => [r.thing, r.state])).toEqual([["table", "checked"], ["table", "checked"]]);
  });

  it("never fail the answer when the facts cannot be written", async () => {
    const s = await setup();
    s.db.sql("DROP TABLE example_facts");
    const { got } = await explain(s, { [SONNET]: [text(line("Both", "a table", "yes", "no"))] });
    expect(got.map((e) => e.type)).toEqual(["delta", "done"]);
  });

  it("are named in the request as a short list of the learner's examples, on an explain question only", () => {
    const turns = [{ role: "user", content: "x" }];
    expect(parseRequest({ kind: "explain", cats: [], turns, examples: [{ cell: "both", text: "a pot", extra: 1 }] })).toEqual({ ok: true, request: { kind: "explain", cats: [], turns, examples: [{ cell: "both", text: "a pot" }] } });
    expect((parseRequest({ kind: "chat", cats: [], turns, examples: [{ cell: "both", text: "a pot" }] }) as { request: object }).request).not.toHaveProperty("examples");
    expect((parseRequest({ kind: "explain", cats: [], turns, examples: [] }) as { request: object }).request).not.toHaveProperty("examples");
    for (const examples of ["a pot", [{ cell: "q1", text: "a pot" }], [{ cell: "both", text: "" }], [{ cell: "both", text: "x".repeat(201) }], Array(9).fill({ cell: "both", text: "a pot" }), [null]])
      expect(parseRequest({ kind: "explain", cats: [], turns, examples }), JSON.stringify(examples).slice(0, 40)).toMatchObject({ ok: false, code: "bad_request" });
  });

  it("are kept on Previews only: production has no EXAMPLE_FACTS", () => {
    const wrangler = readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8");
    const at = wrangler.indexOf('"previews"');
    expect(wrangler.slice(0, at)).not.toMatch(/"EXAMPLE_FACTS"/);
    expect(wrangler.slice(at)).toMatch(/"EXAMPLE_FACTS":\s*"record"/);
  });
});
