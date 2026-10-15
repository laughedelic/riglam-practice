// The Magic Key as the Worker holds it, and the limit on wrong guesses (docs/DATA.md, docs/SERVER.md).
import { parseMagicKey } from "../src/ai/magic-key";
import { checkProof } from "../src/ai/proof";
import type { Env } from "./env";

/** The Magic Key in the secret, as dashed lower-case words; null when no secret is set. A secret that is not words is used as it stands. */
export const magicKeyOf = (env: Env): string | null => {
  const raw = env.RIGLAM_DATA_KEY?.trim();
  return raw ? (parseMagicKey(raw) ?? raw) : null;
};

/** Wrong guesses one caller may make per hour before the answer is "try later". The key has few words, so the limit is what protects it. */
export const GUESSES_PER_HOUR = 30;

const hourOf = (now: Date) => now.toISOString().slice(0, 13);
const nextHour = (now: Date) => new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000 + 3_600_000).toISOString();

/** A short hash of the caller's address: enough to count by, and no address is stored. */
export async function callerOf(address: string | undefined): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`riglam/caller/1:${address ?? ""}`)));
  return Array.from(bytes.slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
}

export type Gate = { ok: true } | { ok: false; reason: "wrong" | "blocked"; resetsAt?: string };

/**
 * Checks a proof, counting the failures of this caller. A caller past the limit is `blocked` without the proof being looked at,
 * so the limit cannot be used to test guesses either. Without a database nothing is counted (the tests; the tutor is off then anyway).
 */
export async function gate(env: Env, now: Date, caller: string, device: string, proof: string): Promise<Gate> {
  const key = magicKeyOf(env);
  if (!key) return { ok: false, reason: "wrong" };
  const hour = hourOf(now);
  if (env.DB) {
    const row = await env.DB.prepare("SELECT n FROM guesses WHERE hour = ?1 AND who = ?2").bind(hour, caller).first<{ n: number }>().catch(() => null);
    if ((row?.n ?? 0) >= GUESSES_PER_HOUR) return { ok: false, reason: "blocked", resetsAt: nextHour(now) };
  }
  if (await checkProof(key, device, proof)) return { ok: true };
  if (env.DB) {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM guesses WHERE hour < ?1").bind(new Date(now.getTime() - 2 * 3_600_000).toISOString().slice(0, 13)),
      env.DB.prepare("INSERT INTO guesses (hour, who, n) VALUES (?1, ?2, 1) ON CONFLICT (hour, who) DO UPDATE SET n = n + 1").bind(hour, caller),
    ]).catch(() => {});
  }
  return { ok: false, reason: "wrong" };
}
