import { state } from "./state.js";
import { aiCase, aiFlag, autoFlags, decorateAns, flagId, flagsSubscribe, openFlag, removeFlag, saveFlag, setFlagState } from "./ai/flags.js";
import { quorumThings, setQuorum, setQuorumOffer } from "./ai/quorum.js";
import { refOf } from "./core/rel.js";
import { favKey } from "./practice/favorites.js";
import { advance, next } from "./practice/queue.js";
import { choose, fbNode } from "./practice/screen.js";
import { SKIP_DAYS, hiddenKeys, isSkipped, skipPair, undoSkip } from "./practice/skips.js";
import { defParts, termsNode } from "./practice/terms.js";
import { buildPool, indexData, nextGenerated } from "./practice/universe.js";
import { signature } from "../ui/account";
import { setDefLang } from "./shell/options.js";
import { render, renderSession } from "./shell/render.js";
import "./core/viewport.js";
import "./shell/keys.js";
import "./debate/text.js";
import "./shell/timers.js";

/* ---------- boot ---------- */
// The page knows its host only through the platform it is started with (src/platform/types.ts): the term data and the
// capabilities `db`, `sample` and `tutor`, any of which may be missing.
export function startApp(platform){
  render();
  boot(platform);
  exposeTestHook();
}
// What the start is waiting for, in words: the recovery panel of the PWA page (index.html) shows it when the start takes too long.
function waiting(what){ try{ window.__riglamWaiting=typeof what==="function"?what:()=>what; }catch(e){} }
async function boot(platform){
  try{ await bootSteps(platform); }
  catch(e){ try{ window.__riglamFailed=String(e&&e.message||e); }catch(_){} throw e; }
}
async function bootSteps(platform){
  waiting("the practice data");
  try{ state.DATA=await platform.loadData(); indexData(); buildPool(); }
  catch(e){ state.mode="nodata"; render(); return; }
  waiting("the storage on this device");
  try{ state.db=await platform.db(); }catch(e){ state.db=null; }
  waiting("the other parts of the app");
  try{ state.sample=await platform.sample(); }catch(e){ state.sample=null; }
  try{ state.unlock=platform.unlock?await platform.unlock():null; }catch(e){ state.unlock=null; }
  try{ state.keyHeld=platform.keyHeld?await platform.keyHeld():null; }catch(e){ state.keyHeld=null; }
  // the server may need seconds to say whether it has a tutor: the page opens first and draws again when the answer comes
  if(state.unlock&&state.unlock.answer){ const u=state.unlock; u.answer.then(on=>{ u.tutor=!!on; if(state.mode!=="loading") render(); },()=>{}); }
  try{ state.tutor=platform.tutor?await platform.tutor():null; }catch(e){ state.tutor=null; }
  try{ setQuorumOffer(state.tutor&&platform.quorum?await platform.quorum():false); }catch(e){ setQuorumOffer(false); }
  try{ state.account=platform.account?await platform.account():null; }catch(e){ state.account=null; }
  // which build this is: asked in the background (it looks at the server), shown in Options when it arrives
  if(platform.about) platform.about().then(a=>{ state.about=a; if(state.optsOpen) render(); },()=>{});
  // updating in place: the platform tells when a newer version is ready; Options shows where it stands
  state.updates=platform.updates||null;
  if(state.updates) state.updates.subscribe(()=>{ if(state.optsOpen) render(); });
  // A Magic Key entered in the prompt is taken in place (no reload), so the pair on the screen and the answer being given stay.
  if(platform.onKey) platform.onKey(()=>rekey(platform));
  if(state.account){ let seen=signature(state.account.view()); state.account.subscribe(v=>{ const now=signature(v); if(now!==seen){ seen=now; if(state.optsOpen) render(); } }); }
  if(!state.db){ state.gotA=state.gotB=state.gotS=true; advance(); state.mode="quiz"; render(); return; }
  waiting(()=>"the saved "+[!state.gotB&&"batches",!state.gotA&&"answers",!state.gotS&&"skipped pairs"].filter(Boolean).join(", ")+" on this device");
  state.db.collection("batches").orderBy("order","asc").onSnapshot(snap=>{
    state.batches=snap.docs.map(d=>Object.assign({id:d.id},d.data())); state.gotB=true; settle();
  },()=>{ state.gotB=true; settle(); });
  state.db.collection("answers").onSnapshot(snap=>{
    const m={}; snap.docs.forEach(d=>{m[d.id]=d.data();}); state.answers=m; state.gotA=true; settle();
  },()=>{ state.gotA=true; settle(); });
  state.db.collection("favorites").onSnapshot(snap=>{
    const m={}; snap.docs.forEach(d=>{m[d.id]=d.data();});
    const same=Object.keys(m).sort().join()===Object.keys(state.favs).sort().join(); state.favs=m;
    if(!same&&state.mode!=="loading") render();
  },()=>{});
  state.db.collection("skips").onSnapshot(snap=>{
    const m={}; snap.docs.forEach(d=>{m[d.id]=d.data();});
    const same=Object.keys(m).sort().join()===Object.keys(state.skips).sort().join(); state.skips=m; state.gotS=true;
    if(state.mode==="loading") settle(); else if(!same&&state.tab==="review") render();
  },()=>{ state.gotS=true; settle(); });
  setTimeout(()=>{ if(!state.gotS){ state.gotS=true; settle(); } },2500);       // never hold the first pair for the skips
  flagsSubscribe();
  state.db.collection("debates").onSnapshot(snap=>{
    const m={}; snap.docs.forEach(d=>{m[d.id]=d.data();}); state.debates=m; settle();
  },()=>{});
}
// What depends on the key, read again after the prompt took one: the definitions in the data, the tutor, and the Options row (enter a key / change it).
async function rekey(platform){
  state.DATA=await platform.loadData(); indexData(); buildPool();
  try{ state.unlock=platform.unlock?await platform.unlock():null; }catch(e){ state.unlock=null; }
  try{ state.keyHeld=platform.keyHeld?await platform.keyHeld():null; }catch(e){ state.keyHeld=null; }
  try{ state.tutor=platform.tutor?await platform.tutor():null; }catch(e){ state.tutor=null; }
  try{ setQuorumOffer(state.tutor&&platform.quorum?await platform.quorum():false); }catch(e){ setQuorumOffer(false); }
  state.keyAsk=false;
  if(state.mode!=="loading") render();
}
function settle(){
  if(!state.gotB||!state.gotA||!state.gotS) return;
  if(state.mode==="loading"){ advance(); render(); return; }
  if(state.tab==="review") render(); else renderSession();
}

/* ---------- test hook (begin): lets the browser tests in tests/ read internals; inert unless a test defines window.__riglamTest ---------- */
function exposeTestHook(){
if(typeof window.__riglamTest==="function") window.__riglamTest({get cur(){return state.cur},get ui(){return state.ui},get tab(){return state.tab},get favs(){return state.favs},get mode(){return state.mode},get view(){return state.view},get optsOpen(){return state.optsOpen},favKey,refOf,render,choose,fbNode,defParts,termsNode,setDefLang,get defLang(){return state.defLang},get DATA(){return state.DATA},next,advance,get skips(){return state.skips},set skips(v){state.skips=v},skipPair,undoSkip,isSkipped,hiddenKeys,get POOL(){return state.POOL},nextGenerated,SKIP_DAYS,get quorum(){return state.quorum},get quorumOffered(){return state.quorumOffered},get quorumOptIn(){return state.quorumOptIn},setQuorum,quorumThings,get flags(){return state.flags},flagId,openFlag,saveFlag,removeFlag,setFlagState,aiCase,aiFlag,autoFlags,decorateAns});
}
/* ---------- test hook (end) ---------- */
