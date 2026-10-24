// Taking a choice on the path, as the lab's Motion tab has it (Choose: slide it onto the path; Two on a row: fade and slide). The choices stand beside the dotted
// path, not on it. A tap on one (or a slide of it to the left, which a finger can stop half way) sends its mark onto the line with a small knock; the others fade
// while the dotted thread above it turns solid, together; the mark fills when the solid line reaches it; and, in a list, it rises along that thread to the first
// row's place while the trace below it turns gray. Then the step goes on (`done`). The stages are CSS variables on the choice's section (`.sx.gap`: s the snap, f the
// others fading, g the thread turning solid, n the mark filling, r the rise), so the stylesheet (styles/41-path-choose.css) draws everything from them and a hand can
// drive the first three. Reduced motion skips all of it.
import { state } from "../state.js";
import { bump } from "./gesture.ts";

type Ease = "io" | "out" | "back";
/** A stage: when it starts and how long it runs (ms), its ease, and the overshoot of a "back" one. */
export interface Stage { n: string; a: number; d: number; e: Ease; c?: number }

const EASE = {
  out: (u: number) => 1 - (1 - u) ** 3,
  io: (u: number) => (u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2),
  back: (u: number, c1 = 2.2) => 1 + (c1 + 1) * (u - 1) ** 3 + c1 * (u - 1) ** 2,
};
/** The overshoot of the snap is about 3 px whatever the travel: the ease's overshoot is 4c³ / (27 (c + 1)²) of it, solved for c. */
export function backC(travel: number): number {
  const want = 3.2 / Math.max(travel, 1);
  let lo = 0.05, hi = 4;
  for (let k = 0; k < 24; k++) { const c = (lo + hi) / 2; if ((4 * c ** 3) / (27 * (c + 1) ** 2) < want) lo = c; else hi = c; }
  return (lo + hi) / 2;
}
/** The stages of a choice: `travel` the way of the mark to the line (px), `rise` how far it then goes up (px, 0 on one row), `row` for two options on one row. */
export function stages(travel: number, rise: number, row: boolean): Stage[] {
  if (row) {
    const sd = 260 + 1.4 * travel, g0 = sd * 0.8;
    return [{ n: "s", a: 0, d: sd, e: "back", c: backC(travel) }, { n: "f", a: 0, d: 220, e: "out" }, { n: "g", a: g0, d: 380, e: "io" }, { n: "n", a: g0 + 340, d: 170, e: "out" }];
  }
  const up = Math.abs(rise) < 2 ? 0 : Math.min(540, 240 + Math.abs(rise) * 2);
  const t: Stage[] = [{ n: "s", a: 0, d: 300, e: "back", c: backC(travel) }, { n: "f", a: 220, d: 380, e: "io" }, { n: "g", a: 220, d: 380, e: "io" }, { n: "n", a: 540, d: 170, e: "out" }];
  if (up) t.push({ n: "r", a: 600, d: up, e: "io" });
  return t;
}

const get = (g: HTMLElement, n: string) => parseFloat(g.style.getPropertyValue("--" + n)) || 0;
/** The trail ahead under the choices (the tail section): it goes solid as the trace below the mark does, so it takes that stage as `--tx` (the thread turning solid for two
 *  options on a row, the rise in a list). */
const tailOf = (g: HTMLElement) => { const t = g.nextElementSibling; return t instanceof HTMLElement && t.classList.contains("ptail") ? t : null; };
const put = (g: HTMLElement, n: string, v: number) => {
  g.style.setProperty("--" + n, v.toFixed(4));
  if (n === (g.dataset.fx === "row" ? "g" : "r")) { const t = tailOf(g); if (t) t.style.setProperty("--tx", v.toFixed(4)); }
};
const frames = new WeakMap<HTMLElement, number>();
const STAGES = ["s", "f", "g", "n", "r"];
const reduced = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
const gapOf = (chs: Element) => chs.closest<HTMLElement>(".sx.gap");
const box = (e: Element) => e.getBoundingClientRect();

/** Clears every trace of a choice taken (or half taken by hand): the stages, the measures, the marks on the rows. */
export function clearChoice(g: HTMLElement | null): void {
  if (!g) return;
  cancelAnimationFrame(frames.get(g) || 0); frames.delete(g);
  delete g.dataset.fx; delete g.dataset.snap; delete g.dataset.run;
  for (const n of [...STAGES, "ox", "ry", "yp"]) g.style.removeProperty("--" + n);
  tailOf(g)?.style.removeProperty("--tx");
  g.querySelectorAll<HTMLElement>(".crow[data-pk]").forEach((r) => delete r.dataset.pk);
}
/** The row is the one being taken: measures how far its mark is from the line (`--ox`), from the first row's mark (`--ry`) and from the top of the section (`--yp`). */
function mark(g: HTMLElement, row: HTMLElement): void {
  clearChoice(g);
  const chs = g.querySelector<HTMLElement>(".chs.slide"), list = !!chs && !chs.classList.contains("row2");
  const mk = (r: Element) => { const m = r.querySelector(".mc"), e = (m && (m.firstElementChild as HTMLElement | null)) || m; return e ? box(e) : null; };
  const gr = box(g), line = gr.left + (parseFloat(getComputedStyle(g).getPropertyValue("--m")) || 50), m = mk(row), first = chs?.querySelector(".crow"), m0 = first ? mk(first) : null;
  if (!m) return;
  const cy = m.top + m.height / 2, cx = m.left + m.width / 2;
  g.style.setProperty("--ox", Math.max(0, cx - line).toFixed(1) + "px");
  g.style.setProperty("--ry", (list && m0 ? Math.min(0, m0.top + m0.height / 2 - cy) : 0).toFixed(1) + "px");
  g.style.setProperty("--yp", (cy - gr.top).toFixed(1) + "px");
  for (const n of STAGES) put(g, n, 0);
  row.dataset.pk = "1"; g.dataset.fx = list ? "list" : "row";
}
/** The row slid by hand to `p` (0 to 1): its snap, the others' fade and the thread's solidifying go as one. It knocks each time it snaps: slid back off the line
 *  (below 0.85, so that a finger resting at the line does not knock again and again) and onto it again, it knocks again. */
function slideTo(g: HTMLElement, p: number): void {
  for (const n of ["s", "f", "g"]) put(g, n, p);
  if (p >= 0.98 && !g.dataset.snap) { g.dataset.snap = "1"; bump(); }
  else if (p < 0.85 && g.dataset.snap) delete g.dataset.snap;
}
/** The stages played from where they are (a slide by hand leaves some of them part way: those go on at once, the later ones move up with them); `done` at the end. */
function run(g: HTMLElement, done: () => void): void {
  g.dataset.run = "1";
  const T = stages(parseFloat(g.style.getPropertyValue("--ox")) || 22, parseFloat(g.style.getPropertyValue("--ry")) || 0, g.dataset.fx === "row");
  const v0: Record<string, number> = {}; for (const s of T) v0[s.n] = get(g, s.n);
  let shift = 0; for (const s of T) if ((s.n === "f" || s.n === "g") && v0[s.n] > 0.02) shift = Math.max(shift, s.a);
  if (shift) for (const s of T) { if (s.a >= shift) s.a -= shift; else if (v0[s.n] > 0.02) s.a = 0; }
  const t0 = performance.now();
  const f = (now: number) => {
    let all = true;
    for (const s of T) {
      const u = Math.max(0, Math.min(1, (now - t0 - s.a) / s.d));
      if (u < 1) all = false;
      put(g, s.n, v0[s.n] + (1 - v0[s.n]) * EASE[s.e](u, s.c));
    }
    if (!g.dataset.snap && get(g, "s") >= 0.98) { g.dataset.snap = "1"; bump(); }
    if (all) { frames.delete(g); done(); } else frames.set(g, requestAnimationFrame(f));
  };
  frames.set(g, requestAnimationFrame(f));
}
/** A slide let go short of half way: the row goes back. */
function slideBack(g: HTMLElement): void {
  const s0 = get(g, "s"), t0 = performance.now();
  const f = (now: number) => {
    const u = Math.min(1, (now - t0) / 200), v = s0 * (1 - EASE.out(u));
    for (const n of ["s", "f", "g"]) put(g, n, v);
    if (u < 1) frames.set(g, requestAnimationFrame(f)); else clearChoice(g);
  };
  cancelAnimationFrame(frames.get(g) || 0); frames.set(g, requestAnimationFrame(f));
}

/** Takes the choice `k` with the animation, then `done`: false when there is none to play (no sliding choices on the page, reduced motion), and the caller goes on its own. */
export function takeChoice(k: string, done: () => void): boolean {
  if (reduced()) return false;
  const chs = document.querySelector<HTMLElement>("#path .chs.slide"), g = chs && gapOf(chs); if (!chs || !g) return false;
  const row = Array.from(chs.querySelectorAll<HTMLElement>(".crow")).find((r) => r.dataset.k === k); if (!row) return false;
  if (g.dataset.run) return true;
  if (!g.dataset.fx || !row.dataset.pk) mark(g, row);
  if (!g.dataset.fx) return false;
  // the step goes on (its draw is at once, or at the next frame: then the choice is cleared after it, so that no frame shows the choices back as they were)
  run(g, () => { done(); if (state.pathQ) requestAnimationFrame(() => clearChoice(g)); else clearChoice(g); });
  return true;
}

/** Makes the rows of a sliding choice slide by hand: a finger dragging a row to the left takes it along (the others fade as it goes); let go past half way, it is
 *  taken (`pick`), short of it, it goes back. A tap is the row's own click. Returns what undoes it. */
export function bindSlide(chs: HTMLElement, pick: (k: string) => void): () => void {
  let d: { row: HTMLElement; x0: number; y0: number; id: number; moved: boolean; ox: number } | null = null, hushed = false;
  const g = () => gapOf(chs);
  const down = (e: PointerEvent) => {
    const gp = g(), row = (e.target as Element).closest<HTMLElement>(".crow"); if (!gp || !row || d || gp.dataset.fx || reduced() || (e.pointerType === "mouse" && e.button !== 0)) return;
    d = { row, x0: e.clientX, y0: e.clientY, id: e.pointerId, moved: false, ox: 22 };
  };
  const move = (e: PointerEvent) => {
    const gp = g(); if (!d || !gp || e.pointerId !== d.id) return;
    const dx = d.x0 - e.clientX, dy = Math.abs(e.clientY - d.y0);
    if (!d.moved) {
      if (dx > 6 && dx > dy * 1.5) { mark(gp, d.row); d.ox = Math.max(8, parseFloat(gp.style.getPropertyValue("--ox")) || 22); d.moved = true; try { chs.setPointerCapture(e.pointerId); } catch { /* gone */ } }
      else { if (dy > 10 || dx < -10) d = null; return; }
    }
    slideTo(gp, Math.max(0, Math.min(1, dx / d.ox)));
  };
  const up = (e: PointerEvent) => {
    const gp = g(), s = d; if (!s || !gp || e.pointerId !== s.id) return;
    d = null; if (!s.moved) return;
    hushed = true; setTimeout(() => { hushed = false; }, 0);
    if (get(gp, "s") >= 0.5 && s.row.dataset.k) { pick(s.row.dataset.k); if (!gp.dataset.run) clearChoice(gp); } else slideBack(gp);
  };
  const cancel = () => { const gp = g(); if (d && d.moved && gp) slideBack(gp); d = null; };
  const click = (e: Event) => { if (hushed) { e.stopPropagation(); e.preventDefault(); } };
  chs.addEventListener("pointerdown", down); chs.addEventListener("pointermove", move); chs.addEventListener("pointerup", up); chs.addEventListener("pointercancel", cancel); chs.addEventListener("click", click, true);
  return () => { chs.removeEventListener("pointerdown", down); chs.removeEventListener("pointermove", move); chs.removeEventListener("pointerup", up); chs.removeEventListener("pointercancel", cancel); chs.removeEventListener("click", click, true); };
}
