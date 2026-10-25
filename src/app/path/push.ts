// Taking a station by pushing (the look's `ride: push`; take.ts is the squeeze it replaces). The station is a bead that rises on the thread, and the page above it is strung on the same
// thread: what the station comes up against is pushed up ahead of it, whole, and leaves through the top; nothing is squeezed or fades away on its own. Held over the curb (gesture.ts) the
// page already follows the station (`holdPush`), so the thread never runs on under a page that stayed behind; let go, the station keeps rising from where it is (`playPush`), pushing
// what is left, and lands where the next step's first bullet will be; then the step goes on (`act`) and the new page comes in.
// A page that keeps a statement across the step (`data-keep` on the last element of it, after its `.stm` lines: a syllogism's S, P and R) is not pushed away: what is under the statement folds into it, the
// station rises to the statement's foot, and the result opens there, its node coming out of the station and the statement settling into its place in the result's page.
// The push is a custom property on `.pathc` (`--push`, styles/44-path-push.css); the page is cut under the station's top edge, so what is below it is not seen.
import { state } from "../state.js";
import { foldPage, playTake } from "./take.ts";

type Ease = (u: number) => number;
const EASE: Record<"io" | "out", Ease> = { out: (u) => 1 - (1 - u) ** 3, io: (u) => (u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2) };
const clamp = (v: number) => Math.max(0, Math.min(1, v));
/** the air between the page's last part and the station's top edge (px), the station's landing (ms), and how far below the statement's foot it comes to rest (px) */
const GAP = 4, LAND = 300, BELOW = 26;
/** how the new page's first bullet (or the result's node) settles from where the station landed */
const SETTLE = { duration: 300, easing: "cubic-bezier(.2,.8,.3,1)" };

const parts = (root: HTMLElement | null) => {
  const main = root && root.querySelector<HTMLElement>(".main"), sc = main && main.querySelector<HTMLElement>(".pscroll"), pc = sc && sc.querySelector<HTMLElement>(".pathc");
  return { main, sc, pc };
};
const keepOf = (pc: HTMLElement | null) => pc && pc.querySelector<HTMLElement>("[data-keep]");

/**
 * Pushes the page up as far as the station has come into it: the page's last part (not the thread's tail under it) stops `GAP` px above the station's top edge. `k` is how much of the
 * way it goes at once (1: all of it), so that a page that was folded a moment ago, or a station that jumps, does not make the page jump. Returns how far the page is pushed now.
 */
export function pushPage(root: HTMLElement, k = 1): number {
  const { sc, pc } = parts(root), go = root.querySelector<HTMLElement>(".main .foot #stn .go"); if (!sc || !pc || !go) return 0;      // a station on the page itself has nothing to push
  const kids = Array.from(pc.children).filter((e): e is HTMLElement => e instanceof HTMLElement && !e.classList.contains("ptail"));
  const last = kids[kids.length - 1]; if (!last) return 0;
  const at = Number(pc.dataset.push || 0), scr = sc.getBoundingClientRect(), top = go.getBoundingClientRect().top;
  const end = Math.min(last.getBoundingClientRect().bottom + at, scr.bottom);      // where the page would end if it were not pushed (it is seen no lower than the scroll's foot)
  const want = Math.max(0, end - (top - GAP));
  const p = at + (want - at) * k;
  pc.dataset.push = p.toFixed(1); pc.style.setProperty("--push", p.toFixed(1) + "px");
  root.style.setProperty("--cut", Math.max(0, scr.bottom - top - 8).toFixed(1) + "px");
  root.classList.toggle("pushing", p > 0.5);
  return p;
}

/** Folds what follows `keep` (in the page's order) into it: each later part goes to nothing in height while it fades, so the statement stays where it is and what is under it comes up to it. */
function foldAfter(keep: HTMLElement, pc: HTMLElement): void {
  const out: HTMLElement[] = [];
  for (let n: HTMLElement | null = keep; n && n !== pc; n = n.parentElement) {
    for (let s = n.nextElementSibling; s; s = s.nextElementSibling) {
      if (!(s instanceof HTMLElement) || s.classList.contains("ptail") || s.classList.contains("pk-f") || !s.offsetHeight) continue;
      s.style.height = s.offsetHeight + "px"; s.classList.add("tkd", "pk-f"); out.push(s);
    }
  }
  void pc.offsetHeight;
  for (const s of out) s.classList.add("tkf");
}
/** What the fold of `foldAfter` did is undone (`soft`: it opens again over a moment). */
function unfoldAfter(pc: HTMLElement, soft: boolean): void {
  for (const s of Array.from(pc.querySelectorAll<HTMLElement>(".pk-f"))) {
    s.classList.remove("tkf");
    const end = () => { if (!s.classList.contains("tkf")) { s.classList.remove("tkd", "pk-f"); s.style.height = ""; } };
    if (soft) setTimeout(end, 340); else end();
  }
}
/** What comes before the statement `keep` ends (its heading, not its lines) fades; it stays in its place until the step goes on. */
function fadeBefore(keep: HTMLElement, pc: HTMLElement): void {
  const first = (keep.parentElement && keep.parentElement.querySelector<HTMLElement>(".stm")) || keep;
  for (let n: HTMLElement | null = first; n && n !== pc; n = n.parentElement) for (let s = n.previousElementSibling; s; s = s.previousElementSibling) if (s instanceof HTMLElement) s.classList.add("pk-gone");
}

/**
 * The page follows the station while it is held over its curb: it is pushed up as the station rises into it. A page that keeps a statement is not pushed: what is under the statement
 * folds into it. Returns the stop of the following (what it has done stays; `clearPush` takes it back).
 */
export function holdPush(root: HTMLElement): () => void {
  const { pc } = parts(root), keep = keepOf(pc);
  if (pc && keep) { foldAfter(keep, pc); return () => {}; }
  let raf = 0, on = true;
  const tick = () => { if (!on) return; pushPage(root, 0.4); raf = requestAnimationFrame(tick); };
  tick();
  return () => { on = false; cancelAnimationFrame(raf); };
}

/** The page goes back to where it was (the station was pulled back under the curb, or let go short of it). `soft`: it slides back rather than at once. */
export function clearPush(root: HTMLElement | null, soft = true): void {
  const { pc } = parts(root); if (!root || !pc) return;
  unfoldAfter(pc, soft);
  for (const s of Array.from(pc.querySelectorAll<HTMLElement>(".pk-gone"))) s.classList.remove("pk-gone");
  if (pc.dataset.push || root.classList.contains("pushing")) {
    if (soft) { root.classList.add("pushback"); setTimeout(() => root.classList.remove("pushback"), 340); }
    pc.style.setProperty("--push", "0px"); delete pc.dataset.push;
    const end = () => { pc.style.removeProperty("--push"); root.classList.remove("pushing"); root.style.removeProperty("--cut"); };
    if (soft) setTimeout(() => { if (!pc.dataset.push) end(); }, 340); else end();
  }
}

/** Plays the take of the station `stn` (lifted `lift` px by the hand, the page pushed `dataset.push` already), then `act`; `settle` when the new page is in. */
export function playPush(root: HTMLElement, stn: HTMLElement, lift: number, act: () => void, settle: () => void): void {
  const { main, sc, pc } = parts(root);
  const go = stn.querySelector<HTMLElement>(".go"), foot = stn.closest<HTMLElement>(".foot"), riser = root.querySelector<HTMLElement>(".riser");
  // a station that stands on the page itself (the Check above the keyboard) has no page to push: it rides as it always did
  if (!main || !sc || !pc || !go || !foot) { playTake(root, stn, lift, act, settle); return; }
  const u = state.ui;
  foldPage(root, true);
  const scr = sc.getBoundingClientRect(), keep = keepOf(pc);
  // where the station lands: the next step's first bullet (the top of the page), or just under the foot of the statement that stays
  let ayV: number;
  if (keep) ayV = keep.getBoundingClientRect().bottom + BELOW;
  else {
    const head = Array.from(pc.children).find((k): k is HTMLElement => k instanceof HTMLElement && k.getBoundingClientRect().height > 4 && k.getBoundingClientRect().bottom > scr.top + 6 && !k.classList.contains("ptail"));
    const bul = head && head.querySelector<HTMLElement>(".d, .rfig"), hr = head && head.getBoundingClientRect(), br = bul && bul.getBoundingClientRect();
    ayV = Math.max(scr.top + 18, scr.top + 14 + (br && hr ? br.height / 2 : 14));
  }
  const gr = go.getBoundingClientRect(), go0 = gr.top + gr.height / 2 + lift;           // the station's diamond at rest (in the foot)
  const R = keep ? go0 - ayV : Math.max(lift + 8, go0 - ayV);                              // how far it rises (a station held above the statement comes down to it)
  const T = Math.max(520, Math.min(1100, 420 + Math.abs(R - lift) * 0.62)), t0 = performance.now();
  if (riser) riser.style.bottom = foot.offsetHeight + "px";
  root.classList.add("pulling"); stn.classList.add("dragging"); main.classList.add("pk-run"); if (keep) main.classList.add("pk-keep");
  if (keep) { fadeBefore(keep, pc); foldAfter(keep, pc); }
  const was = keep ? Array.from(pc.querySelectorAll<HTMLElement>(".stm")).map((e) => e.getBoundingClientRect().top) : [];
  let ended = false, raf = 0;
  const draw = (t: number) => {
    const e = EASE.io(clamp(t / T)), dy = lift + (R - lift) * e;
    stn.style.transform = `translateY(${-dy}px)`;
    root.style.setProperty("--lift", dy.toFixed(1) + "px"); root.style.setProperty("--pull", "1");
    main.style.setProperty("--tkl", EASE.out(clamp((t - (T - LAND)) / LAND)).toFixed(3));
    if (!keep) pushPage(root, 0.6);
  };
  draw(0);
  const arrive = () => {
    const now = parts(root).pc;
    main.classList.remove("pk-run", "pk-swap"); main.style.removeProperty("--tkl");
    clearPush(root, false);
    const s2 = root.querySelector<HTMLElement>("#stn, #stnp"); if (s2) { s2.style.transform = ""; s2.classList.remove("dragging"); }
    if (riser) riser.style.display = "";
    root.classList.remove("pulling"); root.style.setProperty("--pull", "0"); root.style.setProperty("--lift", "0px");
    main.classList.add("tk-in"); setTimeout(() => main.classList.remove("tk-in", "pk-keep"), 520);
    // the new page's first bullet (the result's node, when the statement stayed) settles from where the station landed; the statement, from where it stood
    const nb = now && (keep ? now.querySelector<HTMLElement>(".pvline .d.big, .vband .d") : now.querySelector<HTMLElement>(".d, .rfig"));
    if (nb && nb.animate) {
      const r = nb.getBoundingClientRect(), d = ayV - (r.top + r.height / 2);
      if (Math.abs(d) > 1) nb.animate(keep ? [{ translate: `0 ${d}px`, scale: 0.6, opacity: 0.5 }, { translate: "0 0", scale: 1, opacity: 1 }] : [{ translate: `0 ${d}px` }, { translate: "0 0" }], SETTLE);
    }
    if (keep && now) Array.from(now.querySelectorAll<HTMLElement>(".stm")).forEach((e, i) => { const d = was[i] - e.getBoundingClientRect().top; if (e.animate && Math.abs(d) > 1) e.animate([{ translate: `0 ${d}px` }, { translate: "0 0" }], SETTLE); });
    settle();
  };
  // the step is taken; the path draws the new page in the next frame (refreshPath), before this frame's next callback: the page that keeps a statement says so by its verdict, at the latest a few frames later
  const drawn = () => { let n = 0; const step = () => { const p = parts(root).pc; if (keep ? (p && p.querySelector(".pvline")) || ++n > 4 : ++n > 1) arrive(); else requestAnimationFrame(step); }; step(); };
  const finish = () => {
    if (ended) return; ended = true; cancelAnimationFrame(raf);
    if (state.ui === u) act();       // else the page has changed meanwhile (a menu, another exercise): nothing to take
    if (!keep) main.classList.add("pk-swap");
    drawn();
  };
  const frame = (now: number) => { const t = now - t0; draw(Math.min(t, T)); if (t >= T) finish(); else raf = requestAnimationFrame(frame); };
  raf = requestAnimationFrame(frame);
  setTimeout(finish, T + 700);
}
