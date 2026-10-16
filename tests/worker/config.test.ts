// The Worker's settings (worker/config.ts) and the prices (worker/prices.ts).
import { describe, expect, it } from "vitest";
import { readAccountConfig, readConfig } from "../../worker/config";
import type { Env } from "../../worker/env";
import { addTokens, costMicro, costOfTokens, noTokens } from "../../worker/prices";

const env = (vars: Partial<Env> = {}) => vars as Env;

describe("account settings", () => {
  it("hold an account to 5,000 documents and 3,000 changes a day unless set otherwise", () => {
    expect(readAccountConfig(env())).toMatchObject({ maxDocs: 5000, dailyWrites: 3000 });
    expect(readAccountConfig(env({ MAX_DOCS_PER_ACCOUNT: "800" })).maxDocs).toBe(800);
  });
});

describe("config", () => {
  it("has the documented defaults", () => {
    expect(readConfig(env())).toEqual({
      model: "claude-sonnet-5-5",
      effort: "medium",
      maxTokens: 6000,
      maxRounds: 4,
      deviceDailyMicro: 1_000_000,
      globalDailyMicro: 8_000_000,
      reserveMicro: 50_000,
    });
  });

  it("takes the variables that make sense", () => {
    const c = readConfig(env({ TUTOR_MODEL: " claude-haiku-5-5 ", TUTOR_EFFORT: "high", TUTOR_MAX_TOKENS: "3000", TUTOR_MAX_ROUNDS: "2", DEVICE_DAILY_BUDGET_USD: "1.25", GLOBAL_DAILY_BUDGET_USD: "10", RESERVE_USD: "0.1" }));
    expect(c).toEqual({ model: "claude-haiku-5-5", effort: "high", maxTokens: 3000, maxRounds: 2, deviceDailyMicro: 1_250_000, globalDailyMicro: 10_000_000, reserveMicro: 100_000 });
  });

  it("falls back to the default for a value that is empty, not a number or out of range", () => {
    const c = readConfig(env({ TUTOR_MODEL: "  ", TUTOR_EFFORT: "extreme", TUTOR_MAX_TOKENS: "lots", TUTOR_MAX_ROUNDS: "99", DEVICE_DAILY_BUDGET_USD: "-1", GLOBAL_DAILY_BUDGET_USD: "", RESERVE_USD: "0" }));
    expect(c).toEqual(readConfig(env()));
  });

  it("accepts a budget of zero, which closes the tutor for that scope", () => {
    expect(readConfig(env({ DEVICE_DAILY_BUDGET_USD: "0" })).deviceDailyMicro).toBe(0);
  });
});

describe("prices", () => {
  const usage = { input_tokens: 1000, output_tokens: 500, cache_creation_input_tokens: 400, cache_read_input_tokens: 3000 };

  it("charges each kind of token at its rate (Sonnet 5.5: 2 / 2.50 / 0.10 / 10 dollars per million)", () => {
    // 1000*2 + 400*2.5 + 3000*0.1 + 500*10 micro-dollars
    expect(costMicro("claude-sonnet-5-5", usage)).toBe(2000 + 1000 + 300 + 5000);
  });

  it("charges cache writes at the 1-hour rate for the part the response says is 1-hour", () => {
    const split = { ...usage, cache_creation: { ephemeral_1h_input_tokens: 100, ephemeral_5m_input_tokens: 300 } };
    expect(costMicro("claude-sonnet-5-5", split)).toBe(2000 + 300 * 2.5 + 100 * 4 + 300 + 5000);
  });

  it("prices the other models listed", () => {
    expect(costMicro("claude-haiku-5-5", { input_tokens: 1_000_000 })).toBe(100_000);
    expect(costMicro("claude-opus-5-5", { output_tokens: 1000 })).toBe(20_000);
  });

  it("charges a model it does not know at the highest rate, and rounds up to a whole micro-dollar", () => {
    expect(costMicro("claude-future-9", { input_tokens: 1000 })).toBe(10_000);
    expect(costMicro("claude-haiku-5-5", { cache_read_input_tokens: 1 })).toBe(1);
  });

  it("is zero for no usage", () => {
    expect(costMicro("claude-sonnet-5-5", null)).toBe(0);
    expect(costMicro("claude-sonnet-5-5", {})).toBe(0);
  });

  it("adds up the tokens of several calls, and prices the sum like the calls one by one", () => {
    const sum = noTokens();
    addTokens(sum, usage);
    addTokens(sum, { input_tokens: 50, output_tokens: 10 });
    addTokens(sum, undefined);
    expect(sum).toEqual({ input: 1050, output: 510, cacheWrite: 400, cacheRead: 3000 });
    expect(costOfTokens("claude-sonnet-5-5", sum)).toBe(costMicro("claude-sonnet-5-5", usage) + costMicro("claude-sonnet-5-5", { input_tokens: 50, output_tokens: 10 }));
  });
});
