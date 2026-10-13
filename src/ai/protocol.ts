// The contract between the app and its server (worker/): what the app sends to the tutor, and what comes back.
// Both sides import this file, so the shapes cannot drift apart. The tutor request carries only what the person typed
// and the facts of the page's own state; the standing instructions, the notes and the lookup tools stay on the server.

export const API = {
  health: "/api/health",
  tutor: "/api/tutor",
} as const;

export const HEADER = {
  device: "x-riglam-device",
  proof: "x-riglam-proof",
} as const;

export interface Turn {
  role: "user" | "assistant";
  content: string;
}

export type TutorKind = "chat" | "explain";

export interface TutorRequest {
  kind: TutorKind;
  /** ids of the two categories of the pair (the keys of the term data's `notes`); the server adds the fine points that belong to them */
  cats: string[];
  /** the conversation so far, oldest first; the last turn is the learner's */
  turns: Turn[];
}

/** What the server accepts. Anything above these is refused with `prompt_too_large`. */
export const LIMITS = {
  turns: 40,
  /** all turns together, in characters */
  chars: 60_000,
  cats: 2,
  /** the request body, in bytes */
  body: 200_000,
} as const;

/**
 * The error codes. The first group is the page's own vocabulary (src/app/app.js, errCopy and ERR_OFF), so the page shows
 * its existing messages; `unavailable` and `refused` fall to its generic "could not answer just now".
 */
export type ErrorCode =
  | "rate_limited" // the device's or everybody's budget for the day is used, or the model is busy
  | "not_granted" // the proof does not match: the key is missing or wrong; the page hides the tutor
  | "prompt_too_large"
  | "bad_request"
  | "refused" // the model declined to answer
  | "unavailable"; // the tutor is off, not set up, or failed on the server

/** Server-sent events of the tutor response, in the order they come. */
export type TutorEvent =
  | { type: "delta"; text: string }
  | { type: "done"; truncated: boolean }
  | { type: "error"; code: ErrorCode; message: string };

/** The answer of /api/health. */
export interface Health {
  ok: true;
  tutor: "on" | "off";
}
