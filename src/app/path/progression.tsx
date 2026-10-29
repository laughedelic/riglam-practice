// The Progression page: the stages of the ladder (src/domain/stages.ts) as stops on one line, each stage's ring the node (path/rings.tsx), with where it
// stands under its name. A tap on a stage unfolds what it introduces and its new terms, each with its mark; a term the learner has met opens its card on a
// page of its own, as its stop showed it (the names, the definition, where it sits, the examples), and Back comes to the stages again where they were. A
// fold at the top says how the stages work. Above them, Difficulty, a heading as Stages is, says how the pace, the negations and the depth stand, and
// opens their page (path/difficulty.tsx). The roadmap's foot shows the same rings in a row (`StageRings`): a tap on one opens the page with that stage unfolded, and the link under the top bar's ring does so with the stage the learner is on.
// The page stands in for Review (state.pathProg; setTab closes it), and Back from it goes where it was opened from: the roadmap or the exercise.
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
import { LADDER_TOP, STAGES, ladderTop } from "../../domain/stages.ts";
import type { DataIndex } from "../../ai-shared/lookup.ts";
import type { ProgressionAt } from "../types.ts";
import { DifficultyPage, difficultyLine } from "./difficulty.tsx";
import { flow } from "./progress.tsx";
import { StageRing, marksOf, rightOf, ringLabel, stageWhere } from "./rings.tsx";
import { TopBar } from "./shell.tsx";
import { FitTerm, StopSections } from "./stop-def.tsx";
import { isOpen, toggleOpen } from "./stored.tsx";
import { Names } from "./terms.tsx";
import { D, Gap, Head, Icon, St, Sx } from "./ui.tsx";

/** The roadmap's slide (37-path-panels.css), and a little more: the page is out of sight by then. */
const SLIDE_MS = 420;
/** The stages of the ladder: those after its last are the layers of depth, on the Difficulty page (src/domain/stages.ts, LADDER_TOP). */
const LADDER = STAGES.filter((s) => s.n <= LADDER_TOP);

/** Opens the page in place of Review, with a stage unfolded and in view when one is named. `from`: the roadmap's rings or the link on the top bar's ring sheet. */
export function openProgression(stage: number, from: ProgressionAt["from"]) {
  const p = state.pathProg, tab = state.tab === "review" && p ? p.tab : state.tab;   // (opened again while the page is on its way back under the roadmap: what is under it stays)
  setTab("review");
  state.pathProg = { from, tab, at: stage, term: "", y: -1 };
  if (stage) state.pathOpen["pg:" + stage] = true;
  render();
}
/**
 * Back, from the top bar's chevron or the system Back (shell/history.js): a term's card goes back to the stages; the page goes where it was opened from. Opened
 * from the ring sheet, that is the exercise. Opened from the roadmap, the page slides away as an exercise does and shows the roadmap, and once it is out of
 * sight the screen that was under the roadmap before comes back under it (its Continue goes there).
 */
export function progBack() {
  const p = state.pathProg; if (!p) return;
  if (p.term || p.diff === "over") { p.term = ""; delete p.diff; render(); return; }
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
function openTerm(id: string) {
  const p = state.pathProg, pg = document.querySelector<HTMLElement>("#path .pprog"); if (!p) return;
  p.y = pg ? pg.scrollTop : 0; p.term = id; render();
}
/**
 * Opens the Difficulty page: over the stages from their page (Back comes to them), or by itself from a result or the practice options, in place of Review
 * as the stages would be (Back goes to the exercise).
 */
export function openDifficulty(over = false) {
  if (over) { const p = state.pathProg, pg = document.querySelector<HTMLElement>("#path .pprog"); if (!p) return; p.y = pg ? pg.scrollTop : 0; p.diff = "over"; render(); return; }
  openProgression(0, "sheet");
  if (state.pathProg) { state.pathProg.diff = "alone"; render(); }
}

/** The stages as a row of rings in the roadmap's foot, the one the learner is on with a halo; a tap on a ring opens the Progression page with that stage unfolded. */
export function StageRings() {
  const top = ladderTop(state.stages);
  return <div class="rstages" role="group" aria-label={"The stages: stage " + top + " of " + LADDER_TOP}>
    <div class="tup-rings" style={"--n:" + LADDER_TOP}>{LADDER.map((s) =>
      <button type="button" class={"tup-rg " + stageWhere(s.n, top)} aria-label={ringLabel(s.n, marksOf(s.n)) + ". Progression"} onClick={() => openProgression(s.n, "road")}>
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
      : <button type="button" class="ttn prg-tb" aria-label={name + ", " + SAYS[t.mark] + ". Its card"} onClick={() => openTerm(t.id)}><span lang="en">{name}</span><Icon n="chev" /></button>}</li>;
})}</ul>;

/** How a stage stands: its new terms answered right, or how many it brings while it is ahead. */
function standing(n: number, top: number): string {
  const m = marksOf(n), where = stageWhere(n, top);
  if (!m.length) return where === "ahead" ? "longer things, no new terms" : "no new terms";
  if (where === "ahead") return m.length + (m.length === 1 ? " new term" : " new terms");
  return (where === "now" ? "now · " : "") + rightOf(m) + " of " + m.length + " right";
}
/** A stage as a stop on the line, its ring the node: a tap unfolds what it introduces and its new terms. */
function StageRow({ n, name, adds, top }: { n: number; name: string; adds: string; top: number }) {
  const k = "pg:" + n, open = isOpen(k), m = marksOf(n);
  return <>
    <St d={<span class="prgd"><StageRing n={n} top={top} /></span>} cls={"trow prg can " + stageWhere(n, top) + (open ? " open" : "")}>
      <button type="button" class="trb" data-stage={n} aria-expanded={open ? "true" : "false"} onClick={() => toggleOpen(k)}>
        <b>{"Stage " + n + " · " + name}</b><small class="prg-s">{standing(n, top)}</small><span class="arr"><Icon n="chev" /></span></button></St>
    {open ? <div class="pfold" data-fold={n}><div class="wtext tup prg-p"><p>{adds}</p>{m.length ? <Terms marks={m} /> : null}</div></div> : null}
  </>;
}
/** What the stages are and how they move, folded at the top of the list: the stage station's and the ring sheet's words. */
function How() {
  const k = "pg:how", open = isOpen(k);
  return <>
    <St d={<D cls="sub" />} cls={"trow prg-how can" + (open ? " open" : "")}>
      <button type="button" class="trb" aria-expanded={open ? "true" : "false"} onClick={() => toggleOpen(k)}><b>How the stages work</b><span class="arr"><Icon n="chev" /></span></button></St>
    {open ? <div class="pfold"><div class="wtext tup prg-p"><ul class="tup-bul">
      <li>Each stage adds a new kind of thing to ask about, from everyday things toward abstract ideas.</li>
      <li>The earlier stages stay in the mix, and Review keeps them fresh.</li>
      <li>Each new term comes with its definition first.</li>
      <li>{flow(state.pace)}</li>
      <li>A stage begins with its first new term, once the stage before has brought all of its own. A wrong answer takes back only that term’s mark.</li>
      <li>{"Stage " + LADDER_TOP + " is the last. Chains of reasoning come after it as a difficulty of their own, like the negations: see Difficulty, above."}</li>
      <li>Progression works across all exercises.</li>
      <li>A stage’s ring has a segment for each of its new terms, and each term a diamond: green when your last answer on it was right, red when it was wrong, open while it is not asked yet.</li>
    </ul></div></div> : null}
  </>;
}

/** The difficulty besides the stages, a heading of its own above them: how each of the three stands, and the way to its page. */
const Difficulty = () => <Sx cls="walked first ptrail"><Gap h={6} />
  <St d={<D cls="sec tsd" />} cls="sechead trow prg-h can">
    <button type="button" class="trb" aria-label={"Difficulty: " + difficultyLine()} onClick={() => openDifficulty(true)}><span class="ph">Difficulty<span>{difficultyLine()}</span></span><span class="arr"><Icon n="chev" /></span></button></St>
</Sx>;

/** The stages. Opened at a stage, its unfolded row comes into view, once; back from a term's card, the page is where it was. */
function Stages({ p }: { p: ProgressionAt }) {
  const top = ladderTop(state.stages), all = LADDER.flatMap((s) => marksOf(s.n));
  useLayoutEffect(() => {
    const pg = document.querySelector<HTMLElement>("#path .pprog"); if (!pg) return;
    if (p.y >= 0) { pg.scrollTop = p.y; p.y = -1; return; }
    const at = p.at; if (!at) return;
    p.at = 0;
    const row = pg.querySelector<HTMLElement>('[data-stage="' + at + '"]')?.closest<HTMLElement>(".st"), end = pg.querySelector<HTMLElement>('[data-fold="' + at + '"]') || row;
    if (!row || !end) return;
    const box = pg.getBoundingClientRect(), over = end.getBoundingClientRect().bottom + 16 - box.bottom;
    if (over > 0) pg.scrollTop += Math.min(over, row.getBoundingClientRect().top - box.top - 8);
  });
  return <>
    <TopBar title="Progression" back={{ label: p.from === "road" ? "Back to the roadmap" : "Back to " + exName(p.tab), go: progBack }} />
    <div key="stages" class="ppage prv pprog">
      <Difficulty />
      <Sx cls="walked ptrail">
        <Head d={<D cls="sec tsd" />} h="Stages" sub={"stage " + top + " of " + LADDER_TOP + (all.length ? " · " + rightOf(all) + " of " + all.length + " terms right" : "")} />
        <How />
        {LADDER.map((s) => <StageRow n={s.n} name={s.name} adds={s.adds} top={top} />)}
        <Gap h={6} /></Sx>
      <div style={{ height: "30px" }} />
    </div>
  </>;
}
/** A term's card, as its stop showed it, on a page of its own over the stages: its stage and its mark above it. */
function TermCard({ id }: { id: string }) {
  const c = termOf(id), name = (c && c.term) || id, def = !!state.DATA && hasDef(state.DATA.terms[name]);
  const s = STAGES.find((x) => marksOf(x.n).some((t) => t.id === id)), mark = (s && marksOf(s.n).find((t) => t.id === id)?.mark) || "met";
  return <>
    <TopBar title="Progression" back={{ label: "Back to Progression", go: progBack }} />
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
  if (p.diff) return <DifficultyPage back={p.diff === "over" ? { label: "Back to Progression", go: progBack } : { label: p.from === "road" ? "Back to the roadmap" : "Back to " + exName(p.tab), go: progBack }} />;
  return <Stages p={p} />;
}
