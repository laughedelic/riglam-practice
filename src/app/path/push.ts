// Taking a station by pushing (the look's `ride: push`; take.ts is the squeeze it replaces). The station is a bead that rises on the thread, and the page above it is strung on the same
// thread: what the station comes up against is pushed up ahead of it, whole, and leaves through the top; nothing is squeezed or fades away on its own. Held over the curb (gesture.ts) the
// page already follows the station (`holdPush`), so the thread never runs on under a page that stayed behind; let go, the station keeps rising from where it is (`playPush`), pushing
// what is left, and comes to rest where the next step's first bullet will be, as the station, the big diamond; then the step goes on (`act`), the station (a copy of it, the step takes the
// station itself away) settles into the exact place of the new first bullet, with a little recoil past it under the look's `land: recoil`, and turns into that bullet: smaller and its
// color, the page coming in as it turns.
// A page that keeps a statement across the step (`data-keep` on the last element of it, after its `.stm` lines: a syllogism's S, P and R) is not pushed away: what is under the statement folds into it, the
// station rises to the statement's foot, and the result opens there, its node coming out of the station and the statement settling into its place in the result's page.
// The push is a custom property on `.pathc` (`--push`, styles/44-path-push.css); the page is cut under the station's top edge, so what is below it is not seen.
import { state } from "../state.js";
import { dropHold, holdOf, wait } from "./foot.ts";
import { foldPage, playTake } from "./take.ts";

type Ease = (u: number) => number;
const EASE: Record<"io" | "out", Ease> = { out: (u) => 1 - (1 - u) ** 3, io: (u) => (u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2) };
const clamp = (v: number) => Math.max(0, Math.min(1, v));
/** the air between the page's last part and the station's top edge (px), when the station's words go before it comes to rest (ms), and how far below the statement's foot it comes to rest (px) */
const GAP = 4, LAND = 300, BELOW = 26;
/** where a new page's first bullet is, from the top of the scroll (px): the station comes to rest there; and how far the recoil takes it past (px) */
const FIRST = 38, RECOIL = 12;
/** how the statement settles into the result's page (ms), how long the station that has come to rest waits as it is, and how long it takes to turn into the new bullet */
const SETTLE = { duration: 300, easing: "cubic-bezier(.2,.8,.3,1)" }, HOLD = 70, TURN = 260;

const parts = (root: HTMLElement | null) => {
  const main = root && root.querySelector<HTMLElement>(".main"), sc = main && main.querySelector<HTMLElement>(".pscroll"), pc = sc && sc.querySelector<HTMLElement>(".pathc");
  return { main, sc, pc };
};
export const keepOf = (pc: HTMLElement | null) => pc && pc.querySelector<HTMLElement>("[data-keep]");

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
/**
 * What comes before the statement `keep` ends (its heading, not its lines) fades, and what is in the statement's own section above it folds until the statement stands where the result puts it
 * (`keep.dataset.keep`, px under the section's top), so that the statement comes up with the heading going and does not move when the step goes on. Returns how far the statement comes up.
 * With `keep.dataset.keep` "stay" nothing folds: the heading stays where it is and its diamond goes to ink with the line (Categories, as the questions of Pervasions do).
 */
export function foldBefore(keep: HTMLElement, pc: HTMLElement): number {
  const first = (keep.parentElement && keep.parentElement.querySelector<HTMLElement>(".stm")) || keep, sec = first.parentElement, stay = keep.dataset.keep === "stay";
  if (!stay) for (let n: HTMLElement | null = first; n && n !== pc; n = n.parentElement) for (let s = n.previousElementSibling; s; s = s.previousElementSibling) if (s instanceof HTMLElement) s.classList.add("pk-gone");
  for (const e of Array.from(pc.querySelectorAll<HTMLElement>(".pskip"))) e.classList.add("pk-gone");
  if (!sec) return 0;
  sec.classList.add("pk-walked");      // the statement's line goes from the question's gold to ink as the step is taken
  if (stay) return 0;
  const above = Array.from(sec.children).slice(0, Array.prototype.indexOf.call(sec.children, first)).filter((e): e is HTMLElement => e instanceof HTMLElement), last = above.pop();
  const keepTop = Number(keep.dataset.keep) || 0, up = first.getBoundingClientRect().top - sec.getBoundingClientRect().top - keepTop;
  if (!last || up < 1) return 0;
  // everything folds to nothing but the last piece (the space the result leaves above its statement), which comes to its height
  for (const e of above) { e.style.height = e.offsetHeight + "px"; e.classList.add("tkd", "pk-fb"); }
  last.style.height = last.offsetHeight + "px"; last.style.overflow = "hidden"; last.classList.add("pk-fb");
  void sec.offsetHeight;
  for (const e of above) e.classList.add("tkf");
  last.style.height = keepTop + "px";
  return up;
}

/**
 * The page follows the station while it is held over its curb: it is pushed up as the station rises into it. A page that keeps a statement is not pushed: what is under the statement
 * folds into it. Returns the stop of the following (what it has done stays; `clearPush` takes it back).
 */
export function holdPush(root: HTMLElement): () => void {
  const { main, pc } = parts(root), keep = keepOf(pc), stn = root.querySelector<HTMLElement>(".main .foot #stn");
  if (pc && keep) foldAfter(keep, pc);
  // the placeholder of the station that comes next is born at the foot once this one has cleared it (foot.ts)
  const hold = main && stn ? holdOf(root, main, stn) : null;
  let raf = 0, on = true;
  const tick = () => {
    if (!on) return;
    if (!keep) pushPage(root, 0.4);
    if (hold) hold.to(parseFloat(root.style.getPropertyValue("--lift")) || 0);
    raf = requestAnimationFrame(tick);
  };
  tick();
  return () => { on = false; cancelAnimationFrame(raf); };
}

/** The page goes back to where it was (the station was pulled back under the curb, or let go short of it). `soft`: it slides back rather than at once. `ride`: the ride goes on (the placeholder at the foot stays). */
export function clearPush(root: HTMLElement | null, soft = true, ride = false): void {
  const { pc } = parts(root); if (!root || !pc) return;
  if (!ride) dropHold(root, soft);
  unfoldAfter(pc, soft);
  for (const s of Array.from(pc.querySelectorAll<HTMLElement>(".pk-gone"))) { s.classList.remove("pk-gone", "pk-fb", "tkd", "tkf"); s.style.height = s.style.overflow = ""; }
  if (pc.dataset.push || root.classList.contains("pushing")) {
    if (soft) { root.classList.add("pushback"); setTimeout(() => root.classList.remove("pushback"), 340); }
    pc.style.setProperty("--push", "0px"); delete pc.dataset.push;
    const end = () => { pc.style.removeProperty("--push"); root.classList.remove("pushing"); root.style.removeProperty("--cut"); };
    if (soft) setTimeout(() => { if (!pc.dataset.push) end(); }, 340); else end();
  }
}

/** Calls `done` once, when the animation `a` has finished (or, if it does not report that, after `ms`). */
function after(a: Animation | null, ms: number, done: () => void): void {
  let on = true; const once = () => { if (on) { on = false; done(); } };
  if (a) a.finished.then(once, once);
  setTimeout(once, ms + 120);
}

/** A copy of the station where it stands now (the step takes the station itself away): it comes to rest at the new first bullet and turns into it. */
function ghostOf(main: HTMLElement, stn: HTMLElement): HTMLElement {
  const mr = main.getBoundingClientRect(), r = stn.getBoundingClientRect(), g = stn.cloneNode(true) as HTMLElement;
  g.removeAttribute("id"); g.removeAttribute("aria-label"); g.setAttribute("aria-hidden", "true"); g.tabIndex = -1; g.className = "stn pk-ghost" + Array.from(stn.classList).filter((c) => c.startsWith("stk")).map((c) => " " + c).join("");      // it keeps what the station says: its size and color
  g.style.cssText = `position:absolute;left:${(r.left - mr.left).toFixed(1)}px;top:${(r.top - mr.top).toFixed(1)}px;width:${r.width.toFixed(1)}px;height:${r.height.toFixed(1)}px;margin:0;box-sizing:border-box;transform:none;transition:none;pointer-events:none;z-index:7`;
  main.append(g);
  return g;
}

/**
 * Plays the take of the station `stn` (lifted `lift` px by the hand, the page pushed `dataset.push` already), then `act`; `settle` when the new page is in. `how.recoil`: the station rises a little
 * past the new first bullet and comes back to it. The next station is a placeholder at the foot while this one rises (foot.ts), and the real one comes in once the step has landed.
 */
export function playPush(root: HTMLElement, stn: HTMLElement, lift: number, act: () => void, settle: () => void, how: { recoil?: boolean } = {}): void {
  const recoil = !!how.recoil;
  const { main, sc, pc } = parts(root);
  const go = stn.querySelector<HTMLElement>(".go"), foot = stn.closest<HTMLElement>(".foot"), riser = root.querySelector<HTMLElement>(".riser");
  // a station that stands on the page itself (the Check above the keyboard) has no page to push: it rides as it always did
  if (!main || !sc || !pc || !go || !foot) { playTake(root, stn, lift, act, settle); return; }
  const u = state.ui, hold = holdOf(root, main, stn);
  foldPage(root, true);
  const scr = sc.getBoundingClientRect(), keep = keepOf(pc);
  const up = keep ? foldBefore(keep, pc) : 0;      // the heading above the statement folds away: the statement comes up to where the result puts it
  // where the station comes to rest: just under the foot of the statement that stays (where it will be), or where a new page's first bullet is
  const ayV = keep ? keep.getBoundingClientRect().bottom - up + BELOW : scr.top + FIRST;
  const gr = go.getBoundingClientRect(), go0 = gr.top + gr.height / 2 + lift;           // the station's diamond at rest (in the foot)
  const R = (keep ? go0 - ayV : Math.max(lift + 8, go0 - ayV)) + (recoil && !keep ? RECOIL : 0);   // how far it rises (a station held above the statement comes down to it)
  const T = Math.max(520, Math.min(1100, 420 + Math.abs(R - lift) * 0.62)), t0 = performance.now();
  if (riser) riser.style.bottom = foot.offsetHeight + "px";
  root.classList.add("pulling"); stn.classList.add("dragging"); main.classList.add("pk-run"); if (keep) main.classList.add("pk-keep");
  if (keep) foldAfter(keep, pc);
  let was: number[] = [];
  let ended = false, raf = 0;
  const draw = (t: number) => {
    const e = EASE.io(clamp(t / T)), dy = lift + (R - lift) * e;
    stn.style.transform = `translateY(${-dy}px)`;
    hold.to(dy);
    root.style.setProperty("--lift", dy.toFixed(1) + "px"); root.style.setProperty("--pull", "1");
    main.style.setProperty("--tkl", EASE.out(clamp((t - (T - LAND)) / LAND)).toFixed(3));
    if (!keep) pushPage(root, 0.6);
  };
  draw(0);

  // the station has come to rest and the step has gone on, the new page is drawn (hidden): the copy of the station settles into the place of the new bullet, waits a moment as the big
  // diamond, and turns into the bullet while the page comes in
  const land = (g: HTMLElement) => {
    const now = parts(root).pc, gg = g.querySelector<HTMLElement>(".go");
    const nb = now && gg ? (keep ? now.querySelector<HTMLElement>(".pvline .d.big, .vband .d") : now.querySelector<HTMLElement>(".d, .rfig")) : null;
    const over = () => { main.classList.remove("pk-swap", "pk-run"); if (nb) nb.style.visibility = ""; g.remove(); hold.activate(); dropHold(root); };
    const reveal = () => { main.classList.remove("pk-swap"); main.classList.add("tk-in"); setTimeout(() => main.classList.remove("tk-in", "pk-keep"), 520); };
    if (!gg || !nb) { reveal(); g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: "forwards" }); setTimeout(() => { over(); settle(); }, 200); return; }
    const a = gg.getBoundingClientRect(), r = nb.getBoundingClientRect(), dx = r.left + r.width / 2 - (a.left + a.width / 2), dy = r.top + r.height / 2 - (a.top + a.height / 2);
    nb.style.visibility = "hidden";
    // the statement settles into its place in the result as the station comes to rest at the node
    if (keep) Array.from(now!.querySelectorAll<HTMLElement>(".stm")).forEach((e, i) => { const d = was[i] - e.getBoundingClientRect().top; if (e.animate && Math.abs(d) > 1) e.animate([{ translate: `0 ${d}px` }, { translate: "0 0" }], SETTLE); });
    const far = Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5, ms = keep ? SETTLE.duration : recoil ? 380 : 240;
    const glide = far && g.animate ? g.animate([{ translate: "0 0" }, { translate: `${dx.toFixed(1)}px ${dy.toFixed(1)}px` }], { duration: ms, easing: recoil ? "cubic-bezier(.3,1.45,.5,1)" : SETTLE.easing, fill: "forwards" }) : null;
    // then the big diamond turns into the new bullet: its size and color, its arrow going, the page coming in around it
    const turn = () => {
      reveal(); settle();
      const bg = getComputedStyle(nb).backgroundColor, k = nb.offsetWidth && gg.offsetWidth ? nb.offsetWidth / gg.offsetWidth : 1, mk = gg.querySelector<HTMLElement>(".mk");
      if (mk && mk.animate) mk.animate([{ opacity: 1 }, { opacity: 0 }], { duration: TURN * 0.55, fill: "forwards" });
      const turned = gg.animate ? gg.animate([{ scale: 1, backgroundColor: getComputedStyle(gg).backgroundColor }, { scale: k, backgroundColor: bg }], { duration: TURN, easing: SETTLE.easing, fill: "forwards" }) : null;
      after(turned, TURN, () => {
        over();
        const nm = nb.querySelector<HTMLElement>(".mk"); if (keep && nm && nm.animate) nm.animate([{ opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1 }], { duration: 180, easing: SETTLE.easing });
      });
    };
    const wait = () => setTimeout(turn, HOLD);
    if (glide) after(glide, ms, wait); else wait();
  };
  // the step is taken; the path draws the new page in the next frame (refreshPath), before this frame's next callback: the page that keeps a statement says so by its verdict, at the latest a few frames later
  const drawn = (g: HTMLElement) => {
    let n = 0;
    const step = () => {
      const p = parts(root).pc;
      if (!(keep ? (p && p.querySelector(".pvline")) || ++n > 4 : ++n > 1)) { requestAnimationFrame(step); return; }
      clearPush(root, false, true);                 // the old page is gone: the new one is where it is, not pushed (the placeholder at the foot stays)
      main.style.removeProperty("--tkl");           // and the station of the new page has its words
      const s2 = root.querySelector<HTMLElement>("#stn, #stnp"); if (s2) { s2.style.transform = ""; s2.style.visibility = ""; s2.classList.remove("dragging"); }
      if (riser) riser.style.display = "";
      root.classList.remove("pulling"); root.style.setProperty("--pull", "0"); root.style.setProperty("--lift", "0px");
      land(g);
    };
    step();
  };
  const finish = () => {
    if (ended) return; ended = true; cancelAnimationFrame(raf);
    if (keep) was = Array.from(pc.querySelectorAll<HTMLElement>(".stm")).map((e) => e.getBoundingClientRect().top);      // where the statement stands as the step goes on
    const g = ghostOf(main, stn);                   // the step takes the station away: a copy of it goes on
    stn.style.visibility = "hidden";
    hold.born(); wait(main);                        // the placeholder is there (a short ride has not cleared the foot), and the foot shows no real station until the step has landed
    main.classList.add("pk-swap");                  // the old page is not seen (what stays, the statement, is) until the new one is drawn
    if (state.ui === u) act();                      // else the page has changed meanwhile (a menu, another exercise): nothing to take
    drawn(g);
  };
  const frame = (now: number) => { const t = now - t0; draw(Math.min(t, T)); if (t >= T) finish(); else raf = requestAnimationFrame(frame); };
  raf = requestAnimationFrame(frame);
  setTimeout(finish, T + 700);
}
