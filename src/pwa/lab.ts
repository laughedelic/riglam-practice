// The PWA's `lab` capability: the check lab's model calls (src/app/ai/lab.js) go to the app's own server (docs/SERVER.md, "The check lab"), which
// answers them on a Preview only. The request proves that the sender has the study group's key without sending it (src/ai/proof.ts).
import { API, HEADER, type LabResponse } from "../ai/protocol";
import { makeProof } from "../ai/proof";
import { deviceId } from "./device";
import { httpError, serverSays, tutorError } from "./tutor";
import type { LabSample } from "../platform/types";

const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

/** Whether the server says it answers the lab's calls. Anything else (not said, off, unreachable, slow, not a Worker at all) is "no". */
export async function labIsOn(doFetch: typeof fetch = (...a) => fetch(...a), waitMs = 4000): Promise<boolean> {
  return (await serverSays(doFetch, waitMs)).lab;
}

/** The lab's model call for a device that has `key` (already known to be the study group's). Rejects as the tutor does: with an error that has a `code`. */
export function createLab(key: string, doFetch: typeof fetch = (...a) => fetch(...a), device: () => string = deviceId): LabSample {
  return async (prompt, options = {}) => {
    const id = device();
    let res: Response;
    try {
      res = await doFetch(API.lab, {
        method: "POST",
        headers: { "content-type": "application/json", [HEADER.device]: id, [HEADER.proof]: await makeProof(key, id) },
        body: JSON.stringify({ model: options.model, effort: options.effort ?? "medium", prompt }),
        signal: options.signal,
      });
    } catch (e) {
      throw isAbort(e) ? tutorError("cancelled", "cancelled") : tutorError("offline", "no connection");
    }
    if (!res.ok) throw await httpError(res);
    let body: Partial<LabResponse> | null = null;
    try {
      body = (await res.json()) as Partial<LabResponse>;
    } catch {
      /* not JSON: the check below says so */
    }
    if (!body || typeof body.text !== "string") throw tutorError("unavailable", "the answer was not what the lab expects");
    return { text: body.text, truncated: !!body.truncated, modelApplied: typeof body.modelApplied === "string" ? body.modelApplied : undefined };
  };
}
