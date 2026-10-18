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
  // not while a write of a flag is pending: its optimistic document would go, and if the write then fails and is undone the server would keep a flag the device does not have (the last write to end runs the flush)
  const R=state.reports; if(!R||state.flagPending) return;
  const flags=ids.filter(id=>state.flags[id]&&!isSent(state.flags[id])).map(id=>Object.assign({},state.flags[id],{id}));
  const items=[];
  for(const f of flags){ const answer=await answerFor(f); if(answer!==undefined) items.push({id:f.id,flag:f,answer}); }
  // a flag removed while its exercise was being read stays out: sending starts by clearing the removal kept for its id, which must not be lost (there is no wait between this line and that)
  const going=items.filter(i=>state.flags[i.id]);
  if(!going.length) return;
  const stored=await R.send(going);
  for(const f of flags){
    if(!stored.includes(f.id)) continue;
    await flagTurn(f.id,async()=>{
      const cur=state.flags[f.id];
      // marked only if the flag is still the one that was sent: an edit made meanwhile sends itself
      if(!cur||cur.updatedAt!==f.updatedAt||isSent(cur)) return;
      // never earlier than the revision: a flag edited on a device whose clock is ahead has an `updatedAt` later than now, and would stay unsent and go again
      const now=new Date().toISOString(), doc=Object.assign({},cur,{sentAt:now>cur.updatedAt?now:cur.updatedAt}); state.flags[f.id]=doc;
      await put("flags",f.id,doc);     // if this fails the server has the flag all the same, and the mark is set again with the next send
    });
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
      // in turn with the flag's other writes, and looked at again then (flagTurn): an edit or a removal made while an earlier write waited is not written over
      await flagTurn(t.id,async()=>{
        const now=state.flags[t.id];
        if(!now||now.updatedAt!==asked.get(t.id)||!isSent(now)) return;
        const doc=Object.assign({},now,{review}); state.flags[t.id]=doc; changed=true;
        await put("flags",t.id,doc);      // if this fails the reply is kept for this visit and asked for again at the next
      });
    }
    if(changed&&state.tab==="review"&&state.mode!=="loading"&&!typingEl(document.activeElement)) render();
  }catch(e){ /* asked again later */ }
  finally{ state.repliesBusy=false; }
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
  checkReplies();
}
// A removed flag is taken back from the server in its turn. The removal is kept on the device at once (platform.withdrawReport), before it waits for the uploads ahead of it, so
// that closing the page then does not lose it; where there is no way to send it now (offline at the start, no key), the next start that has one does.
export function withdrawFlag(id){
  if(state.withdrawLater) state.withdrawLater(id);
  const R=state.reports;
  if(R) inOrder(()=>R.withdraw(id));
}
