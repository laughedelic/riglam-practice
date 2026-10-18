import type { Env } from "./env";

export interface Config {
  model: string;
  effort: "low" | "medium" | "high" | "xhigh" | "max";
  maxTokens: number;
  maxRounds: number;
  /** budgets in micro-dollars (millionths of a US dollar), so that the counters are integers */
  deviceDailyMicro: number;
  globalDailyMicro: number;
  reserveMicro: number;
}

const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;

function number(raw: string | undefined, fallback: number, min: number, max: number): number {
  const n = raw === undefined || raw.trim() === "" ? NaN : Number(raw);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}
const micro = (usd: number) => Math.round(usd * 1_000_000);

/** The settings, each from its variable when that is a sensible value and from the default otherwise. */
export function readConfig(env: Env): Config {
  const effort = EFFORTS.find((e) => e === env.TUTOR_EFFORT) ?? "medium";
  return {
    model: env.TUTOR_MODEL?.trim() || "claude-sonnet-5-5",
    effort,
    maxTokens: Math.round(number(env.TUTOR_MAX_TOKENS, 6000, 500, 32000)),
    maxRounds: Math.round(number(env.TUTOR_MAX_ROUNDS, 4, 1, 8)),
    deviceDailyMicro: micro(number(env.DEVICE_DAILY_BUDGET_USD, 1, 0, 1000)),
    globalDailyMicro: micro(number(env.GLOBAL_DAILY_BUDGET_USD, 8, 0, 10000)),
    reserveMicro: micro(number(env.RESERVE_USD, 0.05, 0.001, 5)),
  };
}

export interface QuorumConfig {
  /** whether the server offers Quorum, the tutor's mode of several models and a judge (worker/quorum.ts) */
  on: boolean;
  /** offered, but each device turns it on itself: a server that is not a test server, where Quorum is slower and keeps the text of every run */
  optIn: boolean;
  /** Quorum's own budgets in micro-dollars, apart from the tutor's */
  deviceDailyMicro: number;
  globalDailyMicro: number;
  /** what a Quorum question is assumed to cost until it has finished */
  reserveMicro: number;
}

/** Quorum's settings. It is off unless `QUORUM` is `on` (offered, and on for a device until it turns it off) or `optin` (offered, off for a device until it turns it on). */
export function readQuorumConfig(env: Env): QuorumConfig {
  const mode = env.QUORUM?.trim();
  return {
    on: mode === "on" || mode === "optin",
    optIn: mode === "optin",
    deviceDailyMicro: micro(number(env.QUORUM_DEVICE_DAILY_BUDGET_USD, 3, 0, 1000)),
    globalDailyMicro: micro(number(env.QUORUM_GLOBAL_DAILY_BUDGET_USD, 12, 0, 10000)),
    reserveMicro: micro(number(env.QUORUM_RESERVE_USD, 0.4, 0.001, 20)),
  };
}

export interface AccountConfig {
  /** who may create an account: anyone, only a caller with the study group's proof, or nobody (existing accounts still sign in) */
  signup: "open" | "group" | "closed";
  maxAccounts: number;
  /** documents one account may hold */
  maxDocs: number;
  /** document writes one account may make per UTC day */
  dailyWrites: number;
  /** sign-in, sign-up and add-a-passkey ceremonies that may be started per UTC day, all callers together (each writes a row, and anyone can ask) */
  dailyCeremonies: number;
}

const SIGNUPS = ["open", "group", "closed"] as const;

/** The account settings, each from its variable when that is a sensible value and from the default otherwise. */
export function readAccountConfig(env: Env): AccountConfig {
  return {
    signup: SIGNUPS.find((s) => s === env.SIGNUP?.trim()) ?? "open",
    maxAccounts: Math.round(number(env.MAX_ACCOUNTS, 300, 0, 100_000)),
    maxDocs: Math.round(number(env.MAX_DOCS_PER_ACCOUNT, 5_000, 100, 1_000_000)),
    dailyWrites: Math.round(number(env.DAILY_WRITES_PER_ACCOUNT, 3_000, 10, 1_000_000)),
    dailyCeremonies: Math.round(number(env.CEREMONIES_PER_DAY, 2_000, 10, 1_000_000)),
  };
}
