import { state } from "../state.js";
import { fillAns } from "../ai/tutor.js";
import { el } from "../core/dom.js";
import { REL, cellLabel, lcRel, refOf } from "../core/rel.js";
import { QCELL } from "../debate/text.js";
import { advance } from "../practice/queue.js";
import { exGrid } from "./review.js";
import { render, top0 } from "../shell/render.js";
import { switchTo } from "../shell/tabs.js";

/* ---------- a stored answer as it was checked: the relation, the four cells and Claude's explanation ---------- */
// Shown under a mistake and under a flag in Review, so the exercise can be read again without practicing it.
const VERDICT={ok:"Right.",bad:"Wrong.",cmp:"Not checked.",open:"Not checked.",part:"Partly right."};
// a cell the relation leaves empty has no reference; any other cell without one is an older pair that did not keep it
const emptyBy=(p,c)=>!!REL[p.relation]&&REL[p.relation].empty.includes(c);
function storedCell(doc,p,c){
  const x=(doc.cells&&doc.cells[c])||{text:""}, debate=doc.mode==="debate", i=QCELL.indexOf(c);
  const q=debate&&doc.qs?doc.qs.find(y=>y.c===c):null;
  const text=String(x.text||"").trim(), ref=refOf(p,c), why=p.why&&p.why[c], v=(q&&q.verdict)||x.verdict||"";
  // a blank cell that the learner did not mark empty, in a relation that does not leave it empty, and that has an example to give, was left unanswered (time ran out):
  // the grader calls that Missing, and it is not the claim that nothing goes there
  // (a pair of the learner's own has no reference, so a cell left blank that the relation asked for leaves possible is "wrong" in the stored verdict)
  const mine=doc.chosen&&REL[doc.chosen], left=!debate&&!text&&!x.none&&!(mine&&mine.empty.includes(c))&&(!!ref||(!!p.own&&v==="bad"));
  const none=x.none||(q&&q.say==="accept")||(!text&&!left);
  const by=(q&&q.by)||x.by;
  return el("div",{class:"cell"+(none?" locked":"")+(v?" v-"+v:""),"aria-label":cellLabel(c,p)},
    debate?el("span",{class:"qn",text:"Q"+(i+1)}):null,
    none?el("span",{class:"empty",text:debate&&q&&q.say==="accept"?"Accepted":"∅"}):left?el("span",{class:"noans",text:"No answer"}):el("span",{class:"cx",text:text}),
    el("div",{class:"fb"},VERDICT[v]?el("b",{text:VERDICT[v]+" "}):null,ref?"Reference: "+ref+".":why||(v==="open"?"Empty by the relation asked for.":doc.relOpen?"":emptyBy(p,c)?"Nothing goes here.":"No reference was kept."),by==="claude"?el("i",{text:" Checked by Claude."}):by==="course"?el("i",{text:" Checked by the course examples."}):null));
}
export const storedPair=doc=>doc.pair||/** @type {import("../types.ts").Pair} */({a:doc.a,b:doc.b,relation:doc.key,ex:{},why:{}});
// what a note of Claude's is read against in Review: the stored pair and the questions the learner accepted, not the exercise on screen
export const noteContext=(doc,p=storedPair(doc))=>({p,accepted:f=>{ const q=doc.mode==="debate"&&doc.qs?doc.qs.find(y=>y.c===f.cell):null; return !!q&&q.say!=="why"; }});
export function exerciseNode(doc){
  const p=storedPair(doc), key=REL[doc.key], mine=doc.chosen&&REL[doc.chosen];
  // Find a pair: the relation was given, and the question is whether the named pair has it
  const asked=doc.mode==="find"?mine||REL[doc.key]:null;
  const rel=doc.mode==="find"?el("p",{class:"note"},el("b",{text:"Asked for: "}),lcRel(asked?asked.name:doc.chosen)+". ",
      doc.correct?"The pair has it.":doc.relOpen?"Claude had not judged the pair.":key&&doc.key!==doc.chosen?"The pair is "+lcRel(key.name)+".":"The pair does not have it.")
    :doc.correct?el("p",{class:"note"},el("b",{text:"Relation right: "}),lcRel(key?key.name:doc.key)+".")
    :el("p",{class:"note"},el("b",{text:"Relation: "}),(key?key.name:doc.key)+". ",mine?"You chose "+lcRel(mine.name)+".":"Time ran out before you chose.");
  const box=el("div",{class:"xbody"},rel,exGrid(p,c=>storedCell(doc,p,c)));
  if(doc.explain){
    const t=el("div",{class:"ans"}); fillAns(t,doc.explain,noteContext(doc,p));
    box.append(el("details",{class:"xexp"},el("summary",{text:"Claude’s explanation"}),t));
  }
  return box;
}
// Practice a stored pair again, as Retry does for mistakes. The tab is switched first: coming from the Debate tab that may draw a pair itself, which would use up the queue.
export function practiceAgain(p,tag){ switchTo("practice"); state.retryQ=[p]; state.retryTag=tag; advance(); render(); top0(); }
