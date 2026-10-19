// The contract between the app and its server (worker/): what the app sends to the tutor, and what comes back.
// Both sides import this file, so the shapes cannot drift apart. The tutor request carries only what the person typed
// and the facts of the page's own state; the standing instructions, the notes and the lookup tools stay on the server.

import type { Examples } from "../ai-shared/examples";

export const API = {
  health: "/api/health",
  tutor: "/api/tutor",
  /** GET, with the device and proof headers: the definitions (`?have=<version>` asks only whether the copy kept is current) */
  course: "/api/course",
  /** GET, with the same headers: the reference examples a device may keep (`?have=<version>` as for the definitions) */
  examples: "/api/course/examples",
} as const;

export const HEADER = {
  device: "x-riglam-device",
  proof: "x-riglam-proof",
} as const;

/** The answer of `GET /api/course`: the definitions as `{ [term]: { d?, d_ru? } }` with their version, or only the version when `have` named it. */
export type CourseResponse = { version: string; definitions: Record<string, { d?: string; d_ru?: string }> } | { version: string; unchanged: true };

/** The answer of `GET /api/course/examples`: the device part of the reference examples (src/ai-shared/examples.ts) with its version, or only the version when `have` named it. */
export type ExamplesResponse = { version: string; examples: Examples } | { version: string; unchanged: true };

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
  /**
   * Asks for Quorum (worker/quorum.ts), the tutor's mode on a Preview: several models answer an explain request and the judge's answer is the one shown.
   * A server that has Quorum off, and any request that is not an explain, answers with the one model as always.
   */
  quorum?: boolean;
  /**
   * The learner's examples that the page could not check itself (verdict "not checked"), each with the cell it stands in. Sent with an explain
   * request only. A server that keeps learned facts (docs/SERVER.md, "Learned facts") reads the answer's lines about these examples and keeps what
   * the models said of each; it ignores the lines about any other example. A device that does not share its examples leaves the field out.
   */
  examples?: ExplainExample[];
}

/** One of the learner's examples in an explain request: its text as typed, and the cell it stands in. */
export interface ExplainExample {
  cell: "both" | "anb" | "bna" | "nei";
  text: string;
}

/** What the server accepts. Anything above these is refused with `prompt_too_large`. */
export const LIMITS = {
  turns: 40,
  /** all turns together, in characters */
  chars: 60_000,
  cats: 2,
  /** examples one explain request may name, and the characters of each */
  examples: 8,
  exampleChars: 200,
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
  | { type: "error"; code: ErrorCode; message: string }
  /** Quorum: a model has answered (`ok`) or failed, or the judge has (`name` "Judge"); sent as they happen, so the page can show how far it is */
  | { type: "step"; name: string; ok: boolean }
  /** Quorum: every answer and the ruling, before `done` */
  | { type: "quorum"; record: QuorumRecord }
  /** Quorum was asked for, but this answer is one model's: Quorum's budget for the day is used */
  | { type: "single"; why: "budget" };

/**
 * The models of Quorum (worker/quorum.ts). Each answers the explain request on its own, with the tutor's instructions and tools; where they give different
 * cells for an example, the judge reads the answers and writes the one the learner sees. The names are what the chip shows.
 */
export const QUORUM = {
  models: [
    { id: "claude-haiku-5-5", name: "Haiku" },
    { id: "claude-sonnet-5-5", name: "Sonnet" },
    { id: "claude-opus-5-5", name: "Opus" },
  ],
  judge: { id: "claude-opus-5-5", name: "Judge" },
} as const;

/** One call of a Quorum run: a model's answer, or the judge's. A call that failed has no text and says why in `error`. */
export interface QuorumRun {
  name: string;
  model: string;
  text: string;
  ok: boolean;
  /** milliseconds from the start of the call to its end */
  ms: number;
  truncated?: boolean;
  error?: ErrorCode;
}

/** What the maintainer sees of a Quorum run, and what the server keeps of it (migrations/0008_quorum_records.sql). */
export interface QuorumRecord {
  /** the stored row's id, which the flags made on this run carry */
  id: string;
  /** the models' answers, in the order of `QUORUM.models` */
  models: QuorumRun[];
  /** the judge's answer, when it was asked (`why`) */
  judge: QuorumRun | null;
  /** the name of the call whose text the learner saw: "Judge", or the model's name when the answers agreed (or only one could be used) */
  shown: string;
  why: "disagree" | null;
}

/** What a server offers of Quorum, as the page reads it from /api/health: nothing, or Quorum on by default, or Quorum for a device that asks for it. */
export type QuorumOffer = false | NonNullable<Health["quorum"]>;

/** The answer of /api/health. */
export interface Health {
  ok: true;
  tutor: "on" | "off";
  /**
   * Quorum (worker/quorum.ts) is offered; left out when it is not, as on every server that is not a Preview. "on": a device has it on until it turns it off (a Preview);
   * "optin": a device has it off until it turns it on.
   */
  quorum?: "on" | "optin";
  /** optional accounts and sync (src/account/protocol.ts); a server from before accounts leaves it out */
  accounts?: "on" | "off";
  /** reports of flags (src/report/protocol.ts); a server from before them leaves it out */
  reports?: "on" | "off";
}
