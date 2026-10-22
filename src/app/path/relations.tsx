// Relations on the Path: 1 the relation (the five as choices on the path), 2 the examples (one case at a time, the pair folded into a strip
// above), 3 the result (the pair with your relation marked, the verdict, a row for each case, Why from the tutor). The rules are the
// classic page's (practice/screen.js, grading.js, src/domain): the Path draws the same attempt, `state.ui`, and calls the same steps.
import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { state } from "../state.js";
import { ask } from "../ai/tutor.js";
import { quorumItem } from "../ai/quorum-panel.js";
import { canAsk } from "../core/ask.js";
import { CELLS, ORDER, REL, cellLabel, notaOf } from "../core/rel.js";
import { singular } from "../debate/text.js";
import { favTarget, isFav, toggleFav } from "../practice/favorites.js";
import { check } from "../practice/grading.js";
import { next } from "../practice/queue.js";
import { choose, explainParts, fillable, nextFwd } from "../practice/screen.js";
import { skipPair } from "../practice/skips.js";
import { lineageOf, termsNode } from "../practice/terms.js";
import { catByLabel } from "../practice/universe.js";
import { openChat } from "../shell/chat.js";
import { render } from "../shell/render.js";
import type { CellId, RelKey } from "../../ai-shared/relations.ts";
import { VERDICT_RE, parseFactLine } from "../../domain/verdict.ts";
import { refreshPath } from "./index.tsx";
import { Foot, HideKeys, KbdStation, PreStation, SideStation, Station, TopBar, pathNote } from "./shell.tsx";
import { DefCard, OneTerm, TermText } from "./terms.tsx";
import { Bridge, D, Fig, Gap, Head, Icon, Knob, Mark, SHORT, St, Sx } from "./ui.tsx";
import { Scroll } from "./scroll.tsx";

/** The name of each case, as the lab writes it. */
export const CASE: Record<string, string> = { both: "both A and B", anb: "A, not B", bna: "B, not A", nei: "neither" };
const u0 = () => state.ui!;
const pair = () => state.cur!.p;
/** the relation picked (the steps after the first have one) */
const relOf = () => u0().rel as RelKey;
const filled = (c: CellId) => { const x = u0().cells[c]; return !!(x.t || "").trim() || !!x.none; };

/** What to name for a case: "Something that is an effect but not a thought." */
function caseQ(c: CellId) {
  const p = pair(), a = singular(p.a), b = singular(p.b), K = (w: string) => <b class="conn">{w}</b>;
  return ({
    both: <>Name something that is {K("both")} {a} {K("and")} {b}.</>,
    anb: <>Something that is {a}, {K("but not")} {b}.</>,
    bna: <>Something that is {b}, {K("but not")} {a}.</>,
    nei: <>Something that is {K("neither")} {a} {K("nor")} {b}.</>,
  } as Record<string, ComponentChildren>)[c];
}
/** The star of the pair, beside it: pressed while the pair is a favorite. */
function Star() {
  const p = favTarget(); if (!state.db || !p || p.own) return null;
  const on = isFav(p);
  return <button type="button" class={"pib fav pstar" + (on ? " on" : "")} aria-pressed={on ? "true" : "false"} aria-label={on ? "In favorites" : "Add to favorites"} onClick={() => toggleFav(p)}><Icon n="star" /></button>;
}
/** The pair with a relation as its node on the path: A on the upper line, B on the lower, like the figure's two diamonds. */
function PairNode({ rel, right }: { rel: RelKey; right?: ComponentChildren }) {
  const p = pair(), long = Math.max(p.a.length, p.b.length) > 24;
  return <div class={"pn" + (long ? " long" : "")}><i class="pnm a">A</i><i class="pnm b">B</i><Fig k={rel} size="pnode" />
    <span class="pnl a"><i>A</i><b>{p.a}</b></span><span class="pnl b"><i>B</i><b>{p.b}</b></span>
    {right ? <span class="pnr">{right}</span> : null}<span class="pnn" title={REL[rel].name}>{SHORT[rel]}</span></div>;
}
/** The class under a term of the pair at the result: "each is a form". */
function ClassOf({ label, cat, where }: { label: string; cat?: string | null; where: string }) {
  const li = lineageOf(cat || catByLabel(label)); if (!li) return null;
  const name: string | undefined = li.everyday ? li.names[0] : li.names[1]; if (!name) return null;
  const low = name.toLowerCase();
  return <><small class="cls">each is {/^[aeiou]/.test(low) ? "an" : "a"} <OneTerm txt={low} term={name} where={where} /></small><DefCard where={where} /></>;
}
/** A chain of terms with "is a" between them, small and italic (the grading writes them with a separator). */
const isa = (s: string) => String(s).split("").flatMap((x, i) => (i ? [" ", <i class="pisa">{/^[aeiou]/i.test(x) ? "is an" : "is a"}</i>, " ", x] : [x]));

/* ---------- 1 the relation ---------- */
function pick(k: string) {
  const u = u0(); if (u.pk || u.checked || u.late) return;
  u.pk = k; refreshPath();
  setTimeout(() => { if (state.ui !== u) return; u.pk = null; u.pall = false; choose(k); }, 420);
}
function PickStep({ kb }: { kb: boolean }) {
  const u = u0(), p = pair(), retry = state.cur!.retry;
  return <>
    <Scroll>
      {retry ? <p class="retry">{(state.cur!.tag || "Retry") + (state.retryQ.length ? " · " + state.retryQ.length + " more" : "")}</p> : null}
      <Sx cls="cur first"><Gap h={14} /><Head d={<D cls="sec now" />} h="1 Relation" sub="how do A and B relate?" /><Gap h={4} />
        <St d={<span class="ab">A</span>} cls={"pairst" + (state.db ? " hasstar" : "")}><Star /><span class={"tn" + (p.a.length > 24 ? " long" : "")}>{p.a}</span></St>
        <St d={<span class="ab">B</span>} cls="pairst"><span class={"tn" + (p.b.length > 24 ? " long" : "")}>{p.b}</span></St><Gap h={8} /></Sx>
      <Sx cls="gap"><span class="gapq" aria-hidden="true">?</span>
        <div class={"chs" + (u.pk ? " fading" : "")} role="group" aria-label="Relation">{ORDER.map((k, i) => {
          const r = REL[k as RelKey], sym = state.nota !== "codes" ? notaOf(k) : "";
          return <button type="button" class={"crow" + (u.pk === k ? " picked" : "")} aria-pressed={u.rel === k ? "true" : "false"} aria-keyshortcuts={String(i + 1)} onClick={() => pick(k)}>
            <span class="mc"><Fig k={k} /></span><span class="ct"><b>{r.name}{sym ? <span class="rsym">{sym}</span> : null}</b><small>{r.gloss(p.a, p.b)}</small></span>
          </button>;
        })}</div></Sx>
      <Sx cls="ptail" />
    </Scroll>
    {kb ? null : <Foot aux={<SideStation kind="skip" act={skipPair} />}>
      {u.rel ? <Station name="Examples" hint="the relation you picked" act={() => { u.open = false; render(); }} /> : <PreStation name="Examples" hint="pick a relation first" />}
    </Foot>}
  </>;
}

/* ---------- 2 the examples ---------- */
/** The open case, the next one after it that is still empty (going round), and whether it is the last to write. */
function cursor() {
  const u = u0(), order = fillable(), ready = order.every(filled);
  const ci = u.pall ? -1 : Math.max(0, Math.min(u.ci || 0, order.length - 1)), c = ci >= 0 ? order[ci] : null;
  const rest = ci >= 0 ? [...order.slice(ci + 1), ...order.slice(0, ci)] : order, nextC = rest.find((x) => !filled(x)) || null;
  return { order, ready, ci, c, nextC, last: !nextC };
}
const focusField = () => { const i = document.getElementById("cin") as HTMLInputElement | null; if (i) { i.focus({ preventScroll: true }); const n = i.value.length; try { i.setSelectionRange(n, n); } catch { /* not a text field */ } } };
/** Enter on a case: this one is written, the next empty one opens; after the last the keyboard goes away (and, from the keyboard's station, it checks). */
function commit(thenCheck = false) {
  const u = u0(), k = cursor();
  if (!k.c) return;
  if (!filled(k.c)) { const s = document.getElementById("kst"); if (s && s.offsetParent) { s.classList.add("peek"); setTimeout(() => s.classList.remove("peek"), 1700); } else pathNote("Write an example first, or say nothing exists"); return; }
  if (k.nextC) { u.ci = k.order.indexOf(k.nextC); u.pall = false; render(); focusField(); return; }
  u.pall = true;
  const a = document.activeElement as HTMLElement | null; if (a && a.blur) a.blur();
  render();
  if (thenCheck) check();
}
function openCase(i: number) { const u = u0(); u.ci = i; u.pall = false; render(); focusField(); }
function nothing(c: CellId) { const x = u0().cells[c]; x.t = ""; x.none = true; commit(); }

/** The strip under the top bar: the pair with your relation, folded; pull it (or tap it) to look back at the steps done. */
function Strip() {
  const u = u0(), p = pair(), r = REL[relOf()], g = useRef<{ y0: number; moved: boolean } | null>(null), open = !!u.pstrip;
  const set = (o: boolean) => { u.pstrip = o; refreshPath(); };
  return <div class={"pstrip" + (open ? " open" : "")}
    onPointerDown={(e) => { const c = (e.target as Element).closest("button"); if (c && !c.classList.contains("knob")) return; g.current = { y0: e.clientY, moved: false }; }}
    onPointerMove={(e) => {
      const s = g.current; if (!s) return; const d = e.clientY - s.y0;
      if (!s.moved && Math.abs(d) > 6) { s.moved = true; try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* gone */ } }
      if (d > 26 && !u.pstrip) { set(true); s.y0 = e.clientY; } else if (d < -26 && u.pstrip) { set(false); s.y0 = e.clientY; }
    }}
    onPointerUp={() => { const s = g.current; g.current = null; if (s && !s.moved) set(!u.pstrip); }} onPointerCancel={() => { g.current = null; }}>
    <div class="fold2 compact"><div><Sx cls="walked"><PairNode rel={relOf()} right={<Star />} /></Sx></div></div>
    <div class="fold2 full"><div>
      <Sx cls="walked"><Gap h={4} />
        <St d={<span class="ab">A</span>} cls="pairst sm"><span class="tn">{p.a}</span></St>
        <St d={<span class="ab">B</span>} cls="pairst sm"><span class="tn">{p.b}</span><p class="pq">How do the two terms relate?</p></St></Sx>
      <Sx cls="walked"><Gap h={10} />
        <St d={<Fig k={relOf()} size="m" />}><span style={{ display: "flex", alignItems: "baseline", gap: "8px", flexWrap: "wrap" }}><b class="yours" style={{ fontSize: "19px" }}>{r.name}</b>{state.nota !== "codes" ? <span class="rsym">{notaOf(relOf())}</span> : null}</span>
          <span class="pq" style={{ fontSize: "14.5px", display: "block" }}>{r.gloss(p.a, p.b)}. {u.late ? "Time ran out: this is the relation." : "Yours, not checked yet."}</span>
          {u.late ? null : <button type="button" class="pbtn" onClick={() => { u.open = true; u.pstrip = false; render(); }}>Pick another</button>}</St><Gap h={6} /></Sx>
    </div></div>
    <span class="pullr"><span class="gtip">{open ? "slide up to return" : "pull to look back"}</span><Knob label={open ? "Fold the earlier steps" : "Open the earlier steps"} onClick={() => set(!u.pstrip)} /></span>
  </div>;
}
/** The heading while the keyboard is up: the pair node, larger; with examples tucked above, it pulls down to show them. */
function KHead() {
  const g = useRef<number | null>(null);
  const above = () => { const sc = document.querySelector<HTMLElement>("#path .pscroll"); if (sc) sc.scrollTo({ top: 0, behavior: "smooth" }); };
  return <div class="khead"
    onPointerDown={(e) => { if ((e.currentTarget as HTMLElement).classList.contains("hasabove")) g.current = e.clientY; }}
    onPointerMove={(e) => { if (g.current === null) return; if (e.clientY - g.current > 12) { g.current = null; above(); } }}
    onPointerUp={() => { g.current = null; }} onPointerCancel={() => { g.current = null; }}>
    <PairNode rel={relOf()} right={<span class="pnx">Relations</span>} />
    <span class="pullr kpull"><span class="gtip kabt" /><button type="button" class="knob" aria-label="Show the examples written above" onMouseDown={(e) => e.preventDefault()} onClick={above}><span class="mk"><Icon n="chev" /></span></button></span>
  </div>;
}
function ExamplesStep({ kb }: { kb: boolean }) {
  const u = u0(), k = cursor(), first = k.order[0];
  const rows = k.order.map((c, i) => {
    const x = u.cells[c];
    if (i === k.ci) return <St d={<D cls="sub now" />} cls="sb now"><span class="lab">{CASE[c]}</span><p class="qq">{caseQ(c)}</p>
      <div class="fieldrow"><input class="pfield" id="cin" value={x.t} placeholder="write an example" autoComplete="off" autoCapitalize="off" spellcheck={false} enterKeyHint={k.last ? "done" : "next"} aria-label={cellLabel(c, pair())}
        onInput={(e) => { x.t = (e.currentTarget as HTMLInputElement).value; if (x.none) x.none = false; refreshPath(); }}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }} /></div>
      <p class="help"><span class="htx">{c === first ? "Your own example, in a few words." : "In a few words."} </span><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => nothing(c)}>nothing exists</button></p></St>;
    // a written case opens again with a tap; the field keeps the focus meanwhile, so the keyboard stays up and nothing moves under the finger
    if (filled(c)) return <button type="button" class="sbb" onMouseDown={(e) => e.preventDefault()} onClick={() => openCase(i)} aria-label={CASE[c] + ": " + (x.none ? "nothing exists" : x.t) + ". Change it"}>
      <St d={<D cls="sub yours" />} cls="sb done"><span class="lab">{CASE[c]}</span><span class={"pans" + (x.none ? " nil" : "")}>{x.none ? "nothing exists" : x.t.trim()}</span></St></button>;
    return <St d={<D cls="sub" />} cls="sb later"><span class="lab">{CASE[c]}</span><p class="qq">{caseQ(c)}</p></St>;
  });
  const kname = k.last ? "Check" : "Next example", ktag = k.last || !k.nextC ? "" : CASE[k.nextC];
  return <>
    <KHead /><Strip />
    <Scroll dim={!!u.pstrip}>
      <Sx cls="cur first"><div class="ksp" style={{ height: "16px" }} /><Head d={<D cls="sec now" />} h="2 Examples" sub={k.order.length === 1 ? "one case" : "one for each case"} />{rows}<Gap h={6} /></Sx>
      <Sx cls="ptail" />
    </Scroll>
    <Foot kbd={kb ? <KbdStation name={kname} tag={ktag} ready={!!k.c && filled(k.c)} act={() => commit(true)} /> : null}
      aux={<>{k.ready ? null : <SideStation kind="skip" act={skipPair} />}{kb ? <HideKeys /> : null}</>}>
      {k.ready ? <Station name="Check" hint={"your relation and " + (k.order.length === 1 ? "one example" : k.order.length + " examples")} act={() => { const a = document.activeElement as HTMLElement | null; if (a && a.blur) a.blur(); check(); }} />
        : <PreStation name="Result" hint="write each example first" />}
    </Foot>
  </>;
}

/* ---------- 3 the result ---------- */
// the tutor's explanation without its lines on the cases (those are on the cases' rows)
const CELL_LN = /^[-•*\s]*(?:\*\*)?(?:both|a not b|b not a|neither|q[1-4])(?:\*\*)?\s*:/i;
function latestExplain() {
  const chat = u0().chat || [];
  for (let i = chat.length - 1; i >= 0; i--) { const t = chat[i]; if (t.role === "assistant" && t.kind === "explain") return t; }
  return null;
}
function WhyText() {
  const t = latestExplain(); if (!t || !t.content) return null;
  const seen = new Set<string>(), out: ComponentChildren[] = [];
  String(t.content).split("\n").forEach((ln0: string, i: number) => {
    if (!ln0.trim() || CELL_LN.test(ln0.trim()) || parseFactLine(ln0)) return;
    const ln = ln0.replace(/^[-•*\s]+/, "").replace(/\*\*/g, "").replace(VERDICT_RE, "").trim(); if (!ln) return;
    const m = ln.match(/^([A-Za-z][A-Za-z0-9 ,'’-]{0,28}):\s+(.*)$/), w = "pw" + i;
    out.push(<p class="whyt">{m ? <><b>{m[1]}:</b> <TermText text={m[2]} where={w} seen={seen} /></> : <TermText text={ln} where={w} seen={seen} />}</p>, <DefCard where={w} />);
  });
  return out.length ? <div class="tsay">{out}</div> : t.pending ? null : <p class="whyt">The tutor's notes are on the examples above.</p>;
}
/** The tutor at work: three dots, one after the other, and the seconds. */
function Thinking({ label }: { label: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const t0 = Date.now(), id = setInterval(() => { if (ref.current) ref.current.textContent = Math.floor((Date.now() - t0) / 1000) + "s"; }, 250);
    return () => clearInterval(id);
  }, []);
  return <div class="think" role="status"><span class="tk"><i /></span><span class="tt">{label}</span><span class="secs" ref={ref}>0s</span></div>;
}
const needsKey = () => !canAsk() && !!state.unlock && !!state.unlock.tutor;
/** Asks the tutor to check the open examples and explain; without the Magic Key, its prompt first. */
function askTutor(open = true) {
  const u = u0(); if (u.ctl) return;
  if (canAsk()) { if (open) u.pwhy = true; void ask(null, "explain"); return; }
  if (needsKey()) void Promise.resolve(state.unlock!.open()).then((taken) => { if (taken && state.ui === u && canAsk() && u.checked && !u.explained && !u.ctl) { if (open) u.pwhy = true; void ask(null, "explain"); } });
}
/** What the tutor's button in the top bar does on a result: ask for the explanation, or open the conversation. */
export function relTutor(): (() => void) | null {
  const u = state.ui; if (!u || !u.checked) return null;
  return () => { if (!u.explained && !u.ctl) askTutor(); else openChat(); };
}
function Row({ c }: { c: CellId }) {
  const u = u0(), r = u.res, cr = r.cells[c] as { v: string; msg: string[] }, p = pair(), out = REL[relOf()].empty.includes(c), x = u.cells[c], t = (x.t || "").trim();
  const open = cr.v === "cmp" || cr.v === "open", m = cr.v === "ok" ? "ok" : cr.v === "bad" ? "no" : "pt", busy = open && !!u.ctl;
  const tnote: string | undefined = (explainParts().cells as Record<string, string>)[c], key = (p.ex && p.ex[c as keyof typeof p.ex]) || "";
  const ans = out ? <span class="ans2 nil">not asked by your relation</span> : t ? <span class={"ans2" + (m === "no" ? " no" : "")}>{t}</span> : <span class="ans2 nil">{x.none ? "nothing exists" : "left empty"}</span>;
  const note = tnote ? <><span class="tutn">the tutor:</span> <TermText text={tnote} where={"pc" + c} /></>
    : out ? <>you left this case out; for example <span class="fix">{key}</span></>
    : open ? <>unchecked: the list does not know it yet{key ? <>; the course's example: <span class="fix">{key}</span></> : null}</>
    : <><b>{cr.msg[0]}</b>{cr.msg[2] ? <i>{cr.msg[2]}</i> : null}{isa(cr.msg[1] || "")}</>;
  const side = open && !busy && !(u.explained && !r.relOpen) && (canAsk() || needsKey());
  return <St d={<D cls={"sub " + (busy ? "pthink" : m)} />} cls={"sb exr" + (tnote ? " tut" : "")}>
    <span class="lab">{CASE[c]}</span><div class="line1">{ans}{busy ? null : <Mark m={m} />}</div>
    <p class="xnote">{note}</p>{tnote ? <DefCard where={"pc" + c} /> : null}
    {busy ? <Thinking label="the tutor is checking" /> : null}
    {side ? <button type="button" class="tside" aria-disabled={needsKey() ? "true" : undefined} onClick={() => askTutor(false)}><span class="tsd" /><b>Check and explain</b><span class="tsl" /></button> : null}
  </St>;
}
function WhyRow() {
  const u = u0(), r = u.res, unc = CELLS.filter((c) => r.cells[c].v === "cmp" || r.cells[c].v === "open").length;
  if (!canAsk() && !u.chat && !u.chatErr && !needsKey()) return null;
  const open = !!u.pwhy, t = latestExplain(), writing = !!u.ctl, q = quorumItem();
  const sub = writing ? "the tutor is writing" : u.explained ? "from the tutor" : needsKey() ? "needs the Magic Key" : unc ? "check the open " + (unc === 1 ? "example" : "examples") + " and explain" : "ask the tutor";
  const act = () => { if (!u.explained && !u.ctl) { askTutor(); return; } u.pwhy = !u.pwhy; render(); };
  return <Sx cls="walked">
    <button type="button" class={"wrow" + (open ? " open" : "")} aria-expanded={open ? "true" : "false"} onClick={act}><D cls={"sub " + (writing ? "pthink" : "tut")} />
      <span class="ct"><b>Why</b><span>{sub}</span></span><span class="arr"><Icon n="chev" /></span></button>
    {open ? <div class="wtext">
      {writing && !(t && t.content) ? <Thinking label="the tutor is reading your answer" /> : null}
      <WhyText />
      {u.chatErr ? <p class="terr">{u.chatErr}</p> : null}
      {q ? <Bridge fill={() => q.body()} /> : null}
      <div class="tact">
        {writing ? <button type="button" class="pbtn" onClick={() => u.ctl && u.ctl.abort()}>Stop</button> : null}
        {!writing && canAsk() && u.explained ? <button type="button" class="pbtn" onClick={openChat}>Ask a follow-up</button> : null}
        {!writing && canAsk() && u.explained && r.relOpen ? <button type="button" class="pbtn" onClick={() => askTutor()}>Ask again</button> : null}
      </div>
    </div> : null}
  </Sx>;
}
function TermsRow() {
  const u = u0(), open = !!u.pterms;
  return <Sx cls="walked">
    <button type="button" class={"wrow" + (open ? " open" : "")} aria-expanded={open ? "true" : "false"} onClick={() => { u.pterms = !open; render(); }}><D cls="sub done" />
      <span class="ct"><b style={{ color: "var(--ink)" }}>Terms</b><span>the two terms, and where each belongs</span></span><span class="arr" style={{ color: "var(--ink2)" }}><Icon n="chev" /></span></button>
    {open ? <div class="wtext"><Bridge fill={() => termsNode(pair())} /></div> : null}
  </Sx>;
}
function ResultStep() {
  const u = u0(), p = pair(), r = u.res, rel = relOf(), mine = SHORT[rel], right = SHORT[p.relation];
  const rows = CELLS.filter((c) => !REL[rel].empty.includes(c) || r.cells[c].v === "bad");
  const unc = rows.filter((c) => r.cells[c].v === "cmp" || r.cells[c].v === "open").length, nbad = rows.filter((c) => r.cells[c].v === "bad").length, nex = rows.filter((c) => !REL[rel].empty.includes(c)).length;
  const ov: string = r.overall, v = ov === "bad" ? "no" : ov === "part" ? "pt" : "ok";
  const word = ov === "pend" ? "Right so far" : ({ ok: "Right", part: "Partly right", bad: "Not quite" } as Record<string, string>)[ov] || "Not quite";
  const cases = (n: number) => (n === 1 ? "one case" : n + " cases");
  const vsub = (ov === "pend" ? unc + " unchecked" + (u.ctl ? " · the tutor is on it" : "") : ov === "ok" ? "your relation and " + (nex === 1 ? "one example" : nex + " examples")
    : ov === "part" ? cases(nbad) + " to look at" : u.late ? "time ran out on the relation" + (nbad ? "; " + cases(nbad) + " to look at" : "") : "the relation" + (nbad ? " and " + cases(nbad) : "")) + (u.exLate ? " · time ran out on the examples" : "");
  const own = Math.max(p.a.length, p.b.length) > 24 || !r.relOk, long = Math.max(p.a.length, p.b.length) > 24, star = <Star />;
  const rv = r.relOk ? <span class="rvl"><b class="yours">{mine}</b><Mark m="ok" /></span>
    : <><span class="rvl">{u.late ? <s class="no">no relation</s> : <s class="no">{mine}</s>}<Mark m="no" /></span><span class="rvl"><Fig k={p.relation} size="xs" /><span class="fix">{right}</span></span></>;
  const errs = [u.saveErr, state.favErr, state.skipErr].filter(Boolean);
  return <>
    <Scroll>
      <Sx cls="walked first"><Gap h={14} />
        <div class={"pn res" + (long ? " long" : "") + (state.db ? " rstar" : "")}><i class="pnm a">A</i><i class="pnm b">B</i><Fig k={rel} size="pnode" />
          <span class="pnl a"><i>A</i><span class="tw"><b>{p.a}</b><ClassOf label={p.a} cat={p.catA} where="pca" /></span></span>
          <span class="pnl b"><i>B</i><span class="tw"><b>{p.b}</b><ClassOf label={p.b} cat={p.catB} where="pcb" /></span></span>
          {state.db ? <span class="pnr">{star}</span> : null}<span class={"pnn rv" + (own ? " own" : "")}>{rv}</span></div><Gap h={10} /></Sx>
      <Sx cls={({ ok: "okp", no: "nop", pt: "ptp" } as Record<string, string>)[v] + " vband"}>
        <St d={<D cls={"big " + v} mark={v === "ok" ? "check" : v === "no" ? "cross" : "q"} />} cls={"pvline " + v}>{word}<small class="vsub">{vsub}</small></St></Sx>
      <Sx cls={nbad ? "nop" : "okp"}><Gap h={2} />{rows.map((c) => <Row c={c} />)}</Sx>
      <WhyRow />
      <TermsRow />
      {errs.map((e) => <p class="pnoteline bad" style={{ padding: "8px 18px 0 calc(var(--m) + 22px)" }}>{e}</p>)}
      <Sx cls="ptail" />
    </Scroll>
    <Foot><Station name={nextFwd().label} act={() => next()} /></Foot>
  </>;
}

/** The screen of Relations: its top bar and the step the attempt is at. */
export function relationsScreen(kb: boolean): { cls: string; node: ComponentChildren } {
  const u = u0(), step = u.checked ? 3 : !u.rel || u.open ? 1 : 2;
  const waiting = !!u.chat && u.chat.some((t: { role: string; pending?: boolean; content?: string }) => t.role === "assistant" && !t.pending && t.content) && !u.pwhy;
  const top = <TopBar title="Relations" tools tutor={relTutor()} tutorDot={waiting || !!u.ctl} />;
  if (step === 1) return { cls: "", node: <>{top}<PickStep kb={kb} /></> };
  if (step === 2) return { cls: cursor().ready ? "ready" : "", node: <>{top}<ExamplesStep kb={kb} /></> };
  return { cls: "done", node: <>{top}<ResultStep /></> };
}
