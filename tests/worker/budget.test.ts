// The spend counters (worker/budget.ts) on the real SQL, in an in-memory SQLite.
import { describe, expect, it } from "vitest";
import { dayOf, prune, reserve, settle, tutorSwitchedOn } from "../../worker/budget";
import { noTokens } from "../../worker/prices";
import { fakeD1 } from "./support";

const DAY = "2026-10-13";
const caps = { deviceCap: 100, globalCap: 250 };
const hold = (db: D1Database, device: string, micro = 100, over: Partial<typeof caps> & { pool?: "quorum" } = {}) => reserve(db, { day: DAY, device, micro, ...caps, ...over });
const rows = (sql: ReturnType<typeof fakeD1>["sql"]) => Object.fromEntries(sql<{ scope: string; micro: number; calls: number }>("SELECT scope, micro, calls FROM budget WHERE day = ?", DAY).map((r) => [r.scope, [r.micro, r.calls]]));

describe("days", () => {
  it("are UTC dates", () => {
    expect(dayOf(new Date("2026-10-13T23:59:59Z"))).toBe("2026-10-13");
    expect(dayOf(new Date("2026-10-14T00:00:00Z"))).toBe("2026-10-14");
  });
});

describe("reserve", () => {
  it("holds the amount against the device and the global counter", async () => {
    const { d1, sql } = fakeD1();
    expect(await hold(d1, "a")).toEqual({ ok: true });
    expect(rows(sql)).toEqual({ global: [100, 1], "dev:a": [100, 1] });
  });

  it("refuses a device that is at its cap, names the device, and leaves the global counter as it was", async () => {
    const { d1, sql } = fakeD1();
    await hold(d1, "a");
    expect(await hold(d1, "a")).toEqual({ ok: false, scope: "device" });
    expect(rows(sql)).toEqual({ global: [100, 1], "dev:a": [100, 1] });
  });

  it("refuses everybody when the global cap is reached, and leaves the device counter alone", async () => {
    const { d1, sql } = fakeD1();
    await hold(d1, "a");
    await hold(d1, "b");
    expect(await hold(d1, "c")).toEqual({ ok: false, scope: "global" });
    expect(rows(sql)).toEqual({ global: [200, 2], "dev:a": [100, 1], "dev:b": [100, 1], "dev:c": [0, 0] });
  });

  it("lets only as many simultaneous questions through as the budget has room for", async () => {
    const { d1 } = fakeD1();
    const results = await Promise.all(["a", "b", "c", "d", "e"].map((d) => hold(d1, d, 100, { globalCap: 300, deviceCap: 1000 })));
    expect(results.filter((r) => r.ok)).toHaveLength(3);
  });

  it("keeps Quorum's counters apart from the tutor's: a full Quorum leaves the tutor room, and a settled Quorum call moves only its own", async () => {
    const { d1, sql } = fakeD1();
    expect(await hold(d1, "a", 100, { pool: "quorum" })).toEqual({ ok: true });
    expect(await hold(d1, "a", 100, { pool: "quorum" })).toEqual({ ok: false, scope: "device" });
    expect(await hold(d1, "a")).toEqual({ ok: true });
    expect(rows(sql)).toEqual({ quorum: [100, 1], "quorum:dev:a": [100, 1], global: [100, 1], "dev:a": [100, 1] });
    await settle(d1, { day: DAY, device: "a", held: 100, actual: 30, now: new Date("2026-10-13T10:00:00Z"), kind: "explain", model: "quorum", rounds: 4, tokens: noTokens(), outcome: "answered", pool: "quorum" });
    expect(rows(sql)).toEqual({ quorum: [30, 1], "quorum:dev:a": [30, 1], global: [100, 1], "dev:a": [100, 1] });
  });

  it("starts each day from zero", async () => {
    const { d1 } = fakeD1();
    await hold(d1, "a");
    expect(await reserve(d1, { day: "2026-10-14", device: "a", micro: 100, ...caps })).toEqual({ ok: true });
  });
});

describe("settle", () => {
  const done = (over: Record<string, unknown> = {}) => ({ day: DAY, device: "a", held: 100, actual: 30, now: new Date("2026-10-13T10:00:00Z"), kind: "explain", model: "claude-sonnet-5-5", rounds: 2, tokens: { ...noTokens(), input: 5, output: 7 }, outcome: "answered", ...over });

  it("replaces the held amount by the real cost, and logs the call without any text", async () => {
    const { d1, sql } = fakeD1();
    await hold(d1, "a");
    await settle(d1, done());
    expect(rows(sql)).toEqual({ global: [30, 1], "dev:a": [30, 1] });
    const [log] = sql<Record<string, unknown>>("SELECT * FROM usage_log");
    expect(log).toMatchObject({ at: "2026-10-13T10:00:00.000Z", day: DAY, device: "a", kind: "explain", model: "claude-sonnet-5-5", rounds: 2, input_tokens: 5, output_tokens: 7, micro: 30, outcome: "answered" });
    expect(Object.keys(log).sort()).toEqual(["at", "cache_read_tokens", "cache_write_tokens", "day", "device", "id", "input_tokens", "kind", "micro", "model", "outcome", "output_tokens", "rounds"]);
  });

  it("can charge more than was held, and the counter never goes below zero", async () => {
    const { d1, sql } = fakeD1();
    await hold(d1, "a");
    await settle(d1, done({ actual: 160 }));
    expect(rows(sql)).toEqual({ global: [160, 1], "dev:a": [160, 1] });
    await settle(d1, done({ held: 100000, actual: 0 }));
    expect(rows(sql)).toEqual({ global: [0, 1], "dev:a": [0, 1] });
  });
});

describe("the switch", () => {
  it("is on without a row or with any value but 'off'", async () => {
    const { d1, sql } = fakeD1();
    expect(await tutorSwitchedOn(d1)).toBe(true);
    sql("SELECT 1");
    await d1.prepare("INSERT INTO settings (key, value) VALUES ('tutor', 'on')").run();
    expect(await tutorSwitchedOn(d1)).toBe(true);
    await d1.prepare("UPDATE settings SET value = 'off' WHERE key = 'tutor'").run();
    expect(await tutorSwitchedOn(d1)).toBe(false);
  });
});

describe("prune", () => {
  it("removes counters and log lines older than 45 days and keeps the rest", async () => {
    const { d1, sql } = fakeD1();
    for (const day of ["2026-08-01", "2026-09-01", DAY]) {
      await d1.prepare("INSERT INTO budget (day, scope, micro) VALUES (?1, 'global', 1)").bind(day).run();
      await d1.prepare("INSERT INTO usage_log (at, day, device, kind, model, rounds, input_tokens, output_tokens, cache_write_tokens, cache_read_tokens, micro, outcome) VALUES ('x', ?1, 'a', 'chat', 'm', 1, 0, 0, 0, 0, 1, 'answered')").bind(day).run();
    }
    await prune(d1, DAY);
    expect(sql<{ day: string }>("SELECT day FROM budget ORDER BY day").map((r) => r.day)).toEqual(["2026-09-01", DAY]);
    expect(sql<{ day: string }>("SELECT day FROM usage_log ORDER BY day").map((r) => r.day)).toEqual(["2026-09-01", DAY]);
  });
});
