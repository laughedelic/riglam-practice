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

// Flags a program writes, not a learner (`auto` in the flag document): the rule is in src/domain/flags.ts because the page needs it too.
export { AUTO_FLAGS, autoFlagOf, type AutoFlag } from "../domain/flags";

export interface ReportRequest {
  send?: FlagReport[];
  /** the app's version, kept with the reports sent in this request */
  app?: string;
  /** ids of flags the learner removed */
  withdraw?: string[];
}

export interface ReportResponse {
  /** the ids the server now holds */
  stored: string[];
  /** the ids it holds no longer (also those it never held) */
  withdrawn: string[];
}

export const REPORT_LIMITS = {
  /** reports in one request */
  send: 5,
  withdraw: 50,
  /** the request body, in bytes */
  body: 160 * 1024,
  /** the flag document and the stored answer, as JSON text */
  flag: 8 * 1024,
  answer: 48 * 1024,
  /** received per UTC day: from one device id (made up by the sender, so it is not enough alone), from one address, and in all */
  perDevice: 20,
  perCaller: 60,
  perDay: 1000,
  /** the same limits for automatic flags (`autoFlagOf`), counted apart from the hand-made ones */
  auto: { perDevice: 100, perCaller: 200, perDay: 2000 },
  /** reports held at a time, of both kinds; a further new one is refused */
  held: 20_000,
} as const;
