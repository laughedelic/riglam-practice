// What is at the foot while a station that rides away from it (the push of push.ts, the Check's scan of scan.tsx) is away: the look's `foot`.
//   thread: the station that comes next is there as soon as the old one has risen clear of the foot, and the thread is whole between the two, so the station slides up a thread that is fixed
//           at both ends (`Hand`: a copy of the station with the name it is known to have, `Station next`, or the gray one a question has; the page that follows brings the real one, and its
//           words come in). The Check's scan has it this way by itself (scan.tsx `becomeNext`).
//   after:  the foot is empty from the moment the station leaves until the step has landed, and then the next station comes in at the foot and the thread joins it (`wait`, `come`).
// The look is one choice for every ride, so that the Path does the same thing wherever a station is taken.
const CLEAR = 38;        // how far the station has risen (px) before the next one is born: its diamond has cleared the foot's
const TIP = 20;          // half a station's diagonal (px): the thread ends at the rider's lower tip, so it never crosses the diamond
const FADE = 280;        // ms

const liftOf = (root: HTMLElement) => parseFloat(root.style.getPropertyValue("--lift")) || 0;

/** The next station and the thread to it, drawn over the foot by a station that is riding away (thread). */
export class Hand {
  private th: HTMLElement | null = null;
  private sd: HTMLElement | null = null;
  private done = false;
  private model: HTMLElement | null = null;
  /** where the station rests, in the main's own coordinates: the center of its diamond, and the box it stands in */
  private at: { cx: number; cy: number; l: number; t: number; w: number; h: number; bottom: number } | null = null;
  constructor(private main: HTMLElement, stn: HTMLElement, private next: string | null, lift: number) {
    const go = stn.querySelector<HTMLElement>(".go"); if (!go) return;
    const m = main.getBoundingClientRect(), g = go.getBoundingClientRect(), r = stn.getBoundingClientRect();
    this.at = { cx: g.left + g.width / 2 - m.left, cy: g.top + g.height / 2 + lift - m.top, l: r.left - m.left, t: r.top + lift - m.top, w: r.width, h: r.height, bottom: m.height };
    this.model = stn;
  }

  /** The station is `dy` px above where it rests (`reach`: the thread reaches its center, not just its tip). Born once it is clear of the foot. */
  to(dy: number, reach = false): void {
    if (this.done || !this.at) return;
    if (!this.sd && dy > CLEAR) this.born();
    if (this.th) this.th.style.height = Math.max(0, dy - (reach ? 0 : TIP)).toFixed(1) + "px";
  }
  private born(): void {
    const a = this.at, model = this.model; if (!a || !model) return;
    const th = document.createElement("div");
    th.className = "fw-th"; th.setAttribute("aria-hidden", "true");
    th.style.cssText = `left:${a.cx.toFixed(1)}px;bottom:${(a.bottom - a.cy).toFixed(1)}px;height:0`;
    // the next station is the one it is known to be, or, as a question's is, the gray one without words; the page that follows draws the real one in its place
    const sd = model.cloneNode(true) as HTMLElement, go = sd.querySelector<HTMLElement>(".go"), gol = sd.querySelector<HTMLElement>(".gol");
    sd.removeAttribute("id"); sd.removeAttribute("aria-label"); sd.setAttribute("aria-hidden", "true"); sd.tabIndex = -1; sd.className = "stn fw-sd";
    if (go && gol) {
      const b = document.createElement("b"); b.textContent = this.next || "";
      if (!this.next) { go.className = "go pre"; go.textContent = ""; gol.className = "gol pre"; }
      gol.textContent = ""; gol.append(b);
    }
    sd.style.cssText = `position:absolute;left:${a.l.toFixed(1)}px;top:${a.t.toFixed(1)}px;width:${a.w.toFixed(1)}px;height:${a.h.toFixed(1)}px;margin:0;box-sizing:border-box;transform:none;transition:none;pointer-events:none;z-index:7`;
    this.main.append(th, sd);
    this.th = th; this.sd = sd;
  }
  /** The step has been taken: the real station of the new page is at the foot, the copy goes, and the real one's words come in (its diamond too, if it is not the kind the copy was). */
  swap(): void {
    if (!this.sd) return;
    this.sd.remove(); this.sd = null;
    const real = this.main.querySelector<HTMLElement>(".foot .stn"); if (!real) return;
    // the copy's kind and words are the real one's, then nothing moves; a copy without words gets them; another kind of station comes in as the Check's next one does
    const cls = real.classList.contains("pre") !== !this.next ? "scn-next" : this.next ? "" : "fw-in";
    if (!cls) return;
    real.classList.add(cls); setTimeout(() => real.classList.remove(cls), 500);
  }
  /** The thread has done its work (the new page is coming in around it): it fades and goes. */
  fade(): void {
    const th = this.th, sd = this.sd; this.th = null;
    if (sd) { sd.remove(); this.sd = null; }
    if (!th) return;
    th.style.transition = `opacity ${FADE}ms ease`; th.style.opacity = "0";
    setTimeout(() => th.remove(), FADE + 40);
  }
  /** The station went back (pulled back under the curb): the copy and the thread go with it. */
  gone(soft: boolean): void {
    this.done = true;
    for (const e of [this.th, this.sd]) {
      if (!e) continue;
      if (soft) { e.style.transition = "opacity .16s ease"; e.style.opacity = "0"; setTimeout(() => e.remove(), 200); } else e.remove();
    }
    this.th = this.sd = null;
  }
}

const hands = new WeakMap<HTMLElement, Hand>();
/** The hand of the station on `root` (made when first asked for: from the curb, or at the start of a ride). `next`: the name of the station that comes after it, when it is known. */
export function handOf(root: HTMLElement, main: HTMLElement, stn: HTMLElement, next: string | null): Hand {
  let h = hands.get(root);
  if (!h) { h = new Hand(main, stn, next, liftOf(root)); hands.set(root, h); }
  return h;
}
/** The hand is let go (the ride is over, or the station went back). */
export function dropHand(root: HTMLElement | null, soft = false): void {
  const h = root && hands.get(root); if (!root || !h) return;
  hands.delete(root); h.gone(soft);
}
/** The hand is let go and its thread fades (the ride is over). */
export function endHand(root: HTMLElement | null): void {
  const h = root && hands.get(root); if (!root || !h) return;
  hands.delete(root); h.fade();
}

/** `after`: the foot shows no station from now (the step is being taken). */
export const wait = (main: HTMLElement): void => { main.classList.add("fw-wait"); };
/** `after`: the next station comes in at the foot (its diamond and words, as the one the Check's scanner leaves). */
export function come(main: HTMLElement): void {
  main.classList.remove("fw-wait");
  const s = main.querySelector<HTMLElement>(".foot .stn"); if (!s) return;
  s.classList.add("scn-next"); setTimeout(() => s.classList.remove("scn-next"), 500);
}
