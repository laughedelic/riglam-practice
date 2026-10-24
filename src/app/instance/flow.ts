// Find an instance: one to three categories are shown, and the learner names something that is all of them, or says that nothing is. The rules
// (which sets are asked, what is right and why) are in src/domain/instance.ts; this is the page around them: the screen state and the saved
// answer. An answer is kept in the collection "answers" with `mode: "instance"`, so it is stored and synced like the others, and the lists that
// mean the Relations exercise leave it out (practice/universe.js, answerList). The exercise is drawn on the Path only (path/instance.tsx); the
// classic page says so in its place (shell/render.js).
import { state } from "../state.js";
import { persist } from "../practice/answers.js";
import { freshUi } from "../practice/queue.js";
import { render, top0 } from "../shell/render.js";
import { drawInstance, gradeInstance, instanceKey } from "../../domain/instance.ts";
import type { InstanceQuestion, InstanceResult } from "../../domain/instance.ts";
import type { DataIndex } from "../../ai-shared/lookup.ts";
import type { InstanceDoc, Ui } from "../types.ts";

/** How many sets asked lately the draw passes over. */
const RECENT = 16;
const GRADE: Record<InstanceResult["v"], InstanceDoc["grade"]> = { ok: "ok", bad: "bad", open: "pend" };
/** The page's state is the data index the rules take (types.ts, State), once the data is in. */
const ix = () => state as unknown as DataIndex;

/** A new attempt: what is written (`said`), or "nothing is" (`none`); `ir` is the result once checked. */
export function freshInstanceUi(): Ui {
  return Object.assign(freshUi(), { inst: true, said: "", none: false, ir: null as InstanceResult | null, focusIn: true }) as unknown as Ui;
}
/** The set on screen, or undefined while the data has none to ask. */
export const shownSet = (): InstanceQuestion | undefined => (state.cur && state.cur.inst ? state.cur.iq : undefined);

/** Draws the next set at the stages that are on, leaning away from the ones asked lately. */
export function advanceInstance(): void {
  const q = state.DATA ? drawInstance(ix(), { rng: Math.random, avoid: new Set(state.instRecent), stages: state.stages }) : null;
  if (q) state.instRecent = [...state.instRecent, instanceKey(q.cats)].slice(-RECENT);
  state.cur = { p: null as never, inst: true, iq: q ?? undefined };
  state.ui = freshInstanceUi(); state.mode = "quiz";
}
/** Skip: another set, with nothing kept. */
export function skipInstance(): void { advanceInstance(); render(); top0(); }

/** Whether this attempt has begun: something written, or "nothing is" said. */
export const instanceBegun = (u: Ui): boolean => !!String(u.said || "").trim() || !!u.none;

const live = () => { const u = state.ui; return u && u.inst && !u.checked ? u : null; };
/** The words in the field; writing takes back a "nothing is". */
export function writeInstance(text: string): void {
  const u = live(); if (!u) return;
  u.said = text; u.none = false;
}
/** "Nothing is": the answer that nothing is all of them; again, back to writing. */
export function sayNothing(on = true): void {
  const u = live(); if (!u) return;
  u.none = on; if (on) u.said = "";
  render();
}

/** Whether the field offers the things the course knows as they are typed; kept on the device. */
export function setInstanceSuggest(on: boolean): void {
  state.instSuggest = on;
  try { localStorage.setItem("rd-inst-suggest", on ? "1" : "0"); } catch { /* storage blocked */ }
  render();
}

const docId = () => "instance-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
/** Check: grades what was written, or "nothing is"; the result shows and the answer is kept. */
export function checkInstance(): void {
  const u = live(), q = shownSet(), said = String((u && u.said) || "").trim();
  if (!u || !q || (!u.none && !said)) return;
  const ir = gradeInstance(ix(), q, u.none ? { none: true } : { text: said }, state.EX);
  u.ir = ir; u.checked = true;
  const doc: InstanceDoc = {
    pairId: docId(), mode: "instance", cats: q.cats, labels: q.labels, possible: q.possible, said: u.none ? null : said,
    ...(ir.from ? { thing: ir.thing } : {}), grade: GRADE[ir.v], at: new Date().toISOString(),
  };
  render(); top0();
  if (!state.db) return;
  u.saveId = doc.pairId; u.doc = doc as never;     // the stored shape of Find an instance is not a pair's (types.ts); persist() only reads its keys
  persist(u, "Your answer");
}
