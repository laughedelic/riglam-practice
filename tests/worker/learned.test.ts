// Learned facts (worker/learned.ts): after an explain question, what the answer says of each example the page could not check is kept in example_facts,
// one row per example and category. Only where EXAMPLE_FACTS says so (the previews block), and only for the examples the page named.
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../worker/app";
import { parseRequest } from "../../worker/tutor";
import { NOW, ask, events, fakeKit, fakeModels, json, setup, type Round } from "./support";
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

  it("are kept and answered on Previews only: production has no EXAMPLE_FACTS", () => {
    const wrangler = readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8");
    const at = wrangler.indexOf('"previews"');
    expect(wrangler.slice(0, at)).not.toMatch(/"EXAMPLE_FACTS"/);
    expect(wrangler.slice(at)).toMatch(/"EXAMPLE_FACTS":\s*"serve"/);
  });
});

describe("known facts", () => {
  const known = async (s: Setup, body: unknown, env: Partial<Env> = {}, headers = s.headers()) => {
    const app = createApp({ kit: async () => fakeKit().kit, now: () => NOW });
    return app.request("/api/known", { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) }, { EXAMPLE_FACTS: "serve", ...s.env, ...env } as Env);
  };
  const unanimous = (s: Setup, a: string, b: string, env: Partial<Env> = { EXAMPLE_FACTS: "serve" }) =>
    explain(s, { [HAIKU]: [text(line("Both", "a table", a, b))], [SONNET]: [text(line("Both", "a table", a, b))], [OPUS]: [text(line("Both", "a table", a, b))] }, { quorum: true }, { QUORUM: "on", ...env });

  it("answer an example both of whose sides may be served, as the tutor's line for the cell asked about", async () => {
    const s = await setup();
    await unanimous(s, "yes", "no");
    const res = await known(s, { cats: ["c_form", "c_round"], examples: [{ cell: "anb", text: "The table" }, { cell: "nei", text: "a stone" }] });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await json(res)).toEqual({ known: [{ cell: "anb", text: "The table", line: 'A not B: "The table" | class: Table | A yes: it is a form | B no: it is round', by: "learned" }] });
    // the categories the other way round give the sides the other way round
    expect((await json(await known(s, { cats: ["c_round", "c_form"], examples: [{ cell: "bna", text: "a table" }] }))).known[0].line).toBe('B not A: "a table" | class: Table | A no: it is round | B yes: it is a form');
  });

  it("answer an example with one servable side that already fails the cell, with that side only and the other left unsure", async () => {
    const s = await setup();
    await unanimous(s, "yes", "no");                  // a table: a form, not round
    s.db.sql("DELETE FROM example_facts WHERE cat = 'c_round'");
    const ask = (cell: string, cats = ["c_form", "c_round"]) => known(s, { cats, examples: [{ cell, text: "a table" }] }).then(json);
    expect(await ask("nei")).toEqual({ known: [{ cell: "nei", text: "a table", line: 'Neither: "a table" | class: Table | A yes: it is a form | B unsure: ', by: "learned", half: true }] });
    expect((await ask("bna")).known[0], "A must be no there").toMatchObject({ half: true, line: 'B not A: "a table" | class: Table | A yes: it is a form | B unsure: ' });
    expect((await ask("anb")).known, "a yes for A could still fit: it takes both sides to say so").toEqual([]);
    expect((await ask("both")).known, "the same").toEqual([]);
    // the other category pair, the other way round: the form is B now
    expect((await ask("nei", ["c_round", "c_form"])).known[0]).toMatchObject({ cell: "nei", half: true, line: 'Neither: "a table" | class: Table | A unsure:  | B yes: it is a form' });
    // both sides known: a whole line, with no half
    await unanimous(s, "yes", "no");
    expect((await ask("anb")).known[0]).not.toHaveProperty("half");
    expect((await ask("nei")).known[0], "the other side is there now").toMatchObject({ cell: "nei" });
    expect((await ask("nei")).known[0]).not.toHaveProperty("half");
  });

  it("do not serve a half from a row that is not servable, and call it reviewed only when every row it rests on is", async () => {
    const s = await setup();
    await unanimous(s, "yes", "no");
    s.db.sql("DELETE FROM example_facts WHERE cat = 'c_round'");
    const nei = { cats: ["c_form", "c_round"], examples: [{ cell: "nei", text: "a table" }] };
    s.db.sql("UPDATE example_facts SET state = 'disputed'");
    expect((await json(await known(s, nei))).known, "a disputed side").toEqual([]);
    s.db.sql("UPDATE example_facts SET state = 'reviewed'");
    expect((await json(await known(s, nei))).known[0]).toMatchObject({ half: true, by: "reviewed" });
    s.db.sql("UPDATE example_facts SET state = 'checked'");
    expect((await json(await known(s, nei))).known[0]).toMatchObject({ half: true, by: "learned" });
  });

  it("answer nothing of a candidate, a disputed or an older row, and say reviewed where the maintainer decided both sides", async () => {
    const s = await setup();
    await explain(s, { [SONNET]: [text(line("Both", "a table", "yes", "no"))] }, {}, { EXAMPLE_FACTS: "serve" }); // one model: candidates
    const ask = { cats: ["c_form", "c_round"], examples: [{ cell: "anb", text: "a table" }] };
    expect((await json(await known(s, ask))).known).toEqual([]);
    s.db.sql("UPDATE example_facts SET state = 'checked'");
    expect((await json(await known(s, ask))).known).toHaveLength(1);
    s.db.sql("UPDATE example_facts SET epoch = 0");
    expect((await json(await known(s, ask))).known, "an older epoch").toEqual([]);
    s.db.sql("UPDATE example_facts SET state = 'reviewed'");
    expect((await json(await known(s, ask))).known[0].by).toBe("reviewed");
    s.db.sql("UPDATE example_facts SET state = 'disputed', epoch = 1 WHERE cat = 'c_round'");
    expect((await json(await known(s, ask))).known, "one side disputed").toEqual([]);
  });

  it("are answered only where EXAMPLE_FACTS is serve, to a device with the Magic Key, for a well-formed question", async () => {
    const s = await setup();
    await unanimous(s, "yes", "no");
    const ask = { cats: ["c_form", "c_round"], examples: [{ cell: "anb", text: "a table" }] };
    for (const EXAMPLE_FACTS of [undefined, "record", "off"]) expect((await known(s, ask, { EXAMPLE_FACTS })).status, String(EXAMPLE_FACTS)).toBe(503);
    expect((await known(s, ask, {}, s.headers({ "x-riglam-proof": "0".repeat(64) }))).status).toBe(401);
    for (const body of ["not json", { cats: ["c_form"], examples: ask.examples }, { cats: ask.cats, examples: [] }, { cats: ask.cats, examples: [{ cell: "q1", text: "a table" }] }])
      expect((await known(s, body)).status, JSON.stringify(body)).toBe(400);
    expect((await known(s, "x".repeat(9000))).status).toBe(413);
    expect((await json(await known(s, { cats: ["c_form", "other"], examples: ask.examples }))).known, "a category the data does not have").toEqual([]);
  });

  it("are offered in health where the tutor is on and EXAMPLE_FACTS is serve", async () => {
    const health = async (env: Partial<Env>) => {
      const s = await setup(env);
      return (await createApp({ kit: async () => fakeKit().kit, now: () => NOW }).request("/api/health", {}, s.env)).json();
    };
    expect(await health({ EXAMPLE_FACTS: "serve" })).toMatchObject({ tutor: "on", known: "on" });
    expect(await health({ EXAMPLE_FACTS: "record" })).not.toHaveProperty("known");
    expect(await health({ EXAMPLE_FACTS: "serve", ANTHROPIC_API_KEY: undefined })).not.toHaveProperty("known");
  });

  it("say unavailable, not nothing, when the table cannot be read", async () => {
    const s = await setup();
    s.db.sql("DROP TABLE example_facts");
    expect((await known(s, { cats: ["c_form", "c_round"], examples: [{ cell: "anb", text: "a table" }] })).status).toBe(503);
  });
});
