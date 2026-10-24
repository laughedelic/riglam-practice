// Taking the Check of the examples, as the lab's Check scan has it (Slide and mark · the relation last). The Check does not ride like any station: its diamond opens into a
// hollow one, a scanner, that slides up the thread in one move, without stopping. Each case it passes is marked the moment the scanner's centre crosses its diamond (the
// diamond takes its verdict's color, the mark comes in after the example, the scanner's rim flashes the same color); the heading's bullet is covered and its words go;
// at the top of the slide it reaches the strip's edge and the relation is marked there (struck, or checked: a knock in the hand); then it settles back into the
// heading's place, fills with the verdict's color and grows into the result's node, its word beside it. Then the check is taken (`act`) and the result's page comes in
// around the node, which stays where the scanner left it. The verdicts are graded before the check (`ScanPlan`, relations.tsx), in the same way the check grades them.
// The page's own nodes are only marked with classes (styles/43-path-scan.css) and given their marks; the scanner is drawn over the page.
import { render } from "preact";
import { bump } from "./gesture.ts";
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
}

const EASE = { out: (u: number) => 1 - (1 - u) ** 3, io: (u: number) => (u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2) };
/** the morph of the Check into the scanner, the settle back from the strip, the scanner becoming the result's node (ms) */
const MORPH = 200, SETTLE = 240, BECOME = 360;
/** how long the slide lasts for the way it goes (px) */
const slideMs = (d: number) => Math.max(560, Math.min(1000, 380 + d * 1.25));

/** Plays the scan from the Check `stn` (lifted `lift` px by the hand) with the verdicts of `plan`, then `act` (the check); `settle` once the result's page is in. */
export function playScan(root: HTMLElement, stn: HTMLElement, plan: ScanPlan, act: () => void, settle: () => void): void {
  const main = root.querySelector<HTMLElement>(".main"), sc = root.querySelector<HTMLElement>(".main .pscroll"), pc = sc && sc.querySelector<HTMLElement>(".pathc");
  const go = stn.querySelector<HTMLElement>(".go"), head = pc && pc.querySelector<HTMLElement>(".sx.cur .sechead");
  const top = root.querySelector<HTMLElement>(root.classList.contains("kbup") ? ".khead" : ".pstrip");
  const pn = top && top.querySelector<HTMLElement>(root.classList.contains("kbup") ? ".pn" : ".compact .pn");
  if (!main || !sc || !pc || !go || !head || !top) { act(); settle(); return; }
  const rows = Array.from(pc.querySelectorAll<HTMLElement>(".sx.cur .sb"));
  const mr = () => main.getBoundingClientRect();
  const midY = (e: Element) => { const r = e.getBoundingClientRect(); return r.top + r.height / 2 - mr().top; };
  const hd = head.querySelector<HTMLElement>(".d") || head;
  const gr = go.getBoundingClientRect(), m0 = mr(), x = gr.left + gr.width / 2 - m0.left, y0 = gr.top + gr.height / 2 - m0.top;

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

  let y = y0;
  const place = () => { scn.style.top = y.toFixed(1) + "px"; past.style.top = y.toFixed(1) + "px"; past.style.height = Math.max(0, y0 - y).toFixed(1) + "px"; };
  const set = (n: string, v: number) => scn.style.setProperty(n, v.toFixed(4));
  const flash = (v: Verdict3) => { scn.classList.remove("f-ok", "f-no", "f-pt"); void scn.offsetWidth; scn.classList.add("f-" + v); };
  const marked = new Set<number>();
  const markRow = (i: number) => {
    const r = rows[i], v = plan.cases[i]; if (!r || !v) return;
    marked.add(i); r.classList.add("scn", "scn-" + v); flash(v);
    const at = r.querySelector(".pans") || r.querySelector(".fieldrow") || r.querySelector(".ptx"), box = document.createElement("span");
    box.className = "pscm"; render(<Mark m={v} />, box); if (at) at.append(box);
  };
  const markRel = () => {
    if (!pn) return;
    pn.classList.add("scn-rel", "scn-" + plan.rel);
    const nn = pn.querySelector(".pnn"), box = document.createElement("span");
    box.className = "pscm"; render(<Mark m={plan.rel} />, box); if (nn) nn.append(box);
    bump(plan.rel === "no" ? 14 : 10);
  };

  let raf = 0, done = false;
  const t0 = performance.now();
  let yTop = 0, d = 0, tSlide = 0, tSettle = 0, tBecome = 0, relDone = false, headDone = false;
  const frame = (now: number) => {
    const t = now - t0;
    if (t < MORPH) { set("--k", EASE.io(t / MORPH)); raf = requestAnimationFrame(frame); return; }
    set("--k", 1);
    if (!d) { yTop = top.getBoundingClientRect().bottom - mr().top + 20; d = Math.max(1, y0 - yTop); tSlide = slideMs(d); tSettle = MORPH + tSlide; tBecome = tSettle + SETTLE; }
    if (t < tSettle) {
      const u = EASE.io((t - MORPH) / tSlide);
      if (s0) sc.scrollTop = s0 * (1 - u);       // a page scrolled down comes back to its top, under the scanner
      y = y0 + ((top.getBoundingClientRect().bottom - mr().top + 20) - y0) * u;
      rows.forEach((r, i) => { if (!marked.has(i) && y <= midY(r.querySelector(".d") || r)) markRow(i); });
      if (!headDone && y <= midY(hd) + 8) { headDone = true; head.classList.add("scn-gone"); }
    } else if (t < tBecome) {
      if (!relDone) { relDone = true; rows.forEach((_, i) => { if (!marked.has(i)) markRow(i); }); if (!headDone) { headDone = true; head.classList.add("scn-gone"); } markRel(); }
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
  const finish = () => {
    if (done) return; done = true; cancelAnimationFrame(raf);
    act();
    requestAnimationFrame(() => requestAnimationFrame(arrive));
  };
  // the result's page is drawn and comes in where it is; the scanner glides the short way to its node's place and is the node from then on
  const arrive = () => {
    const nd = root.querySelector<HTMLElement>(".main .pvline .d.big");
    main.classList.remove("sc-run"); stn.classList.remove("scanning"); past.remove();
    const to = nd ? midY(nd) : y, end = () => { scn.remove(); main.classList.remove("sc-hand"); };
    main.classList.add("sc-in"); setTimeout(() => main.classList.remove("sc-in"), 520);
    settle();   // the page is the result's now: its station takes a tap during the glide
    if (!nd || Math.abs(to - y) < 1 || !scn.animate) { end(); return; }
    main.classList.add("sc-hand");
    scn.animate([{ transform: "none" }, { transform: `translateY(${(to - y).toFixed(1)}px)` }], { duration: 240, easing: "cubic-bezier(.2,.8,.3,1)", fill: "forwards" }).finished.then(end, end);
  };
  place();
  raf = requestAnimationFrame(frame);
  setTimeout(() => { if (!done) { cancelAnimationFrame(raf); finish(); } }, 4000);
}
