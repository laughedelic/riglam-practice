// Taking the Check of the examples, as the lab's Check scan has it (Slide and mark · the relation last). The Check does not ride like any station: its diamond opens into a
// hollow one, a scanner, that slides up the thread in one move, without stopping. Each case it passes is marked the moment the scanner's centre crosses its diamond (the
// diamond takes its verdict's color, the mark comes in after the example, the scanner's rim flashes the same color); the heading's bullet is covered and its words go;
// at the top of the slide it reaches the strip's edge and the relation is marked there (struck, or checked: a knock in the hand); then it settles back into the
// heading's place, fills with the verdict's color and grows into the result's node, its word beside it. Then the check is taken (`act`) and the result's page comes in
// around the node, which stays where the scanner left it. The verdicts are graded before the check (`ScanPlan`, relations.tsx), in the same way the check grades them.
// The page's own nodes are only marked with classes (styles/43-path-scan.css) and given their marks; the scanner is drawn over the page.
// With the keyboard up (the folded layout) the page opens first (relayout.ts): the keyboard goes and the page takes its own layout while the scanner, the Check turned into it,
// glides down to the foot; a beat, and then the scan runs over the opened page exactly as on a screen with no keyboard. At the foot, as the scanner leaves the Check's place, the
// station that comes next takes it (it is the same station: its words change, and it comes in), so the thread always runs on to a station.
// Under the look's `check: morph` the step from the examples' page to the result's page is not a swap: the case rows and the parts of the pair (its figure, the two terms, the relation
// given with its verdict mark), which the result shows too, move from where they stood to where they are in the result (the strip's leftovers fade, the rest of the result fades in
// around them), the result's node and word wait for the scanner from the moment the page is swapped, and the scanner takes its time to glide into the node's place.
// The result's page is drawn and starts to come in within one frame, so that it is never seen whole for a frame before it fades in.
import { render } from "preact";
import { state } from "../state.js";
import { come, wait } from "./foot.ts";
import { bump } from "./gesture.ts";
import { openPage } from "./relayout.ts";
import { Mark } from "./ui.tsx";

export type Verdict3 = "ok" | "no" | "pt";
export interface ScanPlan {
  /** the verdict of each case on the page, in the page's order */
  cases: Verdict3[];
  rel: Verdict3;
  /** the result's: its color, word and the line beside the word */
  v: Verdict3;
  word: string;
  sub: string;
  /** the name of the station that comes next, which takes the Check's place at the foot as the scanner leaves it */
  next?: string;
}

const EASE = { out: (u: number) => 1 - (1 - u) ** 3, io: (u: number) => (u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2) };
/** the morph of the Check into the scanner, the settle back from the strip, the scanner becoming the result's node (ms) */
const MORPH = 200, SETTLE = 240, BECOME = 360;
/** the page opening under the keyboard's layout (it starts a moment after the Enter and takes this long), the beat before the slide, and the longest the foot is waited for to be still (the keyboard going takes the screen's height with it) */
const OPEN = 380, OPEN_AT = 40, BEAT = 60, STILL = 80, WAIT = 700;
/** the morph: how long what the two pages share takes to move, and the scanner to glide (ms; the glide without it is shorter) */
const MOVE = { duration: 380, easing: "cubic-bezier(.2,.8,.3,1)" }, GLIDE = 240;
/** the parts of the pair that the strip and the result both show: where they stand in the strip, where in the result, and what their size is measured by (font size, or the figure's width) */
const PAIR: [role: string, from: string, to: string, by: "font" | "width"][] = [
  ["fig", "svg.rfig", "svg.rfig", "width"],
  ["ia", ".pnl.a > i", ".pnl.a > i", "font"], ["a", ".pnl.a > b", ".pnl.a .tw > b", "font"],
  ["ib", ".pnl.b > i", ".pnl.b > i", "font"], ["b", ".pnl.b > b", ".pnl.b .tw > b", "font"],
  ["ma", ".pnm.a", ".pnm.a", "font"], ["mb", ".pnm.b", ".pnm.b", "font"],      // A and B in the margin, when the look has them there
];
interface Stood { r: DOMRect; size: number }
const sizeOf = (e: Element, by: "font" | "width") => by === "font" ? parseFloat(getComputedStyle(e).fontSize) || 1 : e.getBoundingClientRect().width || 1;
/** `fn`, once the path has drawn what the step changed: the draw waits for the next frame, and what is asked for after it runs after it in that frame, before anything is painted */
const drawn = (fn: () => void) => { if (state.pathQ) requestAnimationFrame(fn); else fn(); };
/** how long the slide lasts for the way it goes (px) */
const slideMs = (d: number) => Math.max(560, Math.min(1000, 380 + d * 1.25));

/**
 * Plays the scan from the Check `stn` (lifted `lift` px by the hand) with the verdicts of `plan`, then `act` (the check); `settle` once the result's page is in.
 * `open`, when the keyboard's layout is up: lets the field go and the layout be the page's again (the page opens as the scan begins). `morph`: the result's page moves in from the examples'.
 * `fw`: the look's `foot`: with `thread` the station that comes next takes the Check's place at the foot as the scanner leaves it, with `after` the foot is empty until the scanner is the result's node.
 */
export function playScan(root: HTMLElement, stn: HTMLElement, plan: ScanPlan, act: () => void, settle: () => void, open?: (() => void) | null, morph = false, fw: "thread" | "after" = "thread"): void {
  const main = root.querySelector<HTMLElement>(".main"), sc = root.querySelector<HTMLElement>(".main .pscroll"), pc = sc && sc.querySelector<HTMLElement>(".pathc");
  const go = stn.querySelector<HTMLElement>(".go"), head = pc && pc.querySelector<HTMLElement>(".sx.cur .sechead");
  // the strip under the top bar (the folded heading, while the keyboard's layout is up) and the pair's node in it: found when needed, as the layout changes
  const topEl = () => root.querySelector<HTMLElement>(root.classList.contains("kbup") ? ".khead" : ".pstrip");
  const pnEl = () => { const t = topEl(); return t && t.querySelector<HTMLElement>(root.classList.contains("kbup") ? ".pn" : ".compact .pn"); };
  if (!main || !sc || !pc || !go || !head || !topEl()) { act(); settle(); return; }
  const kb = !!open && root.classList.contains("kbup");
  const rows = Array.from(pc.querySelectorAll<HTMLElement>(".sx.cur .sb"));
  const mr = () => main.getBoundingClientRect();
  const midY = (e: Element) => { const r = e.getBoundingClientRect(); return r.top + r.height / 2 - mr().top; };
  const hd = head.querySelector<HTMLElement>(".d") || head;
  const gr = go.getBoundingClientRect(), m0 = mr(), x = gr.left + gr.width / 2 - m0.left, y0a = gr.top + gr.height / 2 - m0.top;
  // the station at the foot that takes the scan's place (the Check itself, or, once the keyboard's layout is gone, the foot's)
  let fst: HTMLElement | null = kb ? null : stn, y0 = y0a;
  const foot = () => { if (!fst || !fst.isConnected) fst = root.querySelector<HTMLElement>(".foot #stn"); if (fst) fst.classList.add("scanning"); return fst && fst.querySelector<HTMLElement>(".go"); };

  // the scanner over the page, where the Check's diamond is; the Check itself goes (its diamond is the scanner now)
  const scn = document.createElement("div");
  scn.className = "pscan " + plan.v; scn.setAttribute("aria-hidden", "true");
  scn.innerHTML = '<i class="pscd"></i><span class="pscw"><b></b><small></small></span>';
  (scn.querySelector(".pscw b") as HTMLElement).textContent = plan.word; (scn.querySelector(".pscw small") as HTMLElement).textContent = plan.sub;
  scn.style.left = x.toFixed(1) + "px";
  const past = document.createElement("div"); past.className = "pscpast"; past.style.left = x.toFixed(1) + "px";
  main.append(past, scn);
  stn.style.transform = ""; stn.classList.remove("dragging"); stn.classList.add("scanning");
  root.classList.remove("pulling"); root.style.setProperty("--pull", "0"); root.style.setProperty("--lift", "0px");
  main.classList.add("sc-run");
  const s0 = sc.scrollTop;
  if (kb) { main.classList.add("sc-open"); openPage(root, main, () => { root.classList.remove("kbup"); open!(); }, OPEN, OPEN_AT); }

  let y = y0;
  // the thread the scanner has passed runs down to the foot (`thread`); with `after` the foot is empty and the thread ends at the last case's diamond, so nothing is left behind the scanner down there
  const lastD = fw === "after" && rows.length ? rows[rows.length - 1] : null;
  const place = () => {
    const end = lastD ? Math.min(y0, midY(lastD.querySelector(".d") || lastD)) : y0;
    scn.style.top = y.toFixed(1) + "px"; past.style.top = y.toFixed(1) + "px"; past.style.height = Math.max(0, end - y).toFixed(1) + "px";
  };
  const set = (n: string, v: number) => scn.style.setProperty(n, v.toFixed(4));
  const flash = (v: Verdict3) => { scn.classList.remove("f-ok", "f-no", "f-pt"); void scn.offsetWidth; scn.classList.add("f-" + v); };
  const nameOf = (r: HTMLElement) => { const l = r.querySelector(".lab"); return l ? (l.textContent || "").trim() : ""; };
  const marked = new Set<number>();
  const markRow = (i: number) => {
    const r = rows[i], v = plan.cases[i]; if (!r || !v) return;
    marked.add(i); r.classList.add("scn", "scn-" + v); flash(v);
    const at = r.querySelector(".pans") || r.querySelector(".fieldrow") || r.querySelector(".ptx"), box = document.createElement("span");
    box.className = "pscm"; render(<Mark m={v} />, box); if (at) at.append(box);
  };
  const markRel = () => {
    const pn = pnEl(); if (!pn) return;
    pn.classList.add("scn-rel", "scn-" + plan.rel);
    const nn = pn.querySelector(".pnn"), box = document.createElement("span");
    box.className = "pscm"; render(<Mark m={plan.rel} />, box); if (nn) nn.append(box);
    bump(plan.rel === "no" ? 14 : 10);
  };

  let raf = 0, done = false;
  const t0 = performance.now();
  let yTop = 0, d = 0, tSlide = 0, tSettle = 0, tBecome = 0, relDone = false, headDone = false;
  // the slide starts once the Check is the scanner (and, when the page opens first, once the scanner is at the foot and the foot is still)
  let slideAt = MORPH, opening = kb, lastF = y0a, lastAt = 0;
  const strip = () => { const t = topEl(); return t ? t.getBoundingClientRect().bottom - mr().top + 20 : 0; };
  // the station that comes next takes the Check's place at the foot as the scanner leaves it
  const becomeNext = () => {
    const f = fst && fst.isConnected && fst.closest(".foot") ? fst : null; if (!f || !plan.next) return;
    const b = f.querySelector(".gol b"), tx = b && b.firstChild;
    if (tx && tx.nodeType === 3) (tx as Text).data = plan.next;
    f.setAttribute("aria-label", plan.next); f.classList.remove("scanning"); f.classList.add("scn-next");
  };
  const frame = (now: number) => {
    const t = now - t0;
    set("--k", EASE.io(Math.min(1, t / MORPH)));
    if (opening) {
      const g = foot(), f = g ? midY(g) : null, u = Math.max(0, Math.min(1, (t - OPEN_AT) / OPEN));
      y = y0a + ((f === null ? y0a : f) - y0a) * EASE.io(u);
      if (f !== null && Math.abs(f - lastF) > 0.5) { lastF = f; lastAt = t; }
      const still = f !== null && u >= 1 && t - Math.max(lastAt, OPEN_AT + OPEN) >= STILL;
      if (still || t > OPEN_AT + OPEN + WAIT) { opening = false; y0 = y = f === null ? y : f; slideAt = t + BEAT; main.classList.remove("sc-open"); }
      place(); raf = requestAnimationFrame(frame); return;
    }
    if (t < slideAt) { place(); raf = requestAnimationFrame(frame); return; }
    if (!d) { yTop = strip(); d = Math.max(1, y0 - yTop); tSlide = slideMs(d); tSettle = slideAt + tSlide; tBecome = tSettle + SETTLE; if (fw === "thread") becomeNext(); else wait(main); }
    if (t < tSettle) {
      const u = EASE.io((t - slideAt) / tSlide);
      if (s0) sc.scrollTop = s0 * (1 - u);       // a page scrolled down comes back to its top, under the scanner
      y = y0 + (strip() - y0) * u;
      for (let i = rows.length - 1; i >= 0; i--) if (!marked.has(i) && y <= midY(rows[i].querySelector(".d") || rows[i])) markRow(i);   // from the bottom up, also when a slow frame passes several
      if (!headDone && y <= midY(hd) + 8) { headDone = true; head.classList.add("scn-gone"); }
    } else if (t < tBecome) {
      if (!relDone) { relDone = true; for (let i = rows.length - 1; i >= 0; i--) if (!marked.has(i)) markRow(i); if (!headDone) { headDone = true; head.classList.add("scn-gone"); } markRel(); }
      const u = EASE.out((t - tSettle) / SETTLE), yH = midY(hd);
      y = yTop + (yH - yTop) * u;
    } else {
      y = midY(hd);
      set("--e", EASE.io(Math.min(1, (t - tBecome) / BECOME)));
      if (t >= tBecome + BECOME) { place(); finish(); return; }
    }
    place();
    raf = requestAnimationFrame(frame);
  };
  // what the examples' page and the result's page share: the case rows (by their names), the pair's node and the parts of the pair, where they stand now
  const shared = (): Map<string, number> => {
    const m = new Map<string, number>(), pn = pnEl();
    for (const r of rows) { const k = nameOf(r); if (k) m.set(k, r.getBoundingClientRect().top); }
    if (pn) m.set("", pn.getBoundingClientRect().top);
    return m;
  };
  const stood = (): Map<string, Stood> => {
    const m = new Map<string, Stood>(), pn = pnEl(); if (!pn) return m;
    for (const [k, from, , by] of PAIR) { const e = pn.querySelector(from), r = e && e.getBoundingClientRect(); if (e && r && (r.width || r.height)) m.set(k, { r, size: sizeOf(e, by) }); }      // a part that is not drawn has no place to move from
    // the relation given: its name and the mark beside it, as one
    const rn = pn.querySelector(".pnn .rn"), mk = pn.querySelector(".pnn .pscm");
    if (rn) { const a = rn.getBoundingClientRect(), b = mk ? mk.getBoundingClientRect() : a; m.set("rel", { r: new DOMRect(a.left, Math.min(a.top, b.top), b.right - a.left, Math.max(a.bottom, b.bottom) - Math.min(a.top, b.top)), size: 1 }); }
    return m;
  };
  // what the strip shows besides, and the result does not (the relation's code, the hint, its rule and its cap on the line), stays where it is and fades; the parts that move are not left behind
  const ghostOf = (): HTMLElement | null => {
    const t = topEl(); if (!t) return null;
    const g = t.cloneNode(true) as HTMLElement, r = t.getBoundingClientRect(), m = mr();
    g.removeAttribute("id"); g.setAttribute("aria-hidden", "true"); g.classList.add("sc-ghost");
    for (const e of Array.from(g.querySelectorAll<HTMLElement>(".pnl, .pnm, svg.rfig, .pnn"))) e.style.visibility = "hidden";
    g.style.cssText += `;position:absolute;left:${(r.left - m.left).toFixed(1)}px;top:${(r.top - m.top).toFixed(1)}px;width:${r.width.toFixed(1)}px;height:${r.height.toFixed(1)}px;margin:0;box-sizing:border-box;pointer-events:none;z-index:6`;
    main.append(g);
    return g;
  };
  const finish = () => {
    if (done) return; done = true; cancelAnimationFrame(raf);
    const was = morph ? shared() : null, parts = morph ? stood() : null, ghost = morph ? ghostOf() : null;
    if (morph) main.classList.add("sc-morph", "sc-hand");      // the scanner is the result's node and word until it has glided into place: the page's own are not seen twice
    if (fw === "after") wait(main);                          // the foot shows no station until the scanner has landed
    act();
    drawn(() => arrive(was, parts, ghost));
  };
  // the rows and the pair's parts that the result shares move from where they stood to where they are; the rows and parts it has more of come in
  const moveIn = (was: Map<string, number>, parts: Map<string, Stood>) => {
    const now = main.querySelector<HTMLElement>(".pathc"); if (!now) return;
    const slide = (e: HTMLElement, a: Keyframe, clear?: () => void) => { if (!e.animate) return; const f = e.animate([a, { translate: "0 0", scale: "1" }], MOVE); if (clear) f.finished.then(clear, clear); };
    const flip = (e: HTMLElement, from: number | undefined) => {
      if (from === undefined) return false;
      const d = from - e.getBoundingClientRect().top; if (Math.abs(d) > 1) slide(e, { translate: `0 ${d.toFixed(1)}px` });
      return true;
    };
    for (const r of Array.from(now.querySelectorAll<HTMLElement>(".sb"))) { const k = nameOf(r); if (k && flip(r, was.get(k))) { const sx = r.closest(".sx"); if (sx) sx.classList.add("morphed"); } else r.classList.add("mnew"); }
    const pn = now.querySelector<HTMLElement>(".pn.res"); if (!pn) return;
    // a part of the pair: from where it stood, as big as it was (the text and the figure are the result's own, scaled down to what they were)
    const move = (e: HTMLElement | null, was: Stood | undefined, by: "font" | "width" | null) => {
      if (!e || !was || !e.animate) return false;
      const r = e.getBoundingClientRect(), k = by ? was.size / sizeOf(e, by) : 1, dx = was.r.left - r.left, dy = was.r.top - r.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(1 - k) < 0.02) return true;
      e.style.transformOrigin = "0 0";
      slide(e, { translate: `${dx.toFixed(1)}px ${dy.toFixed(1)}px`, scale: k.toFixed(3) }, () => { e.style.transformOrigin = ""; });
      return true;
    };
    let any = false;
    for (const [k, , to, by] of PAIR) any = move(pn.querySelector<HTMLElement>(to), parts.get(k), by) || any;
    if (!move(pn.querySelector<HTMLElement>(".pnn.rv .rvl"), parts.get("rel"), null)) { const rv = pn.querySelector(".pnn.rv"); if (rv) rv.classList.add("mnew"); }
    if (any) { const sx = pn.closest(".sx"); if (sx) sx.classList.add("morphed"); }
  };
  // the result's page is drawn and comes in where it is; the scanner glides the short way to its node's place and is the node from then on
  const arrive = (was: Map<string, number> | null, parts: Map<string, Stood> | null, ghost: HTMLElement | null) => {
    const nd = root.querySelector<HTMLElement>(".main .pvline .d.big");
    main.classList.remove("sc-run", "sc-open"); for (const e of [stn, fst]) if (e) e.classList.remove("scanning", "scn-next"); past.remove();
    // the scanner is the node until it is in its place; the page's own, with its mark, takes over: the mark comes in rather than appears
    const to = nd ? midY(nd) : y, end = () => {
      scn.remove(); main.classList.remove("sc-hand"); if (fw === "after") come(main);
      const mk = nd && nd.querySelector<HTMLElement>(".mk"); if (mk && mk.animate) mk.animate([{ opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1 }], { duration: 180, easing: MOVE.easing });
    };
    main.classList.add("sc-in");
    setTimeout(() => { main.classList.remove("sc-in", "sc-morph"); for (const e of Array.from(main.querySelectorAll(".morphed,.mnew"))) e.classList.remove("morphed", "mnew"); }, 520 + (morph ? 200 : 0));
    if (ghost) { if (ghost.animate) ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: "ease-out", fill: "forwards" }).finished.then(() => ghost.remove(), () => ghost.remove()); else ghost.remove(); }
    if (was && parts) moveIn(was, parts);
    settle();   // the page is the result's now: its station takes a tap during the glide
    if (!nd || Math.abs(to - y) < 1 || !scn.animate) { end(); return; }
    main.classList.add("sc-hand");
    scn.animate([{ transform: "none" }, { transform: `translateY(${(to - y).toFixed(1)}px)` }], { duration: morph ? MOVE.duration : GLIDE, easing: MOVE.easing, fill: "forwards" }).finished.then(end, end);
  };
  place();
  raf = requestAnimationFrame(frame);
  setTimeout(() => { if (!done) { cancelAnimationFrame(raf); finish(); } }, 4000);
}
