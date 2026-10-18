// A learner's flag on something Claude said, read as a record of the practice: which stored answer it was made on, and
// what it is on, in words. The page lists flags with their exercise in Review; whoever reviews flags later (a person,
// or a model on a server) reads them the same way. Nothing here reads the page, storage or the network.
import { QCELL } from "../ai-shared/debate";
import type { FlagCause, FlagReview } from "../ai-shared/flag-review";
import { CELL_NAME } from "../ai-shared/prompts";
import type { CellId } from "../ai-shared/relations";

/** The fields of a stored flag that this module reads; the stored shape is `FlagDoc` in src/app/types.ts. */
export interface FlagRef {
  caseKey?: string;
  thing?: string;
  part?: string;
  model?: string;
  n?: string | null;
  pair?: { tab?: string } | null;
  state?: string;
}

export type AnswerCol = "answers" | "debates";

/**
 * Flags a program writes, not a learner (`auto` in the flag document, src/app/ai/flags.js). Quorum's is the only one so far: the
 * models that explained one example disagreed. They are sent to the app's server like the others but counted on their own, so they
 * cannot use up the day's hand-made flags, and the models do not review them (docs/SERVER.md, "Flag reports"). A value not listed
 * here makes a flag an ordinary one, so a device cannot give itself the allowance of an automatic flag by naming one that does not exist.
 */
export const AUTO_FLAGS = ["quorum"] as const;
export type AutoFlag = (typeof AUTO_FLAGS)[number];
export const autoFlagOf = (flag: object): AutoFlag | null => AUTO_FLAGS.find((a) => a === (flag as { auto?: unknown }).auto) ?? null;

/**
 * The stored answer a flag was made on. A flag's case key is the collection and the id of the answer on screen
 * ("answers_r-mv9q", "debates_q-mv9q"); the check lab uses the same key. A key that names no collection gives null,
 * and an answer that was never saved is simply not found under the id.
 */
export function flagAnswerRef(f: FlagRef): { col: AnswerCol; id: string } | null {
  const m = /^(answers|debates)_(.+)$/.exec(f.caseKey || "");
  return m ? { col: m[1] as AnswerCol, id: m[2] } : null;
}

const isCell = (n: string): n is CellId => Object.prototype.hasOwnProperty.call(CELL_NAME, n);

/**
 * What the flag is on, in words: Claude's whole explanation, its note on one cell (a question in a debate) or on the
 * relation, or one answer in the chat. A part of the check lab is named by the example, the model and the part;
 * `modelName` turns a model id into its name.
 */
export function flaggedPart(f: FlagRef, modelName: (id: string) => string = (id) => id): string {
  const n = f.n == null ? "" : String(f.n);
  const debate = f.pair?.tab === "debate" || flagAnswerRef(f)?.col === "debates";
  if (f.part === "explain") {
    if (n === "rel") return "Claude’s note on the relation";
    if (isCell(n)) return "Claude’s note on " + (debate ? "Q" + (QCELL.indexOf(n) + 1) : CELL_NAME[n]);
    return "Claude’s explanation";
  }
  if (f.part === "chat") return "Claude’s answer in the chat";
  return [f.thing ? "“" + f.thing + "”" : "", f.model ? modelName(f.model) : "", f.part || ""].filter(Boolean).join(" · ");
}

/**
 * A flag's state in words. "new" is every flag nobody has looked at yet; where flags are sent to the maintainer, `sent` says whether
 * this one has been (undefined where they are not).
 */
export function flagStateText(state: string | undefined, sent?: boolean): string {
  if (state === "reviewed") return "Reviewed";
  if (state === "resolved") return "Resolved";
  return sent === undefined ? "Not reviewed yet" : sent ? "Sent to the maintainer" : "Waiting to be sent";
}

/**
 * What happens to a flag after the reviews (src/ai-shared/flag-review.ts), as a rule of the process:
 * - "reply": the reviewers agree with confidence that the learner is wrong, or that the tutor's text is wrong; the
 *   learner gets the reply, and a tutor fault is also counted for the maintainer's list of tutor improvements.
 * - "fix": they agree it is wording only; the change is prepared on its own and the learner gets the reply.
 * - "escalate": the fault is in the data, the rules that build pairs, or the grading (a change of the course data or
 *   the app that the maintainer decides), or the reviewers disagree, are unsure, or are fewer than two. When both are
 *   sure of the verdict and the cause, their agreed reply goes with it, so the learner can read a first answer while the
 *   maintainer decides; otherwise there is none.
 */
export interface FlagOutcome {
  action: "reply" | "fix" | "escalate";
  /** the reply the learner reads, when the reviewers agree on one */
  reply: string;
  /** the change to make, when there is one */
  fix: string;
  cause: FlagCause | "";
  /** why, in a few words, for the maintainer's list */
  reason: string;
}

export function decideFlag(reviews: readonly FlagReview[]): FlagOutcome {
  const out = (action: FlagOutcome["action"], reason: string, r?: FlagReview): FlagOutcome =>
    ({ action, reason, reply: r ? r.reply : "", fix: r ? r.fix : "", cause: r ? r.cause : "" });
  if (reviews.length < 2) return out("escalate", "fewer than two reviews");
  const [first] = reviews, same = (k: "verdict" | "cause") => reviews.every((r) => r[k] === first[k]);
  if (!same("verdict")) return out("escalate", "the reviewers disagree on whether the learner is right");
  if (first.verdict === "unclear") return out("escalate", "the reviewers cannot tell");
  if (!same("cause")) return out("escalate", "the reviewers disagree on the cause", first);
  // no reply from reviewers who are not sure: the learner reads only what both stand behind
  if (!reviews.every((r) => r.confident)) return out("escalate", "a reviewer is not sure", { ...first, reply: "" });
  if (first.verdict === "learner_wrong") return out("reply", "the learner is wrong", first);
  if (first.cause === "tutor") return out("reply", "the tutor was wrong", first);
  if (first.cause === "wording") return out("fix", "wording only", first);
  if (first.cause === "none") return out("escalate", "the learner is right, but no cause is named", first);
  return out("escalate", "a change of the " + ({ data: "term data", generator: "rules that build pairs", grading: "grading" } as Record<string, string>)[first.cause] + " is needed", first);
}
