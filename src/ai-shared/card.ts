// The per-pair card the tutor gets as its first message, and the line that asks it to explain an answer. They are
// built from the pair, the learner's answer and the term data, so the page and the Worker produce the same text.
import { qPlain, QCELL } from "./debate";
import { catFacts } from "./facts";
import { matchItem, pairCats } from "./lookup";
import type { DataIndex } from "./lookup";
import { CELLS, REL, cellLabel, refOf } from "./relations";
import type { CellId, PairLike, RelKey } from "./relations";
import { CELL_NAME, DEBATE_ASK, DEBATE_NOTE, FIRST_ASK, GUIDE } from "./prompts";

/** One answer of the debate mode: Accept, Why? (with an example), or nothing. */
export interface DebateAnswer {
  say?: "accept" | "why" | null;
  text?: string;
  timeout?: boolean;
}

/** The part of the page's answer state that the card and the explain request read. */
export interface AnswerView {
  debate?: boolean;
  /** the relation the learner chose; set when the card is built, since after a timeout the page has shown the right one */
  rel?: RelKey | null;
  /** time ran out before the learner chose */
  late?: boolean;
  /** time ran out on the examples */
  exLate?: boolean;
  /** the examples written (or "none") per cell */
  cells: Record<CellId, { t: string; none?: boolean }>;
  /** debate: the four answers */
  ans?: DebateAnswer[];
  res: {
    /** debate: the relation the first three answers imply, "bad" when they contradict each other */
    implied?: RelKey | "bad" | null;
    /** the page's verdict per cell: "ok", "bad", or "cmp" when it could not classify the example */
    cells: Record<CellId, { v: string }>;
  };
}

export function tutorCard(ix: DataIndex, p: PairLike, u: AnswerView): string {
  const [ca,cb]=pairCats(ix,p);
  const card={A:ca?catFacts(ix,ca,p.a):{label:p.a,type:p.typeA}, B:cb?catFacts(ix,cb,p.b):{label:p.b,type:p.typeB}};
  const notes=[...new Set([ca,cb].flatMap(c=>c&&ix.DATA.notes&&ix.DATA.notes[c]||[]))];
  const refTxt=(c: CellId)=>refOf(p,c)?JSON.stringify(refOf(p,c)):"EMPTY ("+((p.why&&p.why[c])||"no example")+")";
  let mid: string;
  if(u.debate){
    const imp=u.res.implied, ans=u.ans as DebateAnswer[];
    const lines=QCELL.map((c,i)=>{
      const a=ans[i], r=u.res.cells[c];
      const said=a.say==="accept"?"ACCEPT"+(a.timeout?" (time ran out, which counts as accepting)":""):a.say==="why"?"WHY"+(a.text?" with the example "+JSON.stringify(a.text):" without an example"):"nothing (time ran out)";
      const it=a.text?matchItem(ix,a.text):null;
      return "- Q"+(i+1)+" ("+qPlain(i)+") counter-example cell: "+cellLabel(c,p)+"; learner said "+said+
        (it?" [in the practice list as: "+it.n+", type "+it.t+"]":"")+"; reference "+refTxt(c)+"; page verdict "+r.v;
    }).join("\n");
    mid=`${DEBATE_NOTE}
A = ${JSON.stringify(p.a)}, B = ${JSON.stringify(p.b)}.
Correct relation: ${REL[p.relation].name}. The learner's Q1 to Q3 answers give: ${imp==="bad"?"a self-contradiction":imp?REL[imp].name:"nothing (time ran out)"}. Learner chose: ${u.late?"nothing (time ran out; the page then showed the right relation)":REL[u.rel as RelKey].name}.
Reference note: ${p.note||"none"}
Questions (verdict cmp = learner wrote an example the page could not classify):
${lines}`;
  } else {
    const lines=CELLS.map(c=>{
      const none=REL[u.rel as RelKey].empty.includes(c)||u.cells[c].none, t=u.cells[c].t.trim(), r=u.res.cells[c];
      const it=t?matchItem(ix,t):null;
      return "- "+cellLabel(c,p)+": learner wrote "+(none?"NONE":(t?JSON.stringify(t):"(blank)"))+
        (it?" [in the practice list as: "+it.n+", type "+it.t+"]":"")+
        "; reference "+refTxt(c)+"; page verdict "+r.v;
    }).join("\n");
    mid=`Correct relation: ${REL[p.relation].name}. Learner chose: ${u.late?"nothing (time ran out; the page then showed the right relation)":REL[u.rel as RelKey].name}.${u.exLate?" Time ran out on the examples: cells the learner had not reached are blank.":""}
Reference note: ${p.note||"none"}
Cells (verdict cmp = learner wrote something the page could not classify):
${lines}`;
  }
  return GUIDE+`

CARD (from the course booklet's term data; the relation and reference examples were computed from a list of classified examples):
${JSON.stringify(card)}
${mid}`+(notes.length?"\nFine points (from the sources; apply them):\n"+notes.map(n=>"- "+n).join("\n"):"");
}

// Explain also verifies the examples the page could not check: those cell lines end in a machine-readable verdict.
export function explainAsk(U: Pick<AnswerView, "debate" | "res">): string {
  const dbt=!!U.debate, open=CELLS.filter(c=>U.res.cells[c].v==="cmp");
  const base=dbt?DEBATE_ASK:FIRST_ASK;
  if(!open.length) return base;
  const nm=(c: CellId)=>dbt?"Q"+(CELLS.indexOf(c)+1):CELL_NAME[c];
  return base+`
The page could not check the examples in: ${open.map(nm).join(", ")}. End each of those cell lines with " => yes" if the example belongs in that cell (an existent thing; in Neither a non-existent such as the horn of a rabbit counts too), " => no" if it does not, or " => unsure".`+(dbt?`
Q1 is the Both cell, Q2 A not B, Q3 B not A, Q4 Neither.`:"")+`
How to decide: read the example in its ordinary sense (a song is the sound of someone singing or playing; a stone is an ordinary stone at room temperature). Place it under A or B first, then use the correct relation above: it is computed and right, so if whatever is B is A, a B belongs in Both. Use classify_example or lookup_term when a classification is not obvious.
Say "unsure" only when the sources disagree on how to classify the thing (see the fine points) or when you cannot tell what the example names. Then the line names each reading and the cell it gives, in a few words. A word that could also mean something else is not a reason for "unsure": decide on the ordinary reading and mention the other one briefly.`;
}
