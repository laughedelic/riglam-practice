// The definitions, which the server gives to a device that has the Magic Key (docs/DATA.md, docs/SERVER.md). The page asks with
// the same proof the tutor uses (src/ai/proof.ts) and keeps the answer on the device, so the definitions work offline afterwards
// and the page opens at once; a second request, made in the background, finds out whether they changed or the key stopped fitting.
import { API, HEADER, type CourseResponse } from "../ai/protocol";
import { makeProof } from "../ai/proof";
import { deviceId } from "./device";

export type Definitions = Record<string, { d?: string; d_ru?: string }>;
export interface KeptCourse { version: string; definitions: Definitions }

const CACHE = "riglam.course";

export type CourseOutcome =
  | { ok: true; version: string; definitions: Definitions }
  | { ok: true; version: string; unchanged: true }
  | { ok: false; reason: "not_granted" | "rate_limited" | "offline" | "unavailable"; resetsAt?: string };

/** How long the request and the reading of the answer may take: the page waits for them before it starts, so a stalled connection must not hold it. */
export const COURSE_TIMEOUT_MS = 10_000;

/**
 * Asks the server for the definitions. `have` is the version already kept: the server then answers only whether it is current.
 * A request that has not finished after `timeoutMs` (the answer's body included) counts as no connection.
 */
export async function fetchCourse(key: string, have?: string, doFetch: typeof fetch = (...a) => fetch(...a), device: () => string = deviceId, timeoutMs = COURSE_TIMEOUT_MS): Promise<CourseOutcome> {
  const id = device();
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), timeoutMs);
  try {
    let res: Response;
    try {
      const url = have ? `${API.course}?have=${encodeURIComponent(have)}` : API.course;
      res = await doFetch(url, { headers: { [HEADER.device]: id, [HEADER.proof]: await makeProof(key, id) }, cache: "no-store", signal: stop.signal });
    } catch {
      return { ok: false, reason: "offline" };
    }
    try {
      if (res.status === 429 || res.status === 401 || res.status === 403) {
        let resetsAt: string | undefined;
        try {
          const at = ((await res.json()) as { error?: { resetsAt?: unknown } })?.error?.resetsAt;
          if (typeof at === "string" && !Number.isNaN(Date.parse(at))) resetsAt = new Date(at).toISOString();
        } catch (e) {
          if (stop.signal.aborted) throw e;
          /* no JSON body */
        }
        return res.status === 429 ? { ok: false, reason: "rate_limited", resetsAt } : { ok: false, reason: "not_granted" };
      }
      if (!res.ok) return { ok: false, reason: "unavailable" };
      const body = (await res.json()) as CourseResponse;
      if ("unchanged" in body) return { ok: true, version: body.version, unchanged: true };
      if (typeof body.version === "string" && body.definitions && typeof body.definitions === "object") return { ok: true, version: body.version, definitions: body.definitions };
    } catch {
      if (stop.signal.aborted) return { ok: false, reason: "offline" };
      /* not JSON: the page was served by something that is not the Worker */
    }
    return { ok: false, reason: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
}

export function keptCourse(): KeptCourse | null {
  try {
    const kept = JSON.parse(localStorage.getItem(CACHE) ?? "null");
    return kept && typeof kept.version === "string" && kept.definitions && typeof kept.definitions === "object" ? kept : null;
  } catch {
    return null;
  }
}
export function keepCourse(kept: KeptCourse) {
  try { localStorage.setItem(CACHE, JSON.stringify(kept)); } catch { /* storage full or unavailable: the next visit asks again */ }
}
export function forgetCourse() {
  try { localStorage.removeItem(CACHE); } catch { /* storage unavailable */ }
}

/** The sentence for an outcome that is not a success, for the Magic Key prompt. */
export function whyNot(o: Extract<CourseOutcome, { ok: false }>, now: () => Date = () => new Date()): string {
  if (o.reason === "not_granted") return "That is not the Magic Key. Check the words and try again.";
  if (o.reason === "rate_limited") {
    const at = o.resetsAt ? new Date(o.resetsAt) : null;
    const wait = at ? Math.max(1, Math.ceil((at.getTime() - now().getTime()) / 60_000)) : null;
    return wait ? `Too many tries from this network. Try again in ${wait} minute${wait === 1 ? "" : "s"}.` : "Too many tries from this network. Try again later.";
  }
  if (o.reason === "offline") return "The Magic Key can only be checked online. Connect and try again.";
  return "The server could not check the key just now. Try again later.";
}
