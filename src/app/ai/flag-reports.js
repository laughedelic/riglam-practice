import { state } from "../state.js";
import { typingEl } from "../core/viewport.js";
import { put } from "../practice/answers.js";
import { render } from "../shell/render.js";
import { autoFlagOf, flagAnswerRef } from "../../domain/flags.ts";

/* ---------- reports: a flag goes to the app's server ---------- */
// Where the place has a server for flags and this device has the Magic Key (platform.reports), a flag is sent to the app's maintainer
// with the stored answer it was made on. A flag counts as sent while its `sentAt` is not earlier than its `updatedAt`, so one that is
// edited is sent again. One that could not be sent (offline, over the day's limit) is tried again when the page starts and after the
// next flag. A removed flag is taken back. Where there is no such place, flags stay on the device.
export const ANSWER_MAX=48*1024;   // the server's limit for a stored answer (REPORT_LIMITS.answer, src/report/protocol.ts)
export const isSent=f=>!!f.sentAt&&f.sentAt>=f.updatedAt;

// the stored answer the flag was made on; left out when this device does not have it or it is too large to send
function answerFor(f){
  const r=flagAnswerRef(f); if(!r) return null;
  const a=(r.col==="debates"?state.debates:state.answers)[r.id];
  return a&&JSON.stringify(a).length<=ANSWER_MAX?a:null;
}
export async function sendFlags(ids){
  const R=state.reports; if(!R) return;
  const flags=ids.filter(id=>state.flags[id]&&!isSent(state.flags[id])).map(id=>Object.assign({},state.flags[id],{id}));
  if(!flags.length) return;
  const stored=await R.send(flags.map(f=>({id:f.id,flag:f,answer:answerFor(f)})));
  for(const f of flags){
    const cur=state.flags[f.id];
    // marked only if the flag is still the one that was sent: an edit made meanwhile sends itself
    if(!stored.includes(f.id)||!cur||cur.updatedAt!==f.updatedAt||isSent(cur)) continue;
    const doc=Object.assign({},cur,{sentAt:new Date().toISOString()}); state.flags[f.id]=doc;
    try{ await put("flags",f.id,doc); }catch(e){ /* the server has it; the mark is set again with the next send */ }
  }
  if(state.tab==="review"&&state.mode!=="loading"&&!typingEl(document.activeElement)) render();
}
/* ---------- replies: how the review of a sent flag stands ---------- */
// The server reviews each report (docs/SERVER.md, "Reviewing flags") and may reply. The page asks about its sent flags at the start and when Review
// is opened (at most once a minute), and keeps the answer on the flag as `review` ({state, reply, at}); the reply is shown as plain text under
// the flag. A flag whose review is over ("fixed", "decided") is not asked about again. An edit drops `review` (saveFlag writes a fresh document).
// All such flags are asked about, newest first, in the batches Reports.status makes of the server's limit: a fixed share of them would leave
// the later ones without a reply for as long as the earlier ones stay "answered" or "with the maintainer". What comes back is kept only for the
// version of the flag that was asked about.
const REPLY_EVERY_MS=60*1000, OVER=new Set(["fixed","decided"]);
export async function checkReplies(force){
  const R=state.reports; if(!R||state.repliesBusy||!state.db) return;
  const now=Date.now(); if(!force&&now-state.repliesAt<REPLY_EVERY_MS) return;
  const ids=Object.keys(state.flags).filter(id=>{ const f=state.flags[id]; return isSent(f)&&!(f.review&&OVER.has(f.review.state)); })
    .sort((x,y)=>(state.flags[y].updatedAt||"").localeCompare(state.flags[x].updatedAt||""));
  if(!ids.length) return;
  const asked=new Map(ids.map(id=>[id,state.flags[id].updatedAt]));
  state.repliesBusy=true; state.repliesAt=now;
  try{
    const told=await R.status(ids); let changed=false;
    for(const t of told){
      const cur=state.flags[t.id], had=cur&&cur.review;
      // not a flag that was edited meanwhile, even if the edit has been sent again (the server replied to its old words), and not one that has not moved
      if(!cur||!asked.has(t.id)||cur.updatedAt!==asked.get(t.id)||!isSent(cur)||(had&&had.state===t.state&&(had.reply||"")===(t.reply||""))) continue;
      const review={state:t.state}; if(t.reply) review.reply=t.reply; if(t.replyAt) review.at=t.replyAt;
      if(t.state==="sent"&&!had) continue;     // nothing to keep yet
      const doc=Object.assign({},cur,{review}); state.flags[t.id]=doc; changed=true;
      try{ await put("flags",t.id,doc); }catch(e){ /* kept for this visit; asked again at the next */ }
    }
    if(changed&&state.tab==="review"&&state.mode!=="loading"&&!typingEl(document.activeElement)) render();
  }catch(e){ /* asked again later */ }
  finally{ state.repliesBusy=false; }
}
// the flags that were never sent or were edited since, oldest first, and the removals that did not reach the server
export async function flushFlags(){
  const R=state.reports; if(!R||state.reportBusy||state.flagPending) return;
  state.reportBusy=true;
  try{
    await R.flush();
    const waiting=Object.keys(state.flags).filter(id=>!isSent(state.flags[id])).sort((x,y)=>(state.flags[x].updatedAt||"").localeCompare(state.flags[y].updatedAt||""));
    const todo=[...waiting.filter(id=>!autoFlagOf(state.flags[id])).slice(0,20),...waiting.filter(id=>autoFlagOf(state.flags[id])).slice(0,50)];
    if(todo.length) await sendFlags(todo);
  }catch(e){ /* tried again at the next start */ }
  finally{ state.reportBusy=false; }
  checkReplies();
}
export function withdrawFlag(id){ if(state.reports) state.reports.withdraw(id); }
