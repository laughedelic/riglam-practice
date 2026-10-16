// The Magic Key at the Worker (worker/magic.ts): GET /api/course, and the allowance of wrong guesses per caller and hour.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../worker/app";
import { GUESSES_PER_HOUR } from "../../worker/magic";
import { HEADER } from "../../src/ai/protocol";
import { makeProof, newDeviceId } from "../../src/ai/proof";
import { testMagicKey } from "../support/magic-key";
import { NOW, ask, json, seedCourse, setup } from "./support";

type Setup = Awaited<ReturnType<typeof setup>>;

const ROWS = { definitions: JSON.stringify({ Form: { d: "a definition" } }), notes: JSON.stringify({ terms: {} }) };
const app = () => createApp({ kit: async () => null, now: () => NOW });
const from = (ip: string) => ({ "cf-connecting-ip": ip });
const right = (s: Setup, ip = "10.0.0.1") => ({ [HEADER.device]: s.device, [HEADER.proof]: s.proof, ...from(ip) });
async function wrong(ip = "10.0.0.1") {
  const device = newDeviceId();
  return { [HEADER.device]: device, [HEADER.proof]: await makeProof(testMagicKey(), device), ...from(ip) };
}
const course = async (s: Setup, headers: Record<string, string>, have?: string) => app().request(have ? `/api/course?have=${have}` : "/api/course", { headers }, s.env);
const used = (s: Setup) => s.db.sql<{ who: string; n: number }>("SELECT who, n FROM guesses").map((r) => r.n);

beforeEach(() => void vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

describe("GET /api/course", () => {
  it("gives the definitions to a proof that fits, and says when the copy a device kept is current", async () => {
    const s = await setup();
    await seedCourse(s.env.DB!, ROWS);
    const res = await course(s, right(s));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toEqual({ version: "2026-10-13T09:00:00.000Z", definitions: { Form: { d: "a definition" } } });
    expect(JSON.stringify(body)).not.toContain("terms");
    expect(await json(await course(s, right(s), body.version))).toEqual({ version: body.version, unchanged: true });
  });

  it("refuses a proof made with another key, says when the server has no course data, and counts the wrong one", async () => {
    const s = await setup();
    const refused = await course(s, await wrong());
    expect(refused.status).toBe(401);
    expect((await json(refused)).error.code).toBe("not_granted");
    expect(used(s)).toEqual([1]);
    const empty = await course(s, right(s));
    expect(empty.status).toBe(503);
    expect(used(s), "a proof that fits gives its guess back: still the one wrong guess").toEqual([1]);
  });
});

describe("the allowance of wrong guesses", () => {
  const spend = async (s: Setup, ip: string, times: number) => {
    for (let i = 0; i < times; i++) expect((await course(s, await wrong(ip))).status).toBe(401);
  };

  it("lets a caller try 30 times an hour, then answers 429 with the time, even to a proof that fits", async () => {
    const s = await setup();
    await seedCourse(s.env.DB!, ROWS);
    await spend(s, "10.0.0.1", GUESSES_PER_HOUR);
    const blocked = await course(s, right(s, "10.0.0.1"));
    expect(blocked.status).toBe(429);
    expect((await json(blocked)).error).toMatchObject({ code: "rate_limited", scope: "caller", resetsAt: "2026-10-13T11:00:00.000Z" });
    expect(used(s)).toEqual([GUESSES_PER_HOUR]);
    expect((await course(s, right(s, "10.0.0.2"))).status, "another caller is not held by it").toBe(200);
  });

  it("holds requests that arrive together to the same limit", async () => {
    const s = await setup();
    const sent = await Promise.all(Array.from({ length: GUESSES_PER_HOUR + 10 }, async () => (await course(s, await wrong())).status));
    expect(sent.filter((x) => x === 401)).toHaveLength(GUESSES_PER_HOUR);
    expect(sent.filter((x) => x === 429)).toHaveLength(10);
    expect(used(s)).toEqual([GUESSES_PER_HOUR]);
  });

  it("is not used up by proofs that fit", async () => {
    const s = await setup();
    await seedCourse(s.env.DB!, ROWS);
    const sent = await Promise.all(Array.from({ length: 20 }, () => course(s, right(s)).then((r) => r.status)));
    expect(sent.every((x) => x === 200)).toBe(true);
    expect(used(s), "a caller who never guesses wrong leaves no row behind").toEqual([]);
    await spend(s, "10.0.0.1", GUESSES_PER_HOUR);
  });

  it("answers the tutor route the same way: a wait for the caller, not a verdict on the key", async () => {
    const s = await setup();
    await spend(s, "10.0.0.1", GUESSES_PER_HOUR);
    const res = await app().request("/api/tutor", { method: "POST", headers: { "content-type": "application/json", ...right(s, "10.0.0.1") }, body: ask() }, s.env);
    expect(res.status).toBe(429);
    expect((await json(res)).error).toMatchObject({ code: "rate_limited", scope: "caller", resetsAt: "2026-10-13T11:00:00.000Z" });
    expect(Number(res.headers.get("retry-after"))).toBe(3600);
    const other = await app().request("/api/tutor", { method: "POST", headers: { "content-type": "application/json", ...(await wrong("10.0.0.3")) }, body: ask() }, s.env);
    expect(other.status, "a wrong key from a caller with allowance left is still a refusal").toBe(401);
  });
  it("does not look at a proof when its guess cannot be counted, so a failing counter is no way to test keys", async () => {
    const s = await setup();
    await seedCourse(s.env.DB!, ROWS);
    const real = s.env.DB!;
    const failing = (sql: string) => /INSERT INTO guesses/.test(sql);
    const db = new Proxy(real, {
      get: (target, prop) => (prop === "prepare" ? (sql: string) => (failing(sql) ? { bind: () => ({ run: () => Promise.reject(new Error("d1 is down")) }) } : target.prepare(sql)) : Reflect.get(target, prop)),
    });
    const broken = { ...s.env, DB: db } as typeof s.env;
    for (const headers of [right(s), await wrong()]) {
      const res = await app().request("/api/course", { headers }, broken);
      expect(res.status, "the same answer to a proof that fits and one that does not").toBe(503);
      expect((await json(res)).error.code).toBe("unavailable");
      expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    }
    const tutor = await app().request("/api/tutor", { method: "POST", headers: { "content-type": "application/json", ...right(s) }, body: ask() }, broken);
    expect(tutor.status).toBe(503);
    expect(used(s)).toEqual([]);
  });

  it("does not look at a proof when there is no database to count in either (a missing binding is no way to test keys)", async () => {
    const s = await setup();
    const bare = { ...s.env, DB: undefined } as typeof s.env;
    for (const headers of [right(s), await wrong()]) {
      const res = await app().request("/api/course", { headers }, bare);
      expect(res.status, "the same answer to a proof that fits and one that does not").toBe(503);
      expect((await json(res)).error.code).toBe("unavailable");
    }
    const tutor = await app().request("/api/tutor", { method: "POST", headers: { "content-type": "application/json", ...(await wrong()) }, body: ask() }, bare);
    expect(tutor.status).toBe(503);
  });

  it("removes the row of a caller whose only guess was given back, but keeps the wrong guesses of one who made some", async () => {
    const s = await setup();
    await seedCourse(s.env.DB!, ROWS);
    expect((await course(s, right(s))).status).toBe(200);
    expect(used(s)).toEqual([]);
    expect((await course(s, await wrong())).status).toBe(401);
    expect((await course(s, right(s))).status).toBe(200);
    expect(used(s)).toEqual([1]);
  });
});
