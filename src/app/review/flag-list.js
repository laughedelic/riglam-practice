import { state } from "../state.js";
import { flagAnswerRef } from "../../domain/flags.ts";

/* ---------- Review: your flags (path/review.tsx draws them), each with the exercise it was made on ---------- */
// A flag is the learner's note on something Claude said (ai/flags.js).
export const byNewest=(x,y)=>(y.updatedAt||y.at||"").localeCompare(x.updatedAt||x.at||"");
export function answerOf(f){
  const r=flagAnswerRef(f); if(!r) return null;
  return (r.col==="debates"?state.debates:state.answers)[r.id]||null;
}
// the flag as the case the editor works on (ai/flags.js), so that Edit changes this same document
export const caseOf=(f,what)=>({id:f.id,caseKey:f.caseKey,thing:f.thing,part:f.part,model:f.model,runId:f.runId,n:f.n,shown:f.shown,asked:f.asked,pair:f.pair,partLabel:what});
// The server's reply to a sent flag, as plain text. A reply can be flagged in turn: that is a flag of its own, on the same exercise, that the
// maintainer reads (the server does not review a reply again). It carries the reply as what Claude said and the learner's first note as the question.
export const replyCase=f=>({caseKey:f.caseKey,thing:"",part:"reply",model:"",runId:null,n:f.id,shown:f.review.reply,asked:f.note||undefined,pair:f.pair,partLabel:"The reply to a flag"});
export const REPLY_HEAD={maintainer:"Reply so far, until the maintainer decides",decided:"The maintainer’s reply"};
