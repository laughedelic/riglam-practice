// The Difficulty section of the Progression page (path/progression.tsx): what makes the practice harder besides the stages, each a line with what it is and
// its quick choice (path/lines.tsx). The pace: how many course terms may be not right yet before a new one waits, and how many questions apart new terms come
// (src/domain/intro.ts, PACES, paceSpacing), said in one line for the pace chosen. The negations: a negated side in the pairs of Relations and Pervasions,
// open from stage NEG_OPEN (src/domain/stages.ts), with their brackets. The depth: chains of reasoning, layer by layer, the stages after the ladder's last
// (LADDER_TOP), open once it is on. The pace starts steady, the negations and the depth off, and a result suggests their next step; a negation step taken
// stays on the page below its stage, so it can be switched off. The rules are in practice/difficulty.ts and the domain, the words here, kept short.
import { state } from "../state.js";
import { DEPTH_NAME, DEPTH_PICK, PACE_NAME, depthCanSet, depthNow, negationsOpen, setDepth, setPace } from "../practice/difficulty.ts";
import { setNegBrackets, setNegation } from "../shell/session.js";
import { PACES, paceSpacing } from "../../domain/intro.ts";
import { LADDER_TOP, NEG_OPEN } from "../../domain/stages.ts";
import { Line } from "./lines.tsx";
import { num } from "./progress.tsx";
import { Words } from "./ui.tsx";

const NEG_WORD: Record<string, string> = { off: "off", one: "one side", both: "both sides" };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** What a pace means, in one line. */
const paceLine = (n: number) => "Up to " + num(n) + " terms not right yet, and a new term at most every " + num(paceSpacing(n)) + " questions.";

/** How the three stand, in a few words. */
export const difficultyLine = (): string => PACE_NAME[state.pace] + " pace · negations " + NEG_WORD[state.negation] + " · depth " + DEPTH_NAME[depthNow()];

/** A choice that waits for its stage: when it opens, in place of the choice. */
const Wait = ({ n }: { n: number }) => <small class="pdiff-wait">{"From stage " + n + "."}</small>;

/** The lines of the section, under its heading. */
export function DifficultyLines() {
  const negOpen = negationsOpen() || state.negation !== "off", deepOpen = depthCanSet();     // negations on below their stage (the stages moved down) can still be switched off
  return <>
    <Line title="Pace" sub={paceLine(state.pace)}>
      <Words label="Pace" items={PACES.map((n) => [n, cap(PACE_NAME[n] || String(n))] as [number, string])} cur={state.pace} on={setPace} /></Line>
    <Line title="Negations" sub="Pairs with “non-”, such as non-(wooden things).">
      {negOpen ? <Words label="Negations" items={[["off", "Off"], ["one", "One side"], ["both", "Both sides"]]} cur={state.negation} on={setNegation} /> : <Wait n={NEG_OPEN} />}</Line>
    {negOpen ? <Line title="Brackets" sub="non-(wooden things), not non-wooden things" sw={{ on: state.negBrackets, toggle: () => setNegBrackets(!state.negBrackets) }} /> : null}
    <Line title="Depth" sub="Chains of reasoning on familiar things, one layer at a time.">
      {deepOpen ? <Words label="Depth" items={DEPTH_PICK.map((w, i) => [i, w] as [number, string])} cur={depthNow()} on={setDepth} /> : <Wait n={LADDER_TOP} />}</Line>
  </>;
}
