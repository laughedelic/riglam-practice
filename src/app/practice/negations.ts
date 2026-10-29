// The offer of the next step of the negation track on a result of Relations: once the plain pairs go well, pairs with one side negated; once those go
// well, both sides. The rule (what counts, how long the run is) is negationOffer in src/domain/stages.ts; this is the page around it, built like
// the offer of another stage in Categories (categories/flow.js): it shows on the result, nothing changes without a tap, and an offer passed over or
// declined needs another run. The classic page draws it with offerNode, the Path with NegOffer (path/relations.tsx). On the Path it comes from stage
// NEG_SUGGEST on, and only while fewer terms are open than the learner's pace allows (negationSuggested); the Difficulty page sets the step any time
// from NEG_OPEN (path/difficulty.tsx).
import { state } from "../state.js";
import { el } from "../core/dom.js";
import { answerList } from "./universe.js";
import { saveProgress } from "./progress.ts";
import { render } from "../shell/render.js";
import { negationOffer, negationSuggested, type NegOutcome } from "../../domain/stages.ts";
import { openNow } from "./stops.ts";
import type { PairLike } from "../../ai-shared/relations.ts";
import type { NegResult } from "../types.ts";

/** The offer on a result: a step to take ("one", "both"), or the line that says what the answer to it did. */
export type NegOffer = { kind: "one" | "both" } | { kind: "done"; text: string };

const RECENT_RUN = 20;     // the answers finished on this page that the run looks back over (more than the streak needs)
const store = (key: string, v: string) => { try { localStorage.setItem(key, v); } catch (e) { /* private mode: the offer counts from the page's start */ } };

/** The latest Relations answers, oldest first, from after the last time an offer was answered: the saved ones, and the ones finished on this page (they may not have come back from the database yet). */
function results(): NegOutcome[] {
  const since = state.negOfferAt || "", byId = new Map<string, NegResult>();
  for (const d of answerList()) byId.set(d.pairId, { pairId: d.pairId, at: d.at || "", ok: !!d.correct, neg: !!(d.pair && d.pair.neg) });
  for (const d of state.relSession) byId.set(d.pairId, d);
  return [...byId.values()].filter((d) => d.at > since).sort((x, y) => x.at.localeCompare(y.at));
}
/** A pair was checked (practice/grading.js): it joins the run, and the offer due after it, if any, is what the result shows. */
export function afterRelation(pairId: string, p: PairLike, ok: boolean): NegOffer | null {
  state.relSession = [...state.relSession, { pairId, at: new Date().toISOString(), ok, neg: !!p.neg }].slice(-RECENT_RUN);
  if (state.design === "path" && !negationSuggested(state.stages, openNow().size, state.pace)) return null;     // the Path suggests them from a stage on, and not while the terms are hard going
  const step = negationOffer(results(), state.negation);
  return step ? { kind: step } : null;
}
/** The run that led to an offer is spent: the next one counts from now. */
function spendRun() { state.negOfferAt = new Date().toISOString(); store("rd-neg-offer", state.negOfferAt); saveProgress(); }
/** The next pair is drawn: an offer passed over is Not now, so it asks again after another run, not after every result. */
export function passNegOffer() { const o = state.ui && state.ui.negOffer; if (o && o.kind !== "done") spendRun(); }
const pending = (): { kind: "one" | "both" } | null => { const o = state.ui && state.ui.negOffer; return o && o.kind !== "done" ? o : null; };
/** "Negate one side" or "Negate both sides": the negation track takes the step from the next pair on. Nothing changes without this tap. */
export function acceptNegOffer() {
  const o = pending(); if (!o) return;
  const kind = state.negation === "both" ? "both" : o.kind;     // both sides set meanwhile (the Difficulty page): the tap never takes a step back
  state.negation = kind; store("rd-negation", kind); spendRun();
  const where = state.design === "path" ? "on the Difficulty page" : "in the practice options";
  state.ui!.negOffer = { kind: "done", text: kind === "one" ? "Negations are on: from the next pair, about a third of the pairs negate one side. Change it " + where + "."
    : "Both sides now: half of the negated pairs negate both. Change it " + where + "." };
  render();
}
/** "Not now": the track stays as it is, and the next offer needs another run. */
export function declineNegOffer() {
  const o = pending(); if (!o) return;
  spendRun();
  state.ui!.negOffer = { kind: "done", text: o.kind === "one" ? "Plain pairs only, for now. It asks again after another five right in a row."
    : "One side only, for now. It asks again after another five negated pairs right in a row." };
  render();
}
/** What the offer says: the question, an example of the step, and the buttons' words. */
export function negOfferText(kind: "one" | "both") {
  return kind === "one"
    ? { q: "Plain pairs are going well. Try pairs with a negated side?", ex: "About a third of the pairs then negate one side, as in “furniture” and “non-(wooden things)”.", yes: "Negate one side" }
    : { q: "Pairs with a negated side are going well. Negate both sides too?", ex: "Half of the negated pairs then negate both, as in “non-(furniture)” and “non-(wooden things)”.", yes: "Negate both sides" };
}
export const NEG_NOTE = "Never starts by itself. Change it, or switch negations off, in the practice options.";
/** The classic page's offer under the result of a pair, or the line that says what the answer to it did. */
export function negOfferNode() {
  const o = state.ui && state.ui.negOffer as NegOffer | null | undefined; if (!o) return null;
  if (o.kind === "done") return el("p", { class: "catnote", role: "status", text: o.text });
  const t = negOfferText(o.kind);
  return el("div", { class: "catoffer", role: "group", "aria-label": "Negations" },
    el("p", { class: "catoq", text: t.q }),
    el("p", { class: "catnote", text: t.ex }),
    el("div", { class: "actions left" },
      el("button", { type: "button", class: "btn catyes", onclick: acceptNegOffer, text: t.yes }),
      el("button", { type: "button", class: "btn ghost", onclick: declineNegOffer, text: "Not now" })),
    el("p", { class: "catnote", text: NEG_NOTE }));
}
