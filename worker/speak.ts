// Reading aloud with the server's voices (docs/SERVER.md, "Reading aloud"): one sentence or a few go to Google's Text-to-Speech (the Chirp 3 HD voices) and the audio
// comes back as it is. The server holds the Google key and the limits; the page only asks, with the Magic Key's proof as for the tutor, and keeps the device's own voice
// as the fallback. Nothing is stored here: not the text, not the audio (the page keeps the clips of this visit, src/ui/speech.ts).
// The limits are in characters per UTC day, for one device and for everybody, counted in the budget table at `SPEAK_MICRO_PER_CHAR` (worker/budget.ts), so that the month
// stays inside the vendor's free characters.

import { SPEAK, type SpeakVoice } from "../src/ai/protocol";

/** The vendor's name for each voice the page may ask for. Anything else is refused before it reaches the vendor. */
const NAMES: Record<SpeakVoice, string> = {
  charon: "en-US-Chirp3-HD-Charon",
  kore: "en-US-Chirp3-HD-Kore",
  achird: "en-US-Chirp3-HD-Achird",
  sulafat: "en-US-Chirp3-HD-Sulafat",
};
export const voiceName = (voice: SpeakVoice): string => NAMES[voice];

const ENDPOINT = "https://texttospeech.googleapis.com/v1/text:synthesize";
/** The vendor is asked once and for no longer than this: the page is waiting, and falls back to the device's voice. */
const WAIT_MS = 10_000;

export type SpeakParsed = { ok: true; request: { text: string; voice: SpeakVoice } } | { ok: false; message: string };

/** The text as the vendor gets it (white space collapsed, control characters gone) and the voice (the default when none is named); a message when it cannot be read. */
export function parseSpeak(body: unknown): SpeakParsed {
  if (!body || typeof body !== "object") return { ok: false, message: "the body must be an object" };
  const { text, voice } = body as { text?: unknown; voice?: unknown };
  if (typeof text !== "string") return { ok: false, message: "text must be a string" };
  // eslint-disable-next-line no-control-regex
  const clean = text.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (!clean) return { ok: false, message: "text is empty" };
  if (clean.length > SPEAK.chars) return { ok: false, message: `text is longer than ${SPEAK.chars} characters` };
  const id = voice === undefined ? SPEAK.default : SPEAK.voices.find((v) => v.id === voice)?.id;
  if (!id) return { ok: false, message: "no such voice" };
  return { ok: true, request: { text: clean, voice: id } };
}

export type Spoken = { ok: true; audio: Uint8Array } | { ok: false; status: number };

/**
 * One call to the vendor. `status` is its HTTP status, or 0 when it could not be reached, was too slow or answered in a form that is not audio. The key and the text are never logged.
 * `origin` is the address this Worker was asked at: a Google key restricted to the app's domains (HTTP referrers, `*.laughedelic.workers.dev`) is only accepted with a matching `Referer`,
 * which a server does not send by itself. The restriction that really protects a key held here is the one to the Text-to-Speech API.
 */
export async function synthesize(apiKey: string, origin: string, request: { text: string; voice: SpeakVoice }, doFetch: typeof fetch = (...a) => fetch(...a)): Promise<Spoken> {
  try {
    const res = await doFetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey, referer: `${origin}/` },
      body: JSON.stringify({
        input: { text: request.text },
        voice: { languageCode: "en-US", name: NAMES[request.voice] },
        audioConfig: { audioEncoding: "MP3" },
      }),
      signal: AbortSignal.timeout(WAIT_MS),
    });
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      return { ok: false, status: res.status };
    }
    const content = ((await res.json()) as { audioContent?: unknown }).audioContent;
    if (typeof content !== "string" || !content) return { ok: false, status: 0 };
    const binary = atob(content);
    const audio = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) audio[i] = binary.charCodeAt(i);
    return { ok: true, audio };
  } catch {
    return { ok: false, status: 0 };
  }
}
