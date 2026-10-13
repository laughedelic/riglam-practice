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
