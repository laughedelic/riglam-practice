// The examples on the Path, for Relations and Find a pair: one case at a time, the pair and its relation folded into a strip above, and while
// the keyboard is up a heading with the pair. The cases are the attempt's (`state.ui.cells`), the ones the relation leaves possible.
import type { ComponentChildren } from "preact";
import { useRef } from "preact/hooks";
import { state } from "../state.js";
import { cellLabel } from "../core/rel.js";
import { fillable } from "../practice/screen.js";
import { skipPair } from "../practice/skips.js";
import { render } from "../shell/render.js";
import type { CellId, RelKey } from "../../ai-shared/relations.ts";
import { refreshPath } from "./index.tsx";
import { CASE, PairNode, Star, caseQ, pairOf, u0 } from "./parts.tsx";
import { Scroll } from "./scroll.tsx";
import { Foot, HideKeys, KbdStation, PreStation, SideStation, Station, VoiceBar, pathNote } from "./shell.tsx";
import { D, Gap, Head, Icon, Knob, St, Sx, NOFILL } from "./ui.tsx";

const filled = (c: CellId) => { const x = u0().cells[c]; return !!(x.t || "").trim() || !!x.none; };
/** The open case, the next one after it that is still empty (going round), and whether it is the last to write. */
function cursor() {
  const u = u0(), order = fillable() as CellId[], ready = order.every(filled);
  const ci = u.pall ? -1 : Math.max(0, Math.min(u.ci || 0, order.length - 1)), c = ci >= 0 ? order[ci] : null;
  const rest = ci >= 0 ? [...order.slice(ci + 1), ...order.slice(0, ci)] : order, nextC = rest.find((x) => !filled(x)) || null;
  return { order, ready, ci, c, nextC, last: !nextC };
}
/** Whether every case asked for has an example (or says that nothing exists). */
export const examplesReady = () => cursor().ready;
const focusField = () => { const i = document.getElementById("cin") as HTMLInputElement | null; if (i) { i.focus({ preventScroll: true }); const n = i.value.length; try { i.setSelectionRange(n, n); } catch { /* not a text field */ } } };
const blur = () => { const a = document.activeElement as HTMLElement | null; if (a && a.blur) a.blur(); };
/** Enter on a case: this one is written, the next empty one opens; after the last the keyboard goes away (and, from the keyboard's station, `check`). */
function commit(check: (() => void) | null) {
  const u = u0(), k = cursor();
  if (!k.c) return;
  if (!filled(k.c)) { const s = document.getElementById("kst"); if (s && s.offsetParent) { s.classList.add("peek"); setTimeout(() => s.classList.remove("peek"), 1700); } else pathNote("Write an example first, or say nothing exists"); return; }
  if (k.nextC) { u.ci = k.order.indexOf(k.nextC); u.pall = false; render(); focusField(); return; }
  u.pall = true; blur(); render();
  if (check) check();
}
function openCase(i: number) { const u = u0(); u.ci = i; u.pall = false; render(); focusField(); }
function nothing(c: CellId) { const x = u0().cells[c]; x.t = ""; x.none = true; commit(null); }

/** The strip under the top bar: the pair with its relation, folded; pull it (or tap it) to look back at `full`, the steps done. */
function Strip({ rel, full }: { rel: RelKey; full: ComponentChildren }) {
  const u = u0(), g = useRef<{ y0: number; moved: boolean } | null>(null), open = !!u.pstrip;
  const set = (o: boolean) => { u.pstrip = o; refreshPath(); };
  return <div class={"pstrip" + (open ? " open" : "")}
    onPointerDown={(e) => { const c = (e.target as Element).closest("button"); if (c && !c.classList.contains("knob")) return; g.current = { y0: e.clientY, moved: false }; }}
    onPointerMove={(e) => {
      const s = g.current; if (!s) return; const d = e.clientY - s.y0;
      if (!s.moved && Math.abs(d) > 6) { s.moved = true; try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* gone */ } }
      if (d > 26 && !u.pstrip) { set(true); s.y0 = e.clientY; } else if (d < -26 && u.pstrip) { set(false); s.y0 = e.clientY; }
    }}
    onPointerUp={(e) => { const s = g.current; g.current = null; if (s && !s.moved && !(e.target as Element).closest(".knob")) set(!u.pstrip); }} onPointerCancel={() => { g.current = null; }}>
    <div class="fold2 compact"><div><Sx cls="walked"><PairNode rel={rel} right={<Star />} /></Sx></div></div>
    <div class="fold2 full"><div>{full}</div></div>
    <span class="pullr"><span class="gtip">{open ? "slide up to return" : "pull to look back"}</span><Knob label={open ? "Fold the earlier steps" : "Open the earlier steps"} onClick={() => set(!u.pstrip)} /></span>
  </div>;
}
/** The pair's two stops, small, for the strip unfolded, with the question they were asked under. */
export function StripPair({ q }: { q: string }) {
  const p = pairOf();
  return <Sx cls="walked"><Gap h={4} />
    <St d={<span class="ab">A</span>} cls="pairst sm"><span class="tn">{p.a}</span></St>
    <St d={<span class="ab">B</span>} cls="pairst sm"><span class="tn">{p.b}</span><p class="pq">{q}</p></St></Sx>;
}
/** The heading while the keyboard is up: the pair node, larger; with examples tucked above, it pulls down to show them. */
function KHead({ rel, title }: { rel: RelKey; title: string }) {
  const g = useRef<number | null>(null);
  const above = () => { const sc = document.querySelector<HTMLElement>("#path .pscroll"); if (sc) sc.scrollTo({ top: 0, behavior: "smooth" }); };
  return <div class="khead"
    onPointerDown={(e) => { if ((e.currentTarget as HTMLElement).classList.contains("hasabove")) g.current = e.clientY; }}
    onPointerMove={(e) => { if (g.current === null) return; if (e.clientY - g.current > 12) { g.current = null; above(); } }}
    onPointerUp={() => { g.current = null; }} onPointerCancel={() => { g.current = null; }}>
    <PairNode rel={rel} right={<span class="pnx">{title}</span>} />
    <span class="pullr kpull"><span class="gtip kabt" /><button type="button" class="knob" aria-label="Show the examples written above" onMouseDown={(e) => e.preventDefault()} onClick={above}><span class="mk"><Icon n="chev" /></span></button></span>
  </div>;
}

/**
 * The step of the examples: `title` the exercise, `step` its number, `rel` the relation the cases come from, `full` what the strip shows
 * unfolded, `check` the check of the answer.
 */
export function ExamplesStep({ kb, title, step, rel, full, check }: { kb: boolean; title: string; step: number; rel: RelKey; full: ComponentChildren; check: () => void }) {
  const u = u0(), p = pairOf(), k = cursor(), first = k.order[0];
  const rows = k.order.map((c, i) => {
    const x = u.cells[c];
    if (i === k.ci) return <St d={<D cls="sub now" />} cls="sb now"><span class="lab">{CASE[c]}</span><p class="qq">{caseQ(c, p)}</p>
      <div class="fieldrow"><input class="pfield" id="cin" value={x.t} placeholder="write an example" {...NOFILL} enterKeyHint={k.last ? "done" : "next"} aria-label={cellLabel(c, p)}
        onInput={(e) => { x.t = (e.currentTarget as HTMLInputElement).value; if (x.none) x.none = false; refreshPath(); }}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(null); } }} /></div>
      <p class="help"><span class="htx">{c === first ? "Your own example, in a few words." : "In a few words."} </span><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => nothing(c)}>nothing exists</button></p></St>;
    // a written case opens again with a tap; the field keeps the focus meanwhile, so the keyboard stays up and nothing moves under the finger
    if (filled(c)) return <button type="button" class="sbb" onMouseDown={(e) => e.preventDefault()} onClick={() => openCase(i)} aria-label={CASE[c] + ": " + (x.none ? "nothing exists" : x.t) + ". Change it"}>
      <St d={<D cls="sub yours" />} cls="sb done"><span class="lab">{CASE[c]}</span><span class={"pans" + (x.none ? " nil" : "")}>{x.none ? "nothing exists" : x.t.trim()}</span></St></button>;
    return <St d={<D cls="sub" />} cls="sb later"><span class="lab">{CASE[c]}</span><p class="qq">{caseQ(c, p)}</p></St>;
  });
  const kname = k.last ? "Check" : "Next example", ktag = k.last || !k.nextC ? "" : CASE[k.nextC];
  return <>
    <KHead rel={rel} title={title} /><Strip rel={rel} full={full} />
    <Scroll dim={!!u.pstrip}>
      <Sx cls="cur first"><div class="ksp" style={{ height: "16px" }} /><Head d={<D cls="sec now" />} h={step + " Examples"} sub={k.order.length === 1 ? "one case" : "one for each case"} />{rows}<Gap h={6} /></Sx>
      <Sx cls="ptail" />
    </Scroll>
    <VoiceBar />
    <Foot kbd={kb ? <KbdStation name={kname} tag={ktag} ready={!!k.c && filled(k.c)} act={() => commit(check)} /> : null}
      aux={<>{k.ready ? null : <SideStation kind="skip" act={skipPair} />}{kb ? <HideKeys /> : null}</>}>
      {k.ready ? <Station name="Check" hint={"your " + (state.ui!.find ? "pair" : "relation") + " and " + (k.order.length === 1 ? "one example" : k.order.length + " examples")} act={() => { blur(); check(); }} />
        : <PreStation name="Result" hint="write each example first" />}
    </Foot>
  </>;
}
