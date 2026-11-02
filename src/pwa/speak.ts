// The PWA's `speak` capability: sentences read aloud by the app's own server with natural voices (docs/SERVER.md, "Reading aloud"). The request proves that the sender has the
// study group's key without sending it, as the tutor's does (src/ai/proof.ts); the answer is the audio itself. Errors are the tutor's (src/pwa/tutor.ts), so the page can tell
// a used-up day (`rate_limited`) from a server that cannot make the clip just now.
import { API, HEADER, SPEAK, type SpeakRequest, type SpeakVoice } from "../ai/protocol";
import { makeProof } from "../ai/proof";
import { deviceId } from "./device";
import { httpError, tutorError } from "./tutor";
import type { Speaker } from "../platform/types";

const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

/** The voices of the server for a device that has `key` (already known to be the study group's). */
export function createSpeaker(key: string, doFetch: typeof fetch = (...a) => fetch(...a), device: () => string = deviceId): Speaker {
  return {
    voices: SPEAK.voices.map((v) => ({ id: v.id, name: v.name })),
    async clip(text, voice, options = {}) {
      const id = device();
      const body: SpeakRequest = { text, voice: SPEAK.voices.some((v) => v.id === voice) ? (voice as SpeakVoice) : SPEAK.default };
      let res: Response;
      try {
        res = await doFetch(API.speak, {
          method: "POST",
          headers: { "content-type": "application/json", [HEADER.device]: id, [HEADER.proof]: await makeProof(key, id) },
          body: JSON.stringify(body),
          cache: "no-store",
          signal: options.signal,
        });
      } catch (e) {
        throw isAbort(e) ? tutorError("cancelled", "cancelled") : tutorError("offline", "no connection");
      }
      if (!res.ok) throw await httpError(res);
      try {
        const blob = await res.blob();
        if (!blob.size) throw tutorError("unavailable", "the clip is empty");
        return blob.type ? blob : new Blob([blob], { type: "audio/mpeg" });
      } catch (e) {
        if (typeof (e as { code?: unknown })?.code === "string") throw e;
        throw isAbort(e) ? tutorError("cancelled", "cancelled") : tutorError("offline", "the connection broke");
      }
    },
  };
}
