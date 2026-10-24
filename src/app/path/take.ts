// Taking a station, as the lab's Motion tab has it (Take · fold like the keyboard, then push out). Pulled over the curb (gesture.ts), the page folds as it does with the
// keyboard up: the detail under its lines goes (`foldPage`; pulled back under the curb it unfolds). Let go, and the page's lines squeeze up into the top bullet, the bullet's
// words go into it, and the bullet is pushed up the thread and out through the top; the station rides up behind them (the thread stays attached to it), so it never slides over
// anything, and lands where the next step's first bullet will be. Then the step goes on (`act`) and the new page comes in, its first bullet settling into place. The stages are
// custom properties on `.main` (b the lines squeezing, h the words going into the bullet, c the bullet leaving, l the landing), so the stylesheet (styles/42-path-take.css)
// draws everything from them. A page with a running clock, reduced motion and the look's `ride: plain` take the step at once. The station may also be on the page itself, as the
// Check node under the last example while the keyboard is up (examples.tsx): it rides from where it stands, and is not squeezed with the rest.
import { state } from "../state.js";
import { currentLook } from "./look.ts";

type Ease = "io" | "out";
const EASE = { out: (u: number) => 1 - (1 - u) ** 3, io: (u: number) => (u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2) };
/** Each stage: when it starts and how long it runs (ms), and its ease. */
const STAGE: Record<string, [number, number, Ease]> = { b: [0, 380, "io"], h: [200, 300, "io"], c: [440, 460, "out"], r: [140, 1150, "io"], l: [1140, 300, "out"] };
const END = 1140 + 300;
/** What the fold takes off the page: the detail under a line (the verdict's words, the notes under a case, the tutor's, the options' glosses). */
const DETAIL = ".vsub,.xnote,.tnote,.tsay,.wtext,.cls,.pndef,.pnoteline,.crow small";

const reduced = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
const clamp = (v: number) => Math.max(0, Math.min(1, v));

/** Whether a station taken now plays the ride: a page of the Path, not under reduced motion, no clock running on the question. */
export function canTake(root: HTMLElement | null): boolean {
  if (!root || currentLook().ride !== "fold" || reduced()) return false;
  const u = state.ui; if (u && u.tq) return false;
  return !!root.querySelector(".main .pscroll .pathc") && !!root.querySelector("#stn");
}

/** The page folds (over the curb) or unfolds (back under it): the detail goes in 0.3 s, the lines stay. */
export function foldPage(root: HTMLElement | null, on: boolean): void {
  const pc = root && root.querySelector(".main .pscroll .pathc"); if (!pc) return;
  for (const el of pc.querySelectorAll<HTMLElement>(DETAIL)) {
    if (el.parentElement && el.parentElement.closest(DETAIL)) continue;
    if (on) {
      if (!el.classList.contains("tkd")) { const h = el.offsetHeight; if (!h) continue; el.style.height = h + "px"; el.classList.add("tkd"); void el.offsetHeight; }
      el.classList.add("tkf");
    } else if (el.classList.contains("tkd")) {
      el.classList.remove("tkf");
      setTimeout(() => { if (!el.classList.contains("tkf")) { el.classList.remove("tkd"); el.style.height = ""; } }, 340);
    }
  }
}

const VARS = ["--tkb", "--tkh", "--tkc", "--tkl", "--tkt", "--tkth"];
/** Plays the take of the station `stn` (lifted `lift` px by the hand), then `act`; `settle` when the new page is in. */
export function playTake(root: HTMLElement, stn: HTMLElement, lift: number, act: () => void, settle: () => void): void {
  const main = root.querySelector<HTMLElement>(".main"), sc = root.querySelector<HTMLElement>(".main .pscroll"), pc = sc && sc.querySelector<HTMLElement>(".pathc");
  const go = stn.querySelector<HTMLElement>(".go"), foot = stn.closest<HTMLElement>(".foot"), riser = root.querySelector<HTMLElement>(".riser");
  const kids = () => (pc ? Array.from(pc.children).filter((e): e is HTMLElement => e instanceof HTMLElement) : []);
  const scr = sc && sc.getBoundingClientRect(), head = scr && kids().find((k) => { const r = k.getBoundingClientRect(); return r.height > 4 && r.bottom > scr.top + 6 && !k.classList.contains("ptail"); });
  if (!main || !sc || !pc || !go || !scr || !head) { act(); settle(); return; }
  const u = state.ui;
  foldPage(root, true);
  // the first part of the page is the bullet that leaves; the rest squeezes up into it
  head.dataset.tk = "head";
  const bul = head.querySelector<HTMLElement>(".d, .rfig"), hr = head.getBoundingClientRect(), br = bul && bul.getBoundingClientRect();
  const bOff = br ? br.top + br.height / 2 - hr.top : 14;
  const ayC = Math.max(head.offsetTop + bOff, sc.scrollTop + 18);                 // the bullet's y in the scroll's content
  const ayV = ayC - sc.scrollTop + scr.top;                                          // and on the screen
  const cn = stn.closest<HTMLElement>(".cnode"); if (cn) cn.style.animation = "none";   // a Check that is still sliding in is where it is going
  const gr = go.getBoundingClientRect(), go0 = gr.top + gr.height / 2 + lift;       // the station's diamond, at rest (in the foot, or on the page under the last example)
  const R = Math.max(lift + 8, go0 - ayV);                                          // how far the station rides
  const t0 = performance.now();
  main.style.setProperty("--tkt", (scr.top - main.getBoundingClientRect().top).toFixed(1) + "px");
  if (riser) { if (foot) riser.style.bottom = foot.offsetHeight + "px"; else riser.style.display = "none"; }
  root.classList.add("pulling"); stn.classList.add("dragging");
  let ended = false, raf = 0;
  const set = (n: string, v: number) => main.style.setProperty(n, v.toFixed(4));
  const draw = (t: number) => {
    const v: Record<string, number> = {};
    for (const n in STAGE) { const [a, d, e] = STAGE[n]; v[n] = EASE[e](clamp((t - a) / d)); }
    set("--tkb", v.b); set("--tkh", v.h); set("--tkc", v.c); set("--tkl", v.l);
    const dy = lift + (R - lift) * v.r;
    stn.style.transform = `translateY(${-dy}px)`;
    root.style.setProperty("--lift", dy.toFixed(1) + "px"); root.style.setProperty("--pull", "1");
    main.style.setProperty("--tkth", Math.max(0, go0 - dy - scr.top).toFixed(1) + "px");
    for (const k of kids()) k.style.setProperty("--sy", (ayC - k.offsetTop).toFixed(1) + "px");
  };
  draw(0); main.classList.add("tk-run");
  const arrive = () => {
    const now = root.querySelector<HTMLElement>(".main .pscroll .pathc");
    main.classList.remove("tk-run"); for (const n of VARS) main.style.removeProperty(n);
    for (const k of now ? Array.from(now.children) as HTMLElement[] : []) { k.style.removeProperty("--sy"); delete k.dataset.tk; }
    const s2 = root.querySelector<HTMLElement>("#stn, #stnp"); if (s2) { s2.style.transform = ""; s2.classList.remove("dragging"); }
    if (riser) riser.style.display = "";
    root.classList.remove("pulling"); root.style.setProperty("--pull", "0"); root.style.setProperty("--lift", "0px");
    // the new page comes in; its first bullet settles from where the station landed
    main.classList.add("tk-in"); setTimeout(() => main.classList.remove("tk-in"), 520);
    const nb = now && now.querySelector<HTMLElement>(".d, .rfig");
    if (nb && nb.animate) {
      const r = nb.getBoundingClientRect(), d = ayV - (r.top + r.height / 2);
      if (Math.abs(d) > 1) nb.animate([{ translate: `0 ${d}px` }, { translate: "0 0" }], { duration: 280, easing: "cubic-bezier(.2,.8,.3,1)" });
    }
    settle();
  };
  const finish = () => {
    if (ended) return; ended = true; cancelAnimationFrame(raf);
    if (state.ui === u) act();       // else the page has changed meanwhile (a menu, another exercise): nothing to take
    requestAnimationFrame(() => requestAnimationFrame(arrive));
  };
  const frame = (now: number) => { const t = now - t0; draw(Math.min(t, END)); if (t >= END) finish(); else raf = requestAnimationFrame(frame); };
  raf = requestAnimationFrame(frame);
  setTimeout(finish, END + 700);
}
