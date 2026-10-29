// The Difficulty page, over the Progression page (path/progression.tsx): what makes the practice harder besides the stages, each with a line on what it is
// and the choice. The pace: how many course terms may be not right yet before a new one waits, and how many questions apart new terms come (src/domain/intro.ts,
// PACES, paceSpacing), said in one line for the pace chosen. The negations: a negated side
// in the pairs of Relations and Pervasions, open from stage NEG_OPEN (src/domain/stages.ts). The depth: chains of reasoning, layer by layer, the stages
// after the ladder's last (LADDER_TOP), open once it is on. The pace starts steady, the negations and the depth off, and a result suggests their next
// step; a negation step taken stays on the page below its stage, so it can be switched off. The rules are in practice/difficulty.ts and the domain, the words here, kept short.
import { state } from "../state.js";
import { DEPTH_NAME, DEPTH_PICK, PACE_NAME, depthCanSet, depthNow, negationsOpen, setDepth, setPace } from "../practice/difficulty.ts";
import { setNegBrackets, setNegation } from "../shell/session.js";
import { PACES, paceSpacing } from "../../domain/intro.ts";
import { LADDER_TOP, NEG_OPEN } from "../../domain/stages.ts";
import { Row, Switch } from "./options.tsx";
import { num } from "./progress.tsx";
import { TopBar } from "./shell.tsx";
import { Words } from "./ui.tsx";

const NEG_WORD: Record<string, string> = { off: "off", one: "one side", both: "both sides" };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** What a pace means, in one line. */
const paceLine = (n: number) => "Up to " + num(n) + " terms not right yet, and a new term at most every " + num(paceSpacing(n)) + " questions.";

/** The page's line on the Progression page: how each of the three stands. */
export const difficultyLine = (): string => PACE_NAME[state.pace] + " pace · negations " + NEG_WORD[state.negation] + " · depth " + DEPTH_NAME[depthNow()];


export function DifficultyPage({ back }: { back: { label: string; act: () => void } }) {
  const negOpen = negationsOpen() || state.negation !== "off", deepOpen = depthCanSet();     // negations on below their stage (the stages moved down) can still be switched off
  return <>
    <TopBar title="Difficulty" back={back} />
    <div key="diff" class="ppage prv pdiff">
      <p class="psub">The pace starts steady, negations and depth off. A result suggests the next step of these two when your answers show you are ready.</p>
      <Row lb="Pace"><b>Pace</b><small>{paceLine(state.pace)}</small>
        <Words label="Pace" items={PACES.map((n) => [n, cap(PACE_NAME[n] || String(n))] as [number, string])} cur={state.pace} on={setPace} /></Row>
      <Row lb="Not"><b>Negations</b><small>Pairs with “non-”, such as non-(wooden things).</small>
        {negOpen ? <Words label="Negations" items={[["off", "Off"], ["one", "One side"], ["both", "Both sides"]]} cur={state.negation} on={setNegation} /> : <small class="pdiff-wait">{"From stage " + NEG_OPEN + "."}</small>}</Row>
      {negOpen ? <Switch lb="" title="Brackets" note="non-(wooden things), not non-wooden things." on={state.negBrackets} toggle={() => setNegBrackets(!state.negBrackets)} /> : null}
      <Row lb="Depth"><b>Depth</b><small>Chains of reasoning on familiar things, one layer at a time.</small>
        {deepOpen ? <Words label="Depth" items={DEPTH_PICK.map((w, i) => [i, w] as [number, string])} cur={depthNow()} on={setDepth} /> : <small class="pdiff-wait">{"From stage " + LADDER_TOP + "."}</small>}</Row>
      <div style={{ height: "30px" }} />
    </div>
  </>;
}
