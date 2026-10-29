// Blitz, the tutor and voice keep their own value in each exercise (the Design Lab's "Settings and options", round 3): Blitz on in Relations can be off in
// Syllogisms. `rd-per-ex` holds what each exercise was set to; an exercise not set yet takes the shared value, which the old keys keep (`rd-blitzuse`,
// `rd-autoexplain`, `rd-voice-read`, `rd-voice-answer`) and every change also writes, so it is the last choice made anywhere. The page reads the values
// of the exercise on screen where it always did (state.blitzUse, state.autoExplain, state.voice): they are put in place as an exercise opens.
import { state } from "../state.js";
import { type Own, type OwnKey, EXERCISES } from "../../domain/per-exercise.ts";

const now = (): Required<Own> => ({ blitzUse: state.blitzUse, autoExplain: state.autoExplain, read: state.voice.read, answer: state.voice.answer });
function put(o: Required<Own>) {
  state.blitzUse = o.blitzUse; if (!o.blitzUse) state.blitz = false;
  state.autoExplain = o.autoExplain; state.voice.read = o.read; state.voice.answer = o.answer as typeof state.voice.answer;
}
/** At the start: the values as loaded are the shared ones; then the exercise on screen takes its own. */
export function startPerExercise() {
  state.perBase = now();
  usePerExercise(state.tab);
}
/** The exercise `ex` opens: its own values, the shared ones where it has none. Not an exercise (Review): nothing changes. */
export function usePerExercise(ex: string) {
  if (!EXERCISES.includes(ex) || !state.perBase) return;
  put({ ...state.perBase, ...state.perEx[ex] } as Required<Own>);
}
/** A setting changed in the exercise on screen: it is that exercise's own value, and the shared one for the exercises not set yet. The caller has set the state. */
export function keepOwn<K extends OwnKey>(k: K, v: Required<Own>[K]) {
  if (state.perBase) state.perBase = { ...state.perBase, [k]: v };
  if (!EXERCISES.includes(state.tab)) return;
  state.perEx = { ...state.perEx, [state.tab]: { ...state.perEx[state.tab], [k]: v } };
  try { localStorage.setItem("rd-per-ex", JSON.stringify(state.perEx)); } catch { /* the choice holds for this visit */ }
}
/** The shared value changed without a choice in an exercise (the design's default for the tutor): exercises without their own follow it. */
export function setBase<K extends OwnKey>(k: K, v: Required<Own>[K]) {
  if (state.perBase) state.perBase = { ...state.perBase, [k]: v };
}
