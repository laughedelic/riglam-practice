// Find an instance on the Path: 1 the categories, each a stop, and the answer under them: a thing written in the field (the things the data
// knows are offered as the words are typed), or "nothing is"; then the result: the verdict, the answer, a row for each category with the
// reason, why nothing can be all of them, or a thing that is. The steps are instance/flow.ts; the tutor has no part here yet.
import type { ComponentChildren } from "preact";
import { useEffect } from "preact/hooks";
import { state } from "../state.js";
import { checkInstance, sayNothing, shownSet, writeInstance } from "../instance/flow.ts";
import { next } from "../practice/queue.js";
import { skipPair } from "../practice/skips.js";
import { spelled, stripDet } from "../../ai-shared/lookup.ts";
import { catPhrase } from "../../domain/instance.ts";
import type { InstanceQuestion, InstanceResult, InstanceRow } from "../../domain/instance.ts";
import { refreshPath } from "./index.tsx";
import { ErrLines, Verdict, u0 } from "./parts.tsx";
import { Scroll } from "./scroll.tsx";
import { Foot, PreStation, SideStation, Station, TopBar } from "./shell.tsx";
import { D, Gap, Head, Mark, NOFILL, St, Sx } from "./ui.tsx";

const q = () => shownSet() as InstanceQuestion;
const cap = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);
/** What a thing has to be, by how many categories there are: one of them, both, all three. */
const ALL: Record<number, string> = { 1: "one of them", 2: "both", 3: "all three" };
const allOf = (n: number) => ALL[n] || "all of them";
/** The answer that nothing is all of them, as the help and the result say it. */
const noneText = (n: number) => (n === 1 ? "there is none" : "nothing is " + allOf(n));
const said = () => String(u0().said || "").trim();
const ready = () => { const u = u0(); return !!u.none || !!said(); };
const focusField = () => { const i = document.getElementById("iin") as HTMLInputElement | null; if (i) i.focus({ preventScroll: true }); };
const blur = () => { const a = document.activeElement as HTMLElement | null; if (a && a.blur) a.blur(); };
const check = () => { blur(); checkInstance(); };

/** The categories as stops: a small diamond in the margin, the label beside it; `sm` smaller, once they are not the question. */
function CatStops({ s, sm = false }: { s: InstanceQuestion; sm?: boolean }) {
  const small = sm || s.labels.length > 2;
  return <>{s.labels.map((l) => <St d={<D cls="sub done" />} cls={"pairst icat" + (small ? " sm" : "")}><span class={"tn" + (l.length > 24 ? " long" : "")}>{l}</span></St>)}</>;
}

// the things the data knows whose names hold the words typed so far (two letters at least), for the field's list: the practice items, and the
// reference examples where this device has them (those it can check: with classes, or that do not exist); none while the suggestions are off
function suggestions(typed: string): string[] {
  const k = stripDet(spelled(typed));
  if (!state.instSuggest || k.length < 2) return [];
  const names = [...(state.DATA ? state.DATA.items.map((it) => it.n) : []), ...(state.EX ? state.EX.items.filter((ex) => ex.ne || ex.cls?.length).map((ex) => ex.n) : [])];
  const out: string[] = [];
  for (const n of names) if (!out.includes(n) && stripDet(spelled(n)).includes(k) && out.push(n) >= 8) break;
  return out;
}

/* ---------- 1 the categories and the answer ---------- */
function AskStep({ kb }: { kb: boolean }) {
  const u = u0(), s = q(), n = s.cats.length, ok = ready();
  // a new set: the field takes the cursor where there is a keyboard of keys, unless a field has it (as in Find a pair)
  useEffect(() => {
    if (!u.focusIn) return; u.focusIn = false;
    setTimeout(() => { const a = document.activeElement; if (state.ui === u && !(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) && !("ontouchstart" in window)) focusField(); });
  });
  const list = suggestions(u.said || "");
  const answer = u.none
    ? <St d={<D cls="sub yours" />} cls="sb done"><span class="lab">your answer</span><span class="pans nil">{noneText(n)}</span>
      <p class="help"><button type="button" onClick={() => { sayNothing(false); setTimeout(focusField); }}>write a thing instead</button></p></St>
    : <St d={<D cls="sub now" />} cls="sb now"><p class="qq">{n === 1 ? <>Name {<b class="conn">one of them</b>}.</> : <>Name something that is {<b class="conn">{allOf(n)}</b>}.</>}</p>
      <div class="fieldrow"><input class="pfield" id="iin" value={u.said} placeholder="write a thing" {...NOFILL} list={state.instSuggest ? "iin-things" : undefined} enterKeyHint="done"
        aria-label={"Something that is " + allOf(n) + ": " + s.labels.join(", ")}
        onInput={(e) => { writeInstance((e.currentTarget as HTMLInputElement).value); refreshPath(); }}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (ready()) check(); } }} /></div>
      {state.instSuggest ? <datalist id="iin-things">{list.map((v) => <option value={v} />)}</datalist> : null}
      <p class="help"><span class="htx">A thing, in a few words. </span><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { blur(); sayNothing(true); }}>{noneText(n)}</button></p></St>;
  return <>
    <Scroll>
      <Sx cls="cur first"><Gap h={14} /><Head d={<D cls="sec now" />} h="1 Instance" sub={n === 1 ? "something of this kind" : "something that is " + allOf(n)} /><Gap h={6} />
        <CatStops s={s} /><Gap h={4} />{answer}<Gap h={6} /></Sx>
      <Sx cls="ptail" />
    </Scroll>
    {kb ? null : <Foot aux={<SideStation kind="skip" act={skipPair} />}>
      {ok ? <Station name="Check" hint={u.none ? noneText(n) : "“" + said() + "”"} act={check} /> : <PreStation name="Check" hint={"write a thing, or say " + noneText(n)} />}
    </Foot>}
  </>;
}

/* ---------- the result ---------- */
const MARK = (a: boolean | null) => (a ? "ok" : a === false ? "no" : "pt");
/** Why the thing is, or is not, in a category: the steps of the data, a sentence. */
const because = (r: InstanceRow) => [r.reason ? cap(r.reason) + "." : "", r.why].filter(Boolean).join(" ");
/** A category for the thing: its label, the mark, the reason. */
const Row = ({ r }: { r: InstanceRow }) => <St d={<D cls={"sub " + MARK(r.answer)} />} cls={"sb exr catrow" + (r.answer === false ? " wrong" : "")}>
  <div class="line1"><b class="catp">{r.label}</b><Mark m={MARK(r.answer)} /></div>{because(r) ? <p class="xnote">{because(r)}</p> : null}</St>;

function verdictOf(s: InstanceQuestion, ir: InstanceResult, none: boolean): { v: "ok" | "no" | "pt"; word: string; sub: string } {
  const all = allOf(s.cats.length);
  if (ir.v === "ok") return { v: "ok", word: "Right", sub: none ? "nothing can be " + all : ir.thing + " is " + (s.cats.length === 1 ? catPhrase(state.CAT[s.cats[0]]) : all) };
  if (ir.v === "open") return { v: "pt", word: "Not checked", sub: ir.from ? "not every category is settled for it" : "the course data does not know it" };
  const miss = ir.rows.find((r) => r.answer === false);
  return { v: "no", word: "Not quite", sub: none ? "something is" : !s.possible ? "nothing can be " + all : miss ? "it is not among the " + miss.label : "not every category" };
}

function ResultStep() {
  const u = u0(), s = q(), ir = u.ir as InstanceResult, none = !!u.none, { v, word, sub } = verdictOf(s, ir, none);
  const note: ComponentChildren = ir.from === "example" ? "one of the course's reference examples"
    : ir.from || none ? null : s.possible ? "only the things of the practice list and the course's examples are checked here" : "whatever it is, nothing can be " + allOf(s.cats.length);
  return <>
    <Scroll>
      <Sx cls="walked first"><Gap h={14} /><Head d={<D cls="sec done" />} h="1 Instance" sub="checked" /><Gap h={4} /><CatStops s={s} sm /><Gap h={6} /></Sx>
      <Verdict v={v} word={word} sub={sub} />
      <Sx cls="walked"><St d={<D cls={"sub " + (v === "ok" ? "ok" : v)} />} cls="sb exr">
        <span class="lab">your answer</span><div class="line1"><span class={"ans2" + (none ? " nil" : v === "no" ? " no" : "")}>{none ? noneText(s.cats.length) : said()}</span></div>
        {note ? <p class="xnote">{note}</p> : null}</St></Sx>
      {ir.rows.length ? <Sx cls={ir.rows.some((r) => r.answer === false) ? "nop" : "okp"}><p class="pgh"><b>{ir.thing}</b><span>in each category</span></p>{ir.rows.map((r) => <Row r={r} />)}</Sx> : null}
      {s.apart ? <Sx cls="walked"><p class="pgh"><b>Why nothing is</b></p><St d={<D cls="sub done" />} cls="sb exr"><p class="xnote">{s.apart.why}</p></St></Sx> : null}
      {ir.example ? <Sx cls="walked"><p class="pgh"><b>For example</b><span>{ir.example.thing}</span></p>{ir.example.rows.map((r) => <Row r={r} />)}</Sx> : null}
      <ErrLines />
      <Sx cls="ptail" />
    </Scroll>
    <Foot><Station name="Next" hint="other categories" act={() => next()} /></Foot>
  </>;
}

/** The screen of Find an instance: its top bar and the step the attempt is at. */
export function instanceScreen(kb: boolean): { cls: string; node: ComponentChildren } {
  const u = u0(), top = <TopBar title="Find an instance" tools />;
  if (!shownSet()) return { cls: "", node: <>{top}<div class="pstatus"><p>There are no categories to ask about in the practice data.</p></div></> };
  if (u.checked && u.ir) return { cls: "done", node: <>{top}<ResultStep /></> };
  return { cls: ready() ? "ready" : "", node: <>{top}<AskStep kb={kb} /></> };
}
