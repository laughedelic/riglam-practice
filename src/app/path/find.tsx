// Find a pair on the Path: 1 the pair (the relation asked for, and two phenomena named for it), 2 the examples (examples.tsx), 3 the result
// (the pair with the relation asked for, whether it has it, a row for each case, the tutor's Why, the terms). The relation can be changed
// while the pair is not checked; a pick stays for the next pairs until Random. The steps are the classic page's (find/flow.js).
import type { ComponentChildren } from "preact";
import { useEffect } from "preact/hooks";
import { state } from "../state.js";
import { canAsk } from "../core/ask.js";
import { CELLS, ORDER, REL, lcRel, notaOf } from "../core/rel.js";
import { checkFind, chooseRel, editPair, usePair } from "../find/flow.js";
import { guided } from "../practice/guided.ts";
import { next } from "../practice/queue.js";
import { render } from "../shell/render.js";
import type { RelKey } from "../../ai-shared/relations.ts";
import { ExamplesStep, StripPair, examplesReady } from "./examples.tsx";
import { refreshPath } from "./index.tsx";
import { Choices, ErrLines, GuideNote, PairResult, SkipMark, StageOffer, Verdict, WhyRow, needsKey, pairOf, u0 } from "./parts.tsx";
import { Row, cases, isOpen, resultRows } from "./relations.tsx";
import { Scroll } from "./scroll.tsx";
import { nextName } from "./next.ts";
import { Foot, PreStation, SkipSide, Station, TopBar } from "./shell.tsx";
import { D, Fig, Gap, Head, St, Sx, nofillInput } from "./ui.tsx";

const relOf = () => u0().rel as RelKey;
const both = () => { const u = u0(); return !!u.wordA.trim() && !!u.wordB.trim(); };
const focus = (id: string) => { const i = document.getElementById(id); if (i) i.focus({ preventScroll: true }); };
const openRel = () => { const u = u0(); u.open = true; u.pstrip = false; render(); };

/** The relation asked for, as a stop: its figure in the margin, its name, what it says of A and B, and the way to change it. */
function Asked({ change = true }: { change?: boolean }) {
  const u = u0(), r = REL[relOf()];
  return <St d={<Fig k={relOf()} size="m" />} cls="asked"><span class="relnm"><b class="yours">{r.name}</b>{state.nota !== "codes" ? <span class="rsym">{notaOf(relOf())}</span> : null}</span>
    <span class="pq relg">{r.gloss("A", "B")}.{!u.checked && state.findRel ? " Your choice; it stays until Random." : ""}</span>
    {change ? <button type="button" class="pbtn" onClick={openRel}>{state.findRel ? "Change relation" : "Choose relation"}</button> : null}</St>;
}

/* ---------- 1 the pair ---------- */
function Word({ k, key2, what, last }: { k: "a" | "b"; key2: "wordA" | "wordB"; what: string; last: boolean }) {
  const u = u0();
  return <St d={<span class="ab">{k.toUpperCase()}</span>} cls="pairst pfw">
    <div class="fieldrow"><input class="pfield" id={"fw-" + k} value={u[key2]} placeholder={what + " phenomenon"} aria-label={what + " phenomenon, " + k.toUpperCase()} {...nofillInput()} list={guided("find") ? "fw-terms" : undefined}
      autoComplete="off" autoCapitalize="off" spellcheck={false} enterKeyHint={last ? "done" : "next"}
      onInput={(e) => { u[key2] = (e.currentTarget as HTMLInputElement).value; if (u.pairErr) u.pairErr = ""; refreshPath(); }}
      onKeyDown={(e) => { if (e.key !== "Enter") return; e.preventDefault(); if (!last) focus("fw-b"); else usePair(); }} /></div>
  </St>;
}
function PairStep({ kb }: { kb: boolean }) {
  const u = u0(), ok = both();
  // a new pair to name: the first field takes the cursor where there is a keyboard of keys, unless a field has it. The classic page
  // (find/screen.js) does so only when nothing has the focus; here it does also when Find a pair is opened from the roadmap, which gives the
  // focus back to the top bar as it closes, after this draw (so it waits for that)
  useEffect(() => {
    if (!u.focusA) return; u.focusA = false;
    setTimeout(() => { const a = document.activeElement; if (state.ui === u && !(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) && !("ontouchstart" in window)) focus("fw-a"); });
  });
  return <>
    <Scroll>
      <Sx cls={(both() ? "cur" : "gap") + " first"}><Gap h={14} /><Head d={<D cls="sec now" />} h="1 Pair" sub="two phenomena that relate like this" aside={state.findRel ? null : <SkipMark />} /><Gap h={6} />
        <Asked /><Gap h={6} />
        <Word k="a" key2="wordA" what="First" last={false} />
        <Word k="b" key2="wordB" what="Second" last />
        {u.pairErr ? <p class="pnoteline bad perr" role="alert">{u.pairErr}</p> : null}
        <p class="help fhelp">{guided("find") ? "Course terms or your own words." : "Whatever comes to mind."}</p>
        {guided("find") ? <datalist id="fw-terms">{(state.DATA ? state.DATA.cats : []).map((c: { labels: string[] }) => <option value={c.labels[0]} />)}</datalist> : null}
        <Gap h={6} /></Sx>
      <Sx cls="ptail" />
    </Scroll>
    {kb ? null : <Foot aux={state.findRel ? null : <SkipSide />}>
      {ok ? <Station name="Examples" hint="your pair" act={usePair} /> : <PreStation name="Examples" hint="name both first" />}
    </Foot>}
  </>;
}

/** The choice of the relation: Random, a different one each time (the default), or one of the five, which stays for the next pairs. */
function RelStep() {
  const u = u0();
  const items = [{ k: "rand", b: "Random", s: u.step === 0 ? "a different relation each time" : "a different relation for the next pairs", pressed: !state.findRel },
    ...ORDER.map((k) => ({ k, b: REL[k as RelKey].name, s: REL[k as RelKey].gloss("A", "B"), fig: k, sym: state.nota !== "codes" ? notaOf(k) : "", pressed: state.findRel === k }))];
  return <>
    <Scroll>
      <Sx cls="cur first"><Gap h={14} /><Head d={<D cls="sec now" />} h="Relation" sub="it stays until you pick Random" />
        <p class="pnoteline pfnote">{u.step === 0 ? "Pick the relation to work with. Your words stay." : "Pick another relation for this pair. Your examples stay, except one in a case the new relation leaves empty."}</p><Gap h={4} /></Sx>
      <Choices label="Relation to practice" items={items} onPick={(k) => chooseRel(k === "rand" ? null : k)} />
      <Sx cls="ptail" />
    </Scroll>
    <Foot><Station back name={u.step === 0 ? "Back to your pair" : "Back to the examples"} act={() => { u.open = false; render(); }} /></Foot>
  </>;
}

/* ---------- 2 the examples: what the strip shows unfolded ---------- */
function Named() {
  return <>
    <StripPair q="Your pair." />
    <Sx cls="walked"><Gap h={10} /><Asked change={false} />
      <St d={<span />}><span class="pbtns"><button type="button" class="pbtn" onClick={() => { u0().pstrip = false; editPair(); }}>Change the pair</button><button type="button" class="pbtn" onClick={openRel}>Change relation</button></span></St><Gap h={6} /></Sx>
  </>;
}

/* ---------- 3 the result ---------- */
function ResultStep() {
  const u = u0(), p = pairOf(), r = u.res, rel = relOf(), asked = REL[rel];
  const named = !p.own || p.relation !== rel, gl = (k: RelKey) => (p.own ? REL[k].gloss("A", "B") : REL[k].gloss(p.a, p.b));
  const rows = resultRows(rel), unc = rows.filter(isOpen).length, nbad = rows.filter((c) => r.cells[c].v === "bad").length;
  const ov: string = r.overall;
  const v = r.relOpen ? "pt" : !r.relOk || ov === "bad" ? "no" : ov === "part" ? "pt" : "ok";
  const word = r.relUns ? "Not settled" : r.relOpen ? (u.ctl ? "The tutor is judging" : canAsk() || needsKey() ? "Waiting for the tutor" : "Not checked") : !r.relOk ? "Not quite"
    : ov === "pend" ? "Right so far" : ({ ok: "Right", part: "Partly right" } as Record<string, string>)[ov] || "Not quite";
  const sub = r.relOpen ? "your own pair: the course data does not cover it" : !r.relOk ? "that pair is not " + lcRel(asked.name)
    : ov === "pend" ? unc + " unchecked" + (u.ctl ? " · the tutor is on it" : "") : ov === "part" ? cases(nbad) + " to look at" : "the pair and " + (rows.length === 1 ? "one example" : rows.length + " examples");
  const pm = r.relOpen ? "pt" : r.relOk ? "ok" : "no";
  const pairLine = r.relOpen
    ? (r.relUns ? "Whether " + p.a + " and " + p.b + " are " + lcRel(asked.name) + " is not settled. Ask again, or try another pair."
      : u.explained && !u.ctl ? "The tutor's answer did not say whether they are " + lcRel(asked.name) + ". Ask again."
      : "The course data does not cover this pair, so the tutor judges whether it is " + lcRel(asked.name) + "." + (canAsk() ? "" : " The tutor is not available here, so it stays open."))
    : r.relOk ? asked.name + ": " + gl(rel) + "."
    : named ? p.a + " and " + p.b + " are " + lcRel(REL[p.relation].name) + " (" + lcRel(gl(p.relation)) + "), not " + lcRel(asked.name) + "."
    : "The tutor says " + p.a + " and " + p.b + " are not " + lcRel(asked.name) + ".";
  return <>
    <Scroll>
      <PairResult mine={rel} ok={r.relOpen ? null : !!r.relOk} right={named && !r.relOpen ? p.relation : undefined} classes={!p.own} />
      <Verdict v={v} word={word} sub={sub} />
      <Sx cls="walked"><St d={<D cls={"sub " + pm} />} cls="sb exr pairv"><span class="lab">the pair</span><p class="xnote">{pairLine}</p></St></Sx>
      <Sx cls={nbad ? "nop" : "okp"}><Gap h={2} />{(r.relOpen ? CELLS.filter((c) => !REL[rel].empty.includes(c)) : rows).map((c) => <Row c={c} rel={rel} />)}</Sx>
      <WhyRow unc={unc} again={!!r.relOpen} todo={r.relOpen ? "judge your pair and explain" : undefined} />
      <StageOffer />
      <GuideNote />
      <ErrLines />
      <Sx cls="ptail" />
    </Scroll>
    <Foot><Station name={nextName("Next relation")} act={() => next()} /></Foot>
  </>;
}

/** The screen of Find a pair: its top bar and the step the attempt is at. */
export function findScreen(kb: boolean): { cls: string; node: ComponentChildren } {
  const u = u0();
  const top = <TopBar title="Find a pair" tools />;
  if (u.checked) return { cls: "done", node: <>{top}<ResultStep /></> };
  if (u.open) return { cls: "", node: <>{top}<RelStep /></> };
  if (u.step === 0) return { cls: both() ? "ready" : "", node: <>{top}<PairStep kb={kb} /></> };
  return { cls: examplesReady() ? "ready" : "", node: <>{top}<ExamplesStep kb={kb} title="Find a pair" step={2} rel={relOf()} full={<Named />} check={checkFind} /></> };
}
