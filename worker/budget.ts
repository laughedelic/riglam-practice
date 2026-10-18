// The spend counters in D1 (migrations/0001_init.sql). A question first holds back an assumed cost against both the
// device's and the global budget for the day, in one conditional update each, so two questions that arrive together cannot
// both pass a budget that has room for one. When the question ends, the held amount is replaced by the real cost.
// All amounts are micro-dollars. A day is a UTC date, "2026-10-13".

import type { Tokens } from "./prices";

export const dayOf = (now: Date): string => now.toISOString().slice(0, 10);

export type Scope = "global" | "review" | `dev:${string}` | "quorum" | `quorum:dev:${string}`;

/** Whose money a call is: the tutor's, or Quorum's (worker/quorum.ts), which has counters of its own so that it cannot use up the tutor's budget. */
export type Pool = "tutor" | "quorum";
const globalOf = (pool: Pool): Scope => (pool === "quorum" ? "quorum" : "global");
const deviceOf = (pool: Pool, device: string): Scope => (pool === "quorum" ? `quorum:dev:${device}` : `dev:${device}`);

export type Reservation = { ok: true } | { ok: false; scope: "device" | "global" };

const ensure = (db: D1Database, day: string, scope: Scope) => db.prepare("INSERT OR IGNORE INTO budget (day, scope) VALUES (?1, ?2)").bind(day, scope);
const add = (db: D1Database, day: string, scope: Scope, micro: number, cap: number) =>
  db.prepare("UPDATE budget SET micro = micro + ?3, calls = calls + 1 WHERE day = ?1 AND scope = ?2 AND micro + ?3 <= ?4").bind(day, scope, micro, cap);
const adjust = (db: D1Database, day: string, scope: Scope, delta: number) =>
  db.prepare("UPDATE budget SET micro = MAX(0, micro + ?3) WHERE day = ?1 AND scope = ?2").bind(day, scope, delta);
const release = (db: D1Database, day: string, scope: Scope, micro: number) =>
  db.prepare("UPDATE budget SET micro = MAX(0, micro - ?3), calls = MAX(0, calls - 1) WHERE day = ?1 AND scope = ?2").bind(day, scope, micro);

/** Holds `micro` back against the device's and the global budget, or says which one has no room. */
export async function reserve(db: D1Database, p: { day: string; device: string; micro: number; deviceCap: number; globalCap: number; pool?: Pool }): Promise<Reservation> {
  const pool = p.pool ?? "tutor";
  const all = globalOf(pool);
  const dev = deviceOf(pool, p.device);
  await db.batch([ensure(db, p.day, all), ensure(db, p.day, dev)]);
  const g = await add(db, p.day, all, p.micro, p.globalCap).run();
  if (!g.meta.changes) return { ok: false, scope: "global" };
  const d = await add(db, p.day, dev, p.micro, p.deviceCap).run();
  if (!d.meta.changes) {
    await release(db, p.day, all, p.micro).run();
    return { ok: false, scope: "device" };
  }
  return { ok: true };
}

/** Replaces the held amount by the real cost (more or less), and writes the line of the usage log. */
export async function settle(
  db: D1Database,
  p: { day: string; device: string; held: number; actual: number; now: Date; kind: string; model: string; rounds: number; tokens: Tokens; outcome: string; pool?: Pool },
): Promise<void> {
  const delta = p.actual - p.held;
  const pool = p.pool ?? "tutor";
  await db.batch([
    adjust(db, p.day, globalOf(pool), delta),
    adjust(db, p.day, deviceOf(pool, p.device), delta),
    db
      .prepare(
        "INSERT INTO usage_log (at, day, device, kind, model, rounds, input_tokens, output_tokens, cache_write_tokens, cache_read_tokens, micro, outcome) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
      )
      .bind(p.now.toISOString(), p.day, p.device, p.kind, p.model, p.rounds, p.tokens.input, p.tokens.output, p.tokens.cacheWrite, p.tokens.cacheRead, p.actual, p.outcome),
  ]);
}

/** Holds `micro` back against the day's budget for the reviews of flags (its own scope: the tutor's budgets are not touched), or says there is no room. */
export async function reserveReview(db: D1Database, p: { day: string; micro: number; cap: number }): Promise<boolean> {
  await ensure(db, p.day, "review").run();
  return !!(await add(db, p.day, "review", p.micro, p.cap).run()).meta.changes;
}

/** One reviewer's call, as the usage log keeps it. */
export interface ReviewRun {
  model: string;
  rounds: number;
  tokens: Tokens;
  micro: number;
  outcome: string;
}

/** Replaces the amount held for the reviews of a report by what they cost, and writes a line of the usage log for each reviewer. `device` is the sender's. */
export async function settleReview(db: D1Database, p: { day: string; held: number; now: Date; device: string; runs: ReviewRun[] }): Promise<void> {
  const actual = p.runs.reduce((sum, r) => sum + r.micro, 0);
  const line = db.prepare(
    "INSERT INTO usage_log (at, day, device, kind, model, rounds, input_tokens, output_tokens, cache_write_tokens, cache_read_tokens, micro, outcome) VALUES (?1, ?2, ?3, 'review', ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
  );
  await db.batch([
    adjust(db, p.day, "review", actual - p.held),
    ...p.runs.map((r) => line.bind(p.now.toISOString(), p.day, p.device, r.model, r.rounds, r.tokens.input, r.tokens.output, r.tokens.cacheWrite, r.tokens.cacheRead, r.micro, r.outcome)),
  ]);
}

/** False when the operator has switched the tutor off in `settings`. */
export async function tutorSwitchedOn(db: D1Database): Promise<boolean> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'tutor'").first<{ value: string }>();
  return row?.value !== "off";
}

/** Removes counters and log lines older than `keepDays`. Cheap; run now and then. */
export async function prune(db: D1Database, today: string, keepDays = 45): Promise<void> {
  const cutoff = dayOf(new Date(Date.parse(today) - keepDays * 86_400_000));
  await db.batch([db.prepare("DELETE FROM budget WHERE day < ?1").bind(cutoff), db.prepare("DELETE FROM usage_log WHERE day < ?1").bind(cutoff)]);
}
