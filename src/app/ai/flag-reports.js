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
// The page talks to the server about flags one request at a time, in the order it made them (inOrder): an older upload cannot arrive after
// a newer one of the same flag, nor after its removal, which would bring the removed report back.
export const ANSWER_MAX=48*1024;   // the server's limit for a stored answer (REPORT_LIMITS.answer, src/report/protocol.ts)
export const isSent=f=>!!f.sentAt&&f.sentAt>=f.updatedAt;

const order={tail:Promise.resolve(),flush:null};
const inOrder=fn=>{ const run=order.tail.then(fn); order.tail=run.catch(()=>{}); return run; };

// The writes of one flag to the database, in order: the editor's, a removal's, a change of state and the mark that the flag was sent. A write waits for the earlier ones of its flag, so
// one that is tried again after a passing fault (put, practice/answers.js) cannot land after a later edit or removal and put the old document back; the write looks at the flag again
// when its turn comes. While any is pending, the snapshot of the flags does not replace what the page has just changed and flags waiting to go are not sent; when the last has ended
// they go. A failure goes to `undo` where the caller has one; otherwise the page tries again later.
export const flagQ={};
export function flagTurn(k,fn,undo){
  state.flagPending++;
  return flagQ[k]=(flagQ[k]||Promise.resolve()).catch(()=>{}).then(fn).catch(e=>{ if(undo) undo(e); })
    .finally(()=>{ state.flagPending--; if(!state.flagPending) flushFlags(); });
}

// The stored answer the flag was made on: the page's copy, else the one in storage (the copies fill in as the saved collections load, and a
// flag can be sent before that). null when it was never saved or is too large to send; undefined when storage could not be read, and the flag waits.
async function answerFor(f){
  const r=flagAnswerRef(f); if(!r) return null;
  /** @type {any} */ let a=(r.col==="debates"?state.debates:state.answers)[r.id];
  if(!a&&state.db){ try{ const snap=await state.db.collection(r.col).doc(r.id).get(); a=snap.exists?snap.data():null; }catch(e){ return undefined; } }
  return a&&JSON.stringify(a).length<=ANSWER_MAX?a:null;
}
export const sendFlags=ids=>inOrder(()=>sendNow(ids));
async function sendNow(ids){
  const R=state.reports; if(!R) return;
  const flags=ids.filter(id=>state.flags[id]&&!isSent(state.flags[id])).map(id=>Object.assign({},state.flags[id],{id}));
  const items=[];
  for(const f of flags){ const answer=await answerFor(f); if(answer!==undefined) items.push({id:f.id,flag:f,answer}); }
  if(!items.length) return;
  const stored=await R.send(items);
  for(const f of flags){
    if(!stored.includes(f.id)) continue;
    await flagTurn(f.id,async()=>{
      const cur=state.flags[f.id];
      // marked only if the flag is still the one that was sent: an edit made meanwhile sends itself
      if(!cur||cur.updatedAt!==f.updatedAt||isSent(cur)) return;
      const doc=Object.assign({},cur,{sentAt:new Date().toISOString()}); state.flags[f.id]=doc;
      await put("flags",f.id,doc);     // if this fails the server has the flag all the same, and the mark is set again with the next send
    });
  }
  if(state.tab==="review"&&state.mode!=="loading"&&!typingEl(document.activeElement)) render();
}
// the flags that were never sent or were edited since, oldest first, and the removals that did not reach the server; one that is waiting for its
// turn sees everything written until it starts, so a second call while one waits is the same run
export function flushFlags(){
  if(!state.reports) return Promise.resolve();
  if(order.flush) return order.flush;
  return order.flush=inOrder(()=>{ order.flush=null; return flushNow(); });
}
async function flushNow(){
  const R=state.reports; if(!R||state.flagPending) return;
  try{
    await R.flush();
    const waiting=Object.keys(state.flags).filter(id=>!isSent(state.flags[id])).sort((x,y)=>(state.flags[x].updatedAt||"").localeCompare(state.flags[y].updatedAt||""));
    const todo=[...waiting.filter(id=>!autoFlagOf(state.flags[id])).slice(0,20),...waiting.filter(id=>autoFlagOf(state.flags[id])).slice(0,50)];
    if(todo.length) await sendNow(todo);
  }catch(e){ /* tried again at the next start */ }
}
// a removed flag is taken back from the server in its turn; where there is no way to now (offline at the start, no key), the platform keeps the removal for a start that has one
export function withdrawFlag(id){
  const R=state.reports;
  if(R) inOrder(()=>R.withdraw(id)); else if(state.withdrawLater) state.withdrawLater(id);
}
