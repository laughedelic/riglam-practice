// The Progression page: the stages of the ladder (src/domain/stages.ts) as stops on one line, each stage's ring the node (path/rings.tsx), with the new
// terms of the stages reached under it, each with its mark and a word on where it stands. A term met unfolds into what its stop showed (the names, the
// definition, where it sits, the examples); a term whose stop is still to come waits, faint. The stages ahead say how many new terms they bring. Then the
// negations: whether they are on and how they come. The roadmap's foot shows the same rings in a row (`StageRings`): a tap on one opens the page at that
// stage, and "All stages" under the top bar's ring opens it at the stage the learner is on. The page stands in for Review (state.pathProg; setTab clears it).
import { useLayoutEffect } from "preact/hooks";
import { state } from "../state.js";
import { hasDef } from "../practice/terms.js";
import { exName } from "../shell/exercises.js";
import { openStageOptions } from "../shell/session.js";
import { setTab } from "../shell/tabs.js";
import { stopCat } from "../../domain/intro.ts";
import type { StageMark, TermMark } from "../../domain/intro.ts";
import { MAX_STAGE, STAGES, topStage } from "../../domain/stages.ts";
import type { DataIndex } from "../../ai-shared/lookup.ts";
import { refreshPath } from "./index.tsx";
import { StageRing, marksOf, rightOf, ringLabel, stageWhere } from "./rings.tsx";
import { Foot, Station, TopBar } from "./shell.tsx";
import { isOpen, toggleOpen } from "./stored.tsx";
import { StopSections } from "./stop-def.tsx";
import { Names } from "./terms.tsx";
import { D, Gap, Icon, St, Sx } from "./ui.tsx";

/** Opens the page in place of Review, at a stage's row when one is named (a tap on its ring). */
export function openProgression(stage = 0) {
  setTab("review");
  state.pathProg = true; state.pathProgAt = stage;
  refreshPath();
}

/** The stages as a row of rings in the roadmap's foot, the one the learner is on with a halo; a tap on a ring opens the Progression page at that stage. */
export function StageRings() {
  const top = topStage(state.stages);
  return <div class="rstages" role="group" aria-label={"The stages: stage " + top + " of " + MAX_STAGE}>
    <div class="tup-rings" style={"--n:" + MAX_STAGE}>{STAGES.map((s) =>
      <button type="button" class={"tup-rg " + stageWhere(s.n, top)} aria-label={ringLabel(s.n, marksOf(s.n)) + ". Progression"} onClick={() => openProgression(s.n)}>
        <StageRing n={s.n} top={top} /></button>)}</div>
  </div>;
}

/** A term's mark as the node of its row (a green or a red diamond, an open one while it is not answered yet), and the word under its name. */
const NODE: Record<TermMark, string> = { ok: "ok", miss: "no", slip: "no", met: "nil", wait: "" };
const SAYS: Record<TermMark, string> = { ok: "last answer right", miss: "not right yet", slip: "was right, last answer wrong", met: "not asked yet", wait: "its stop is still to come" };
const termOf = (id: string) => (state.DATA ? stopCat(state as unknown as DataIndex, id) : null);

/** A new term of a stage reached: met, its row unfolds into what its stop showed; not met yet, it waits. */
function TermStop({ t }: { t: StageMark }) {
  const c = termOf(t.id); if (!c || !c.term) return null;
  const name = c.term, k = "t:" + c.id, open = isOpen(k), def = hasDef(state.DATA!.terms[name]);
  if (t.mark === "wait") return <St d={<D cls="sub" />} cls="trow prg-t wait"><b lang="en">{name}</b><small class="prg-s">{SAYS.wait}</small></St>;
  return <>
    <St d={<D cls={"sub " + NODE[t.mark]} />} cls={"trow prg-t can" + (open ? " open" : "")}><button type="button" class="trb" aria-expanded={open ? "true" : "false"} onClick={() => toggleOpen(k)}>
      <b lang="en">{name}</b><small class="prg-s">{SAYS[t.mark]}</small><span class="arr"><Icon n="chev" /></span></button></St>
    {open ? <div class="pfold">
      <div class="wtext tstop-def"><Names term={name} /></div>
      <StopSections s={{ cat: c.id, why: "again" }} name={name} def={def} />
      {!def && state.unlock ? <p class="tstop-key">Its definition comes with the Magic Key from your study group’s link.</p> : null}
    </div> : null}
  </>;
}
/** How a stage stands: its new terms answered right, or how many it brings while it is ahead. */
function standing(n: number, top: number): string {
  const m = marksOf(n), where = stageWhere(n, top);
  if (!m.length) return where === "ahead" ? "longer things, no new terms" : "no new terms";
  if (where === "ahead") return m.length + (m.length === 1 ? " new term" : " new terms");
  return (where === "now" ? "now · " : "") + rightOf(m) + " of " + m.length + " right";
}
/** A stage as a stop on the line, its ring the node. */
const StageStop = ({ n, name, top }: { n: number; name: string; top: number }) =>
  <St d={<span class="prgd"><StageRing n={n} top={top} /></span>} cls={"trow prg " + stageWhere(n, top)}>
    <div data-stage={n}><b>{"Stage " + n + " · " + name}</b><small class="prg-s">{standing(n, top)}</small></div></St>;

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

export function ProgressionPage() {
  const top = topStage(state.stages), all = STAGES.flatMap((s) => marksOf(s.n));
  // opened at a stage: its row comes to the top of the page, once
  useLayoutEffect(() => {
    const at = state.pathProgAt; if (!at) return;
    state.pathProgAt = 0;
    const pg = document.querySelector<HTMLElement>("#path .pprog"), row = pg?.querySelector<HTMLElement>('[data-stage="' + at + '"]')?.closest<HTMLElement>(".st");
    if (pg && row) pg.scrollTop += row.getBoundingClientRect().top - pg.getBoundingClientRect().top - 8;
  });
  return <>
    <TopBar title="Progression" />
    <div class="ppage prv pprog">
      <p class="ptitle">Progression</p><p class="psub">{"stage " + top + " of " + MAX_STAGE + (all.length ? " · " + rightOf(all) + " of " + all.length + " terms right" : "")}</p>
      <p class="pgh"><b>Stages and their terms</b></p>
      <Sx cls="walked first ptrail"><Gap h={6} />
        {STAGES.map((s) => <><StageStop n={s.n} name={s.name} top={top} />{s.n <= top ? marksOf(s.n).map((t) => <TermStop t={t} />) : null}</>)}
        <Gap h={6} /></Sx>
      <Negations />
      <div style={{ height: "30px" }} />
    </div>
    <Foot><Station back name="Continue practice" hint={exName(state.own)} act={() => setTab(state.own)} /></Foot>
  </>;
}
