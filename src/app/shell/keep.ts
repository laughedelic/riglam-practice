// An attempt under way survives a restart. Coming back to the app from another one reloads nothing, so whatever was on screen stays as it was; but a
// phone may close a page it keeps in the background, and then the app starts cold. So when the page is put away, the attempt on screen is written to
// the device (`rd-attempt`), if it has begun and is not checked yet: a cold start then opens on that exercise with it, where it would otherwise open on
// the roadmap. An attempt that has not begun, or is checked, is not kept, and a cold start opens on the roadmap as before. What only lives while the page
// does (a clock running, the tutor's conversation, a note or a definition open) is left out; the clock of a question starts again. An attempt kept under
// other term data (an update came in between) is not put back: its question and what grades it were drawn from the data it was kept with.
import { state } from "../state.js";
import { begun } from "./tabs.js";
import { usePerExercise } from "../practice/per-exercise.ts";
import { stillAsked } from "../practice/universe.js";
import { dataStamp } from "../../domain/stamp.ts";

const KEY = "rd-attempt";
const EXERCISES = ["practice", "debate", "find", "syllogism", "categories", "instance"];
// the parts of an attempt that belong to the page that drew it
const PASSING = ["tid", "tq", "tph", "rest", "ck", "hold", "qStart", "chat", "chatErr", "pop", "dterm", "late", "exLate"];

interface Kept { v: 1; tab: string; at: number; cur: unknown; ui: Record<string, unknown>; /** the stamp of the term data it was kept under */ data?: string }

// the stamp of the data on the page, made once for each copy of it
const stamps = new WeakMap<object, string>();
function dataNow(): string | null {
  const d = state.DATA;
  if (!d) return null;
  let s = stamps.get(d);
  if (s === undefined) stamps.set(d, (s = dataStamp(d)));
  return s;
}

/** Writes the attempt on screen to the device, or forgets the one written before when there is none worth keeping. */
export function keepAttempt(): void {
  try {
    const u = state.ui as Record<string, unknown> | null, k = state.own as string;
    if (state.mode !== "quiz" || !u || !state.cur || !EXERCISES.includes(k) || !begun(u)) { localStorage.removeItem(KEY); return; }
    const ui: Record<string, unknown> = { ...u };
    for (const p of PASSING) delete ui[p];
    const kept: Kept = { v: 1, tab: k, at: Date.now(), cur: state.cur, ui, data: dataNow() ?? undefined };
    localStorage.setItem(KEY, JSON.stringify(kept));
  } catch { /* no storage, or an attempt that cannot be written: a cold start opens on the roadmap */ }
}

/**
 * At a cold start: puts the kept attempt back in its exercise and makes it the one on screen. Whether it did (then the app opens on it, not on the
 * roadmap). The kept attempt is used once: the page writes it again when it is put away.
 */
export function takeAttempt(): boolean {
  let raw: string | null;
  try { raw = localStorage.getItem(KEY); localStorage.removeItem(KEY); } catch { return false; }
  if (!raw) return false;
  try {
    const kept = JSON.parse(raw) as Kept;
    if (!kept || kept.v !== 1 || !EXERCISES.includes(kept.tab) || !kept.cur || !kept.ui || typeof kept.ui !== "object") return false;
    const ui: Record<string, unknown> = { ...kept.ui, tid: null, tq: null, tph: null, rest: null, ck: null, hold: null, chat: null, chatErr: "", pop: null, dterm: null, late: false, exLate: false };
    if (!begun(ui)) return false;
    // kept under other term data (or before attempts carried its stamp): a question of Find an instance or Syllogisms, the cells of a pair, the
    // classes of a thing, all were drawn from that data, and what was right then need not be now
    const now = dataNow();
    if (!now || kept.data !== now) return false;
    // an attempt at a pair whose relation the reference has since left open is not put back: it would be graded by the relation it was drawn with
    const pair = (kept.cur as { p?: { a?: string; b?: string; catA?: string | null; catB?: string | null; own?: boolean } | null }).p;
    if (pair && typeof pair.a === "string" && typeof pair.b === "string" && !stillAsked(pair)) return false;
    state.tab = state.own = kept.tab; usePerExercise(kept.tab); state.cur = kept.cur as typeof state.cur; state.ui = ui as typeof state.ui; state.mode = "quiz";
    try { localStorage.setItem("rd-ex", kept.tab); } catch { /* the exercise is still the one on screen */ }
    return true;
  } catch { return false; }
}

const away = () => { if (document.visibilityState === "hidden") keepAttempt(); };
document.addEventListener("visibilitychange", away);
window.addEventListener("pagehide", keepAttempt);
