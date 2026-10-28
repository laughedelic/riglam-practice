// The Difficulty page, over the Progression page (path/progression.tsx): what makes the practice harder besides the stages, each with what it does, when the
// practice suggests it, and the choice. The pace: how many course terms may be not right yet before a new one waits (src/domain/intro.ts, PACES). The
// negations: a negated side in the pairs of Relations and Pervasions, open from stage NEG_OPEN and suggested from NEG_SUGGEST (src/domain/stages.ts). The
// depth: chains of reasoning, the stages after the ladder's last (LADDER_TOP), open once it is on and offered on a result after it. Each starts at its
// easiest; the rules are in practice/difficulty.ts and the domain, the words here.
import { state } from "../state.js";
import { DEPTH_ASKS, DEPTH_NAME, PACE_NAME, depthCanSet, depthNow, negationsOpen, setDepth, setPace } from "../practice/difficulty.ts";
import { setNegBrackets, setNegation } from "../shell/session.js";
import { PACES } from "../../domain/intro.ts";
import { LADDER_TOP, NEG_OPEN, NEG_SUGGEST } from "../../domain/stages.ts";
import { Row, Switch } from "./options.tsx";
import { flow } from "./progress.tsx";
import { TopBar } from "./shell.tsx";
import { Words } from "./ui.tsx";

const NEG_WORD: Record<string, string> = { off: "off", one: "one side", both: "both sides" };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The page's line on the Progression page: how each of the three stands. */
export const difficultyLine = (): string => PACE_NAME[state.pace] + " pace · negations " + NEG_WORD[state.negation] + " · depth " + DEPTH_NAME[depthNow()];


export function DifficultyPage({ back }: { back: { label: string; act: () => void } }) {
  const negOpen = negationsOpen(), deepOpen = depthCanSet(), d = depthNow();
  return <>
    <TopBar title="Difficulty" back={back} />
    <div key="diff" class="ppage prv pdiff">
      <p class="psub">Three things besides the stages make the practice harder. Each starts at its easiest; a result suggests the next step when your answers show you are ready, and here you set them yourself.</p>
      <Row lb="Pace"><b>Pace</b>
        <Words label="Pace" items={PACES.map((n) => [n, cap(PACE_NAME[n] || String(n)) + " · " + n] as [number, string])} cur={state.pace} on={setPace} />
        <small>{flow(state.pace) + " Careful keeps it to two: calmer, and surer of each term. Brisk allows five: the terms come sooner, with more mistakes and review on the way."}</small></Row>
      <Row lb="Not"><b>Negations</b>
        {negOpen ? <Words label="Negations" items={[["off", "Off"], ["one", "One side"], ["both", "Both sides"]]} cur={state.negation} on={setNegation} /> : <small class="pdiff-wait">{"Open from stage " + NEG_OPEN + "."}</small>}
        <small>Pairs where a term is negated: “furniture” and “non-(wooden things)”, which takes in everything that is not a wooden thing. One side negates A or B in about a third of the pairs; both sides negate both in half of those. In Relations and Pervasions.</small>
        <small>{"From stage " + NEG_SUGGEST + " a result of Relations suggests them, after five plain pairs right in a row and while fewer of your terms are not right yet than your pace allows: sooner when the answers come easily, later when they do not. Both sides come the same way."}</small></Row>
      {negOpen ? <Switch lb="" title="Brackets" note="“non-(wooden things)” says that the “non-” takes in everything that is not a wooden thing, what does not exist included. Without them, “non-wooden things” is also read as the things that are not wooden, which leaves out what does not exist. They help while negations are new." on={state.negBrackets} toggle={() => setNegBrackets(!state.negBrackets)} /> : null}
      <Row lb="Depth"><b>Depth</b>
        {deepOpen ? <Words label="Depth" items={DEPTH_NAME.map((w, i) => [i, cap(w)] as [number, string])} cur={d} on={setDepth} /> : <small class="pdiff-wait">{"Open from stage " + LADDER_TOP + ", the last of the stages."}</small>}
        <small>Chains of reasoning on familiar things:</small>
        {DEPTH_ASKS.slice(1).map((t, i) => <small class="pdiff-step"><b>{cap(DEPTH_NAME[i + 1]!)}</b>{": " + t}</small>)}
        <small>{"A result suggests the first step once your last answer on each term of stage " + LADDER_TOP + " is right, and each next one after five right answers in a row on the chains."}</small></Row>
      <div style={{ height: "30px" }} />
    </div>
  </>;
}
