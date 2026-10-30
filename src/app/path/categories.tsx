// Categories on the Path: 1 the categories (the thing, and the categories lifted over a rule onto the path (threshold.tsx), or one at a time with yes and no; the check
// splits them into what applies and what does not, each with the reason), 2 the most specific of those that apply (one tap), 3 the line from
// the most specific up, and the offer of another stage when one is due. The tutor has no part here. The steps are categories/flow.js's; the reference examples it draws from come with the Magic Key.
import { type ComponentChildren, render } from "preact";
import { state } from "../state.js";
import { advanceCategories, checkCategories, continueCategories, pickCategory, resetCategories, sayCategory, tickCategory } from "../categories/flow.js";
import { next } from "../practice/queue.js";
import { toggleOpts } from "../shell/options.js";
import type { DataIndex } from "../../ai-shared/lookup.ts";
import { gradePlace, placeNarrow, type PlaceGraded, type PlaceNarrow, type PlaceQuestion, type PlaceResult, type PlaceRow } from "../../domain/place.ts";
import { refreshPath } from "./index.tsx";
import { Choices, ErrLines, SkipMark, StageOffer, Verdict, pickThen, u0 } from "./parts.tsx";
import type { ScanPlan } from "./scan.tsx";
import { Scroll } from "./scroll.tsx";
import { Threshold } from "./threshold.tsx";
import { nextKind, nextName } from "./next.ts";
import { Foot, PreStation, SkipSide, Station, TopBar } from "./shell.tsx";
import { D, Gap, Head, Mark, St, Sx } from "./ui.tsx";

const q = () => state.cur!.q as PlaceQuestion;
const cap = (t: string) => t[0].toUpperCase() + t.slice(1);
/** Why a category is, or is not, one of the thing's: the steps of the data, a sentence. A reason that only says the category again ("it is not furniture", where the data has
 *  no steps for it) is left out: it tells nothing the row does not. */
const because = (row: PlaceRow) => {
  const echo = row.reason === "it is " + row.phrase || row.reason === "it is not " + row.phrase;
  return [row.reason && !echo ? cap(row.reason) + "." : "", row.why].filter(Boolean).join(" ");
};

/** The thing asked about, as the first stop: its name alone (no exercise names the stage of what it asks). */
function Thing() {
  return <St d={<D cls="sub done" />} cls="stm thing"><span class="cs" lang="en">{q().thing.n}</span></St>;
}
/** One category with the answer: its mark, what the learner did, and the reason; a right one folds to its line, a tap opens the reason. */
function CatRow({ row, one }: { row: PlaceGraded; one: boolean }) {
  const u = u0(), ok = row.ok, why = because(row), open = !ok || !!(u.pcat && u.pcat[row.cat]);
  const tag = row.picked && !row.answer ? (one ? "you said yes" : "you ticked") : !row.picked && row.answer ? (one ? "you said no" : "you missed") : "";
  const body = <div class={"st sb exr catrow" + (ok ? "" : " wrong")} data-mk={row.cat}><D cls={"sub " + (ok ? "ok" : "no")} /><div class="ptx">
    <div class="line1"><b class="catp">{row.phrase}</b><Mark m={ok ? "ok" : "no"} />{tag ? <span class="ctag">{tag}</span> : null}</div>
    {why && open ? <p class="xnote">{why}</p> : null}</div></div>;
  if (ok && why) return <button type="button" class="sbb" aria-expanded={open ? "true" : "false"} onClick={() => { u.pcat = { ...(u.pcat || {}), [row.cat]: !open }; refreshPath(); }}>{body}</button>;
  return body;
}
/** The check of step 1: the categories in two groups, what applies and what does not, the wrong ones first. */
function Split({ one }: { one: boolean }) {
  const g = u0().g1;
  return <>{[true, false].map((yes) => {
    const rows = (g.rows as PlaceGraded[]).filter((r) => r.answer === yes), wrong = rows.filter((r) => !r.ok).length;
    const sub = yes ? (rows.length ? "you found " + (rows.length - wrong) + " of " + rows.length : "none of these applies")
      : wrong ? "you " + (one ? "said yes to " : "ticked ") + wrong + " of these by mistake" : one ? "you said no to all of these" : "you left all of these unticked";
    return <Sx cls={wrong ? "nop" : "okp"}><p class="pgh"><b>{yes ? "What applies" : "What does not apply"}</b><span>{sub}</span></p>
      {rows.slice().sort((a, b) => Number(a.ok) - Number(b.ok)).map((r) => <CatRow row={r} one={one} />)}</Sx>;
  })}</>;
}
/** The verdict of step 1 as the result's node says it: right only when every category is where it belongs (as the progression counts it, categories/flow.js),
 *  else not quite, with what went wrong each way. */
function verdictOf(g: PlaceResult): { v: "ok" | "no"; word: string; sub: string } {
  if (g.ok) return { v: "ok", word: "Right", sub: "" };
  const up = g.rows.filter((r) => r.picked && !r.answer).length, down = g.rows.filter((r) => !r.picked && r.answer).length;
  return { v: "no", word: "Not quite", sub: [up ? up + " selected wrong" : "", down ? down + " missed" : ""].filter(Boolean).join(" · ") };
}
/** The line beside the verdict of step 1: what went wrong, and whether step 2 comes (it is not asked when nothing is left to narrow, categories/flow.js). */
function checkedSub(sub: string, last: boolean): string {
  return [sub, last ? "step 2 is not asked" : "step 1 of 2"].filter(Boolean).join(" · ");
}
/** The room the result's node takes under the thing, for the scan to open there (scan.tsx `ScanPlan.room`): the result's verdict, drawn out of sight at the page's width and
 *  measured, so that the scanner settles where the node will be and the categories under it stand where the result puts them. */
const AFTER_THING = 6;
function roomOf(v: "ok" | "no", word: string, sub: string) {
  return (pc: HTMLElement) => {
    const box = document.createElement("div");
    box.style.cssText = `position:absolute; left:0; top:0; width:${pc.clientWidth}px; visibility:hidden; pointer-events:none`;
    pc.append(box); render(<Verdict v={v} word={word} sub={sub} />, box);
    const band = box.querySelector(".vband"), d = box.querySelector(".pvline .d.big"), b = band && band.getBoundingClientRect(), r = d && d.getBoundingClientRect();
    render(null, box); box.remove();
    return b && r ? { h: AFTER_THING + b.height, at: AFTER_THING + r.top + r.height / 2 - b.top } : null;
  };
}
/** What the scan of the Check marks on its way up (scan.tsx): every category where it stands, the ones over the rule first (the page's order), graded as the check will
 *  grade them; it ends under the thing, where the result's node will be. The heading stays, its diamond turned to ink. */
function scanPlan(): ScanPlan {
  const t = q(), u = u0(), g = gradePlace(t, u.ticked), by = new Map(g.rows.map((r) => [r.cat, r]));
  const order = [...t.rows.filter((r) => u.ticked.includes(r.cat)), ...t.rows.filter((r) => !u.ticked.includes(r.cat))];
  const { v, word, sub } = verdictOf(g), line = checkedSub(sub, !placeNarrow(state as unknown as DataIndex, t, () => 0));
  return { cases: order.map((r) => (by.get(r.cat)!.ok ? "ok" : "no")), rel: v, v, word, sub: line, stop: ".cstop", rows: ".thold .crow", room: roomOf(v, word, line) };
}
/** One category of the result in the threshold's form: on the line when it is over the rule, beside it under the rule, with its mark, what the learner did and the reason. */
function ResRow({ row, on }: { row: PlaceGraded; on: boolean }) {
  const u = u0(), ok = row.ok, why = because(row), open = !ok || !!(u.pcat && u.pcat[row.cat]);
  const tag = !row.picked && row.answer ? "you left it under" : "";
  const cls = "crow cres" + (on ? " on" : "") + (ok ? "" : " wrong");
  const inner = <><span class="mc"><D cls={"sub " + (ok ? "ok" : "no")} /></span><span class="ct"><span class="line1"><b>{row.phrase}</b><Mark m={ok ? "ok" : "no"} />{tag ? <span class="ctag">{tag}</span> : null}</span>
    {why && open ? <span class="xnote">{why}</span> : null}</span></>;
  if (ok && why) return <button type="button" class={cls} data-mk={row.cat} aria-expanded={open ? "true" : "false"} onClick={() => { u.pcat = { ...(u.pcat || {}), [row.cat]: !open }; refreshPath(); }}>{inner}</button>;
  return <div class={cls} data-mk={row.cat}>{inner}</div>;
}
/** The check of step 1 in the threshold's form, the categories where the learner left them (the Design Lab's B, "As you left them"): over the rule what was lifted, under it the rest,
 *  each with its mark; the tag and the reason under a wrong one say which side it belongs on. */
function Settled() {
  const rows = u0().g1.rows as PlaceGraded[], up = rows.filter((r) => r.picked), down = rows.filter((r) => !r.picked);
  return <div class="thold tres">
    <Sx cls={"walked" + (up.length ? "" : " thempty")}><span class="thh" data-mv="above" aria-hidden="true">is</span>{up.length ? <div class="chs up">{up.map((r) => <ResRow row={r} on />)}</div> : null}</Sx>
    <Sx cls="walked thx"><span class="thl" data-mv="rule" /></Sx>
    {down.length ? <Sx cls="walked"><span class="thh" data-mv="below" aria-hidden="true">not</span><div class="chs down">{down.map((r) => <ResRow row={r} on={false} />)}</div></Sx> : null}
  </div>;
}
/** What step 2 says when it was not asked. */
function skipNote() {
  const t = q();
  if (t.thing.ne) return "It does not exist, so it is in none of these and there is nothing to narrow.";
  return t.rows.filter((r) => r.answer).length < 2 ? "Only one of these applies, so there is nothing to narrow." : "The categories that apply do not lie on one line, so none is the most specific.";
}
/* ---------- 1 the categories ---------- */
function TickStep() {
  const u = u0(), t = q(), n = u.ticked.length;
  return <>
    <Scroll>
      <Sx cls="cur first"><Gap h={14} /><Head d={<D cls="sec now" />} h="1 Categories" sub="which of these is it?" aside={<SkipMark />} /><Gap h={6} /><Thing />
        <div class="cstop" data-keep="stay" aria-hidden="true"><i class="d" /></div></Sx>
      <Threshold label="Categories the thing is in" items={t.rows.map((r, i) => ({ k: r.cat, b: r.phrase, key: String(i + 1) }))} picked={u.ticked} onPick={tickCategory} onReset={resetCategories} />
      <Sx cls="ptail" />
    </Scroll>
    <Foot aux={<SkipSide />}>
      <Station kind="chk" name="Check" hint={!n ? "none of these" : n === 1 ? "one category" : n + " categories"} act={() => checkCategories()} scan={scanPlan} />
    </Foot>
  </>;
}
function OneStep() {
  const u = u0(), t = q(), row = t.rows[u.i];
  return <>
    <Scroll>
      <Sx cls="cur first"><Gap h={14} /><Head d={<D cls="sec now" />} h="1 Categories" sub={(u.i + 1) + " of " + t.rows.length + " · is it?"} aside={<SkipMark />} /><Gap h={6} /><Thing />
        {t.rows.slice(0, u.i).map((r) => { const said = !!u.said[r.cat], ok = said === r.answer;
          return <St d={<D cls={"sub " + (ok ? "ok" : "no")} />} cls={"sb exr catrow" + (ok ? "" : " wrong")}><div class="line1"><b class="catp">{r.phrase}</b><span class="ctag">{said ? "yes" : "no"}</span><Mark m={ok ? "ok" : "no"} /></div>
            {ok ? null : <p class="xnote">{because(r)}</p>}</St>; })}
        <St d={<D cls="sub now" />} cls="sb now"><p class="qst" id="catq">Is {t.thing.n} {row.phrase}?</p></St><Gap h={4} /></Sx>
      <Choices label={"Is " + t.thing.n + " " + row.phrase + "?"} items={[{ k: "y", b: "Yes", key: "Y" }, { k: "n", b: "No", key: "N" }]} onPick={(k) => sayCategory(k === "y")} />
      {u.i < t.rows.length - 1 ? <Sx cls="gap later"><St d={<D cls="sub" />} cls="sb later"><span class="lab">{t.rows.length - u.i - 1} more</span></St></Sx> : null}
      <Sx cls={"ptail" + (u.i < t.rows.length - 1 ? " dtail" : "")} />
    </Scroll>
    <Foot aux={<SkipSide />}><PreStation name="Check" hint="answer each one" /></Foot>
  </>;
}
/** Step 1 checked: the verdict on it, the two groups, and the way on (step 2, or the next thing when step 2 is not asked). */
function CheckedStep() {
  const u = u0(), g = u.g1, n: PlaceNarrow | null = u.narrow, one = u.ask !== "all";
  const { v, word, sub } = verdictOf(g);
  return <>
    <Scroll>
      <Sx cls="walked first"><Gap h={14} /><Head d={<D cls="sec done" />} h="1 Categories" sub="which of these is it?" /><Gap h={6} /><Thing /><Gap h={AFTER_THING} /></Sx>
      <Verdict v={v} word={word} sub={checkedSub(sub, !!u.checked)} />
      {one ? <Split one /> : <Settled />}
      {u.checked ? <Sx cls="walked"><p class="pnoteline pfnote">{skipNote()}</p></Sx> : !g.ok && n ? <Sx cls="walked"><p class="pnoteline pfnote">Step 2 uses the corrected set: {n.options.map((r) => r.phrase).join(", ")}.</p></Sx> : null}
      {u.checked ? <StageOffer /> : null}
      <ErrLines />
      <Sx cls="ptail" />
    </Scroll>
    <Foot>{u.checked ? <Station name={nextName("Next thing")} kind={nextKind()} act={() => next()} /> : <Station kind="ex" name="Continue" hint="the most specific" act={continueCategories} />}</Foot>
  </>;
}

/* ---------- 2 the most specific ---------- */
function NarrowStep() {
  const u = u0(), n: PlaceNarrow = u.narrow, g = u.g1;
  return <>
    <Scroll>
      <Sx cls="walked first"><Gap h={14} /><Head d={<D cls="sec done" />} h="1 Categories" sub={g.ok ? "all right" : g.right + " of " + g.rows.length + " right"} /><Gap h={6} /><Thing /><Gap h={8} /></Sx>
      <Sx cls="cur"><Head d={<D cls="sec now" />} h="2 Most specific" sub="which is the narrowest?" aside={<SkipMark />} /><Gap h={4} /></Sx>
      <Choices label="The most specific category" slide items={n.options.map((r, i) => ({ k: r.cat, b: r.phrase, key: String(i + 1) }))} picked={u.pk} onPick={(k) => pickThen(k, () => pickCategory(k))} />
      <Sx cls="ptail" />
    </Scroll>
    <Foot aux={<SkipSide />}><PreStation name="Result" hint="pick the most specific" /></Foot>
  </>;
}

/* ---------- 3 the result ---------- */
function ResultStep() {
  const u = u0(), g = u.g2, n: PlaceNarrow = u.narrow, g1 = u.g1, best = n.line[0].phrase;
  const v = u.grade === "ok" ? "ok" : u.grade === "part" ? "pt" : "no";
  return <>
    <Scroll>
      <Sx cls="walked first"><Gap h={14} /><Head d={<D cls="sec done" />} h="1 Categories" sub={g1.ok ? "all right" : g1.right + " of " + g1.rows.length + " right"} /><Gap h={6} /><Thing /><Gap h={6} /></Sx>
      <Verdict v={v} word={g.ok ? (g1.ok ? "Right" : "Partly right") : "Not the most specific"} sub={g.ok ? g.picked.phrase + " is the most specific" + (g1.ok ? "" : "; step 1 had mistakes") : "true of it, but not the narrowest"} >
        {g.ok ? null : <St d={<span />} cls="pwhat"><p class="conf">“{best}” is more specific than “{g.picked.phrase}”: it is {g.upTo.map((s: { phrase: string }) => s.phrase).join(", which is ")}.</p></St>}
      </Verdict>
      <Sx cls="walked"><p class="pgh"><b>The line</b><span>from the most specific to the most general</span></p>
        {n.line.map((s, i) => { const mine = s.phrase === g.picked.phrase;
          return <St d={<D cls={"sub " + (i === 0 ? "ok" : mine ? "no" : s.option ? "done" : "")} />} cls={"sb pline" + (s.option ? " opt" : "")}>
            <b class="catp">{s.phrase}</b>{mine ? <span class="ctag">{g.ok ? "your pick" : "you picked"}</span> : s.option ? <span class="ctag">an option</span> : null}</St>; })}</Sx>
      <StageOffer />
      <ErrLines />
      <Sx cls="ptail" />
    </Scroll>
    <Foot><Station name={nextName("Next thing")} kind={nextKind()} act={() => next()} /></Foot>
  </>;
}

/** The screen of Categories: its top bar and the step the attempt is at. */
export function categoriesScreen(): { cls: string; node: ComponentChildren } {
  if (!state.cur!.q && state.EX) advanceCategories();      // the examples arrived after the page started: draw the first thing
  const u = u0(), top = <TopBar title="Categories" tools />;
  if (!state.cur!.q) return { cls: "", node: <>{top}<div class="pstatus"><p>Categories uses the reference examples, which this device does not hold yet.</p>
    <p>They come with the Magic Key, in <button type="button" class="plnk" onClick={() => toggleOpts(true)}>Settings</button>.</p></div></> };
  if (u.step === 0) return { cls: u.ask === "one" ? "" : "ready", node: <>{top}{u.ask === "one" ? <OneStep /> : <TickStep />}</> };
  if (u.step === 1) return { cls: u.checked ? "done" : "ready", node: <>{top}<CheckedStep /></> };
  if (u.step === 2) return { cls: "", node: <>{top}<NarrowStep /></> };
  return { cls: "done", node: <>{top}<ResultStep /></> };
}
