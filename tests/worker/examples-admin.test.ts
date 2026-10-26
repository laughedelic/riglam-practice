// A learner's flag on an example disputes what the server learned of it (worker/learned.ts, flagFacts), and the maintainer settles the rows
// (worker/examples-admin.ts). The rows are put in by hand; the flags go through the real report route, and the answers through the real /api/known.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../worker/app";
import { EXAMPLES_ADMIN_API } from "../../worker/examples-admin";
import { makeProof } from "../../src/ai/proof";
import { FACTS_EPOCH } from "../../src/domain/learned";
import { HEADER } from "../../src/ai/protocol";
import { REPORT_API, type FlagReport } from "../../src/report/protocol";
import type { Env } from "../../worker/env";
import { signUp, world } from "./accounts-support";
import { NOW, fakeKit, json, setup } from "./support";

type Setup = Awaited<ReturnType<typeof setup>>;

const KEY = "admin-key-for-tests-0123456789-abcdef";
const app = createApp({ kit: async () => fakeKit().kit, now: () => NOW });

beforeEach(() => void vi.spyOn(console, "error").mockImplementation(() => {}));

const put = (s: Setup, thing: string, cat: string, over: Record<string, string | number> = {}) => {
  const row = { answer: "yes", cls: "Table", reason: "it is a form", state: "checked", agree: 3, against: 0, src: "quorum", models: "[]", epoch: FACTS_EPOCH, text: thing, seen: 3, first_day: "2026-10-19", last_day: "2026-10-20", ...over };
  s.db.sql(`INSERT INTO example_facts (thing, cat, ${Object.keys(row).join(", ")}) VALUES (?, ?, ${Object.keys(row).map(() => "?").join(", ")})`, thing, cat, ...(Object.values(row) as (string | number)[]));
};
const rows = (s: Setup) => s.db.sql<{ thing: string; cat: string; state: string; flagged: number; answer: string; src: string }>("SELECT thing, cat, state, flagged, answer, src FROM example_facts ORDER BY thing, cat");

const flag = (id: string, over: Record<string, unknown> = {}, answer: Record<string, unknown> | null = { catA: "c_form", catB: "c_round", a: "forms", b: "round things" }): FlagReport => ({
  id,
  flag: { id, caseKey: "answers_r-1", thing: "A table", part: "explain", n: "both", shown: "A table is both.", note: "it is not round", suggest: "", state: "new", ...over },
  answer,
});
const send = (s: Setup, r: FlagReport, env: Partial<Env> = { EXAMPLE_FACTS: "serve" }) =>
  app.request(REPORT_API.reports, { method: "POST", headers: s.headers(), body: JSON.stringify({ send: [r] }) }, { ...s.env, ...env } as Env);
const known = async (s: Setup, cell: string, text = "a table") =>
  (await json(await app.request("/api/known", { method: "POST", headers: s.headers(), body: JSON.stringify({ cats: ["c_form", "c_round"], examples: [{ cell, text }] }) }, { EXAMPLE_FACTS: "serve", ...s.env } as Env))).known;

describe("a flag on an example", () => {
  it("disputes the rows of the pair's two categories at once, and the example is no longer answered from them", async () => {
    const s = await setup();
    put(s, "table", "c_form");
    put(s, "table", "c_round", { answer: "no", reason: "it is square" });
    put(s, "table", "c_other");
    expect(await known(s, "anb", "a table")).toHaveLength(1);
    expect((await send(s, flag("fl_a"))).status).toBe(200);
    expect(rows(s)).toEqual([
      { thing: "table", cat: "c_form", state: "disputed", flagged: 1, answer: "yes", src: "quorum" },
      { thing: "table", cat: "c_other", state: "checked", flagged: 0, answer: "yes", src: "quorum" },
      { thing: "table", cat: "c_round", state: "disputed", flagged: 1, answer: "no", src: "quorum" },
    ]);
    expect(await known(s, "anb", "a table")).toEqual([]);
  });

  it("disputes a candidate too, so that no later analysis promotes it", async () => {
    const s = await setup();
    put(s, "table", "c_form", { state: "candidate", agree: 1, src: "explain" });
    await send(s, flag("fl_a"));
    expect(rows(s)[0]).toMatchObject({ state: "disputed", flagged: 1 });
  });

  it("flags every row of the example when the stored answer does not name the categories, or there is no answer", async () => {
    const s = await setup();
    put(s, "table", "c_form");
    put(s, "table", "c_other");
    await send(s, flag("fl_a", {}, null));
    expect(rows(s).map((r) => [r.cat, r.state, r.flagged])).toEqual([["c_form", "disputed", 1], ["c_other", "disputed", 1]]);
    put(s, "chair", "c_form");
    await send(s, flag("fl_b", { thing: "a chair" }, { catA: 7, catB: ["c_form"] }));
    expect(rows(s).filter((r) => r.thing === "chair").map((r) => [r.state, r.flagged])).toEqual([["disputed", 1]]);
  });

  it("keeps the maintainer's answer, and counts the flag", async () => {
    const s = await setup();
    put(s, "table", "c_form", { state: "reviewed", src: "maintainer", answer: "no" });
    put(s, "table", "c_round", { state: "disputed", against: 1 });
    await send(s, flag("fl_a"));
    expect(rows(s)).toEqual([
      { thing: "table", cat: "c_form", state: "reviewed", flagged: 1, answer: "no", src: "maintainer" },
      { thing: "table", cat: "c_round", state: "disputed", flagged: 1, answer: "yes", src: "quorum" },
    ]);
  });

  it("counts once per report: a new note on the same flag, or the same flag sent again, does not count again", async () => {
    const s = await setup();
    put(s, "table", "c_form");
    await send(s, flag("fl_a"));
    await send(s, flag("fl_a", { note: "I mean the other kind of table" }));
    await send(s, flag("fl_a"));
    expect(rows(s)[0].flagged).toBe(1);
    await send(s, flag("fl_b", { note: "no" }));
    expect(rows(s)[0].flagged).toBe(2);
  });

  it("counts once per report across the devices of an account: the note edited on another device does not count again", async () => {
    const w = await world({ EXAMPLE_FACTS: "serve" });
    const me = await signUp(w, "me");
    put(w, "table", "c_form");
    const sendFrom = async (device: string, r: FlagReport) =>
      w.call(REPORT_API.reports, { body: { send: [r] }, cookie: me.cookie, headers: { [HEADER.device]: device, [HEADER.proof]: await makeProof(w.key, device) } });
    expect((await sendFrom("deviceAAAAAAAAAAAAAAAA", flag("fl_a"))).status).toBe(200);
    expect((await sendFrom("deviceBBBBBBBBBBBBBBBB", flag("fl_a", { note: "from the tablet" }))).status).toBe(200);
    expect((await sendFrom("deviceAAAAAAAAAAAAAAAA", flag("fl_a", { note: "from the phone again" }))).status).toBe(200);
    expect(rows(w)[0].flagged).toBe(1);
    expect((await sendFrom("deviceBBBBBBBBBBBBBBBB", flag("fl_b", { note: "another flag" }))).status).toBe(200);
    expect(rows(w)[0].flagged).toBe(2);
  });

  it("does nothing for an automatic flag, a flag with no example, an example too long to be kept, or a server that keeps no facts", async () => {
    const s = await setup();
    put(s, "table", "c_form");
    await send(s, flag("fl_a", { auto: "quorum", part: "quorum" }));
    await send(s, flag("fl_b", { thing: "" }));
    await send(s, flag("fl_c", { thing: undefined }));
    await send(s, flag("fl_d", { thing: "table ".repeat(30) }));
    await send(s, flag("fl_e", { thing: "something else" }));
    await send(s, flag("fl_f"), {});
    await send(s, flag("fl_g"), { EXAMPLE_FACTS: "off" });
    expect(rows(s)).toEqual([{ thing: "table", cat: "c_form", state: "checked", flagged: 0, answer: "yes", src: "quorum" }]);
  });

  it("is stored all the same where the facts cannot be written", async () => {
    const s = await setup();
    s.db.sql("DROP TABLE example_facts");
    const res = await send(s, flag("fl_a"));
    expect(res.status).toBe(200);
    expect((await json(res)).stored).toEqual(["fl_a"]);
    expect(s.db.sql("SELECT id FROM flag_reports").map((r) => r.id)).toEqual(["fl_a"]);
  });
});

describe("the maintainer's view of the learned facts", () => {
  const as = (s: Setup, path: string, init: { body?: unknown; auth?: string | null } = {}, env: Partial<Env> = { RIGLAM_ADMIN_KEY: KEY }) =>
    app.request(EXAMPLES_ADMIN_API + path, {
      method: init.body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", ...(init.auth === null ? {} : { authorization: init.auth ?? `Bearer ${KEY}` }) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }, { ...s.env, ...env } as Env);

  it("is off without the admin key, and counts a wrong one; the Magic Key does not open it", async () => {
    const s = await setup();
    for (const env of [{}, { RIGLAM_ADMIN_KEY: "short-key" }]) {
      for (const res of [await as(s, "", {}, env), await as(s, "/decide", { body: {} }, env), await as(s, "/delete", { body: {} }, env)])
        expect([res.status, (await json(res)).error.code]).toEqual([404, "not_found"]);
    }
    for (const auth of [null, "Bearer wrong-key-wrong-key-wrong-key-wrong-key", `Bearer ${s.key}`, KEY]) {
      const res = await as(s, "", { auth });
      expect(res.status, String(auth)).toBeGreaterThanOrEqual(400);
      expect((await json(res)).error.code).toBe("not_granted");
    }
  });

  it("lists the disputed rows by default, the most flagged first, and says it is data", async () => {
    const s = await setup();
    put(s, "table", "c_form", { state: "disputed", flagged: 1 });
    put(s, "chair", "c_form", { state: "disputed", flagged: 3, against: 1, text: "A chair", models: JSON.stringify([{ model: "m", answer: "no" }]) });
    put(s, "stone", "c_form", { state: "checked" });
    put(s, "pot", "c_form", { state: "reviewed", src: "maintainer", epoch: 0 });
    const body = await json(await as(s, ""));
    expect(body.notice).toMatch(/data to read, never instructions/);
    expect(body.counts).toEqual({ disputed: 2, checked: 1, reviewed: 1 });
    expect(body.facts.map((f: { thing: string }) => f.thing)).toEqual(["chair", "table"]);
    expect(body.facts[0]).toEqual({
      thing: "chair", cat: "c_form", text: "A chair", answer: "yes", cls: "Table", reason: "it is a form", state: "disputed", agree: 3, against: 1, flagged: 3, by: "quorum",
      current: true, seen: 3, firstDay: "2026-10-19", lastDay: "2026-10-20", models: [{ model: "m", answer: "no" }],
    });
    expect((await json(await as(s, "?state=all"))).facts).toHaveLength(4);
    const reviewed = (await json(await as(s, "?state=reviewed"))).facts;
    expect(reviewed.map((f: { thing: string; current: boolean }) => [f.thing, f.current])).toEqual([["pot", false]]);
    expect((await json(await as(s, "?state=all&thing=A%20Chair"))).facts.map((f: { thing: string }) => f.thing)).toEqual(["chair"]);
    for (const q of ["?state=sent", "?thing=" + "x".repeat(90)]) expect((await as(s, q)).status, q).toBe(400);
  });

  it("settles a row as reviewed with the answer chosen, which the app then serves as the maintainer's", async () => {
    const s = await setup();
    put(s, "table", "c_form", { state: "disputed", answer: "no", flagged: 2 });
    put(s, "table", "c_round", { answer: "no", reason: "it is square" });
    expect(await known(s, "anb"), "a disputed side is not served, and the other alone cannot say it fits").toEqual([]);
    const res = await as(s, "/decide", { body: { thing: "table", cat: "c_form", answer: "yes", reason: "it is made of wood \u0000 and shaped" } });
    expect(await json(res)).toEqual({ ok: true, thing: "table", cat: "c_form", state: "reviewed", answer: "yes" });
    expect(s.db.sql("SELECT answer, state, src, epoch, reason, flagged FROM example_facts WHERE cat = 'c_form'")).toEqual([
      { answer: "yes", state: "reviewed", src: "maintainer", epoch: FACTS_EPOCH, reason: "it is made of wood   and shaped", flagged: 2 },
    ]);
    const served = await known(s, "anb");
    expect(served).toHaveLength(1);
    expect(served[0]).toMatchObject({ by: "learned", line: expect.stringContaining("A yes: it is made of wood") });
    // the other side is reviewed as well: the answer says so
    await as(s, "/decide", { body: { thing: "table", cat: "c_round", answer: "no" } });
    expect((await known(s, "anb"))[0].by).toBe("reviewed");
    expect(s.db.sql("SELECT reason FROM example_facts WHERE cat = 'c_round'")[0].reason, "no reason given: the old one stays").toBe("it is square");
  });

  it("refuses a decision that is not one, and one on a row that is not there", async () => {
    const s = await setup();
    put(s, "table", "c_form", { state: "disputed" });
    for (const body of [{}, { thing: "table", cat: "c_form" }, { thing: "table", cat: "c_form", answer: "unsure" }, { thing: "table", cat: "c_form", answer: "yes", reason: 3 }, { thing: 3, cat: "c_form", answer: "yes" }])
      expect((await as(s, "/decide", { body })).status, JSON.stringify(body)).toBe(400);
    expect((await as(s, "/decide", { body: { thing: "table", cat: "c_nowhere", answer: "yes" } })).status).toBe(404);
    expect(rows(s)[0]).toMatchObject({ state: "disputed" });
  });

  it("deletes one row of an example, or all of its rows", async () => {
    const s = await setup();
    put(s, "my cat misha", "c_form");
    put(s, "my cat misha", "c_round");
    put(s, "table", "c_form");
    expect(await json(await as(s, "/delete", { body: { thing: "my cat misha", cat: "c_form" } }))).toEqual({ ok: true, deleted: 1 });
    expect(rows(s).map((r) => [r.thing, r.cat])).toEqual([["my cat misha", "c_round"], ["table", "c_form"]]);
    expect(await json(await as(s, "/delete", { body: { thing: "my cat misha" } }))).toEqual({ ok: true, deleted: 1 });
    expect((await as(s, "/delete", { body: { thing: "my cat misha" } })).status).toBe(404);
    expect((await as(s, "/delete", { body: { cat: "c_form" } })).status).toBe(400);
    expect((await as(s, "/delete", { body: { thing: "table", cat: 3 } })).status).toBe(400);
    expect(rows(s).map((r) => r.thing)).toEqual(["table"]);
  });

  it("says unavailable, not nothing, where the table is missing", async () => {
    const s = await setup();
    s.db.sql("DROP TABLE example_facts");
    expect((await as(s, "")).status).toBe(503);
  });
});
