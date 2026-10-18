import { state } from "../state.js";
import { autoFlags } from "./flags.js";
import { ERR_OFF } from "../core/ask.js";
import { CELLS, REL } from "../core/rel.js";
import { typingEl } from "../core/viewport.js";
import { QCELL } from "../debate/text.js";
import { disputeText, quorumDisputes } from "../../domain/quorum.ts";
import { put } from "../practice/answers.js";
import { favSafe } from "../practice/favorites.js";
import { skipCats } from "../practice/skips.js";
import { norm } from "../practice/universe.js";
import { render, renderKeepFocus } from "../shell/render.js";

/* ---------- check lab (development): independent runs of Haiku, Sonnet and Opus on every checked answer ---------- */
// Each checked answer goes to three models as independent calls. They are told the two categories and the things the learner wrote, not which cell the
// learner chose. When their answers differ, Opus acts as judge: it rules on the thing itself and names the answers that agree with its ruling. When all agree, that
// agreement is the verdict and no judge is called (except for a small spot check). Every run is stored (collection "labruns") so the data can decide which model, or which
// chain of models, the public release uses; any part of any AI answer can be flagged by hand (collection "flags"). The page's own verdicts are unchanged.
const LAB_VER="lab-2";               // lab-2: the judge runs only where the models differ (and as a spot check), lab-1 judged every case
const labSpot=key=>state.labSpotN>0&&parseInt(hash36(key),36)%state.labSpotN===0;
export const LAB_MODELS=[{k:"haiku",id:"claude-haiku-5-5",tier:"quick",name:"Haiku"},{k:"sonnet",id:"claude-sonnet-5-5",tier:"default",name:"Sonnet"},{k:"opus",id:"claude-opus-5-5",tier:"complex",name:"Opus"}];
export const LAB_JUDGE={k:"judge",id:"claude-opus-5-5",tier:"complex",name:"Judge"};
export const labQ={}, flagQ={}, labLocal={};     // labLocal: the runs written in this session, kept apart from what the database snapshot returns
export function setLab(on){ state.lab=!!on; try{ localStorage.setItem("rd-lab",state.lab?"1":"0"); }catch(e){} render(); }
export const labShown=()=>!!(state.labSample&&state.db&&(state.lab||Object.keys(state.labruns).length||Object.keys(labLocal).length||Object.keys(state.flags).length));
export const labRuns=()=>Object.assign({},state.labruns,labLocal);
// the database snapshots; a flag write in flight keeps the snapshot from replacing what the page just changed
function labDataIn(){ if(state.tab==="review"&&state.mode!=="loading"&&!typingEl(document.activeElement)) render(); }
export function labSubscribe(){
  try{ labSubscribeNow(); }catch(e){}          // the lab is optional: a failing subscription must never stop the page from starting
}
function labSubscribeNow(){
  state.db.collection("labruns").orderBy("at","desc").limit(240).onSnapshot(snap=>{
    /** @type {Record<string, any>} */
    const m={}; snap.docs.forEach(d=>{m[d.id]=d.data();}); const same=Object.keys(m).sort().join()===Object.keys(state.labruns).sort().join(); state.labruns=m; if(!same) labDataIn(); },()=>{});
  state.db.collection("flags").orderBy("updatedAt","desc").limit(300).onSnapshot(snap=>{
    if(state.flagPending) return;
    /** @type {Record<string, any>} */ const m={}; snap.docs.forEach(d=>{m[d.id]=d.data();}); const same=JSON.stringify(Object.keys(m).sort().map(k=>[k,m[k].state,m[k].updatedAt]))===JSON.stringify(Object.keys(state.flags).sort().map(k=>[k,state.flags[k].state,state.flags[k].updatedAt]));
    state.flags=m; if(!same) labDataIn();
  },()=>{});
}
export const hash36=s=>{ let h=5381; s=String(s); for(let i=0;i<s.length;i++) h=((h<<5)+h+s.charCodeAt(i))|0; return (h>>>0).toString(36); };
const cellOfRec=r=>!r.exists?"nei":r.inA&&r.inB?"both":r.inA?"anb":r.inB?"bna":"nei";
export function labRef(){
  if(state.labRefC) return state.labRefC;
  const lines=state.DATA.cats.map(c=>{
    const names=c.labels.slice(1,6).join(", ");
    if(c.kind==="dudra"){
      const t=state.DATA.terms[c.term]||/** @type {any} */({}), d=String(t.d||"(no definition in the booklet)").replace(/\s*\((?:tables|Dampilon)\)\s*$/,"").slice(0,320);
      return "- "+c.id+": \""+c.labels[0]+"\" (Dudra term "+c.term+"; "+c.type+") Definition: "+d+(names?" Also called: "+names+".":"");
    }
    return "- "+c.id+": \""+c.labels[0]+"\" (everyday feature; "+c.type+")";
  });
  const notes=[...new Set(Object.values(state.DATA.notes||{}).flat())];
  const text="CATEGORY REFERENCE\n"+lines.join("\n")+"\n\nCLASSIFICATION NOTES\n"+notes.map(n=>"- "+n).join("\n");
  return state.labRefC={text,ver:LAB_VER+"-"+hash36(text)};
}
const LAB_TASK=`You help check answers in a course on Tibetan Buddhist Collected Topics (Dudra). Below are a category reference and one case. A case has two categories, A and B, and one to four things: short examples a learner typed.
For every thing decide, about THE THING:
- inA: is the thing a member of category A (an instance of A, so that it is correctly called A)?
- inB: the same for category B.
- exists: is it an existent (can it exist at all)? A horn of a rabbit or the child of a barren woman does not exist.
- reading: the sense of the word you used, in at most 8 words (e.g. "wooden furniture", "table of figures").
- unsure: true only if the course sources disagree on how to classify it, or you cannot tell what the thing names; otherwise false. If unsure, still give your best inA and inB.
Rules: read the thing in its ordinary sense (a song is the sound of someone singing or playing; a stone is an ordinary stone at room temperature; "me" means the person writing). Use the reference for what each category means and for the classification notes. Do not decide anything from the learner's side of the exercise: you are only told the things and the two categories.
OUTPUT: reply with one JSON object and nothing else (no markdown fences): {"things":[{"thing":"...","reading":"...","inA":true,"inB":false,"exists":true,"unsure":false}]}, one entry per thing in the same order, with exactly these keys.`;
const LAB_JUDGE_TASK=`You are the judge in a comparison of how well different models classify examples for a course on Tibetan Buddhist Collected Topics (Dudra). Below are a category reference, one case (two categories A and B, and one to four things a learner typed) and the independent answers of two or three different models that did not all agree, numbered in random order. Do not guess which model wrote which.
For every thing, rule on the right classification yourself, using the reference and its classification notes: reading (at most 8 words), inA, inB, exists, and unsure (true only if the sources disagree or you cannot tell what the thing names). Read the thing in its ordinary sense. Then list in "right" the numbers of the answers that agree with your ruling on inA, inB and exists (an empty list if none do), and give a reason in at most 20 words, naming the decisive point (a classification note, a definition).
OUTPUT: reply with one JSON object and nothing else (no markdown fences): {"things":[{"thing":"...","reading":"...","inA":true,"inB":false,"exists":true,"unsure":false,"right":[1,3],"reason":"..."}]}, one entry per thing in the same order.`;
function labCaseText(k){
  const d=(id,label)=>id&&state.CAT[id]?"category "+id+" (\""+state.CAT[id].labels[0]+"\"), shown to the learner as \""+label+"\"":"\""+label+"\"";
  return "A = "+d(k.catA,k.a)+"\nB = "+d(k.catB,k.b)+"\nThings:\n"+k.things.map((t,i)=>(i+1)+". "+JSON.stringify(t.text)).join("\n");
}
export function labParse(text,n){
  let s=String(text||"").trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,""), v;
  try{ v=JSON.parse(s); }catch(e){
    const i=s.indexOf("{"), j=s.lastIndexOf("}");
    if(i>=0&&j>i){ try{ v=JSON.parse(s.slice(i,j+1)); }catch(_){} }
    if(v===undefined){ const a=s.indexOf("["), b=s.lastIndexOf("]"); if(a>=0&&b>a){ try{ v=JSON.parse(s.slice(a,b+1)); }catch(_){} } }
  }
  const arr=Array.isArray(v)?v:v&&Array.isArray(v.things)?v.things:null;
  if(!arr||arr.length<n) return null;
  return arr.slice(0,n).map(o=>{
    const r={thing:String((o&&o.thing)||"").slice(0,120), reading:String((o&&o.reading)||"").slice(0,120), inA:!!(o&&o.inA), inB:!!(o&&o.inB), exists:!(o&&o.exists===false), unsure:!!(o&&o.unsure)};
    r.cell=cellOfRec(r);
    if(o&&Array.isArray(o.right)) r.right=o.right.filter(x=>x===1||x===2||x===3);
    if(o&&o.reason) r.reason=String(o.reason).slice(0,200);
    return r;
  });
}
// the things the learner wrote in this answer, each with the cell(s) it stood in and the page's verdict there
export function labThings(U){
  const out=[], seen={};
  const add=(text,c)=>{ const t=String(text||"").trim(), k=norm(t); if(!k) return; let o=seen[k]; if(!o){ o=seen[k]={text:t.slice(0,120),cells:[],page:{}}; out.push(o); } if(!o.cells.includes(c)){ o.cells.push(c); o.page[c]=U.res.cells[c].v; } };
  if(U.debate) QCELL.forEach((c,i)=>{ if(U.ans[i].say==="why") add(U.ans[i].text,c); });
  else CELLS.forEach(c=>{ if(!REL[U.rel].empty.includes(c)&&!U.cells[c].none) add(U.cells[c].t,c); });
  return out.slice(0,6);
}
function labWrite(col,id,doc){
  const clean=JSON.parse(JSON.stringify(doc));
  labQ[id]=(labQ[id]||Promise.resolve()).catch(()=>{}).then(()=>put(col,id,clean)).catch(e=>{ state.flagErr="A Quorum record could not be saved ("+((e&&e.code)||"error")+")."; if(state.ui&&state.ui.lab) labRender(state.ui.lab); });
}
function labPaused(until,why){ if(until>state.labPause){ state.labPause=until; state.labPauseWhy=why; } }
// A retry by hand waits for the pause like a start does; the panel says why nothing ran (the longer pause may be a day, the shorter one two minutes).
function labHeld(L){ if(Date.now()>=state.labPause){ L.held=""; return false; } L.held="Quorum is paused: "+(state.labPauseWhy||"a call failed")+"."; labRender(L); return true; }
// one model, one case; resolves when its record is stored. The model that answered must be the one asked for, else the run does not count.
async function labCall(L,m,prompt,effort,kind,extra){
  const key=L.kase.key, st=L.runs[m.k]=/** @type {{status: string, doc?: object, id?: string}} */({status:"run"}), t0=performance.now(), ref=labRef();
  /** @type {import("../types.ts").LabRunDoc} */
  const doc=Object.assign({kind,caseKey:key,model:m.id,effort,tierAsked:m.tier,promptVersion:LAB_VER,referenceVersion:ref.ver,at:new Date().toISOString(),promptChars:prompt.length,case:L.kase},extra||{});
  try{
    const r=await state.labSample(prompt,{model:m.id,modelTier:m.tier,effort,cache:false});
    doc.ms=Math.round(performance.now()-t0); doc.modelApplied=r.modelApplied||null; doc.tierApplied=r.modelTierApplied||null; doc.truncated=!!r.truncated;
    doc.raw=String(r.text||"").slice(0,3000); doc.replyChars=String(r.text||"").length;
    doc.valid=doc.modelApplied===m.id;
    const recs=labParse(r.text,L.kase.things.length);
    doc.ok=!!recs; if(recs) doc.recs=recs; else doc.error="reply was not the expected JSON";
    st.status=doc.ok?(doc.valid?"ok":"mismatch"):"bad";
  }catch(e){
    doc.ms=Math.round(performance.now()-t0); doc.ok=false; doc.valid=false; doc.error=(e&&e.code)||"error"; st.status="err";
    // no more lab calls for two minutes, or for this page load when the server's budget for them is used or it does not allow them; calls that fail together
    // differently (one hit the budget while another found the models busy) leave the longer pause
    if(e&&e.code==="rate_limited") labPaused(Date.now()+(e.budget?864e5:120000),e.budget?"the budget for Quorum is used up (it comes back tomorrow)":"the models are busy (it tries again in two minutes)");
    if(e&&ERR_OFF.includes(e.code)) labPaused(Date.now()+864e5,"the server does not allow it ("+e.code+")");
  }
  st.doc=doc;
  const id=(kind==="judge"?"lj_":"lr_")+favSafe(key)+(kind==="judge"?"":"_"+m.k);
  st.id=id; labLocal[id]=doc; labWrite("labruns",id,doc);
  return st;
}
// a render while a note is being typed would take the focus away: it waits until the field is left
function labRender(L){
  if(L.u!==state.ui) return;
  if(typingEl(document.activeElement)){ if(!L.wait){ L.wait=setTimeout(()=>{ L.wait=null; labRender(L); },1200); } return; }
  renderKeepFocus();
}
async function labRun(U,C,only,force){
  const L=U.lab; if(!L||!state.labSample) return;
  const ref=labRef(), head=LAB_TASK+"\n\n"+ref.text+"\n\nCASE\n"+labCaseText(L.kase);
  L.busy=true; L.held=""; labRender(L);
  const todo=LAB_MODELS.filter(m=>!only||only.includes(m.k));
  await Promise.all(todo.map(m=>labCall(L,m,head,"medium","classify").then(()=>labRender(L))));
  await labJudge(U,force);
  L.busy=false; labFlagDisputes(L); labRender(L);
}
const labGood=L=>LAB_MODELS.map(m=>L.runs[m.k]).filter(s=>s&&s.status==="ok");
const labDiffers=L=>{ const g=labGood(L); return L.kase.things.some((t,i)=>new Set(g.map(s=>s.doc.recs[i].cell)).size>1); };
// The judge is called when the valid answers differ on any thing, on a spot check of unanimous ones, or when asked (why = "asked"). Its record says which.
async function labJudge(U,force){
  const L=U.lab, ref=labRef(), good=labGood(L);
  if(good.length<2){ L.judgeWhy=null; return; }
  L.judgeWhy=force||(labDiffers(L)?"disagree":labSpot(L.kase.key)?"spot":null);
  if(!L.judgeWhy) return;
  // the answers go to the judge in random order and without the model names
  const order=good.map(s=>s.id).sort(()=>Math.random()-.5);
  const answers=order.map((id,i)=>"ANSWER "+(i+1)+"\n"+JSON.stringify({things:labLocal[id].recs.map(r=>({thing:r.thing,reading:r.reading,inA:r.inA,inB:r.inB,exists:r.exists,unsure:r.unsure}))})).join("\n\n");
  L.runs.judge={status:"run"}; labRender(L);
  await labCall(L,LAB_JUDGE,LAB_JUDGE_TASK+"\n\n"+ref.text+"\n\nCASE\n"+labCaseText(L.kase)+"\n\n"+answers,"high","judge",{order,why:L.judgeWhy});
}
// Where Quorum is divided about an example, the page flags it by itself (see autoFlags). The page's verdict is read now, so a verdict Claude gave since the check counts.
// `again`: the tutor's explanation came after the models. What this round of the models had flagged is only updated where its flag is still there (the verdict it
// names may have changed), so a flag the learner deleted meanwhile stays deleted (it comes back only when the models are run again); the rest is flagged as usual.
function labFlagDisputes(L,again){
  try{
    const J=L.runs.judge, judge=J&&J.status==="ok"&&J.doc&&J.doc.recs?J.doc.recs.map(r=>r.cell):null;
    const models=LAB_MODELS.filter(m=>L.runs[m.k]&&L.runs[m.k].status==="ok").map(m=>({name:m.name,cells:L.runs[m.k].doc.recs.map(r=>r.cell)}));
    const things=L.kase.things.map(t=>({text:t.text,cells:t.cells,page:Object.fromEntries(t.cells.map(c=>[c,L.u.res&&L.u.res.cells[c]?L.u.res.cells[c].v:t.page[c]]))}));
    let found=quorumDisputes(things,models,judge).map(d=>({thing:things[d.index].text,shown:disputeText(d,things[d.index])}));
    const before=again?Object.assign({},L.raised):{}; if(!again) L.raised={};
    for(const f of found) (L.raised||(L.raised={}))[f.thing]=1;
    autoFlags(L.kase,found.filter(f=>!before[f.thing]));
    autoFlags(L.kase,found.filter(f=>before[f.thing]),true);
  }catch(e){}          // the lab is optional: a failing flag must never break the page
}
// The tutor's explanation can change the page's verdicts after the lab has finished (applyVerify); the same final verdicts must give the same flags whichever came
// first, so the disputes are read again. A lab still at work reads them when it ends.
export function labRecheck(U){ const L=U&&U.lab; if(L&&!L.busy) labFlagDisputes(L,true); }
// ask the judge about an answer all models agreed on
export async function labJudgeNow(){
  const U=state.ui; if(!U||!U.lab||U.lab.busy||labGood(U.lab).length<2||labHeld(U.lab)) return;
  U.lab.busy=true; labRender(U.lab); await labJudge(U,"asked"); U.lab.busy=false; labFlagDisputes(U.lab); labRender(U.lab);
}
export function labStart(U,C){
  if(!state.lab||!state.labSample||!state.db||!state.DATA||U.lab||!U.res||!U.checked||Date.now()<state.labPause) return;
  const things=labThings(U); if(!things.length) return;
  const p=C.p, [ca,cb]=skipCats(p);
  const kase={tab:U.debate?"debate":"practice",answerId:U.saveId||null,a:p.a,b:p.b,catA:ca,catB:cb,relation:p.relation,chosen:U.late?null:U.rel,things};
  kase.key=(U.col||"answers")+"_"+(U.saveId||("t"+Date.now().toString(36)));
  U.lab={kase,runs:{},busy:false,u:U};
  labRun(U,C);
}
// Why Quorum did not start for a checked answer: the chip says so, so that a switch that is on never looks like a lab that is missing.
export function labWhyNot(U){
  if(Date.now()<state.labPause) return "Quorum is paused: "+(state.labPauseWhy||"a call failed")+".";
  if(U.res&&!labThings(U).length) return "Nothing to check: no example was written. Quorum classifies the examples you write"+(U.debate?" (here the answers to Why?)":" in the cells")+".";
  return "Quorum did not start for this answer.";
}
export function labAgain(){ const U=state.ui; if(!U||!U.lab||U.lab.busy||labHeld(U.lab)) return; const bad=LAB_MODELS.filter(m=>{ const s=U.lab.runs[m.k]; return !s||s.status!=="ok"; }).map(m=>m.k); delete U.lab.runs.judge; labRun(U,state.cur,bad.length?bad:null); }
