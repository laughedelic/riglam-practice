import { state } from "../state.js";
import { render } from "../shell/render.js";

/* ---------- saving answers ---------- */
// A write that fails with "unavailable" (a passing platform fault) or an unknown code is retried once after a short
// random delay. An answer that still fails stays in `unsaved` and is written again after the next answer saves.
const unsaved={};
const NO_RETRY=["invalid_argument","quota_exceeded","resource_exhausted","revoked","not_granted","capability_disabled","capability_removed","transform_error"];
export async function put(col,id,doc){
  const go=()=>state.db.collection(col).doc(id).set(doc);
  try{ await go(); }
  catch(e){ if(e&&NO_RETRY.includes(e.code)) throw e; await new Promise(r=>setTimeout(r,500+Math.random()*1000)); await go(); }
}
// Writes to one answer run one at a time; a retry of an old answer is skipped once a newer write has saved it.
// Practice answers go to "answers", debates to "debates"; the unsaved list is keyed by collection and id.
const writing={};
function saveAnswer(col,id,doc,flush=true){
  const key=col+"/"+id;
  unsaved[key]={col,id,doc};
  const run=async()=>{ if(!flush&&(!unsaved[key]||unsaved[key].doc!==doc)) return; await put(col,id,doc); if(unsaved[key]&&unsaved[key].doc===doc) delete unsaved[key]; };
  const p=writing[key]=(writing[key]||Promise.resolve()).catch(()=>{}).then(run);
  if(flush) p.then(()=>{ for(const [k,o] of Object.entries(unsaved)) if(k!==key) saveAnswer(o.col,o.id,o.doc,false).catch(()=>{}); },()=>{});
  return p;
}
// Saves the answer on screen (u is that pair's state, so a late result lands on the right pair).
export function persist(u,what){
  if(!state.db||!u.doc||!u.saveId) return;
  saveAnswer(u.col||"answers",u.saveId,u.doc).then(()=>{ if(u.saveErr){ u.saveErr=""; if(u===state.ui) render(); } }).catch(e=>{
    const c=(e&&e.code)||"error";
    u.saveErr=NO_RETRY.includes(c)?what+" is on screen but could not be saved ("+c+"), so it will not appear in Review."
      :what+" is on screen but was not saved: the database did not respond. The page tries again after your next answer; until then it is missing from Review.";
    if(u===state.ui) render();
  });
}
