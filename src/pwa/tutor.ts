// The PWA's `tutor` capability: questions to the app's own server (docs/SERVER.md). The request proves that the sender has the
// study group's key without sending it (src/ai/proof.ts); the answer comes back as server-sent events (src/ai/protocol.ts).
import { API, HEADER, type BudgetScope, type Health, type TutorEvent } from "../ai/protocol";
import { makeProof } from "../ai/proof";
import { deviceId } from "./device";
import type { Tutor } from "../platform/types";

export { deviceId };

/** An error the page understands: `code` is the server's (src/ai/protocol.ts), or `offline`, or `cancelled`. */
export function tutorError(code: string, message: string, extra: { text?: string; budget?: boolean; scope?: BudgetScope; resetsAt?: string } = {}): Error & { code: string; text?: string; budget?: boolean; scope?: BudgetScope; resetsAt?: string } {
  return Object.assign(new Error(message), { code }, extra);
}

const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";
const KNOWN = new Set(["rate_limited", "not_granted", "prompt_too_large", "bad_request", "refused", "unavailable"]);

/** Whether the server says its tutor is on. Anything else (off, unreachable, slow, not a Worker at all) is "no". */
export async function tutorIsOn(doFetch: typeof fetch = (...a) => fetch(...a), waitMs = 4000): Promise<boolean> {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), waitMs);
  try {
    const res = await doFetch(API.health, { cache: "no-store", signal: stop.signal });
    if (!res.ok) return false;
    const body = (await res.json()) as Partial<Health>;
    return body.ok === true && body.tutor === "on";
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function httpError(res: Response, now: () => number = Date.now) {
  let code = "";
  let scope: BudgetScope | undefined;
  let resetsAt: string | undefined;
  try {
    const error = ((await res.json()) as { error?: { code?: unknown; scope?: unknown; resetsAt?: unknown } })?.error;
    code = String(error?.code ?? "");
    if (error?.scope === "device" || error?.scope === "global") scope = error.scope;
    if (typeof error?.resetsAt === "string" && !Number.isNaN(Date.parse(error.resetsAt))) resetsAt = new Date(error.resetsAt).toISOString();
  } catch { /* no JSON body: the status says enough */ }
  if (res.status === 429 && !resetsAt) {
    // an older server, or a proxy: the header says how long to wait
    const wait = Number(res.headers.get("retry-after"));
    if (Number.isFinite(wait) && wait > 0 && wait <= 86_400 * 2) resetsAt = new Date(now() + wait * 1000).toISOString();
  }
  if (!KNOWN.has(code)) code = res.status === 401 ? "not_granted" : res.status === 413 ? "prompt_too_large" : res.status === 429 ? "rate_limited" : "unavailable";
  // A 429 from the server itself (not a "model busy" event inside the answer) means a daily budget is used.
  return tutorError(code, `the server answered ${res.status}`, { budget: res.status === 429, scope, resetsAt });
}

/** The server-sent events in `body`, as they arrive. */
async function* events(body: ReadableStream<Uint8Array>): AsyncGenerator<TutorEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const parse = (block: string): TutorEvent | null => {
    const data = block.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).replace(/^ /, "")).join("\n");
    if (!data) return null;
    try {
      const e = JSON.parse(data);
      return e && typeof e.type === "string" ? (e as TutorEvent) : null;
    } catch {
      return null;
    }
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, "\n");
      for (let at = buffer.indexOf("\n\n"); at >= 0; at = buffer.indexOf("\n\n")) {
        const e = parse(buffer.slice(0, at));
        buffer = buffer.slice(at + 2);
        if (e) yield e;
      }
      if (done) break;
    }
    const last = parse(buffer);
    if (last) yield last;
  } finally {
    reader.cancel().catch(() => {});
  }
}

/** The tutor for a device that has `key` (already known to be the study group's). */
export function createTutor(key: string, doFetch: typeof fetch = (...a) => fetch(...a), device: () => string = deviceId): Tutor {
  return async (request, options = {}) => {
    const id = device();
    let res: Response;
    try {
      res = await doFetch(API.tutor, {
        method: "POST",
        headers: { "content-type": "application/json", [HEADER.device]: id, [HEADER.proof]: await makeProof(key, id) },
        body: JSON.stringify(request),
        signal: options.signal,
      });
    } catch (e) {
      throw isAbort(e) ? tutorError("cancelled", "cancelled") : tutorError("offline", "no connection");
    }
    if (!res.ok || !res.body) throw await httpError(res);
    let text = "";
    try {
      for await (const e of events(res.body)) {
        if (e.type === "delta") {
          text += e.text;
          options.onText?.({ text });
        } else if (e.type === "done") return { text, truncated: e.truncated };
        else if (e.type === "error") throw tutorError(KNOWN.has(e.code) ? e.code : "unavailable", e.message, { text: text || undefined });
      }
    } catch (e) {
      if (typeof (e as { code?: unknown })?.code === "string") throw e; // ours (a DOMException's code is a number)
      throw isAbort(e) ? tutorError("cancelled", "cancelled") : tutorError("offline", "the connection broke", { text: text || undefined });
    }
    throw tutorError("unavailable", "the answer was cut off", { text: text || undefined });
  };
}
