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

export type Gate = { ok: true } | { ok: false; reason: "wrong" | "blocked" | "unavailable"; resetsAt?: string };

/**
 * Checks a proof, counting the failures of this caller. One guess is taken from the caller's hour in a single statement before
 * the proof is looked at, so requests that arrive together cannot all pass the limit: a caller past it is `blocked` without the
 * proof being looked at, and the limit cannot be used to test guesses either. A proof that fits gives the guess back. When the guess
 * cannot be taken (the database fails) the proof is not looked at either and the answer is `unavailable`, so a failing counter does
 * not let anyone try keys without limit. Without a database nothing is counted (the tests; the tutor is off then anyway).
 */
export async function gate(env: Env, now: Date, caller: string, device: string, proof: string): Promise<Gate> {
  const key = magicKeyOf(env);
  if (!key) return { ok: false, reason: "wrong" };
  const hour = hourOf(now);
  let taken = false;
  if (env.DB) {
    let reserved: D1Result;
    try {
      reserved = await env.DB.prepare("INSERT INTO guesses (hour, who, n) VALUES (?1, ?2, 1) ON CONFLICT (hour, who) DO UPDATE SET n = n + 1 WHERE n < ?3")
        .bind(hour, caller, GUESSES_PER_HOUR).run();
    } catch {
      return { ok: false, reason: "unavailable" };
    }
    if (!reserved.meta.changes) return { ok: false, reason: "blocked", resetsAt: nextHour(now) };
    taken = true;
  }
  if (await checkProof(key, device, proof)) {
    if (taken) await env.DB!.prepare("UPDATE guesses SET n = n - 1 WHERE hour = ?1 AND who = ?2 AND n > 0").bind(hour, caller).run().catch(() => {});
    return { ok: true };
  }
  if (env.DB) await env.DB.prepare("DELETE FROM guesses WHERE hour < ?1").bind(new Date(now.getTime() - 2 * 3_600_000).toISOString().slice(0, 13)).run().catch(() => {});
  return { ok: false, reason: "wrong" };
}
