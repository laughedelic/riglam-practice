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
}
export function withdrawFlag(id){ if(state.reports) state.reports.withdraw(id); }
