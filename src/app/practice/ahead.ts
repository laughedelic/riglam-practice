// The pair that the next Next will show, drawn before it: a natural voice reads a question from a clip the server makes, which takes a moment, so
// the first question of the next pair is asked for while its result (or the stop of a new term) is still on screen (shell/voice.js, warmNext).
// The draw is the same one, made earlier and kept: Next takes the pair held if what the draw depends on is as it was, and draws as before if not.
import { state } from "../state.js";
import { restoreLean } from "../shell/stages.js";
import { unmetNow } from "./stops.ts";
import { hiddenKeys } from "./skips.js";
import type { Pair } from "../../domain/types.ts";

type Kind = "practice" | "debate";

/** What the draw of the next pair depends on, as far as it can change between a result and the Next: the stages, the negation track, the skips and the terms met. */
const sig = (): string => [state.stages.join(","), state.negation, state.negBrackets, state.stagesKept, hiddenKeys().size, unmetNow().size].join("|");

/**
 * Puts back what a draw that was not used spent: the pairs it counted as lately asked, and the pair of the lean of a new stage. The lean is put back only while it is what the
 * draw left: a stage taken after the draw sets it anew (shell/stages.js), and that one is not the draw's to undo.
 */
function giveBack(): void {
  const a = state.ahead; state.ahead = null;
  if (!a) return;
  state.recent.splice(0, state.recent.length, ...a.keep.recent);
  if (state.stageLean === a.keep.after) restoreLean(a.keep.lean);
}

/** The pair held for `kind` if it was drawn under what holds now; else drawn by `draw` and held, the one held before being given back. */
export function holdAhead(kind: Kind, draw: () => Pair): Pair {
  const a = state.ahead, now = sig();
  if (a && a.kind === kind && a.sig === now) return a.p;
  giveBack();
  const keep = { recent: state.recent.slice(), lean: state.stageLean, after: 0 };
  const p = draw();
  keep.after = state.stageLean;
  state.ahead = { kind, sig: now, p, keep };
  return p;
}

/** The pair held for `kind`, taken (it is not held any more), when it was drawn under what holds now; else null after giving back what it spent, and the caller draws. */
export function takeAhead(kind: Kind): Pair | null {
  const a = state.ahead;
  if (a && a.kind === kind && a.sig === sig()) { state.ahead = null; return a.p; }
  giveBack();
  return null;
}
