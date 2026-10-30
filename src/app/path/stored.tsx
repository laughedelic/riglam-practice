// An answer as it was checked, drawn on the path where Review unfolds it: the relation as it was answered, a row for each case (or question)
// with what was written, its mark and the reference, and the tutor's explanation kept with it. The words are review/exercise.js's.
import { state } from "../state.js";
import { CELLS, REL } from "../core/rel.js";
import { QCELL } from "../debate/text.js";
import { noteContext, storedCase, storedPair, storedRel } from "../review/exercise.js";
import type { AnswerDoc } from "../types.ts";
import type { CellId, RelKey } from "../../ai-shared/relations.ts";
import { TutorText } from "./flags.tsx";
import { CASE } from "./parts.tsx";
import { refreshPath } from "./index.tsx";
import { D, Fig, Icon, Mark, St } from "./ui.tsx";

const MARK: Record<string, string> = { ok: "ok", bad: "no", cmp: "pt", open: "pt", part: "pt" };
/** Whether a row of Review is unfolded, and the way to fold or unfold it. */
export const isOpen = (k: string) => !!state.pathOpen[k];
export function toggleOpen(k: string) { if (state.pathOpen[k]) delete state.pathOpen[k]; else state.pathOpen[k] = true; refreshPath(); }

/** The relation of a stored answer: its figure, and what was answered of it ("Relation right: four possibilities."). */
export function StoredRel({ doc }: { doc: AnswerDoc }) {
  const [lead, said] = storedRel(doc) as [string, string], k = (doc.chosen || doc.key) as RelKey;
  return <St d={REL[k] ? <Fig k={k} size="m" /> : <D cls="sub done" />} cls="srel"><span class="pq"><b>{lead}</b>{said}</span></St>;
}
/** A row for each case of a stored answer (each question, for Pervasions): what was written, its mark, the verdict, the reference. */
export function StoredCases({ doc }: { doc: AnswerDoc }) {
  const p = storedPair(doc), debate = doc.mode === "debate", order = (debate ? QCELL : CELLS) as CellId[];
  return <>{order.map((c) => {
    const k = storedCase(doc, p, c), m = MARK[k.v] || "";
    const ans = k.accepted ? <span class="ans2 nil">Accepted</span> : k.marked ? <span class="ans2 nil">nothing exists</span> : k.left ? <span class="ans2 nil">no answer</span>
      : k.none ? <span class="ans2 nil">empty</span> : <span class={"ans2" + (m === "no" ? " no" : "")}>{k.text}</span>;
    return <St d={<D cls={"sub " + (m || "done")} />} cls="sb exr">
      <span class="lab">{debate ? "Question " + k.q : CASE[c]}</span><div class="line1">{ans}{m ? <Mark m={m} /> : null}</div>
      <p class="xnote">{k.verdict ? <b>{k.verdict} </b> : null}{k.note}{k.by === "claude" ? <i> Checked by Claude.</i> : k.by === "course" ? <i> Checked by the course examples.</i> : null}</p>
    </St>;
  })}</>;
}
/** The tutor's explanation kept with a stored answer, folded until it is opened. */
export function StoredExplain({ doc, k }: { doc: AnswerDoc; k: string }) {
  if (!doc.explain) return null;
  const key = k + ":x", open = isOpen(key);
  return <>
    <button type="button" class={"wrow" + (open ? " open" : "")} aria-expanded={open ? "true" : "false"} onClick={() => toggleOpen(key)}><D cls="sub tut" />
      <span class="ct"><b>Explanation</b><span>by Claude</span></span><span class="arr"><Icon n="chev" /></span></button>
    {open ? <div class="wtext"><div class="tsay"><TutorText text={doc.explain} ctx={noteContext(doc)} /></div></div> : null}
  </>;
}
/** The whole of a stored answer: the relation, the cases, the explanation. */
export function StoredAnswer({ doc, k }: { doc: AnswerDoc; k: string }) {
  return <><StoredRel doc={doc} /><StoredCases doc={doc} /><StoredExplain doc={doc} k={k} /></>;
}
