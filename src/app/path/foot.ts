// What is at the foot while a station that rides away from it (the push of push.ts, the Check's scan of scan.tsx) is away: a placeholder for the station that comes next. It is there as soon as the
// old station has cleared the foot, gray, empty and small, with the foot's stub of thread above it as always; nothing joins it to the rider. Once the step has landed and the page's thread
// runs down to it again, it is activated: the real station of the new page comes in as what it is, its color and its words ("Next pair", or a question's gray "Check"). One way for every
// ride, so that the Path does the same thing wherever a station is taken.
const CLEAR = 38;        // how far the station has risen (px) before the placeholder is born: its diamond has cleared the foot's

const liftOf = (root: HTMLElement) => parseFloat(root.style.getPropertyValue("--lift")) || 0;

/** The placeholder of the next station, drawn over the foot by a station that is riding away. */
export class Hold {
  private sd: HTMLElement | null = null;
  private done = false;
  private model: HTMLElement | null = null;
  /** where the station rests, in the main's own coordinates: the box it stands in */
  private at: { l: number; t: number; w: number; h: number } | null = null;
  constructor(private main: HTMLElement, stn: HTMLElement, lift: number) {
    if (!stn.querySelector(".go")) return;
    const m = main.getBoundingClientRect(), r = stn.getBoundingClientRect();
    this.at = { l: r.left - m.left, t: r.top + lift - m.top, w: r.width, h: r.height };
    this.model = stn;
  }

  /** The station is `dy` px above where it rests. The placeholder is born once it is clear of the foot. */
  to(dy: number): void { if (dy > CLEAR) this.born(); }
  /** The placeholder is there, if it was not yet (the station has gone from the foot). */
  born(): void {
    const a = this.at, model = this.model; if (this.sd || this.done || !a || !model) return;
    const sd = model.cloneNode(true) as HTMLElement, go = sd.querySelector<HTMLElement>(".go"), gol = sd.querySelector<HTMLElement>(".gol");
    sd.removeAttribute("id"); sd.removeAttribute("aria-label"); sd.setAttribute("aria-hidden", "true"); sd.tabIndex = -1; sd.className = "stn fw-sd";
    if (go && gol) { go.className = "go pre"; go.textContent = ""; gol.className = "gol pre"; gol.textContent = ""; }
    sd.style.cssText = `position:absolute;left:${a.l.toFixed(1)}px;top:${a.t.toFixed(1)}px;width:${a.w.toFixed(1)}px;height:${a.h.toFixed(1)}px;margin:0;box-sizing:border-box;transform:none;transition:none;pointer-events:none;z-index:7`;
    this.main.append(sd);
    this.main.classList.add("fw-ph");      // the foot's stub of thread is whole again, gray and fading, above it
    this.sd = sd;
  }
  /** The step has landed: the placeholder goes and the real station of the new page comes in, as what it is. */
  activate(): void {
    this.done = true;
    this.main.classList.remove("fw-ph");
    if (this.sd) { this.sd.remove(); this.sd = null; }
    come(this.main);
  }
  /** The station went back (pulled back under the curb): the placeholder goes with it. */
  gone(soft: boolean): void {
    this.done = true;
    this.main.classList.remove("fw-ph");
    const e = this.sd; this.sd = null; if (!e) return;
    if (soft) { e.style.transition = "opacity .16s ease"; e.style.opacity = "0"; setTimeout(() => e.remove(), 200); } else e.remove();
  }
}

const holds = new WeakMap<HTMLElement, Hold>();
/** The placeholder of the station on `root` (made when first asked for: from the curb, or at the start of a ride). */
export function holdOf(root: HTMLElement, main: HTMLElement, stn: HTMLElement): Hold {
  let h = holds.get(root);
  if (!h) { h = new Hold(main, stn, liftOf(root)); holds.set(root, h); }
  return h;
}
/** The placeholder is let go, and the ride is over (`activate` has done its work) or the station went back. */
export function dropHold(root: HTMLElement | null, soft = false): void {
  const h = root && holds.get(root); if (!root || !h) return;
  holds.delete(root); h.gone(soft);
}

/** The foot shows no real station from now (the step is being taken). */
export const wait = (main: HTMLElement): void => { main.classList.add("fw-wait"); };
/** The real station of the new page is at the foot as what it is: its diamond comes in with its color, its words after it. */
export function come(main: HTMLElement): void {
  main.classList.remove("fw-wait");
  const s = main.querySelector<HTMLElement>(".foot .stn"); if (!s) return;
  s.classList.add("fw-act"); setTimeout(() => s.classList.remove("fw-act"), 600);
}
