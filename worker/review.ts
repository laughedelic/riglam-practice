// The scheduled review of flag reports (docs/SERVER.md, "Reviewing flags"). A pass takes the reports that wait (state 'sent'), asks
// each reviewing model for its reading of the flag (the same card and lookup tools as the tutor, the reviewer's instructions in
// src/ai-shared/flag-review.ts), and records what the rule in src/domain/flags.ts (decideFlag) makes of the answers: a reply that
// the sender will read, a prepared change, or the maintainer's decision.
//
// What a report holds comes from a device and is not trusted. The request quotes and cuts every such text (reviewRequest), the answer
// must parse as the strict verdict (parseReview), the models can only read, and two of them must agree with confidence for anything
// to reach the sender without the maintainer. The reviews have a daily budget of their own, so that spam can waste only that.
// The pass never throws: it is run by a schedule, and what it cannot finish waits for the next one.

import Anthropic from "@anthropic-ai/sdk";
import { parseReview, readReviewAnswer, type FlagReview, type ReviewFlag } from "../src/ai-shared";
import { autoFlagOf, decideFlag, flaggedPart, type FlagOutcome, type FlagRef } from "../src/domain/flags";
import { dayOf, prune, reserveReview, settleReview, type ReviewRun } from "./budget";
import { readConfig, readReviewConfig, type Config, type ReviewConfig } from "./config";
import type { Env } from "./env";
import type { Kit } from "./kit";
import { autoReason, reportsOn } from "./reports";
import { runTutor } from "./tutor";

export interface ReviewDeps {
  now?: () => Date;
  /** the fetch the model client uses; tests pass a fake */
  fetch?: typeof fetch;
  /** how often the model client repeats a call the API answered with a retryable error (default 1) */
  retries?: number;
  /** makes the kit, or null when there is no course data */
  kit: (env: Env) => Promise<Kit | null>;
}

export interface PassResult {
  /** reports that got their outcome in this pass */
  done: number;
  /** reports given back for the next pass (the model API failed) */
  retried: number;
  /** why the pass stopped before the end of its list, if it did */
  stopped?: "not set up" | "off" | "no data" | "budget" | "error";
}

/** A pass that finds a claim older than this takes the report over (the pass that made it was cut off). */
const STALE_CLAIM_MS = 15 * 60_000;
/** Passes that may take one report before it goes to the maintainer without a full review. */
export const MAX_ATTEMPTS = 3;
const CALL_LIMIT_MS = 180_000;
/** Once the day's budget is used up, a pass looks this far down the list for reports that need no model. */
const SCAN_MAX = 60;

/** False when the operator has switched the review off in `settings` (review = off); reports are still taken. */
async function reviewSwitchedOn(db: D1Database): Promise<boolean> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'review'").first<{ value: string }>();
  return row?.value !== "off";
}

interface Row {
  device: string;
  id: string;
  flag: string;
  answer: string | null;
  attempts: number;
  updated_at: string;
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

/** The review request for a report, or the reason it cannot be reviewed by a model. */
function prepare(kit: Kit, row: Row): { request: string } | { skip: string } {
  if (row.attempts >= MAX_ATTEMPTS) return { skip: "the review did not finish" };
  let flag: Record<string, unknown>;
  let answer: unknown;
  try {
    flag = JSON.parse(row.flag);
    answer = row.answer === null ? null : JSON.parse(row.answer);
  } catch {
    return { skip: "the report could not be read" };
  }
  // A flag a program wrote is the maintainer's from the start; one stored before it was (the report was sent by an earlier version) is given the same reason here.
  const auto = autoFlagOf(flag);
  if (auto) return { skip: autoReason(auto) };
  // A follow-up on a reply goes straight to the maintainer: the reply was the review's, and a second opinion from the same reviewers would only repeat it.
  if (flag.part === "reply") return { skip: "a follow-up on a reply" };
  if (answer === null) return { skip: "the exercise was not kept with the flag" };
  const a = readReviewAnswer(answer);
  if (!a) return { skip: "the exercise could not be read" };
  try {
    const f: ReviewFlag = { what: flaggedPart(flag as FlagRef), shown: str(flag.shown), asked: str(flag.asked), note: str(flag.note), suggest: str(flag.suggest) };
    return { request: kit.reviewRequest(f, a) };
  } catch {
    // a pair the data does not know, for one, or a field that is not text (a device can send anything; one report must not stop the pass)
    return { skip: "the exercise could not be read" };
  }
}

type Failure = "error" | "unreadable";
interface Run extends ReviewRun {
  review: FlagReview | null;
  failure?: Failure;
}

/** One reviewer's reading. Never throws. */
async function reviewOnce(p: { client: Anthropic; kit: Kit; tutor: Config; config: ReviewConfig; model: string; request: string }): Promise<Run> {
  let said = "";
  const o = await runTutor({
    client: p.client,
    kit: { ...p.kit, guide: p.kit.reviewGuide },
    config: { ...p.tutor, model: p.model, effort: p.config.effort, maxTokens: p.config.maxTokens, maxRounds: p.config.maxRounds },
    request: { kind: "explain", cats: [], turns: [{ role: "user", content: p.request }] },
    // the words before a lookup are not the verdict, and glued to it they would make it unreadable
    onRound: () => {
      said = "";
    },
    emit: async (e) => {
      if (e.type === "delta") said += e.text;
    },
    signal: AbortSignal.timeout(CALL_LIMIT_MS),
  });
  const base = { model: p.model, rounds: o.rounds, tokens: o.tokens, micro: o.micro, outcome: o.outcome };
  if (o.outcome === "error" || o.outcome === "aborted") return { ...base, review: null, failure: "error" };
  const review = o.outcome === "answered" ? parseReview(said) : null;
  return review ? { ...base, review } : { ...base, review: null, failure: "unreadable" };
}

const escalation = (reason: string): FlagOutcome => ({ action: "escalate", reason, reply: "", fix: "", cause: "" });

/** Writes the outcome, if the report is still the one that was taken (an edit made meanwhile clears the claim, and its new words wait for the next pass). */
async function record(db: D1Database, row: Row, claim: string, outcome: FlagOutcome, runs: Run[], now: Date): Promise<void> {
  const reviews = runs.map((r) => ({ model: r.model, ...(r.review ?? { failed: r.failure }) }));
  const stamp = now.toISOString();
  await db
    .prepare(
      `UPDATE flag_reports SET state = ?4, reply = ?5, reply_at = ?6, outcome = ?7, cause = ?8, reason = ?9, fix = ?10, reviews = ?11, reviewed_at = ?12, claimed_at = NULL
       WHERE device = ?1 AND id = ?2 AND claimed_at = ?3 AND state = 'sent'`,
    )
    .bind(
      row.device,
      row.id,
      claim,
      outcome.action === "escalate" ? "maintainer" : "answered",
      outcome.reply || null,
      outcome.reply ? stamp : null,
      outcome.action,
      outcome.cause || null,
      outcome.reason,
      outcome.fix || null,
      JSON.stringify(reviews),
      stamp,
    )
    .run();
}

/** Gives the report back to the next pass; `attempt` also gives back the count that taking it added (a pass that never asked a model has not used one of the report's tries). */
const unclaim = (db: D1Database, row: Row, claim: string, attempt = false) =>
  db.prepare(`UPDATE flag_reports SET claimed_at = NULL${attempt ? ", attempts = attempts - 1" : ""} WHERE device = ?1 AND id = ?2 AND claimed_at = ?3`).bind(row.device, row.id, claim).run();

/** One pass: reviews up to `REVIEW_BATCH` waiting reports, oldest first (and, once the day's budget is used, sends the ones that need no model on to the maintainer from further down the list). */
export async function reviewPass(env: Env, deps: ReviewDeps): Promise<PassResult> {
  const result: PassResult = { done: 0, retried: 0 };
  const db = env.DB;
  if (!db || !env.ANTHROPIC_API_KEY) return { ...result, stopped: "not set up" };
  try {
    // reportsOn also fails when a migration is missing, which leaves nothing to review
    if (!(await reportsOn(db)) || !(await reviewSwitchedOn(db))) return { ...result, stopped: "off" };
    const now = (deps.now ?? (() => new Date()))();
    const config = readReviewConfig(env);
    const staleBefore = new Date(now.getTime() - STALE_CLAIM_MS).toISOString();
    /** The next `batch` waiting reports, oldest first, after `after` if there is one (the order is total, so that no report is passed over or listed twice). */
    const list = async (after: Row | null): Promise<Row[]> =>
      (
        await db
          .prepare(
            `SELECT device, id, flag, answer, attempts, updated_at FROM flag_reports WHERE state = 'sent' AND (claimed_at IS NULL OR claimed_at < ?1)${after ? " AND (updated_at, device, id) > (?3, ?4, ?5)" : ""} ORDER BY updated_at, device, id LIMIT ?2`,
          )
          .bind(...[staleBefore, config.batch, ...(after ? [after.updated_at, after.device, after.id] : [])])
          .all<Row>()
      ).results;
    let page = await list(null);
    if (!page.length) return result;

    const kit = await deps.kit(env).catch(() => null);
    if (!kit) return { ...result, stopped: "no data" };
    const tutor = readConfig(env);
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, ...(env.ANTHROPIC_BASE_URL ? { baseURL: env.ANTHROPIC_BASE_URL } : {}), maxRetries: deps.retries ?? 1, timeout: 90_000, ...(deps.fetch ? { fetch: deps.fetch } : {}) });
    const day = dayOf(now);

    let outOfBudget = false;
    for (let listed = page.length; ; ) {
      for (const row of page) {
        const prepared = prepare(kit, row);
        // once the day's budget is used, only the reports that need no model go on
        if (!("skip" in prepared) && outOfBudget) continue;
        const claim = now.toISOString() + "/" + Math.random().toString(36).slice(2, 8);
        // only the report that was listed: one edited since (its words, and so its request, are no longer these) waits for the next pass
        const taken = await db
          .prepare("UPDATE flag_reports SET claimed_at = ?3, attempts = attempts + 1 WHERE device = ?1 AND id = ?2 AND state = 'sent' AND (claimed_at IS NULL OR claimed_at < ?4) AND updated_at = ?5")
          .bind(row.device, row.id, claim, new Date(now.getTime() - STALE_CLAIM_MS).toISOString(), row.updated_at)
          .run();
        if (!taken.meta.changes) continue;
        const taking: Row = { ...row, attempts: row.attempts + 1 };
        try {
          if ("skip" in prepared) {
            await record(db, taking, claim, escalation(prepared.skip), [], now);
            result.done += 1;
            continue;
          }
          if (!(await reserveReview(db, { day, micro: config.reserveMicro, cap: config.dailyMicro }))) {
            outOfBudget = true;
            await unclaim(db, taking, claim, true);
            continue;
          }
          const runs = await Promise.all(config.models.map((model) => reviewOnce({ client, kit, tutor, config, model, request: prepared.request })));
          // the cost is settled whatever came of the reviews
          await settleReview(db, { day, held: config.reserveMicro, now, device: row.device, runs }).catch((e) => console.error("review settle failed", e instanceof Error ? e.name : typeof e));
          if (runs.some((r) => r.failure === "error") && taking.attempts < MAX_ATTEMPTS) {
            // the model API failed: the report waits for the next pass, and so does everything behind it
            await unclaim(db, taking, claim);
            result.retried += 1;
            return { ...result, stopped: "error" };
          }
          await record(db, taking, claim, decideFlag(runs.flatMap((r) => (r.review ? [r.review] : []))), runs, now);
          result.done += 1;
        } catch (e) {
          // only the kind of error is logged: its text could quote a report
          console.error("review failed", e instanceof Error ? e.name : typeof e);
          await unclaim(db, taking, claim).catch(() => {});
          return { ...result, stopped: "error" };
        }
      }
      // Once the day's budget is used the models cannot take another report, but one that needs no model (a follow-up on a reply, an exercise that was not kept) must still reach the
      // maintainer: the list goes on past the reports the budget holds back, a bounded way down.
      if (!outOfBudget || page.length < config.batch || listed >= SCAN_MAX) break;
      page = await list(page[page.length - 1]);
      if (!page.length) break;
      listed += page.length;
    }
    if (outOfBudget) result.stopped = "budget";
    if (result.done) await prune(db, day).catch(() => {});
  } catch (e) {
    console.error("review pass failed", e instanceof Error ? e.name : typeof e);
    return { ...result, stopped: "error" };
  }
  return result;
}
