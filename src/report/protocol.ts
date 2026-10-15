// The contract between the app and its server for flag reports (docs/SERVER.md, "Flag reports"). Both sides import this
// file, so the shapes and the limits cannot drift apart.
//
// A report is a learner's flag on something the tutor said, with the stored answer it was made on. Every device may send
// reports, signed in or not, if it has the Magic Key: a flag is feedback to whoever maintains the app. The server only
// stores them; what is in one is text from a device, so whoever reads it treats it as data.

export const REPORT_API = {
  /** POST: send and take back reports. The device id and the access proof go in the `x-riglam-device` and `x-riglam-proof` headers (src/ai/protocol.ts). */
  reports: "/api/flags",
} as const;

/** A document as the page stores it: a plain JSON object. */
export type ReportDoc = Record<string, unknown>;

export interface FlagReport {
  /** the flag's id on the device: the same report is replaced, not added again */
  id: string;
  /** the flag document (`FlagDoc`, src/app/types.ts) */
  flag: ReportDoc;
  /** the stored answer the flag's case key names (`answers` or `debates`), or null when it was not kept */
  answer: ReportDoc | null;
}

/**
 * Where a report is in its review, as the sender is told: 'sent' (waiting for review), 'answered' (the reply stands),
 * 'maintainer' (the maintainer decides; there may be a first reply meanwhile), 'fixed' (a change was made) and 'decided'
 * (the maintainer decided; the reply is theirs). Review and the maintainer's part: docs/SERVER.md, "Reviewing flags".
 */
export type ReportState = "sent" | "answered" | "maintainer" | "fixed" | "decided";

/** What the sender of a report may read back about it. Nothing else of the review leaves the server. */
export interface ReportStatus {
  id: string;
  state: ReportState;
  /** plain text, shown as text only; absent while there is none */
  reply?: string;
  /** when the reply was written (ISO time) */
  replyAt?: string;
}

export interface ReportRequest {
  send?: FlagReport[];
  /** the app's version, kept with the reports sent in this request */
  app?: string;
  /** ids of flags the learner removed */
  withdraw?: string[];
  /** ids of flags to hear about: the sending device's, and those of the account it is signed in to */
  status?: string[];
}

export interface ReportResponse {
  /** the ids the server now holds */
  stored: string[];
  /** the ids it holds no longer (also those it never held) */
  withdrawn: string[];
  /** for the ids asked in `status` that the server holds; present only when `status` was asked */
  status?: ReportStatus[];
}

export const REPORT_LIMITS = {
  /** reports in one request */
  send: 5,
  withdraw: 50,
  /** ids asked about in one request */
  status: 50,
  /** the request body, in bytes */
  body: 160 * 1024,
  /** the flag document and the stored answer, as JSON text */
  flag: 8 * 1024,
  answer: 48 * 1024,
  /** received per UTC day: from one device id (made up by the sender, so it is not enough alone), from one address, and in all */
  perDevice: 20,
  perCaller: 60,
  perDay: 1000,
  /** reports held at a time; a further new one is refused */
  held: 20_000,
} as const;
