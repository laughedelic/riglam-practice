// What a model call costs, from the token counts the API reports. US dollars per million tokens, which is the same as
// micro-dollars per token. Source: Anthropic's pricing page (platform.claude.com/docs/en/about-claude/pricing, checked 2026-10-13).
// A model that is not listed is charged at the highest rate here, so that a new model name can never make a call look cheaper than it is.

interface Rate {
  input: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
  output: number;
}

const RATES: Record<string, Rate> = {
  "claude-sonnet-5-5": { input: 2, cacheWrite5m: 2.5, cacheWrite1h: 4, cacheRead: 0.1, output: 10 },
  "claude-opus-5-5": { input: 4, cacheWrite5m: 5, cacheWrite1h: 8, cacheRead: 0.2, output: 20 },
  // up to 100,000 prompt tokens; longer prompts cost more, and the tutor's prompts are far shorter
  "claude-haiku-5-5": { input: 0.1, cacheWrite5m: 0.125, cacheWrite1h: 0.2, cacheRead: 0.01, output: 0.5 },
};
const MOST_EXPENSIVE: Rate = { input: 10, cacheWrite5m: 12.5, cacheWrite1h: 20, cacheRead: 1, output: 50 };

/** The token counts of one model call, as the Messages API reports them in `usage`. */
export interface Usage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation?: { ephemeral_5m_input_tokens?: number | null; ephemeral_1h_input_tokens?: number | null } | null;
}

export interface Tokens {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}
export const noTokens = (): Tokens => ({ input: 0, output: 0, cacheWrite: 0, cacheRead: 0 });
export function addTokens(sum: Tokens, usage: Usage | undefined | null): void {
  if (!usage) return;
  sum.input += usage.input_tokens ?? 0;
  sum.output += usage.output_tokens ?? 0;
  sum.cacheWrite += usage.cache_creation_input_tokens ?? 0;
  sum.cacheRead += usage.cache_read_input_tokens ?? 0;
}

/** Rates are dollars per million tokens; a thousandth of that (nano-dollars per token) makes every rate here a whole number, so sums have no rounding noise. */
const nano = (usdPerMillion: number): number => Math.round(usdPerMillion * 1000);

/** Micro-dollars for one call, rounded up. Cache writes are charged at the 1-hour rate when the response says so, else at the 5-minute rate. */
export function costMicro(model: string, usage: Usage | undefined | null): number {
  if (!usage) return 0;
  const r = RATES[model] ?? MOST_EXPENSIVE;
  const total = usage.cache_creation_input_tokens ?? 0;
  const h1 = Math.min(total, usage.cache_creation?.ephemeral_1h_input_tokens ?? 0);
  const h5 = usage.cache_creation?.ephemeral_5m_input_tokens ?? total - h1;
  const nanos =
    (usage.input_tokens ?? 0) * nano(r.input) +
    h5 * nano(r.cacheWrite5m) +
    h1 * nano(r.cacheWrite1h) +
    (usage.cache_read_input_tokens ?? 0) * nano(r.cacheRead) +
    (usage.output_tokens ?? 0) * nano(r.output);
  return Math.ceil(nanos / 1000);
}

/** Micro-dollars for a sum of tokens, with cache writes at the 5-minute rate (an upper bound for the 1-hour rate is not needed: the tutor asks for 5 minutes). */
export function costOfTokens(model: string, t: Tokens): number {
  return costMicro(model, { input_tokens: t.input, output_tokens: t.output, cache_creation_input_tokens: t.cacheWrite, cache_read_input_tokens: t.cacheRead });
}
