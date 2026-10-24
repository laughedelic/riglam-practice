import { state } from "../state.js";
import { afterCheck } from "../ai/known.js";
import { checkFind } from "../find/flow.js";
import { CELLS, REL } from "../core/rel.js";
import { pairsOf } from "../core/util.js";
import { stopTimer } from "../debate/flow.js";
import { persist } from "./answers.js";
import { afterRelation } from "./negations.ts";
import { clearSkip } from "./skips.js";
import { gradeTerms } from "./stops.ts";
import { pairCats } from "./universe.js";
import { focusAfterCheck, render } from "../shell/render.js";
import { grade } from "../../domain/grading.ts";

/* ---------- grading ---------- */
// The checking itself (the relation, which cells can be filled, the examples) is in src/domain/grading.ts; this is the
// step around it: stop the clock, show the result, and save the answer.
export async function check(){
  if(!state.ui||!state.ui.rel||state.ui.checked) return;
  if(state.ui.find){ checkFind(); return; }              // Find a pair shares the cells and their keys, and checks in its own way
  const p=state.cur.p;
  stopTimer(); clearSkip(p); state.ui.res=grade(state,p,state.ui); state.ui.checked=true; state.ui.open=false;
  const id=state.cur.legacy?p.id:(state.cur.retry?"r-":"")+(p.generated&&!state.cur.retry?p.id:"r"+Date.now().toString(36));
  state.ui.negOffer=afterRelation(id,p,!!state.ui.res.relOk);      // the run towards the next step of the negation track (practice/negations.ts)
  gradeTerms(pairCats(p).map(cat=>({cat,ok:!!state.ui.res.relOk})));      // both terms of the pair (practice/stops.ts)
  render();
  focusAfterCheck();
  afterCheck(state.ui);
  if(!state.db) return;
  const cells=/** @type {import("../types.ts").AnswerDoc["cells"]} */({});
  for(const c of CELLS) cells[c]={text:(state.ui.cells[c].t||"").trim(), none:REL[state.ui.rel].empty.includes(c)||state.ui.cells[c].none, verdict:state.ui.res.cells[c].v};
  state.ui.saveId=id;
  const doc={pairId:id,batchId:state.cur.legacy?(state.batches.find(b=>pairsOf(b).includes(p))||{}).id||null:null,a:p.a,b:p.b,catA:pairCats(p)[0],catB:pairCats(p)[1],
    chosen:state.ui.late?null:state.ui.rel,key:p.relation,correct:state.ui.res.relOk,grade:state.ui.res.overall,cells,at:new Date().toISOString(),pair:p};
  if(state.cur.retry) doc.retryOf=p.id;
  if(state.ui.late||state.ui.exLate) doc.timeout=state.ui.late&&state.ui.exLate?"both":state.ui.late?"relation":"examples";
  state.ui.doc=doc;
  persist(state.ui,"Your answer");
}
