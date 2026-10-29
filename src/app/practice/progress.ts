// The learner's progression: the stages on, the course terms met at their stops and how well (practice/stops.ts), the pace they come at, the step of the negation track, the
// runs towards an offer of the stages and each exercise's own (practice/stage-offer.ts), each exercise's guided form (practice/guided.ts), and when the offer of a negation step was last answered. The device keeps it in localStorage, where state.js reads it at the start, and
// in one document, `progress/learner`, which sync carries to the account and to the other devices signed in to it (src/account/sync.ts). A copy that
// differs from the ones this page wrote came from sync or from another tab, which has settled that it is the newer: the page takes it. Reset progression
// (the Path's Stages page) starts it again, on every device; the answers and their statistics stay.
//
// The document has no `at`. A device seeds its documents into an account at their own timestamps the first time it signs in (src/account/sync.ts,
// noteAll), so a copy without one loses to the account's: a few questions answered before signing in on a new device do not undo the progression the
// account holds. The changes made once the device is signed in carry the time they were made, and the later one wins.
import { state } from "../state.js";
import { startFirst } from "../shell/tabs.js";
import { render } from "../shell/render.js";
import type { ProgressDoc } from "../types.ts";
import { freshIntro, normIntro, normPace } from "../../domain/intro.ts";
import { DEFAULT_STAGES, freshRun, normExRuns, normGuided, normRun, normStages, topStage } from "../../domain/stages.ts";
import { EVERYDAY_STAGES } from "../../domain/syllogism.ts";

export const PROGRESS = "progress";
const ID = "learner";

/** A copy as text with its keys in order, so that one read back from any store compares equal to the one written. */
const canon = (v: unknown): string => Array.isArray(v) ? "[" + v.map(canon).join(",") + "]"
  : v && typeof v === "object" ? "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canon((v as Record<string, unknown>)[k])).join(",") + "}"
  : JSON.stringify(v) ?? "null";
const store = (key: string, v: string | null) => { try { if (v === null) localStorage.removeItem(key); else localStorage.setItem(key, v); } catch { /* private mode: this device starts again next time */ } };
const docOf = (): ProgressDoc => ({ stages: [...state.stages], terms: state.intro ?? freshIntro(), negation: state.negation, run: state.stageRun, exercises: state.exRuns, guided: state.guided, negOfferAt: state.negOfferAt, pace: state.pace });

/** The progression changed on this device: kept here, and written for the other devices. */
export function saveProgress() {
  const doc = docOf();
  store("rd-terms", JSON.stringify(doc.terms)); store("rd-stage-run", JSON.stringify(doc.run)); store("rd-ex-runs", JSON.stringify(doc.exercises)); store("rd-guided", JSON.stringify(doc.guided));
  if (!state.db) return;
  state.progressSent = [...state.progressSent.slice(-4), canon(doc)];
  try { void state.db.collection(PROGRESS).doc(ID).set(doc).catch(() => {}); } catch { /* the store refused it: the next change tries again */ }
}

/** The copy in the store: taken when it is not one this page wrote. Whether the progression changed. */
export function takeProgress(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const sig = canon(raw);
  if (state.progressSent.includes(sig)) return false;
  const d = raw as Partial<ProgressDoc>;
  state.progressSent = [...state.progressSent.slice(-4), sig];
  const stages = normStages(d.stages), changed = stages.join() !== state.stages.join();
  state.stages = stages; store("rd-stages", stages.join(","));
  if (changed && (state.stagesKept || state.syllogismEveryday)) { state.stagesKept = state.syllogismEveryday = false; store("rd-stages-kept", null); store("rd-syllogism-level", null); }
  state.intro = normIntro(d.terms); store("rd-terms", JSON.stringify(state.intro));
  state.negation = d.negation === "one" || d.negation === "both" ? d.negation : "off"; store("rd-negation", state.negation);
  state.stageRun = normRun(d.run); store("rd-stage-run", JSON.stringify(state.stageRun));
  state.exRuns = normExRuns(d.exercises); store("rd-ex-runs", JSON.stringify(state.exRuns));
  state.guided = normGuided(d.guided); store("rd-guided", JSON.stringify(state.guided));
  state.negOfferAt = typeof d.negOfferAt === "string" ? d.negOfferAt : ""; store("rd-neg-offer", state.negOfferAt || null);
  state.pace = normPace(d.pace); store("rd-pace", String(state.pace));
  return true;
}

/** Follows the document: a newer copy from another device or tab replaces what this page has, and the screen shows it. */
export function watchProgress() {
  if (!state.db) return;
  try {
    state.db.collection(PROGRESS).onSnapshot((snap: { docs: { id: string; data(): unknown }[] }) => {
      const d = snap.docs.find((x) => x.id === ID);
      if (d && takeProgress(d.data()) && state.mode !== "loading") render();
    }, () => {});
  } catch { /* a store without this collection: the progression stays on the device */ }
}

/**
 * Reset progression: stage 0 alone, no course term met, negations off, every exercise new again and guided, and the offers count from now, so the answers given
 * before do not bring one at once. The answers, their statistics and the settings stay. The question on screen gives way to one drawn from the
 * progression as it is now.
 */
export function resetProgress() {
  const now = new Date().toISOString();
  state.stages = [...DEFAULT_STAGES]; store("rd-stages", state.stages.join(","));
  state.stageLean = 0; store("rd-stage-lean", null);
  state.stagesKept = state.syllogismEveryday = false; store("rd-stages-kept", null); store("rd-syllogism-level", null);
  state.intro = freshIntro();
  state.negation = "off"; store("rd-negation", "off");
  state.stageRun = freshRun(); state.exRuns = {}; state.guided = {};
  state.negOfferAt = now; store("rd-neg-offer", now); state.relSession = [];
  try { if (localStorage.getItem("rd-syllogism-guide") === null) state.syllogismGuide = topStage(state.stages) <= EVERYDAY_STAGES; } catch { /* the default stays */ }
  saveProgress();
  if (state.mode === "quiz") startFirst();
  render();
}
