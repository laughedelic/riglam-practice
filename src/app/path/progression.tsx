// The Progression page: the stages of the ladder (src/domain/stages.ts) as stops on one line, each stage's ring the node (path/rings.tsx), with where it
// stands under its name. A tap on a stage unfolds what it introduces and its new terms, each with its mark; a term the learner has met opens its card on a
// page of its own, as its stop showed it (the names, the definition, where it sits, the examples), and Back comes to the stages again where they were. A
// fold at the top says how the stages work, and the negations follow: whether they are on and how they come. The roadmap's foot shows the same rings in a
// row (`StageRings`): a tap on one opens the page with that stage unfolded, and the link under the top bar's ring does so with the stage the learner is on.
// The page stands in for Review (state.pathProg; setTab closes it), and Back from it goes where it was opened from: the roadmap or the exercise.
import { useLayoutEffect } from "preact/hooks";
import { state } from "../state.js";
import { stopTimer } from "../debate/flow.js";
import { hasDef } from "../practice/terms.js";
import { exName } from "../shell/exercises.js";
import { toggleMenu } from "../shell/menu.js";
import { moves } from "../shell/motion.js";
import { render } from "../shell/render.js";
import { openStageOptions } from "../shell/session.js";
import { setTab, switchTo } from "../shell/tabs.js";
import { stopCat } from "../../domain/intro.ts";
import type { StageMark, TermMark } from "../../domain/intro.ts";
import { MAX_STAGE, STAGES, runNeed, topStage } from "../../domain/stages.ts";
import type { DataIndex } from "../../ai-shared/lookup.ts";
import type { ProgressionAt } from "../types.ts";
import { FLOW, num } from "./progress.tsx";
import { StageRing, marksOf, rightOf, ringLabel, stageWhere } from "./rings.tsx";
import { TopBar } from "./shell.tsx";
import { FitTerm, StopSections } from "./stop-def.tsx";
import { isOpen, toggleOpen } from "./stored.tsx";
import { Names } from "./terms.tsx";
import { D, Gap, Head, Icon, St, Sx } from "./ui.tsx";

/** The roadmap's slide (37-path-panels.css), and a little more: the page is out of sight by then. */
const SLIDE_MS = 420;

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
  if (p.term) { p.term = ""; render(); return; }
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

/** The stages as a row of rings in the roadmap's foot, the one the learner is on with a halo; a tap on a ring opens the Progression page with that stage unfolded. */
export function StageRings() {
  const top = topStage(state.stages);
  return <div class="rstages" role="group" aria-label={"The stages: stage " + top + " of " + MAX_STAGE}>
    <div class="tup-rings" style={"--n:" + MAX_STAGE}>{STAGES.map((s) =>
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
  const k = "pg:how", open = isOpen(k), run = runNeed(state.stageRun), last = STAGES.reduce((m, s) => (marksOf(s.n).length ? s.n : m), 0);
  return <>
    <St d={<D cls="sub" />} cls={"trow prg-how can" + (open ? " open" : "")}>
      <button type="button" class="trb" aria-expanded={open ? "true" : "false"} onClick={() => toggleOpen(k)}><b>How the stages work</b><span class="arr"><Icon n="chev" /></span></button></St>
    {open ? <div class="pfold"><div class="wtext tup prg-p"><ul class="tup-bul">
      <li>Each stage adds a new kind of thing to ask about, from everyday things toward abstract ideas, and then longer chains of reasoning.</li>
      <li>The earlier stages stay in the mix, and Review keeps them fresh.</li>
      <li>Each new term comes with its definition first.</li>
      <li>{FLOW}</li>
      <li>A stage begins with its first new term, once the stage before has brought all of its own. A wrong answer takes back only that term’s mark.</li>
      {last && last < MAX_STAGE ? <li>{"Stage " + (last + 1) + " comes once your last answer on each term of stage " + last + " is right. The stages after it bring no new terms and come after " + num(run) + " right answers in a row on what is new."}</li> : null}
      <li>Progression works across all exercises.</li>
      <li>A stage’s ring has a segment for each of its new terms, and each term a diamond: green when your last answer on it was right, red when it was wrong, open while it is not asked yet.</li>
    </ul></div></div> : null}
  </>;
}

const NEG: Record<string, [string, string]> = {
  off: ["off", "After five right answers in a row on plain pairs in Relations, a result offers pairs with one side negated. Nothing changes without your tap."],
  one: ["one side", "A or B is negated in about a third of the pairs of Relations and Pervasions. After five right in a row on negated pairs, a result offers both sides."],
  both: ["both sides", "Half of the negated pairs of Relations and Pervasions negate both sides."],
};
function Negations() {
  const [now, how] = NEG[state.negation] || NEG.off!;
  return <>
    <p class="pgh"><b>Negations</b><span>{now}</span></p>
    <div class="wtext tup prg-p"><p>{how}</p>
      <p class="tup-note">The stages and the negations follow your answers. To choose them yourself, use the <button type="button" class="plnk" onClick={() => { setTab(state.own); openStageOptions(); }}>practice options</button>.</p></div>
  </>;
}

/** The stages. Opened at a stage, its unfolded row comes into view, once; back from a term's card, the page is where it was. */
function Stages({ p }: { p: ProgressionAt }) {
  const top = topStage(state.stages), all = STAGES.flatMap((s) => marksOf(s.n));
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
    <TopBar title="Progression" back={{ label: p.from === "road" ? "Back to the roadmap" : "Back to " + exName(p.tab), act: progBack }} />
    <div key="stages" class="ppage prv pprog">
      <p class="psub">{"stage " + top + " of " + MAX_STAGE + (all.length ? " · " + rightOf(all) + " of " + all.length + " terms right" : "")}</p>
      <p class="pgh"><b>Stages</b></p>
      <Sx cls="walked first ptrail"><Gap h={6} />
        <How />
        {STAGES.map((s) => <StageRow n={s.n} name={s.name} adds={s.adds} top={top} />)}
        <Gap h={6} /></Sx>
      <Negations />
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
  return p.term ? <TermCard id={p.term} /> : <Stages p={p} />;
}
