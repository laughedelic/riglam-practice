// The Progression page on the Path, a page of settings lines (path/lines.tsx; the Design Lab's "The ring's sheet and the Progression page"): two sections, no line
// of stops. Difficulty: the pace, the negations and the depth, each with its quick choice (path/difficulty.tsx). Stages: Natural progression (the stages move
// up by themselves; off, they stay as the learner sets them), How the stages work, folded, and a line for each stage of the ladder (src/domain/stages.ts)
// with its ring at the right, the groups of three as headings between them. A tap on a stage's line unfolds what it introduces and its new terms, each with its
// mark; a term the learner has met opens its card on a page of its own, as its stop showed it, and Back comes to the stages again where they were. While
// Natural progression is off each stage has its switch left of its name, and the ones left out fade. Reset progression is the last line. The roadmap's foot
// and the top bar's ring sheet show the same rings in a row, stages 1 to 9 without stage 0 of everyday things (`StageRings`): a tap on one opens the page with
// that stage unfolded. The page is the one home of the progression and the difficulty: the practice options hold neither.
// The page stands in for Review (state.pathProg; setTab closes it), and Back from it goes where it was opened from: the roadmap or the exercise.
import type { ComponentChildren } from "preact";
import { useLayoutEffect } from "preact/hooks";
import { state } from "../state.js";
import { stopTimer } from "../debate/flow.js";
import { hasDef } from "../practice/terms.js";
import { exName } from "../shell/exercises.js";
import { toggleMenu } from "../shell/menu.js";
import { moves } from "../shell/motion.js";
import { render } from "../shell/render.js";
import { setTab, switchTo } from "../shell/tabs.js";
import { stopCat } from "../../domain/intro.ts";
import type { StageMark, TermMark } from "../../domain/intro.ts";
import { LADDER_TOP, RING_STAGES, STAGES, ladderTop, toggleStage } from "../../domain/stages.ts";
import type { DataIndex } from "../../ai-shared/lookup.ts";
import type { ProgressionAt } from "../types.ts";
import { resetProgress } from "../practice/progress.ts";
import { movesUp, setMovesUp } from "../practice/stage-offer.ts";
import { setStages } from "../shell/stages.js";
import { DifficultyLines } from "./difficulty.tsx";
import { Line } from "./lines.tsx";
import { HowStages } from "./progress.tsx";
import { StageRing, marksOf, rightOf, ringLabel, stageWhere } from "./rings.tsx";
import { TopBar } from "./shell.tsx";
import { FitTerm, StopSections } from "./stop-def.tsx";
import { isOpen, toggleOpen } from "./stored.tsx";
import { Names } from "./terms.tsx";
import { D, Gap, Head, Icon, St, Sx, Toggle } from "./ui.tsx";

/** The roadmap's slide (37-path-panels.css), and a little more: the page is out of sight by then. */
const SLIDE_MS = 420;
/** The stages of the ladder, stage 0 of everyday things first: those after its last are the layers of depth, Depth in the Difficulty section (src/domain/stages.ts, LADDER_TOP). */
const LADDER = STAGES.filter((s) => s.n <= LADDER_TOP);

/** `openProgression`'s stage for the Stages section at the top of the page, the way to choose the stages (Natural progression and the stages under it). */
export const AT_STAGES = -2;
/**
 * Opens the page in place of Review, with a stage unfolded and in view when one is named (-1: the top of the page, the difficulty; AT_STAGES: the stages).
 * `from`: the roadmap's rings, or the top bar's ring sheet and the other links inside an exercise.
 */
export function openProgression(stage: number, from: ProgressionAt["from"]) {
  const p = state.pathProg, tab = state.tab === "review" && p ? p.tab : state.tab;   // (opened again while the page is on its way back under the roadmap: what is under it stays)
  setTab("review");
  state.pathProg = { from, tab, at: stage, term: "", y: -1 };
  state.resetAsk = "";
  if (stage >= 0) state.pathOpen["pg:" + stage] = true;
  render();
}
/**
 * Back, from the top bar's chevron or the system Back (shell/history.js): a term's card goes back to the stages; the page goes where it was opened from. Opened
 * from the ring sheet, that is the exercise. Opened from the roadmap, the page slides away as an exercise does and shows the roadmap, and once it is out of
 * sight the screen that was under the roadmap before comes back under it (its Continue goes there).
 */
export function progBack() {
  const p = state.pathProg; if (!p) return;
  if (p.term) {     // focus goes back to the term that opened the card
    const from = '[data-term="' + p.term + '"]';
    p.term = ""; render();
    document.querySelector<HTMLElement>("#path .pprog " + from)?.focus({ preventScroll: true });
    return;
  }
  if (p.from === "sheet") { setTab(p.tab); if (state.pathProg === p) { state.pathProg = null; render(); } return; }
  state.fromRoad = false;     // back on the roadmap: the screen under it is an exercise again (shell/history.js)
  toggleMenu(true);
  const under = () => {
    if (state.pathProg !== p || !state.menuOpen) return;    // the roadmap was left, or the page opened again, in the meantime
    state.pathProg = null;
    if (state.tab !== p.tab && state.mode === "quiz") { switchTo(p.tab); stopTimer(); }    // its clock starts when the roadmap closes (toggleMenu)
    render();
    document.querySelector<HTMLElement>("#path .road [aria-current=page]")?.focus({ preventScroll: true });
  };
  if (moves()) setTimeout(under, SLIDE_MS); else under();
}
/** Focus on the Back of the page that came in over the stages (a term's card), as on any page that comes in. */
const focusBack = (page: string) => document.querySelector<HTMLElement>("#path ." + page)?.previousElementSibling?.querySelector<HTMLElement>(".tstn")?.focus({ preventScroll: true });
function openTerm(id: string) {
  const p = state.pathProg, pg = document.querySelector<HTMLElement>("#path .pprog"); if (!p) return;
  p.y = pg ? pg.scrollTop : 0; p.term = id; render(); focusBack("pprog-t");
}
/** Opens the page at its top, the Difficulty section, from a result's offer or a station: in place of Review, and Back goes to the exercise. */
export const openDifficulty = () => openProgression(-1, "sheet");
/** Opens the page at its Stages section, where Natural progression and the stages are set. */
export const openStages = () => openProgression(AT_STAGES, "sheet");

/**
 * The stages of course terms as a row of rings, in the roadmap's foot and on the top bar's ring sheet (`from`), the one the learner is on with a halo; a tap on
 * a ring opens the Progression page with that stage unfolded.
 */
export function StageRings({ from = "road" }: { from?: ProgressionAt["from"] }) {
  const top = ladderTop(state.stages);
  return <div class="rstages" role="group" aria-label={"The stages: stage " + top + " of " + LADDER_TOP}>
    <div class="tup-rings" style={"--n:" + RING_STAGES.length}>{RING_STAGES.map((s) =>
      <button type="button" class={"tup-rg " + stageWhere(s.n, top)} aria-label={ringLabel(s.n, marksOf(s.n)) + ". Progression"} onClick={() => openProgression(s.n, from)}>
        <StageRing n={s.n} top={top} /></button>)}</div>
  </div>;
}

/** A term's mark as the node of its card (a green or a red diamond, an open one while it is not answered yet), and the words for it. */
const NODE: Record<TermMark, string> = { ok: "ok", miss: "no", slip: "no", met: "nil", wait: "" };
const SAYS: Record<TermMark, string> = { ok: "last answer right", miss: "not right yet", slip: "was right, last answer wrong", met: "not asked yet", wait: "its stop is still to come" };
const termOf = (id: string) => (state.DATA ? stopCat(state as unknown as DataIndex, id) : null);

/** The new terms of a stage with their marks: one the learner has met opens its card; one whose stop is still to come is only named. */
const Terms = ({ marks }: { marks: readonly StageMark[] }) => <ul class="tterms prg-tl">{marks.map((t) => {
  const name = termOf(t.id)?.term || t.id;
  return <li class={t.mark}><i class={"tmk " + t.mark} aria-hidden="true" />
    {t.mark === "wait" ? <span class="ttn">{name}</span>
      : <button type="button" class="ttn prg-tb" data-term={t.id} aria-label={name + ", " + SAYS[t.mark] + ". Its card"} onClick={() => openTerm(t.id)}><span lang="en">{name}</span><Icon n="chev" /></button>}</li>;
})}</ul>;

/** How a stage stands: its new terms answered right, or how many it brings while it is ahead. */
function standing(n: number, top: number): string {
  const m = marksOf(n), where = stageWhere(n, top);
  if (!m.length) return where === "ahead" ? "longer things, no new terms" : "no new terms";
  if (where === "ahead") return m.length + (m.length === 1 ? " new term" : " new terms");
  return (where === "now" ? "now · " : "") + rightOf(m) + " of " + m.length + " right";
}
/**
 * A line that unfolds what it holds under it, the whole line its button (How the stages work, a stage): a switch left of its name when it has one, and at
 * the right a chevron, or what `end` gives (a stage's ring).
 */
function FoldLine({ k, title, sub, sw, end, cls = "", stage, children }: { k: string; title: string; sub?: string; sw?: { on: boolean; toggle: () => void; off?: boolean }; end?: ComponentChildren; cls?: string; stage?: number; children?: ComponentChildren }) {
  const open = isOpen(k);
  return <>
    <div class={"ol olfold" + (open ? " open" : "") + (sw && !sw.on ? " off" : "") + cls}>
      <button type="button" class="olhit" data-stage={stage} aria-expanded={open ? "true" : "false"} aria-label={title + (sub ? ", " + sub : "")} onClick={() => toggleOpen(k)} />
      {sw ? <button type="button" class="olsw" role="switch" aria-checked={sw.on ? "true" : "false"} aria-disabled={sw.off ? "true" : undefined} aria-label={title} onClick={sw.toggle}><Toggle on={sw.on} /></button> : <span class="olsw" />}
      <span class="oltx"><b>{title}</b>{sub ? <small>{sub}</small> : null}</span>
      {end || <span class="olchev" aria-hidden="true"><Icon n="chev" /></span>}
    </div>
    {open ? <div class="olfoldc" data-fold={stage}>{children}</div> : null}
  </>;
}
/** The groups of three stages, by the first stage of each: its numeral. */
const GROUPS = ["I", "II", "III"], groupNo = (n: number) => GROUPS[STAGES.filter((s) => s.group && s.n <= n).length - 1];
/**
 * A stage: its name and how it stands, its ring at the right; a tap unfolds what it introduces and its new terms. While Natural progression is off, its switch
 * (the last one on stays on). The first stage of a group of three comes under the group's heading.
 */
function StageLine({ n, name, adds, group, top, pick }: { n: number; name: string; adds: string; group?: string; top: number; pick: boolean }) {
  const m = marksOf(n), on = state.stages.includes(n), where = standing(n, top);
  return <>
    {group ? <h5 class="prg-gh">{groupNo(n) + " · " + group}</h5> : null}
    <FoldLine k={"pg:" + n} stage={n} cls={" prgl " + stageWhere(n, top)} title={"Stage " + n + " · " + name} sub={pick && !on ? "off · " + where.replace(/^now · /, "") : where}
      sw={pick ? { on, off: on && state.stages.length === 1, toggle: () => setStages(toggleStage(state.stages, n)) } : undefined} end={<span class="prgd"><StageRing n={n} top={top} /></span>}>
      <div class="wtext tup prg-p"><p>{adds}</p>{m.length ? <Terms marks={m} /> : null}</div>
    </FoldLine>
  </>;
}
/** Reset progression, asked to confirm. */
function Reset() {
  const ask = state.resetAsk, to = (v: "" | "ask") => { state.resetAsk = v; render(); };
  return <Line title="Reset progression" sub={ask === "done" ? "Done: stage 0, and the course terms come one at a time again." : "Back to stage 0 with no course term met, negations off and every exercise guided again, on every device signed in to your account. Your answers, their statistics and your settings stay."}>
    {ask === "ask" ? <span class="pvline2"><button type="button" class="pbtn" onClick={() => { state.resetAsk = "done"; resetProgress(); }}>Reset</button><button type="button" class="pbtn quiet" onClick={() => to("")}>Keep it</button></span>
      : ask === "" ? <span class="pvline2"><button type="button" class="pbtn quiet" onClick={() => to("ask")}>Reset progression</button></span> : null}</Line>;
}

/** The page. Opened at a stage, its unfolded line comes into view, once; at the stages, their section; back from a term's card, the page is where it was. */
function Stages({ p }: { p: ProgressionAt }) {
  const top = ladderTop(state.stages), all = LADDER.flatMap((s) => marksOf(s.n)), nat = movesUp();
  useLayoutEffect(() => {
    const pg = document.querySelector<HTMLElement>("#path .pprog"); if (!pg) return;
    if (p.y >= 0) { pg.scrollTop = p.y; p.y = -1; return; }
    const at = p.at; if (at === -1) return;
    p.at = -1;
    const box = pg.getBoundingClientRect();
    if (at === AT_STAGES) { const h = pg.querySelector<HTMLElement>(".prg-st"); if (h) pg.scrollTop += h.getBoundingClientRect().top - box.top; return; }
    const row = pg.querySelector<HTMLElement>('[data-stage="' + at + '"]')?.closest<HTMLElement>(".ol"), end = pg.querySelector<HTMLElement>('[data-fold="' + at + '"]') || row;
    if (!row || !end) return;
    const over = end.getBoundingClientRect().bottom + 16 - box.bottom;
    if (over > 0) pg.scrollTop += Math.min(over, row.getBoundingClientRect().top - box.top - 8);
  });
  return <>
    <TopBar title="Progression" back={{ label: p.from === "road" ? "Back to the roadmap" : "Back to " + exName(p.tab), act: progBack }} />
    <div key="stages" class="ppage prv pprog sfull">
      <section class="sgrp"><h4 class="sgh">Difficulty</h4><DifficultyLines /></section>
      <section class="sgrp prg-st"><h4 class="sgh">Stages</h4>
        <p class="sgnote">{"stage " + top + " of " + LADDER_TOP + (all.length ? " · " + rightOf(all) + " of " + all.length + " terms right" : "")}</p>
        <Line title="Natural progression" sub={nat ? "the next stage comes with its first new term" : "off: the stages stay as you set them below"} sw={{ on: nat, toggle: () => setMovesUp(!nat) }} />
        <FoldLine k="pg:how" title="How the stages work" cls=" prg-how"><div class="wtext tup prg-p"><HowStages diff="Depth, above" /></div></FoldLine>
        {LADDER.map((s) => <StageLine n={s.n} name={s.name} adds={s.adds} group={s.group} top={top} pick={!nat} />)}
      </section>
      <section class="sgrp sgend"><Reset /></section>
      <div style={{ height: "30px" }} />
    </div>
  </>;
}
/** A term's card, as its stop showed it, on a page of its own over the stages: its stage and its mark above it. */
function TermCard({ id }: { id: string }) {
  const c = termOf(id), name = (c && c.term) || id, def = !!state.DATA && hasDef(state.DATA.terms[name]);
  const s = STAGES.find((x) => marksOf(x.n).some((t) => t.id === id)), mark = (s && marksOf(s.n).find((t) => t.id === id)?.mark) || "met";
  return <>
    <TopBar title="Progression" back={{ label: "Back to Progression", act: progBack }} />
    <div key="term" class="ppage prv pprog-t">
      <Sx cls="cur first tstop"><Gap h={14} /><Head d={<D cls="sec tsd" />} h={s ? "Stage " + s.n : "Term"} sub={(s ? s.name + " · " : "") + SAYS[mark]} /><Gap h={4} />
        <St d={<D cls={"sub " + NODE[mark]} />} cls="stm thing"><FitTerm text={name} /><Names term={name} /></St>
        <StopSections s={{ cat: id, why: "again" }} name={name} def={def} />
        {!def && state.unlock ? <p class="tstop-key">Its definition comes with the Magic Key from your study group’s link.</p> : null}
        <Gap h={6} /></Sx>
      <div style={{ height: "30px" }} />
    </div>
  </>;
}

export function ProgressionPage() {
  const p = state.pathProg!;
  if (p.term) return <TermCard id={p.term} />;
  return <Stages p={p} />;
}
