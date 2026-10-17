// The contract between the app and its server (worker/): what the app sends to the tutor, and what comes back.
// Both sides import this file, so the shapes cannot drift apart. The tutor request carries only what the person typed
// and the facts of the page's own state; the standing instructions, the notes and the lookup tools stay on the server.

export const API = {
  health: "/api/health",
  tutor: "/api/tutor",
  /** GET, with the device and proof headers: the definitions (`?have=<version>` asks only whether the copy kept is current) */
  course: "/api/course",
  /** POST, with the device and proof headers: one model call of the check lab. Answered only by a server that has the lab on (a Preview). */
  lab: "/api/lab",
} as const;

export const HEADER = {
  device: "x-riglam-device",
  proof: "x-riglam-proof",
} as const;

/** The answer of `GET /api/course`: the definitions as `{ [term]: { d?, d_ru? } }` with their version, or only the version when `have` named it. */
export type CourseResponse = { version: string; definitions: Record<string, { d?: string; d_ru?: string }> } | { version: string; unchanged: true };

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

/**
 * Whose limit a `rate_limited` refusal came from: this device's own daily budget, the one shared by everybody, or the connection's
 * allowance of wrong Magic Keys for the hour (`caller`, with `resetsAt` the start of the next hour).
 */
export type BudgetScope = "device" | "global" | "caller";

/** The body of an error answer. A refusal for a used-up budget also says whose budget it was and when it starts again (UTC midnight, ISO). */
export interface ErrorBody {
  error: { code: ErrorCode; message: string; scope?: BudgetScope; resetsAt?: string };
}

/** Server-sent events of the tutor response, in the order they come. */
export type TutorEvent =
  | { type: "delta"; text: string }
  | { type: "done"; truncated: boolean }
  | { type: "error"; code: ErrorCode; message: string };

/**
 * What the lab route accepts (worker/lab.ts): the models the check lab compares, the effort levels it asks for, and the size of a prompt
 * in characters. A model or an effort outside these is refused, so the route is not a way to use any model for anything.
 */
export const LAB = {
  models: ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"],
  efforts: ["low", "medium", "high"],
  prompt: 100_000,
} as const;

/** The body of `POST /api/lab`: one prompt for one model, with no tools and no earlier turns. */
export interface LabRequest {
  model: string;
  effort: string;
  prompt: string;
}

/** The answer of `POST /api/lab`. `modelApplied` is the model that answered; the lab does not count a run that another model answered. */
export interface LabResponse {
  text: string;
  truncated: boolean;
  modelApplied: string;
}

/** The answer of /api/health. */
export interface Health {
  ok: true;
  tutor: "on" | "off";
  /** the lab's model calls (`POST /api/lab`) are answered; left out when they are not, as on every server that is not a Preview */
  lab?: "on";
  /** optional accounts and sync (src/account/protocol.ts); a server from before accounts leaves it out */
  accounts?: "on" | "off";
}
