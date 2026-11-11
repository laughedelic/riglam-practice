import { state } from "./state.js";
import { aiCase, autoFlags, flagId, flagsSubscribe, openFlag, removeFlag, saveFlag, setFlagState } from "./ai/flags.js";
import { flushFlags } from "./ai/flag-reports.js";
import { loadKnown } from "./ai/known.js";
import { quorumThings, setQuorum, setQuorumOffer } from "./ai/quorum.js";
import { loadExamples } from "./core/examples.js";
import { fromSixth, refOf } from "./core/rel.js";
import { favKey } from "./practice/favorites.js";
import { advance, next } from "./practice/queue.js";
import { choose } from "./practice/screen.js";
import { SKIP_DAYS, hiddenKeys, isSkipped, skipPair } from "./practice/skips.js";
import { defParts } from "./practice/terms.js";
import { buildPool, indexData, nextGenerated } from "./practice/universe.js";
import { startStops } from "./practice/stops.ts";
import { closeGiven, givenAside, givenLine, givenNow, givenShown, openGiven, resumeGiven } from "./practice/given.ts";
import { givenQuestion } from "../domain/given.ts";
import { dailyEnded, dailyOptions, dailyShown, dailyToday, leaveDaily, moreDaily, startDaily } from "./practice/daily.ts";
import { challengePageOn, challengeShown, challengeView, loadChallenge, openItem, setChallenge, showChallenge } from "./practice/challenge.ts";
import { watchProgress } from "./practice/progress.ts";
import { signature } from "../ui/account";
import { setDefLang } from "./shell/session.js";
import { openKey } from "./shell/options.js";
import { render } from "./shell/render.js";
import { startFirst } from "./shell/tabs.js";
import { takeAttempt } from "./shell/keep.ts";
import "./core/viewport.js";
import "./shell/keys.js";
import "./shell/history.js";
import "./debate/text.js";
import "./shell/timers.js";
import { voiceOn } from "../ui/speech";
import { armVoice } from "./shell/voice.js";
import { refreshPath, startPath } from "./path/index.tsx";
import { startNews } from "./path/news.tsx";
import { startPerExercise } from "./practice/per-exercise.ts";
import { armSounds } from "./sound/play.ts";

/* ---------- boot ---------- */
// The page knows its host only through the platform it is started with (src/platform/types.ts): the term data and the
// capabilities `db`, `sample` and `tutor`, any of which may be missing.
export function startApp(platform){
  // Answering by voice is on trial: the device's own choice, else on in a Preview and off in the real app (Read aloud is for everyone)
  let kept=null; try{ kept=localStorage.getItem("rd-voice"); }catch(e){}
  state.voice.on=voiceOn(kept,!!platform.preview);
  // The natural voices of the server are on trial too (Experiments): the same default
  let nat=null; try{ nat=localStorage.getItem("rd-voice-natural"); }catch(e){}
  state.voice.natural=voiceOn(nat,!!platform.preview);
  try{ state.voice.hush=localStorage.getItem("rd-voice-hush")==="1"; }catch(e){}
  state.preview=!!platform.preview;
  startPath();
  startPerExercise();                // Blitz, the tutor and voice as the exercise on screen has them
  armSounds();                       // the audio context for the sounds is made and woken by the first touch
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
  try{ state.DATA=await platform.loadData(); indexData(); buildPool(); startStops(); }
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
  await loadSpeaker(platform);
  // the reference examples arrive in the background (the first time a key is used, or when the server has newer ones): read them when they do
  // (listening first, so that a copy that arrives while this reads is not missed)
  if(platform.onExamples) platform.onExamples(()=>{ loadExamples(platform).then(()=>{ if(state.mode!=="loading") render(); }); });   // the menu and Categories show what the examples allow
  await loadExamples(platform);
  // the challenge that everyone gets now arrives the same way, and may be taken away again (practice/challenge.ts): the roadmap has its stop while there is one
  if(platform.onChallenge) platform.onChallenge(()=>{ loadChallenge(platform); });
  await loadChallenge(platform);
  await loadKnown(platform);
  try{ state.reports=platform.reports?await platform.reports():null; }catch(e){ state.reports=null; }
  state.withdrawLater=platform.withdrawReport||null;
  try{ setQuorumOffer(state.tutor&&platform.quorum?await platform.quorum():false); }catch(e){ setQuorumOffer(false); }
  try{ state.account=platform.account?await platform.account():null; }catch(e){ state.account=null; }
  // which build this is: asked in the background (it looks at the server), shown in the menu and in Settings when it arrives
  if(platform.about) platform.about().then(a=>{ state.about=a; if(state.optsOpen) render(); else refreshPath(); },()=>{});
  // updating in place: the platform tells when a newer version is ready; the menu and Settings show where it stands
  state.updates=platform.updates||null;
  if(state.updates) state.updates.subscribe(()=>{ if(state.optsOpen) render(); else refreshPath(); });   // (the roadmap shows where the look for a newer version stands)
  // the device's storage: when it does not answer in time (or answers after all) the pinned line and Settings' Storage page say so
  state.storage=platform.storage||null;
  if(state.storage) state.storage.subscribe(()=>{ if(state.mode==="loading") return; if(state.optsOpen) render(); else refreshPath(); });
  // A Magic Key entered on the Magic Key page is taken in place (no reload), so the pair on the screen and the answer being given stay.
  if(platform.onKey) platform.onKey(()=>rekey(platform));
  if(state.account){ let seen=signature(state.account.view()); state.account.subscribe(v=>{ const now=signature(v); if(now!==seen){ seen=now; if(state.optsOpen) render(); } }); }
  if(!state.db){ state.gotA=state.gotB=state.gotS=true; firstScreen(); return; }
  waiting(()=>"the saved "+[!state.gotB&&"batches",!state.gotA&&"answers",!state.gotS&&"skipped pairs"].filter(Boolean).join(", ")+" on this device");
  state.db.collection("batches").orderBy("order","asc").onSnapshot(snap=>{
    state.batches=snap.docs.map(d=>Object.assign({id:d.id},d.data())); state.gotB=true; settle();
  },()=>{ state.gotB=true; settle(); });
  state.db.collection("answers").onSnapshot(snap=>{
    const m={}; snap.docs.forEach(d=>{m[d.id]=fromSixth(d.data());}); state.answers=m; state.gotA=true; settle();
  },()=>{ state.gotA=true; settle(); });
  state.db.collection("favorites").onSnapshot(snap=>{
    const m={}; snap.docs.forEach(d=>{m[d.id]=fromSixth(d.data());});
    const same=Object.keys(m).sort().join()===Object.keys(state.favs).sort().join(); state.favs=m;
    if(!same&&state.mode!=="loading") render();
  },()=>{});
  state.db.collection("skips").onSnapshot(snap=>{
    const m={}; snap.docs.forEach(d=>{m[d.id]=fromSixth(d.data());});
    const same=Object.keys(m).sort().join()===Object.keys(state.skips).sort().join(); state.skips=m; state.gotS=true;
    if(state.mode==="loading") settle(); else if(!same&&state.tab==="review") render();
  },()=>{ state.gotS=true; settle(); });
  setTimeout(()=>{ if(!state.gotS){ state.gotS=true; settle(); } },2500);       // never hold the first pair for the skips
  flagsSubscribe();
  watchProgress();      // the progression, as another device or tab changes it (practice/progress.ts)
  state.db.collection("debates").onSnapshot(snap=>{
    const m={}; snap.docs.forEach(d=>{m[d.id]=d.data();}); state.debates=m; settle();
  },()=>{});
}
// The server's natural voices for reading aloud, when it has them, this device has the key and the Natural voices switch is on (shell/voice.js: the voice list and the reading use them, the device's voice is the fallback)
async function loadSpeaker(platform){
  try{ state.voice.speaker=platform.speak?await platform.speak():null; }catch(e){ state.voice.speaker=null; }
  state.voice.remote=state.voice.natural?state.voice.speaker:null;
  state.voice.remoteUntil=0; state.voice.remoteWhy="";
  armVoice();
}
// What depends on the key, read again after the Magic Key page took one: the definitions in the data, the tutor (and what is known without it), and the Settings row (enter a key / change it).
async function rekey(platform){
  state.DATA=await platform.loadData(); indexData(); buildPool();
  try{ state.unlock=platform.unlock?await platform.unlock():null; }catch(e){ state.unlock=null; }
  try{ state.keyHeld=platform.keyHeld?await platform.keyHeld():null; }catch(e){ state.keyHeld=null; }
  try{ state.tutor=platform.tutor?await platform.tutor():null; }catch(e){ state.tutor=null; }
  await loadSpeaker(platform);
  await loadExamples(platform);
  await loadChallenge(platform);
  await loadKnown(platform);
  try{ state.reports=platform.reports?await platform.reports():null; }catch(e){ state.reports=null; }
  try{ setQuorumOffer(state.tutor&&platform.quorum?await platform.quorum():false); }catch(e){ setQuorumOffer(false); }
  state.keyAsk=false;
  flushFlags();                   // flags that were waiting for a key go now
  if(state.mode!=="loading") render();
}
/**
 * The first screen of a cold start: the roadmap, so that the learner chooses where to go (the cover of the installed app flies into it: pwa/cover.ts), unless an attempt was under way
 * when the app was put away (shell/keep.ts): then its exercise, as it was. `rd-start` set to "exercise" keeps the exercise the app was last in instead (the browser tests set it).
 * It is drawn without the slide: the roadmap is there from the first draw, and the cover measures where its figure goes.
 */
function firstScreen(){
  const back=takeAttempt();
  if(!back) startFirst();
  let start=""; try{ start=localStorage.getItem("rd-start")||""; }catch(e){}
  if(!back&&start!=="exercise"&&state.tab!=="review"&&!state.optsOpen){ state.menuOpen=true; state.motion=false; }
  // a key that went wrong at the start (a link whose key does not fit, a key that was changed) is said on the Magic Key page, which opens over that first screen
  const why=state.unlock&&state.unlock.problem;
  if(why){ state.unlock.problem=null; state.motion=false; openKey(null,why); return; }
  render();
  startNews();                      // after an Update: What's new (path/news.tsx)
}
function settle(){
  if(!state.gotB||!state.gotA||!state.gotS) return;
  if(state.mode==="loading"){ firstScreen(); return; }
  if(state.tab==="review") render();
}

/* ---------- test hook (begin): lets the browser tests in tests/ read internals; inert unless a test defines window.__riglamTest ---------- */
function exposeTestHook(){
if(typeof window.__riglamTest==="function") window.__riglamTest({get cur(){return state.cur},get ui(){return state.ui},get tab(){return state.tab},get favs(){return state.favs},get mode(){return state.mode},get view(){return state.view},get coachOpen(){return state.coachOpen},set coachOpen(v){state.coachOpen=v},get optsOpen(){return state.optsOpen},get navGuard(){return state.navGuard},favKey,refOf,render,choose,defParts,setDefLang,get defLang(){return state.defLang},get langs(){return state.langs},get DATA(){return state.DATA},get EX(){return state.EX},get intro(){return state.intro},get stageRun(){return state.stageRun},get exRuns(){return state.exRuns},get stages(){return state.stages},next,advance,get skips(){return state.skips},set skips(v){state.skips=v},skipPair,isSkipped,hiddenKeys,get POOL(){return state.POOL},nextGenerated,SKIP_DAYS,get quorum(){return state.quorum},get quorumOffered(){return state.quorumOffered},get quorumOptIn(){return state.quorumOptIn},setQuorum,quorumThings,get flags(){return state.flags},flagId,openFlag,saveFlag,removeFlag,setFlagState,aiCase,autoFlags,
  // a given question (practice/given.ts): made from what is written down, with the learner's stages and terms unless `o` says others, then opened, set aside, resumed, closed
  given:{make:(g,o)=>givenQuestion(state,g,{...givenNow(),...o}),open:openGiven,resume:resumeGiven,close:closeGiven,shown:givenShown,aside:givenAside,line:givenLine},
  // Daily practice (practice/daily.ts): the session under way, whether its question is on screen, how many were done today, and the roadmap stop's action
  daily:{get run(){return state.daily},get options(){return dailyOptions()},shown:dailyShown,ended:dailyEnded,today:dailyToday,start:startDaily,more:moreDaily,leave:leaveDaily},
  // the kept answers of Relations and of the exercises kept with them: a spec adds one to stand for an earlier miss
  get answers(){return state.answers},
  // the storage the app was started with: a spec takes it away (null) to stand for a device that has none
  get db(){return state.db},set db(v){state.db=v},
  // the challenge (practice/challenge.ts): what the page has of it, a way to give it one without a server, its page and its questions
  challenge:{get now(){return state.chal},view:challengeView,set:setChallenge,show:showChallenge,open:openItem,shown:challengeShown,page:challengePageOn}});
}
/* ---------- test hook (end) ---------- */
