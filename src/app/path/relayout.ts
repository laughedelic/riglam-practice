// The page opens as the keyboard goes (the Check scan on a phone, scan.tsx). With the keyboard up the Path is folded: the top bar stepped aside, the heading the pair node, each
// step written one line, the last one a field, the Check a node under it. When the last example is written the page takes its own layout again (the top bar, the strip, the
// heading, two lines for a step, the foot) and the scan runs over it, as on a screen with no keyboard. This moves each part from where it was to where it is now: a step
// goes down with the page (and its answer first drops under its words, then slides left), the top bar comes down, the heading and the foot come in, and the folded
// heading, which the strip replaces, fades out. Nothing goes back and forth: each part takes the straight way.
const EASE = "cubic-bezier(.4,0,.2,1)";
/** What a step moves inside itself: its diamond, its words, its answer, the open field and the line under it. */
const INNER = ".d,.lab,.pans,.qq,.fieldrow,.help button";
/** The page opening (it starts a moment after the Enter and takes this long), how long the foot must stand still before what waits for it goes on, and the longest it is waited for
 *  (the keyboard going takes the screen's height with it) (ms). */
export const OPEN = 380, OPEN_AT = 40, STILL = 80, WAIT = 700;
/** The top bar's height, which `.pa.kbup .ptb` pulls out of sight (07-path-station.css). */
const BAR = 57;

interface Snap { r: HTMLElement; top: number; kids: { k: HTMLElement; x: number; y: number; on: boolean }[] }

/**
 * Runs `change` (which switches the root from the keyboard's layout to the page's, in the DOM, at once) and animates the parts of the page from where they were to
 * where they are now, over `ms` after `delay`.
 */
export function openPage(root: HTMLElement, main: HTMLElement, change: () => void, ms: number, delay: number): void {
  if (typeof main.animate !== "function") { change(); return; }   // (no Web Animations: the page just opens)
  const rows = Array.from(root.querySelectorAll<HTMLElement>(".main .pscroll .sx.cur .sb"));
  const snap = (): Snap[] => rows.map((r) => {
    const b = r.getBoundingClientRect();
    return { r, top: b.top, kids: Array.from(r.querySelectorAll<HTMLElement>(INNER)).map((k) => { const q = k.getBoundingClientRect(); return { k, x: q.left - b.left, y: q.top - b.top, on: q.width > 0 && q.height > 0 }; }) };
  });
  const kh = root.querySelector<HTMLElement>(".khead"), ptb = root.querySelector<HTMLElement>(".ptb"), head = root.querySelector<HTMLElement>(".sx.cur .sechead");
  const before = snap(), kr = kh && kh.getBoundingClientRect(), mr = main.getBoundingClientRect();
  // the folded heading goes: its picture stays over the strip for a moment and fades
  let ghost: HTMLElement | null = null;
  if (kh && kr) {
    ghost = kh.cloneNode(true) as HTMLElement; ghost.setAttribute("aria-hidden", "true"); ghost.removeAttribute("id");
    Object.assign(ghost.style, { display: "block", position: "absolute", left: kr.left - mr.left + "px", top: kr.top - mr.top + "px", width: kr.width + "px", margin: "0", padding: "10px 0", zIndex: "8", pointerEvents: "none", animation: "none", backgroundColor: "var(--paper)" });
    main.append(ghost);
  }
  change();
  const after = snap();
  const opt: KeyframeAnimationOptions = { duration: ms, delay, easing: EASE, fill: "backwards" };
  const half = (o: Partial<KeyframeAnimationOptions> = {}): KeyframeAnimationOptions => ({ duration: ms * 0.5, delay: delay + ms * 0.5, easing: "ease-out", fill: "backwards", ...o });
  if (ghost) { const g = ghost, gone = () => g.remove(); g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms * 0.35, delay, easing: "ease-out", fill: "forwards" }).finished.then(gone, gone); }
  if (ptb) ptb.animate([{ translate: `0 ${-BAR}px`, opacity: 0 }, { translate: "0 0", opacity: 1 }], opt);
  if (head) head.animate([{ opacity: 0 }, { opacity: 1 }], half());
  after.forEach((a, i) => {
    const b = before[i]; if (!b) return;
    const dy = b.top - a.top;
    if (Math.abs(dy) > 0.5) a.r.animate([{ translate: `0 ${dy.toFixed(1)}px` }, { translate: "0 0" }], opt);
    for (const k of a.kids) {
      const p = b.kids.find((x) => x.k === k.k); if (!p) continue;
      if (!p.on) { if (k.on) k.k.animate([{ opacity: 0 }, { opacity: 1 }], half()); continue; }
      if (!k.on) continue;
      const dx = p.x - k.x, ky = p.y - k.y;
      if (Math.abs(dx) < 0.5 && Math.abs(ky) < 0.5) continue;
      const to = (x: number, y: number) => ({ translate: `${x.toFixed(1)}px ${y.toFixed(1)}px` });
      // an answer that was beside its words and is under them now drops under them first, and then slides left: it never crosses them
      if (k.k.classList.contains("pans") && Math.abs(dx) > 0.5 && Math.abs(ky) > 0.5) k.k.animate([{ ...to(dx, ky), easing: EASE }, { ...to(dx, 0), offset: 0.5, easing: EASE }, to(0, 0)], opt);
      else k.k.animate([to(dx, ky), to(0, 0)], opt);
    }
  });
}

/**
 * Opens the page as `openPage` does, with the foot coming in, and calls `done` once the foot's station stands still in the page's layout, or after `WAIT` at the most: the
 * last example written with the keyboard up, whose Check is then taken from the foot like any other.
 */
export function openThen(root: HTMLElement, main: HTMLElement, change: () => void, done: () => void): void {
  main.classList.add("sc-open");
  openPage(root, main, change, OPEN, OPEN_AT);
  const t0 = performance.now(), end = OPEN_AT + OPEN;
  let last = NaN, at = 0;
  const tick = (now: number) => {
    const t = now - t0, g = root.querySelector<HTMLElement>(".main .foot #stn .go"), y = g ? g.getBoundingClientRect().top : NaN;
    if (!(Math.abs(y - last) <= 0.5)) { last = y; at = t; }
    if ((g && t >= end && t - at >= STILL) || t > end + WAIT) { main.classList.remove("sc-open"); done(); return; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
