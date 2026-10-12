const lcRel=s=>s.replace(/^[A-Z]/,c=>c.toLowerCase());
const REL = {
  mi:   {code:"MI", name:"Mutually inclusive", gloss:(a,b)=>"All "+a+" are "+b+", and all "+b+" are "+a, sets:["=","",""], logic:["⇔","",""], empty:["anb","bna"]},
  con:  {code:"MX", name:"Mutually exclusive", gloss:()=>"Nothing is both", sets:["∩","","= ∅"], logic:["⇒","¬",""], empty:["both"]},
  "3ab":{code:"3P", name:"Three possibilities, A in B", gloss:(a,b)=>"All "+a+" are "+b+", not the reverse", sets:["⊂","",""], logic:["⇒","",""], empty:["anb"]},
  "3ba":{code:"3P", name:"Three possibilities, B in A", gloss:(a,b)=>"All "+b+" are "+a+", not the reverse", sets:["⊃","",""], logic:["⇐","",""], empty:["bna"]},
  "4":  {code:"4P", name:"Four possibilities", gloss:()=>"They overlap; neither contains the other", sets:["∩","","≠ ∅"], logic:["⇏","¬",""], empty:[]}
};
const ORDER=["mi","3ab","3ba","4","con"];
const CELLS=["both","anb","bna","nei"];
const ERR_OFF=["not_granted","sampling_disabled","not_declared","capability_disabled","capability_removed"];
const TIER="default";

/* Standing instructions for the tutor. Facts about the two categories come from the per-pair card
   built from drill-data.json (the Dudra booklet's terms); anything else the tutor looks up with tools. */
const GUIDE = `You are a terse debate tutor for one learner of Gelug Collected Topics (Dudra, Purbuchok's textbook as taught in the course booklet). Ground every claim in the card below or in what the tools return; if neither covers a point, say it is your own reading.
Decision procedure for two phenomena A and B: is there a common locus (an existent that is both)? If not, mutually exclusive (the booklet data calls such terms contradictory). If so: whatever is A is B and whatever is B is A -> mutually inclusive; only one way -> three possibilities; neither way -> four possibilities. The "neither" cell takes anything that is neither, a non-existent such as the horn of a rabbit included (the class convention, Perdue 1992:393); an existent is the better example when there is one. The other three cells need existents.
Style: no greetings, praise, encouragement or filler. The learner sees your answer exactly as written, so settle every judgment silently before writing it; never state a judgment and then reverse it, never write "wait" or "actually". Plain text, no Markdown. Short lines; a line may start with a label and a colon ("Neither: ..."), which the page bolds. At most 110 words unless the learner asks for more.`;

let DATA=null, CAT={}, ITEMIDX={}, ALIASIDX={}, LABELIDX={};
let db=null, sample=null;
let batches=[], answers={}, gotB=false, gotA=false, gotS=false;
let tab="practice", mode="loading", ui=null, cur=null, retryQ=[], recent=[];
let debates={}, own="practice"; const hold={};
let favs={}, favErr="", retryTag="Retry"; const openFavs=new Set(), favQ={};
let nota="codes";
let optsOpen=false, view=null, reviewSeg="overview";
const wideMq=window.matchMedia("(min-width:1100px)"), isWide=()=>wideMq.matches;
// A phone keyboard covers part of the screen. The app follows the visible area, and the tab bar steps aside while a field is in use.
const vv=window.visualViewport;
function syncVv(){
  const r=document.documentElement.style;
  if(vv&&!isWide()&&vv.height<innerHeight-120){ r.setProperty("--vvh",Math.round(vv.height)+"px"); r.setProperty("--vvt",Math.round(vv.offsetTop)+"px"); }
  else { r.removeProperty("--vvh"); r.removeProperty("--vvt"); }
}
if(vv){ vv.addEventListener("resize",syncVv); vv.addEventListener("scroll",syncVv); }
const typingEl=n=>!!n&&(n.tagName==="INPUT"||n.tagName==="TEXTAREA");
document.addEventListener("focusin",e=>{ if(typingEl(e.target)&&matchMedia("(pointer:coarse)").matches) document.documentElement.classList.add("typing"); });
document.addEventListener("focusout",()=>{ setTimeout(()=>{ if(!typingEl(document.activeElement)) document.documentElement.classList.remove("typing"); },80); });
try{ const v=localStorage.getItem("rd-notation"); if(v==="sets"||v==="logic") nota=v; }catch(e){}
let defLang="en";                                           // definitions in the Terms panel: "en", or "enru" (English with the Russian definition and the Russian name of each term)
try{ if(localStorage.getItem("rd-deflang")==="enru") defLang="enru"; }catch(e){}   // an earlier "off" (words only) is now the codes

const $=id=>document.getElementById(id);
function el(tag, props, ...kids){
  const n=document.createElement(tag);
  if(props) for(const [k,v] of Object.entries(props)){
    if(v==null||v===false) continue;
    if(k==="class") n.className=v;
    else if(k==="text") n.textContent=v;
    else if(k==="style") n.setAttribute("style",v);
    else if(k.startsWith("on")) n.addEventListener(k.slice(2),v);
    else n.setAttribute(k, v===true?"":v);
  }
  for(const c of kids.flat()) if(c!=null&&c!==false) n.append(c.nodeType?c:document.createTextNode(String(c)));
  return n;
}
const pairsOf=b=>Array.isArray(b&&b.pairs)?b.pairs:[];
function freshUi(){return {rel:null, open:true, cells:{both:{t:"",none:false},anb:{t:"",none:false},bna:{t:"",none:false},nei:{t:"",none:false}}, checked:false, res:null, chat:null, chatErr:"", q:"", ci:0, seen:0, review:false, rtab:"auto", pop:null, defs:false, tq:null, tid:null, tph:null, late:false, exLate:false};}
const fmtN=n=>("A "+n[0]+" "+n[1]+"B"+(n[2]?" "+n[2]:"")).replace(/\s+/g," ");
const notaParts=k=>REL[k]?(nota==="sets"?REL[k].sets:nota==="logic"?REL[k].logic:[REL[k].code,"",""]):null;
const notaOf=k=>{const n=notaParts(k); return n?(nota==="codes"?n[0]:fmtN(n)):"";};
const L=x=>el("span",{class:"L"+(x==="B"?" lb":""),text:x});
const gradeOf=a=>a?(a.grade||(a.correct?"ok":"bad")):"";
const isMiss=a=>{ const g=gradeOf(a); return g==="bad"||g==="part"; };
const cap=s=>s?s[0].toUpperCase()+s.slice(1):s;
const pick=a=>a[Math.floor(Math.random()*a.length)];
const dayOf=iso=>(iso||"").slice(0,10);
const today=()=>new Date().toISOString().slice(0,10);
// A non-existent (the horn of a rabbit) is a possibility in the "neither" cell, as the class takes it, so that cell
// always has a reference even for old saved pairs that stored none. Perdue 1992:393 and 2014:1026.
const RABBIT="the horn of a rabbit";
function refOf(p,c){ const k=p.ex&&p.ex[c]; return k||(c==="nei"?RABBIT:null); }
function cellLabel(c,p){return {both:"both", anb:p.a+", not "+p.b, bna:p.b+", not "+p.a, nei:"neither"}[c];}

/* ---------- the practice universe ---------- */
function indexData(){
  CAT={}; for(const c of DATA.cats) CAT[c.id]=c;
  ITEMIDX={};
  const put=(k,it)=>{ if(k&&!ITEMIDX[k]) ITEMIDX[k]=it; };
  for(const it of DATA.items){ const k=norm(it.n); put(k,it); put(stripDet(k),it); }
  ALIASIDX={};
  for(const [k,v] of Object.entries(DATA.aliases||{})){ const it=DATA.items.find(i=>i.n===v); if(it&&!ITEMIDX[norm(k)]) ALIASIDX[norm(k)]=it; }
  LABELIDX={};
  for(const c of DATA.cats) for(const l of c.labels){ const k=norm(l); if(!LABELIDX[k]) LABELIDX[k]=c.id; }
}
// Older batch pairs carry only labels; recover their categories when the labels are known.
function catByLabel(l){ const k=norm(l); return LABELIDX[k]||LABELIDX[k.replace(/s$/,"")]||LABELIDX[k+"s"]||null; }
function pairCats(p){ const a=p.catA||catByLabel(p.a), b=p.catB||catByLabel(p.b); return a&&b&&a!==b?[a,b]:[null,null]; }
function norm(s){ return String(s||"").toLowerCase().replace(/[“”"'’.,!?;:()]/g,"").replace(/\s+/g," ").trim(); }
function stripDet(s){ return s.replace(/^(a|an|the|my|your|some)\s+/,""); }
function matchItem(text,exactOnly){
  const k=norm(text); if(!k) return null;
  const tries=[k, stripDet(k), stripDet(k).replace(/s$/,""), stripDet(k).replace(/es$/,"")];
  for(const t of tries) if(ITEMIDX[t]) return ITEMIDX[t];
  if(exactOnly) return null;
  for(const t of tries) if(ALIASIDX[t]) return ALIASIDX[t];
  return null;
}
// An alias ("table") names the thing without the feature the practice item has ("a wooden table"),
// so it cannot settle colour, material, shape or temperature.
const FEATURE=new Set(["wooden","metal","white","red","green","round","square","hot"]);
function inUniverse(it,a,b){
  const sense=CAT[a].sense||CAT[b].sense;
  if(sense&&it.comp) return false;
  if(it.body&&(DATA.bodySkip.includes(a)||DATA.bodySkip.includes(b))) return false;
  return true;
}
function cellsFor(a,b){
  const out={both:[],anb:[],bna:[],nei:[]};
  for(const it of DATA.items){
    if(!inUniverse(it,a,b)) continue;
    const x=it.c.includes(a), y=it.c.includes(b);
    out[x&&y?"both":x?"anb":y?"bna":"nei"].push(it);
  }
  return out;
}
function relOfCells(c){
  if(!c.both.length) return "con";
  if(!c.anb.length&&!c.bna.length) return "mi";
  if(!c.anb.length) return "3ab";
  if(!c.bna.length) return "3ba";
  return "4";
}
const typeText=cid=>CAT[cid].type.split(":")[0];
function whyEmpty(cell,p){
  const A=p.a, B=p.b;
  const q=x=>"“"+x+"”";
  if(cell==="both") return q(A)+" are "+p.typeA+"; "+q(B)+" are "+p.typeB+". Nothing is both.";
  if(cell==="anb") return "Whatever falls under "+q(A)+" also falls under "+q(B)+".";
  if(cell==="bna") return "Whatever falls under "+q(B)+" also falls under "+q(A)+".";
  return "Whatever exists falls under "+q(A)+" or under "+q(B)+"; only a non-existent is neither.";
}
function noteFor(p){
  const t={mi:'"'+p.a+'" and "'+p.b+'" pick out the same class: '+p.typeA+".",
    con:cap(p.a)+" are "+p.typeA+" and "+p.b+" are "+p.typeB+": no common locus.",
    "3ab":"Whatever falls under “"+p.a+"” also falls under “"+p.b+"”, but not the reverse.",
    "3ba":"Whatever falls under “"+p.b+"” also falls under “"+p.a+"”, but not the reverse.",
    "4":cap(p.a)+" and "+p.b+" overlap without either containing the other."};
  return t[p.relation];
}
let POOL=null;
function buildPool(){
  const ids=Object.keys(CAT), out=[];
  const nop=(DATA.nopair||[]).map(x=>x.join("|"));
  for(let i=0;i<ids.length;i++) for(let j=i+1;j<ids.length;j++){
    const a=ids[i], b=ids[j], A=CAT[a], B=CAT[b];
    if(nop.includes([a,b].sort().join("|"))) continue;
    if((A.kind==="everyday"||B.kind==="everyday")&&(A.sense||B.sense)) continue;
    const r=relOfCells(cellsFor(a,b));
    out.push({a,b,r:r==="3ab"||r==="3ba"?"3":r});
  }
  for(const id of ids) if(CAT[id].labels.length>1) out.push({a:id,b:id,r:"mi"});
  POOL=out;
}
function answerList(){ return Object.values(answers).sort((x,y)=>(x.at||"").localeCompare(y.at||"")); }
function makePair(cand){
  let a=cand.a, b=cand.b, la, lb;
  if(a===b){ const ls=CAT[a].labels.slice().sort(()=>Math.random()-.5); la=ls[0]; lb=ls[1]; }
  else { if(Math.random()<.5){ [a,b]=[b,a]; } la=pick(CAT[a].labels); lb=pick(CAT[b].labels); }
  const cells=cellsFor(a,b), rel=relOfCells(cells);
  const p={id:"g-"+Date.now().toString(36)+Math.random().toString(36).slice(2,6), a:la, b:lb, catA:a, catB:b,
    typeA:typeText(a), typeB:typeText(b), relation:rel, ex:{}, why:{}, generated:true};
  for(const c of CELLS){
    // the neither cell prefers an existent, as in debate; a non-existent only when nothing existent fits
    const pool=c==="nei"&&cells.nei.some(i=>!i.ne)?cells.nei.filter(i=>!i.ne):cells[c];
    p.ex[c]=pool.length?pick(pool).n:null; if(!p.ex[c]) p.why[c]=whyEmpty(c,p);
  }
  p.note=noteFor(p);
  return p;
}
function nextGenerated(hist){
  hist=hist||answerList();
  const last=hist.slice(-8).map(x=>x.key==="3ab"||x.key==="3ba"?"3":x.key);
  const seen=new Set(hist.slice(-60).map(x=>[x.catA,x.catB].sort().join("|")).concat(recent));
  const weak={};
  for(const x of hist.slice(-40)) if(isMiss(x)){ if(x.catA) weak[x.catA]=(weak[x.catA]||0)+1; if(x.catB) weak[x.catB]=(weak[x.catB]||0)+1; }
  // the relation least seen lately comes first, so the stream stays mixed
  const rw={mi:1,con:1,"3":1.3,"4":1};
  for(const r of last) rw[r]=Math.max(.15,rw[r]*.45);
  const rels=Object.keys(rw); let tot=rels.reduce((s,r)=>s+rw[r],0), x=Math.random()*tot, R=rels[0];
  for(const r of rels){ if((x-=rw[r])<=0){R=r;break;} }
  const hide=hiddenKeys(); let cands=POOL.filter(c=>c.r===R&&!hide.has(catKey(c.a,c.b)));
  if(!cands.length) cands=POOL.filter(c=>c.r===R);       // everything of this relation is skipped: the skips give way

  const w=cands.map(c=>{
    let v=1; const key=[c.a,c.b].sort().join("|");
    if(seen.has(key)) v*=.08;
    v*=1+1.5*((weak[c.a]||0)+(weak[c.b]||0));
    if(R==="con"&&CAT[c.a].kind==="everyday"&&CAT[c.b].kind==="everyday") v*=.35;
    return v;
  });
  tot=w.reduce((s,v)=>s+v,0); x=Math.random()*tot;
  let ci=0; for(;ci<w.length;ci++){ if((x-=w[ci])<=0) break; }
  const c=cands[Math.min(ci,cands.length-1)];
  recent.push([c.a,c.b].sort().join("|")); if(recent.length>20) recent.shift();
  return makePair(c);
}

/* ---------- queue: retry run, then older prepared pairs not yet answered, then generated ---------- */
function nextPair(){
  if(retryQ.length) return {p:retryQ.shift(), retry:true, tag:retryTag};
  for(const b of batches){ const q=pairsOf(b).find(p=>!answers[p.id]&&!isSkipped(p)); if(q) return {p:q, legacy:true}; }
  return {p:nextGenerated()};
}
function advance(){ cur=nextPair(); ui=freshUi(); mode="quiz"; }

/* ---------- grading ---------- */
function judgeText(p,c,t,cats){
  if(!DATA) return null;
  const [ca,cb]=cats||pairCats(p); if(!ca||!cb) return null;
  const feat=FEATURE.has(ca)||FEATURE.has(cb);
  const it=matchItem(t,feat); if(!it) return null;
  if(!inUniverse(it,ca,cb)) return null;
  const x=it.c.includes(ca), y=it.c.includes(cb);
  const where=x&&y?"both":x?"anb":y?"bna":"nei";
  const nm=cap(t.trim().replace(/[.!]+$/,""));
  if(where===c){
    if(it.ne){ const ref=p.ex&&p.ex[c], better=ref&&!((matchItem(ref)||{}).ne);
      return {v:"ok",msg:["Right. ",nm+" does not exist, and a non-existent counts as neither."+(better?" An existent such as "+ref+" is the better example when there is one.":"")]}; }
    return {v:"ok",msg:["Right. ",nm+": "+termLine(it.t)+"."]};
  }
  return {v:"bad",msg:["Belongs elsewhere. ",nm+" is "+({both:"both",anb:"A but not B",bna:"B but not A",nei:"neither"}[where])+" ("+termLine(it.t)+")."]};
}
function termLine(t){ const ch=(DATA.chains&&DATA.chains[t])||null; return ch?ch.slice(0,3).join("\uE000").toLowerCase():(t||"").toLowerCase(); }
function grade(p,u){
  const implied=REL[u.rel].empty, res={relOk:u.rel===p.relation&&!u.late, cells:{}};
  for(const c of CELLS){
    const key=refOf(p,c), why=(p.why&&p.why[c])||"";
    const none=implied.includes(c)||u.cells[c].none, t=(u.cells[c].t||"").trim();
    let v,msg,kind="occ";
    if(none){ if(key){v="bad";msg=["Counter-example: ",key];} else {v="ok";msg=["Right, empty. ",why];} }
    else if(t){
      if(!key){v="bad";msg=["Nothing can go here. ",why];}
      else { kind="ex"; const j=judgeText(p,c,t); if(j){v=j.v;msg=j.msg; if(j.v==="bad") msg[1]+=" Example: "+key+".";} else {v="cmp";msg=["Not checked. ","Reference: "+key+"."];} }
    }
    else { if(key){v="bad";msg=["Missing. For example: ",key];} else {v="ok";msg=["Right, empty. ",why];} }
    res.cells[c]={v,msg,kind};
  }
  return summarize(res);
}
// Three separate checks: the relation, which cells can be filled (both deterministic), and the examples themselves
// (deterministic when the item is in the practice list, otherwise "cmp" until Claude verifies them).
function summarize(res){
  const cs=CELLS.map(c=>res.cells[c]);
  res.occBad=cs.filter(r=>r.kind==="occ"&&r.v==="bad").length;
  res.exBad=cs.filter(r=>r.kind==="ex"&&r.v==="bad").length;
  res.exOpen=cs.filter(r=>r.v==="cmp").length;
  res.exN=cs.filter(r=>r.kind==="ex").length;
  res.overall=!res.relOk?"bad":(res.occBad||res.exBad)?"part":res.exOpen?"pend":"ok";
  return res;
}
async function check(){
  if(!ui||!ui.rel||ui.checked) return;
  const p=cur.p;
  stopTimer(); clearSkip(p); ui.res=grade(p,ui); ui.checked=true; ui.open=false; render();
  top0(); const bs=document.querySelectorAll("#stage .actions .btn"); if(bs.length) bs[bs.length-1].focus({preventScroll:true});
  if(!db) return;
  const cells={};
  for(const c of CELLS) cells[c]={text:(ui.cells[c].t||"").trim(), none:REL[ui.rel].empty.includes(c)||ui.cells[c].none, verdict:ui.res.cells[c].v};
  const id=ui.saveId=cur.legacy?p.id:(cur.retry?"r-":"")+(p.generated&&!cur.retry?p.id:"r"+Date.now().toString(36));
  const doc={pairId:id,batchId:cur.legacy?(batches.find(b=>pairsOf(b).includes(p))||{}).id||null:null,a:p.a,b:p.b,catA:pairCats(p)[0],catB:pairCats(p)[1],
    chosen:ui.late?null:ui.rel,key:p.relation,correct:ui.res.relOk,grade:ui.res.overall,cells,at:new Date().toISOString(),pair:p};
  if(cur.retry) doc.retryOf=p.id;
  if(ui.late||ui.exLate) doc.timeout=ui.late&&ui.exLate?"both":ui.late?"relation":"examples";
  ui.doc=doc;
  persist(ui,"Your answer");
  labStart(ui,cur);
}

/* ---------- saving answers ---------- */
// A write that fails with "unavailable" (a passing platform fault) or an unknown code is retried once after a short
// random delay. An answer that still fails stays in `unsaved` and is written again after the next answer saves.
const unsaved={};
const NO_RETRY=["invalid_argument","quota_exceeded","resource_exhausted","revoked","not_granted","capability_disabled","capability_removed","transform_error"];
async function put(col,id,doc){
  const go=()=>db.collection(col).doc(id).set(doc);
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
function persist(u,what){
  if(!db||!u.doc||!u.saveId) return;
  saveAnswer(u.col||"answers",u.saveId,u.doc).then(()=>{ if(u.saveErr){ u.saveErr=""; if(u===ui) render(); } }).catch(e=>{
    const c=(e&&e.code)||"error";
    u.saveErr=NO_RETRY.includes(c)?what+" is on screen but could not be saved ("+c+"), so it will not appear in Review."
      :what+" is on screen but was not saved: the database did not respond. The page tries again after your next answer; until then it is missing from Review.";
    if(u===ui) render();
  });
}
/* ---------- favourite pairs ---------- */
// One favourite per pair of categories, whichever way round and whichever of their labels the pair showed;
// the pair itself (relation, reference examples, note) is stored with it so it can be looked up and practised again.
const favSafe=x=>String(x).replace(/[^A-Za-z0-9]+/g,"_");
function favKey(p){ const [a,b]=pairCats(p); return a&&b?"c_"+favSafe([a,b].sort().join("__")):"l_"+favSafe([norm(p.a),norm(p.b)].sort().join("__")); }
const isFav=p=>!!p&&!!favs[favKey(p)];
function favWrite(k,fn,undo){
  favErr="";
  favQ[k]=(favQ[k]||Promise.resolve()).catch(()=>{}).then(fn).catch(e=>{
    undo(); const c=(e&&e.code)||"error";
    favErr="The favourite could not be saved ("+c+"), so it was undone."; render();
  });
}
function setFav(p,on){
  if(!db||!p) return;
  const k=favKey(p), had=favs[k];
  if(on&&!had){
    const [ca,cb]=pairCats(p);
    const doc=JSON.parse(JSON.stringify({key:k,a:p.a,b:p.b,catA:ca,catB:cb,relation:p.relation,pair:p,at:new Date().toISOString()}));
    favs[k]=doc; render();
    favWrite(k,()=>put("favorites",k,doc),()=>{ delete favs[k]; });
  } else if(!on&&had){
    delete favs[k]; render();
    favWrite(k,()=>db.collection("favorites").doc(k).delete(),()=>{ favs[k]=had; });
  }
}
const toggleFav=p=>setFav(p,!isFav(p));
function favBtn(p){
  if(!db||!p) return null;
  const on=isFav(p);
  return el("button",{type:"button",class:"btn ghost fav","aria-pressed":on?"true":"false","aria-label":on?"Remove from favourites":"Add to favourites",title:(on?"Remove from favourites":"Add to favourites")+" (F)",onclick:()=>toggleFav(p)},
    el("span",{class:"star","aria-hidden":"true",text:on?"★":"☆"}), el("span",{class:"fl",text:"Favourite"}));
}
function startFav(p){ retryQ=[p]; retryTag="Favourite"; switchTo("practice"); advance(); render(); top0(); }
function favSection(s){
  if(!db) return;
  const list=Object.values(favs).sort((x,y)=>(y.at||"").localeCompare(x.at||""));
  const sec=el("div",{class:"section"},el("p",{class:"label"},"Favourites",el("span",{class:"hint",text:list.length?list.length+" saved":"star a pair to keep it here"})));
  if(!list.length) sec.append(el("p",{class:"empty-note",text:"Press the star (or F) on a pair while you practise. It stays here with its relation and examples, whether or not you answered it right."}));
  else sec.append(el("ul",{class:"favs"},list.map(f=>{
    const p=f.pair||{a:f.a,b:f.b,relation:f.relation,ex:{},why:{}}, k=REL[p.relation]||REL[f.relation];
    const cell=c=>{
      const ref=refOf(p,c);
      if(ref) return el("div",{class:"cell","aria-label":cellLabel(c,p)},el("span",{class:"cx",text:ref}));
      return el("div",{class:"cell locked","aria-label":cellLabel(c,p)+": nothing"},el("span",{class:"empty",text:"∅"}),(p.why&&p.why[c])?el("div",{class:"fb",text:p.why[c]}):null);
    };
    return el("li",null,el("details",{open:openFavs.has(f.key),ontoggle:e=>{ if(e.target.open) openFavs.add(f.key); else openFavs.delete(f.key); }},
      el("summary",null,el("span",{class:"m",text:"★"}),el("span",null,p.a+" / "+p.b,el("span",{class:"sub",text:(k?k.name:"")+(f.at?" · saved "+dayOf(f.at):"")}))),
      el("div",{class:"fbody"},
        k?el("p",{class:"note"},k.name+": "+k.gloss(p.a,p.b).toLowerCase()+".",notaOf(p.relation)&&nota!=="codes"?[" ",el("span",{class:"nota math",text:notaOf(p.relation)})]:null):null,
        exGrid(p,cell),
        el("p",{class:"note"},(p.typeA||p.typeB)?el("span",{class:"types",text:p.a+": "+(p.typeA||"?")+" · "+p.b+": "+(p.typeB||"?")}):null,p.note||""),
        el("div",{class:"actions"},
          el("button",{type:"button",class:"btn ghost",onclick:()=>{ openFavs.delete(f.key); const q=Object.assign({},f); delete favs[f.key]; render(); favWrite(f.key,()=>db.collection("favorites").doc(f.key).delete(),()=>{ favs[f.key]=q; }); },text:"Remove"}),
          el("button",{type:"button",class:"btn",onclick:()=>startFav(p),text:"Practise this pair"})))));
  })));
  if(favErr) sec.append(el("p",{class:"status",text:favErr}));
  s.append(sec);
}
function next(){ if(ui&&ui.ctl) ui.ctl.abort(); if(ui&&ui.debate) advanceDebate(); else advance(); render(); top0(); }

/* ---------- skipped pairs ---------- */
// A pair that is too hard or too easy can be skipped. The skip is recorded (collection "skips", one document per pair of categories, like a favourite),
// the pair stays out of the drill for SKIP_DAYS days, Review lists it under Skipped, and answering the pair clears the record.
const SKIP_DAYS=7;
const UNDO_MS=6000;                    // how long the hint (narrow) or the note (wide) with Undo stays
let skips={}, skipNote=null, skipErr="";
const skipQ={};
const skipActive=s=>!!(s&&s.at&&Date.now()-Date.parse(s.at)<SKIP_DAYS*864e5);
// the key of a pair of categories, also when both labels belong to one category (minds / consciousnesses): that pair is then one candidate of the pool
const catKey=(a,b)=>"c_"+favSafe([a,b].sort().join("__"));
const skipCats=p=>[p.catA||catByLabel(p.a), p.catB||catByLabel(p.b)];
const skipKey=p=>{ const [a,b]=skipCats(p); return a&&b?catKey(a,b):favKey(p); };
const isSkipped=p=>skipActive(skips[skipKey(p)]);
const hiddenKeys=()=>new Set(Object.values(skips).filter(skipActive).map(s=>s.key));
function skipWrite(k,fn,undo){
  skipErr="";
  skipQ[k]=(skipQ[k]||Promise.resolve()).catch(()=>{}).then(fn).catch(e=>{
    undo(); const c=(e&&e.code)||"error";
    skipErr="The skip could not be saved ("+c+"), so it was undone."; render();
  });
}
function skipPair(){
  if(!ui||mode!=="quiz"||ui.checked||!cur||!cur.p||(tab!=="practice"&&tab!=="debate")) return;
  stopTimer(); dropSkipNote();
  const p=cur.p, k=skipKey(p), had=skips[k], [ca,cb]=skipCats(p), wasDebate=!!ui.debate, prev={cur,rq:retryQ.slice(),rt:retryTag};
  const doc=JSON.parse(JSON.stringify({key:k,a:p.a,b:p.b,catA:ca,catB:cb,relation:p.relation,pair:p,from:wasDebate?"debate":"practice",n:(had&&had.n||0)+1,at:new Date().toISOString()}));
  skips[k]=doc;
  if(db) skipWrite(k,()=>put("skips",k,doc),()=>{ if(had) skips[k]=had; else delete skips[k]; });
  if(wasDebate) advanceDebate(); else advance();
  const n=skipNote={p,key:k,had,debate:wasDebate,ui,prev};
  n.tid=setTimeout(()=>{ if(skipNote===n){ skipNote=null; hideSkipHint(); if(isWide()) render(); } },UNDO_MS);
  render(); top0(); showSkipHint();
}
function dropSkipNote(){ if(skipNote&&skipNote.tid) clearTimeout(skipNote.tid); skipNote=null; hideSkipHint(); }
// answering a pair puts it back among the ordinary ones
function clearSkip(p){
  const k=skipKey(p), had=skips[k]; if(!had) return;
  delete skips[k]; if(skipNote&&skipNote.key===k) dropSkipNote();
  if(db) skipWrite(k,()=>db.collection("skips").doc(k).delete(),()=>{ skips[k]=had; });
}
// the note under which a skip can be taken back, on the pair that replaced it, until something is answered there
function undoSkip(){
  const n=skipNote; if(!n) return;
  dropSkipNote();
  if(n.had){ skips[n.key]=n.had; if(db) skipWrite(n.key,()=>put("skips",n.key,n.had),()=>{}); }
  else { delete skips[n.key]; if(db) skipWrite(n.key,()=>db.collection("skips").doc(n.key).delete(),()=>{}); }
  retryQ=n.prev.rq; retryTag=n.prev.rt; cur=n.prev.cur; mode="quiz";
  if(n.debate){ ui=freshDebateUi(); startQ(); } else ui=freshUi();
  render(); top0();
}
// The note is live while the pair that replaced the skipped one is untouched (no relation picked, no question answered) and for UNDO_MS.
function skipNoteLive(){
  const n=skipNote; if(!n||!ui||n.ui!==ui||ui.checked) return null;
  if(ui.debate?ui.step>0:ui.rel) return null;
  return n;
}
// "Skipped a / b", cut with an ellipsis when it does not fit, so the line never grows
const skipMsg=(n,cls)=>el("span",{class:"skipmsg"+(cls?" "+cls:"")},"Skipped ",el("b",{text:n.p.a+" / "+n.p.b}));
const undoBtn=()=>el("button",{type:"button",class:"skipundo",title:"Take the skip back",onclick:undoSkip,text:"Undo"});
// The skip icon of the narrow top bar (next to the star): there while a pair is open, dimmed once it is checked.
function syncSkipBtn(){
  const b=$("mskip"), ok=mode==="quiz"&&(tab==="practice"||tab==="debate")&&!!cur&&!!cur.p;
  b.hidden=!ok; if(!ok) return;
  b.disabled=!ui||!!ui.checked; b.classList.toggle("hot",!!hintOff);
}
// After a skip on a narrow screen a small hint opens under the icon: "Skipped a / b · Undo". It blocks nothing (no scrim), is outside the cards so nothing shifts,
// and closes on the next tap, key press (Tab moves into it), scroll, or after UNDO_MS. Closing it changes nothing else; Review still lists the pair.
var hintOff=null;
function showSkipHint(){
  hideSkipHint(); const n=skipNote; if(!n||isWide()) return;
  const h=$("skiphint"), bar=document.querySelector(".mbar").getBoundingClientRect(), b=$("mskip").getBoundingClientRect();
  h.replaceChildren(skipMsg(n),undoBtn()); h.hidden=false;
  h.style.top=Math.round(bar.bottom+8)+"px"; h.style.right=Math.round(innerWidth-bar.right+12)+"px";
  h.style.setProperty("--nx",Math.round(bar.right-12-(b.left+b.width/2))+"px");
  const born=performance.now(), close=()=>{ dropSkipNote(); };
  const onDown=e=>{ if(!h.contains(e.target)) close(); };
  const onKey=e=>{ if(performance.now()-born<80||e.key==="Tab"||e.key==="Shift"||(h.contains(e.target)&&(e.key==="Enter"||e.key===" "))) return; close(); };
  const onScroll=e=>{ if(performance.now()-born>300&&!h.contains(e.target)) close(); };
  document.addEventListener("pointerdown",onDown,true); document.addEventListener("keydown",onKey,true);
  document.addEventListener("scroll",onScroll,true); document.addEventListener("wheel",onScroll,{capture:true,passive:true});
  hintOff=()=>{ document.removeEventListener("pointerdown",onDown,true); document.removeEventListener("keydown",onKey,true);
    document.removeEventListener("scroll",onScroll,true); document.removeEventListener("wheel",onScroll,{capture:true}); };
  $("mskip").classList.add("hot");
}
function hideSkipHint(){
  if(hintOff){ hintOff(); hintOff=null; }
  const h=$("skiphint"); if(h){ h.hidden=true; h.replaceChildren(); }
  const b=$("mskip"); if(b) b.classList.remove("hot");
}
// The line under the diamond on a phone: the relation (or what to do).
// spec: {text, cls, disabled, onclick, why}
function subRowNode(spec){
  return el("div",{class:"subrow"},
    spec.text?el("button",{type:"button",class:"subt"+(spec.cls||""),disabled:!!spec.disabled,tabindex:"-1",onclick:spec.onclick||null,text:spec.text}):null,
    spec.why||null);
}
// the action row of a wide screen: the quiet Skip button, and after a skip the note with Undo before it
function skipActs(spacerText){
  const n=skipNoteLive();
  if(n) return [el("span",{class:"kbd spacer skipmsg",role:"status"},"Skipped ",el("b",{text:n.p.a+" / "+n.p.b})),el("button",{type:"button",class:"btn ghost skipw",title:"Take the skip back",onclick:undoSkip,text:"Undo"}),skipBtn()];
  return [spacerText!=null?el("span",{class:"kbd spacer",text:spacerText}):null,skipBtn()];
}
const skipBtn=()=>el("button",{type:"button",class:"btn ghost skipw",title:"Skip this pair (S)",onclick:skipPair,text:"Skip"});
// a pair skipped in Questions is practised in Questions, one skipped in Relations in Relations
function startSkipped(f){
  const p=f.pair||{a:f.a,b:f.b,relation:f.relation,ex:{},why:{}};
  if(f.from==="debate"){ switchTo("debate"); cur={p,debate:true}; ui=freshDebateUi(); mode="quiz"; startQ(); }
  else { retryQ=[p]; retryTag="Skipped"; switchTo("practice"); advance(); }
  render(); top0();
}
function unskipKey(k){
  const had=skips[k]; if(!had) return;
  delete skips[k]; render();
  if(db) skipWrite(k,()=>db.collection("skips").doc(k).delete(),()=>{ skips[k]=had; });
}
function skipSection(s){
  const list=Object.values(skips).sort((x,y)=>(y.at||"").localeCompare(x.at||""));
  const sec=el("div",{class:"section"},el("p",{class:"label"},"Skipped",el("span",{class:"hint",text:list.length?list.length+" set aside":"nothing skipped"})));
  if(!list.length){ sec.append(el("p",{class:"empty-note",text:"Skip a pair that is too hard or too easy. It stays out of the drill for "+SKIP_DAYS+" days and is kept here, apart from your mistakes."})); s.append(sec); return; }
  sec.append(el("p",{class:"note faint",text:"Skipped pairs stay out of the drill for "+SKIP_DAYS+" days. Practise one from here when you want it. A pair you answer leaves this list."}));
  sec.append(el("ul",{class:"sum skips"},list.map(f=>{
    const p=f.pair||{a:f.a,b:f.b,relation:f.relation,ex:{},why:{}}, until=new Date(Date.parse(f.at)+SKIP_DAYS*864e5).toISOString();
    const sub="skipped "+dayOf(f.at)+(f.n>1?", "+f.n+" times":"")+" · "+(skipActive(f)?"back in the drill after "+dayOf(until):"back in the drill");
    return el("li",null,el("span",{class:"m skip","aria-hidden":"true",text:"»"}),
      el("span",null,p.a+" / "+p.b,el("span",{class:"sub",text:sub}),
        el("span",{class:"skact"},
          el("button",{type:"button",class:"btn",onclick:()=>startSkipped(f),text:"Practise"}),
          el("button",{type:"button",class:"btn ghost",onclick:()=>unskipKey(f.key),text:"Remove"}))));
  })));
  if(skipErr) sec.append(el("p",{class:"status",text:skipErr}));
  s.append(sec);
}

/* ---------- check lab (development): independent runs of Haiku, Sonnet and Opus on every checked answer ---------- */
// Each checked answer goes to three models as independent calls. They are told the two categories and the things the learner wrote, not which cell the
// learner chose. When their answers differ, Opus acts as judge: it rules on the thing itself and names the answers that agree with its ruling. When all agree, that
// agreement is the verdict and no judge is called (except for a small spot check). Every run is stored (collection "labruns") so the data can decide which model, or which
// chain of models, the public release uses; any part of any AI answer can be flagged by hand (collection "flags"). The page's own verdicts are unchanged.
const LAB_VER="lab-2";               // lab-2: the judge runs only where the models differ (and as a spot check), lab-1 judged every case
let labSpotN=10;                     // one unanimous answer in labSpotN also goes to the judge (chosen by the case key, so a rerun repeats the choice); 0 never, 1 always
const labSpot=key=>labSpotN>0&&parseInt(hash36(key),36)%labSpotN===0;
const LAB_MODELS=[{k:"haiku",id:"claude-haiku-5-5",tier:"quick",name:"Haiku"},{k:"sonnet",id:"claude-sonnet-5-5",tier:"default",name:"Sonnet"},{k:"opus",id:"claude-opus-5-5",tier:"complex",name:"Opus"}];
const LAB_JUDGE={k:"judge",id:"claude-opus-5-5",tier:"complex",name:"Judge"};
let lab=true;
try{ lab=localStorage.getItem("rd-lab")!=="0"; }catch(e){}
let labruns={}, flags={}, flagErr="", labPause=0, flagPending=0;
const labQ={}, flagQ={}, labLocal={};     // labLocal: the runs written in this session, kept apart from what the database snapshot returns
function setLab(on){ lab=!!on; try{ localStorage.setItem("rd-lab",lab?"1":"0"); }catch(e){} render(); }
const labShown=()=>!!(sample&&db&&(lab||Object.keys(labruns).length||Object.keys(labLocal).length||Object.keys(flags).length));
const labRuns=()=>Object.assign({},labruns,labLocal);
// the database snapshots; a flag write in flight keeps the snapshot from replacing what the page just changed
function labDataIn(){ if(tab==="review"&&mode!=="loading"&&!typingEl(document.activeElement)) render(); }
function labSubscribe(){
  try{ labSubscribeNow(); }catch(e){}          // the lab is optional: a failing subscription must never stop the page from starting
}
function labSubscribeNow(){
  db.collection("labruns").orderBy("at","desc").limit(240).onSnapshot(snap=>{ const m={}; snap.docs.forEach(d=>{m[d.id]=d.data();}); const same=Object.keys(m).sort().join()===Object.keys(labruns).sort().join(); labruns=m; if(!same) labDataIn(); },()=>{});
  db.collection("flags").orderBy("updatedAt","desc").limit(300).onSnapshot(snap=>{
    if(flagPending) return;
    const m={}; snap.docs.forEach(d=>{m[d.id]=d.data();}); const same=JSON.stringify(Object.keys(m).sort().map(k=>[k,m[k].state,m[k].updatedAt]))===JSON.stringify(Object.keys(flags).sort().map(k=>[k,flags[k].state,flags[k].updatedAt]));
    flags=m; if(!same) labDataIn();
  },()=>{});
}
const hash36=s=>{ let h=5381; s=String(s); for(let i=0;i<s.length;i++) h=((h<<5)+h+s.charCodeAt(i))|0; return (h>>>0).toString(36); };
const cellOfRec=r=>!r.exists?"nei":r.inA&&r.inB?"both":r.inA?"anb":r.inB?"bna":"nei";

// the reference the models get, built from the page's own data: every category with its definition, then the classification notes
let labRefC=null;
function labRef(){
  if(labRefC) return labRefC;
  const lines=DATA.cats.map(c=>{
    const names=c.labels.slice(1,6).join(", ");
    if(c.kind==="dudra"){
      const t=DATA.terms[c.term]||{}, d=String(t.d||"(no definition in the booklet)").replace(/\s*\((?:tables|Dampilon)\)\s*$/,"").slice(0,320);
      return "- "+c.id+": \""+c.labels[0]+"\" (Dudra term "+c.term+"; "+c.type+") Definition: "+d+(names?" Also called: "+names+".":"");
    }
    return "- "+c.id+": \""+c.labels[0]+"\" (everyday feature; "+c.type+")";
  });
  const notes=[...new Set(Object.values(DATA.notes||{}).flat())];
  const text="CATEGORY REFERENCE\n"+lines.join("\n")+"\n\nCLASSIFICATION NOTES\n"+notes.map(n=>"- "+n).join("\n");
  return labRefC={text,ver:LAB_VER+"-"+hash36(text)};
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
  const d=(id,label)=>id&&CAT[id]?"category "+id+" (\""+CAT[id].labels[0]+"\"), shown to the learner as \""+label+"\"":"\""+label+"\"";
  return "A = "+d(k.catA,k.a)+"\nB = "+d(k.catB,k.b)+"\nThings:\n"+k.things.map((t,i)=>(i+1)+". "+JSON.stringify(t.text)).join("\n");
}
function labParse(text,n){
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
function labThings(U){
  const out=[], seen={};
  const add=(text,c)=>{ const t=String(text||"").trim(), k=norm(t); if(!k) return; let o=seen[k]; if(!o){ o=seen[k]={text:t.slice(0,120),cells:[],page:{}}; out.push(o); } if(!o.cells.includes(c)){ o.cells.push(c); o.page[c]=U.res.cells[c].v; } };
  if(U.debate) QCELL.forEach((c,i)=>{ if(U.ans[i].say==="why") add(U.ans[i].text,c); });
  else CELLS.forEach(c=>{ if(!REL[U.rel].empty.includes(c)&&!U.cells[c].none) add(U.cells[c].t,c); });
  return out.slice(0,6);
}
function labWrite(col,id,doc){
  const clean=JSON.parse(JSON.stringify(doc));
  labQ[id]=(labQ[id]||Promise.resolve()).catch(()=>{}).then(()=>put(col,id,clean)).catch(e=>{ flagErr="A lab record could not be saved ("+((e&&e.code)||"error")+")."; if(ui&&ui.lab) labRender(ui.lab); });
}
// one model, one case; resolves when its record is stored. The model that answered must be the one asked for, else the run does not count.
async function labCall(L,m,prompt,effort,kind,extra){
  const key=L.kase.key, st=L.runs[m.k]={status:"run"}, t0=performance.now(), ref=labRef();
  const doc=Object.assign({kind,caseKey:key,model:m.id,effort,tierAsked:m.tier,promptVersion:LAB_VER,referenceVersion:ref.ver,at:new Date().toISOString(),promptChars:prompt.length,case:L.kase},extra||{});
  try{
    const r=await sample(prompt,{model:m.id,modelTier:m.tier,effort,cache:false});
    doc.ms=Math.round(performance.now()-t0); doc.modelApplied=r.modelApplied||null; doc.tierApplied=r.modelTierApplied||null; doc.truncated=!!r.truncated;
    doc.raw=String(r.text||"").slice(0,3000); doc.replyChars=String(r.text||"").length;
    doc.valid=doc.modelApplied===m.id;
    const recs=labParse(r.text,L.kase.things.length);
    doc.ok=!!recs; if(recs) doc.recs=recs; else doc.error="reply was not the expected JSON";
    st.status=doc.ok?(doc.valid?"ok":"mismatch"):"bad";
  }catch(e){
    doc.ms=Math.round(performance.now()-t0); doc.ok=false; doc.valid=false; doc.error=(e&&e.code)||"error"; st.status="err";
    if(e&&e.code==="rate_limited") labPause=Date.now()+120000;            // no more lab calls for two minutes
    if(e&&ERR_OFF.includes(e.code)) labPause=Date.now()+864e5;            // not allowed: none for this page load
  }
  st.doc=doc;
  const id=(kind==="judge"?"lj_":"lr_")+favSafe(key)+(kind==="judge"?"":"_"+m.k);
  st.id=id; labLocal[id]=doc; labWrite("labruns",id,doc);
  return st;
}
// A render that the lab causes (a run finished) keeps the keyboard focus where it was: on the same button, found again by its label.
function btnSig(){
  const a=document.activeElement; if(!a||a.tagName!=="BUTTON") return null;
  const box=a.closest("#stage,#coach"); if(!box) return null;
  const k=b=>b.textContent+"|"+(b.getAttribute("aria-label")||"")+"|"+(b.getAttribute("data-fid")||""), same=[...box.querySelectorAll("button")].filter(b=>k(b)===k(a));
  return {box:box.id,k:k(a),i:same.indexOf(a)};
}
function btnBack(f){
  if(!f) return; const box=$(f.box); if(!box) return;
  const k=b=>b.textContent+"|"+(b.getAttribute("aria-label")||"")+"|"+(b.getAttribute("data-fid")||""), same=[...box.querySelectorAll("button")].filter(b=>k(b)===f.k), n=same[f.i]||same[0];
  if(n&&document.activeElement!==n) n.focus({preventScroll:true});
}
// a render while a note is being typed would take the focus away: it waits until the field is left
function labRender(L){
  if(L.u!==ui) return;
  if(typingEl(document.activeElement)){ if(!L.wait){ L.wait=setTimeout(()=>{ L.wait=null; labRender(L); },1200); } return; }
  const f=btnSig(); render(); btnBack(f);
}
async function labRun(U,C,only,force){
  const L=U.lab; if(!L||!sample) return;
  const ref=labRef(), head=LAB_TASK+"\n\n"+ref.text+"\n\nCASE\n"+labCaseText(L.kase);
  L.busy=true; labRender(L);
  const todo=LAB_MODELS.filter(m=>!only||only.includes(m.k));
  await Promise.all(todo.map(m=>labCall(L,m,head,"medium","classify").then(()=>labRender(L))));
  await labJudge(U,force);
  L.busy=false; labRender(L);
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
// ask the judge about an answer all models agreed on
async function labJudgeNow(){
  const U=ui; if(!U||!U.lab||U.lab.busy||labGood(U.lab).length<2) return;
  U.lab.busy=true; labRender(U.lab); await labJudge(U,"asked"); U.lab.busy=false; labRender(U.lab);
}
function labStart(U,C){
  if(!lab||!sample||!db||!DATA||U.lab||!U.res||!U.checked||Date.now()<labPause) return;
  const things=labThings(U); if(!things.length) return;
  const p=C.p, [ca,cb]=skipCats(p);
  const kase={tab:U.debate?"debate":"practice",answerId:U.saveId||null,a:p.a,b:p.b,catA:ca,catB:cb,relation:p.relation,chosen:U.late?null:U.rel,things};
  kase.key=(U.col||"answers")+"_"+(U.saveId||("t"+Date.now().toString(36)));
  U.lab={kase,runs:{},busy:false,u:U};
  labRun(U,C);
}
function labAgain(){ const U=ui; if(!U||!U.lab||U.lab.busy) return; const bad=LAB_MODELS.filter(m=>{ const s=U.lab.runs[m.k]; return !s||s.status!=="ok"; }).map(m=>m.k); delete U.lab.runs.judge; labRun(U,cur,bad.length?bad:null); }

/* ---------- flags: any part of any AI answer ---------- */
// a flag is one document per part: {caseKey, thing, part, model, shown, note, suggest, state}; it can be changed or removed, and it is the labelled data for the model comparison
const flagId=c=>"fl_"+favSafe(c.caseKey).slice(0,60)+"_"+hash36([c.caseKey,c.thing||"",c.part,c.model||"",c.n||""].join("|"));
const flagOf=c=>flags[flagId(c)];
// a render that keeps the chat view where it is scrolled (the overlay is rebuilt and would start at the top again)
function renderKeep(){ const sc=$("chatscroll"), y=sc?sc.scrollTop:0; render(); const n=$("chatscroll"); if(n&&y) n.scrollTop=y; }
function flagWrite(k,fn,undo){
  flagErr=""; flagPending++;
  flagQ[k]=(flagQ[k]||Promise.resolve()).catch(()=>{}).then(fn).catch(e=>{ undo(); flagErr="The flag could not be saved ("+((e&&e.code)||"error")+"), so it was undone."; renderKeep(); }).finally(()=>{ flagPending--; });
}
function openFlag(c,where){
  const had=flagOf(c); ui.flagEdit={c,where,note:had?had.note||"":"",suggest:had?had.suggest||"":""}; renderKeep();
  requestAnimationFrame(()=>{ const t=$("flag-note"); if(t){ t.focus({preventScroll:true}); const e=t.closest(".flagedit"); (e||t).scrollIntoView({block:"nearest"}); } });
}
function saveFlag(){
  const F=ui.flagEdit; if(!F) return;
  const id=flagId(F.c), had=flags[id], now=new Date().toISOString();
  const doc=JSON.parse(JSON.stringify({id,caseKey:F.c.caseKey,thing:F.c.thing||"",part:F.c.part,model:F.c.model||"",runId:F.c.runId||null,n:F.c.n||null,shown:String(F.c.shown||"").slice(0,600),
    note:F.note.trim().slice(0,800),suggest:F.suggest.trim().slice(0,300),pair:F.c.pair||null,at:had?had.at:now,updatedAt:now,state:had?had.state:"new"}));
  flags[id]=doc; ui.flagEdit=null; renderKeep(); refocusFlag(id);
  if(db) flagWrite(id,()=>put("flags",id,doc),()=>{ if(had) flags[id]=had; else delete flags[id]; });
}
function refocusFlag(id){ requestAnimationFrame(()=>{ const b=document.querySelector('[data-fid="'+id+'"]'); if(b) b.focus({preventScroll:true}); }); }
function cancelFlag(){ const F=ui.flagEdit; ui.flagEdit=null; renderKeep(); if(F) refocusFlag(flagId(F.c)); }
function removeFlag(id){
  const had=flags[id]; if(!had) return; delete flags[id]; if(ui) ui.flagEdit=null; renderKeep(); refocusFlag(id);
  if(db) flagWrite(id,()=>db.collection("flags").doc(id).delete(),()=>{ flags[id]=had; });
}
function setFlagState(id,state){
  const had=flags[id]; if(!had) return; const doc=Object.assign({},had,{state,updatedAt:new Date().toISOString()}); flags[id]=doc; renderKeep();
  if(db) flagWrite(id,()=>put("flags",id,doc),()=>{ flags[id]=had; });
}
function flagEditorNode(where){
  const F=ui&&ui.flagEdit; if(!F||F.where!==where) return null;
  const had=flagOf(F.c), nm=(F.c.model?mname(F.c.model)+": ":"")+(F.c.partLabel||F.c.part);
  const note=el("textarea",{id:"flag-note",rows:"2",placeholder:"What is wrong, or why it is right",value:F.note,"aria-label":"Note"}); note.value=F.note;
  const esc=e=>{ if(e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); cancelFlag(); } };
  note.addEventListener("input",e=>{ F.note=e.target.value; }); note.addEventListener("keydown",esc);
  const sug=el("input",{type:"text",id:"flag-sug",placeholder:"I think it should be … (optional)",value:F.suggest,"aria-label":"It should be",autocomplete:"off"});
  sug.addEventListener("input",e=>{ F.suggest=e.target.value; });
  sug.addEventListener("keydown",e=>{ if(e.key==="Enter"){ e.preventDefault(); saveFlag(); } else esc(e); });
  return el("div",{class:"flagedit",role:"group","aria-label":"Flag"},
    el("p",{class:"fh"},el("span",{class:"flg","aria-hidden":"true"}),el("b",{text:had?"Flagged: ":"Flag: "}),el("span",{class:"fv",text:nm})),
    note,sug,
    el("div",{class:"fa"},el("button",{type:"button",class:"btn",onclick:saveFlag,text:"Submit"}),
      el("button",{type:"button",class:"btn ghost",onclick:cancelFlag,text:"Cancel"}),
      had?el("button",{type:"button",class:"back",onclick:()=>removeFlag(flagId(F.c)),text:"Remove flag"}):null));
}
// a small flag control: a value that can be flagged; flagged ones show the flag
function flagPart(c,where,text,cls){
  const on=!!flagOf(c), F=ui.flagEdit, active=F&&flagId(F.c)===flagId(c);
  return el("button",{type:"button","data-fid":flagId(c),class:"lp"+(cls?" "+cls:"")+(on?" flagged":"")+(active?" active":""),"aria-pressed":on?"true":"false","aria-label":"Flag "+(c.partLabel||c.part)+": "+text+(on?" (flagged)":""),title:on?"Flagged. Tap to change":"Tap to flag",onclick:e=>{ e.stopPropagation(); openFlag(c,where); }},
    on?el("span",{class:"flg","aria-hidden":"true"}):null,text);
}

/* ---------- the Lab panel of a result ---------- */
const yn=b=>b?"✓":"✗";
function labState(U){
  const L=U&&U.lab; if(!L) return null;
  const runs=LAB_MODELS.map(m=>L.runs[m.k]).filter(s=>s&&s.doc&&s.status==="ok");
  let diff=false, judgeDiff=false;
  L.kase.things.forEach((t,i)=>{
    const cs=new Set(runs.map(s=>s.doc.recs[i].cell)); if(cs.size>1) diff=true;
    const j=L.runs.judge&&L.runs.judge.status==="ok"?L.runs.judge.doc.recs[i].cell:null; if(j&&!t.cells.includes(j)) judgeDiff=true;
    else if(!j&&runs.length&&!t.cells.includes([...cs][0])&&cs.size===1) judgeDiff=true;
  });
  return {runs,diff,judgeDiff,busy:L.busy};
}
function labItem(){
  if(!lab||!ui||!ui.lab) return null;
  const s=labState(ui);
  // the chip never opens by itself; its sign says whether the answers agree ("…" while running, "≠" when models differ from each other or from you, "=" when all agree)
  return {key:"lab",label:"Lab",st:"none",ic:s.busy?"…":!s.runs.length?"":(s.diff||s.judgeDiff)?"≠":"=",body:()=>labNode(),
    onopen:()=>requestAnimationFrame(()=>{ const v=document.querySelector(".vchips"); if(v) v.scrollIntoView({block:"start"}); })};
}
const mname=k=>k==="judge"?"Judge":(LAB_MODELS.find(m=>m.k===k)||{}).name||k;
function labNode(){
  const L=ui.lab, box=el("div",{class:"lab"}), st=labState(ui);
  const done=LAB_MODELS.filter(m=>L.runs[m.k]&&L.runs[m.k].status!=="run").length;
  const J=L.runs.judge, jok=!!(J&&J.status==="ok"&&J.doc), jwhy={disagree:"the models differed",spot:"spot check",asked:"you asked"}[J&&J.doc&&J.doc.why]||"";
  const sum=L.busy?(J&&J.status==="run"?"Judge is ruling…":"Models running: "+done+" of 3 done"):"Done: "+st.runs.length+" of 3 models answered"+(jok?"; the judge ruled"+(jwhy?" ("+jwhy+")":""):st.runs.length>=2&&!(J&&J.status!=="ok")?"; all agree, no judge needed":"");
  // which models the judge sided with, from the answer numbers it was given (the order of the runs it saw)
  const sided=i=>{ const r=jok&&J.doc.recs&&J.doc.recs[i]; if(!r||!Array.isArray(r.right)||!J.doc.order) return null; const ids=r.right.map(n=>J.doc.order[n-1]).filter(Boolean); return LAB_MODELS.filter(m=>ids.some(id=>id.endsWith("_"+m.k))).map(m=>m.k); };
  box.append(el("p",{class:"lab-h"},el("b",{text:"Lab "}),el("span",{class:"lab-s",text:sum})));
  const errs=LAB_MODELS.concat([LAB_JUDGE]).map(m=>L.runs[m.k]&&["err","bad","mismatch"].includes(L.runs[m.k].status)?m.name+": "+({err:"failed ("+L.runs[m.k].doc.error+")",bad:"unreadable reply",mismatch:"another model answered, run not counted"}[L.runs[m.k].status]):null).filter(Boolean);
  if(errs.length) box.append(el("p",{class:"status",text:errs.join(". ")+"."}));
  L.kase.things.forEach((t,i)=>{
    const base={caseKey:L.kase.key,thing:t.text,pair:{a:L.kase.a,b:L.kase.b,relation:L.kase.relation,tab:L.kase.tab}};
    const rows=[];
    const rowFor=(m,s)=>{
      if(!s) return null;
      if(s.status==="run") return el("div",{class:"lab-r"},el("span",{class:"mn",text:m.name}),el("span",{class:"lab-w",text:"running…"}));
      if(!s.doc||!s.doc.recs) return el("div",{class:"lab-r"},el("span",{class:"mn",text:m.name}),el("span",{class:"lab-w",text:"no answer"}));
      const r=s.doc.recs[i], c=Object.assign({},base,{model:m.k,runId:s.id});
      const same=t.cells.includes(r.cell), P=(part,partLabel,shown,txt,cls)=>flagPart(Object.assign({},c,{part,partLabel,shown}),"t"+i,txt,cls);
      // against the judge's ruling: the models it sided with, or (when it did not say) the ones whose cell equals its cell
      let vs=null;
      if(jok&&m.k!=="judge"&&J.doc.recs[i]){ const sd=sided(i); vs=sd?sd.includes(m.k):r.cell===J.doc.recs[i].cell; }
      const row=el("div",{class:"lab-r"+(s.status==="mismatch"?" off":"")+(m.k==="judge"?" ruling":"")},
        el("span",{class:"mn",text:m.k==="judge"?"Judge’s ruling":m.name}),
        el("span",{class:"lps"},
          el("span",{class:"lcell "+(same?"ok":"diff"),title:same?"Same cell as yours":"A different cell from yours"},P("cell","cell",CELL_NAME[r.cell],CELL_NAME[r.cell])),
          P("inA","in A",yn(r.inA),"A "+yn(r.inA)),
          P("inB","in B",yn(r.inB),"B "+yn(r.inB)),
          P("exists","exists",yn(r.exists),"exists "+yn(r.exists)),
          r.unsure?P("unsure","unsure","unsure","unsure","uns"):null),
        el("span",{class:"lrd"},P("reading","reading",r.reading,"“"+r.reading+"”","rd")),
        el("span",{class:"lt"},vs===null?null:el("b",{class:"vs "+(vs?"yes":"no"),text:vs?"= ruling":"≠ ruling",title:vs?"The judge sided with this answer":"The judge ruled differently"}),s.doc.ms!=null?(s.doc.ms/1000).toFixed(1)+" s":""));
      if(m.k==="judge"){
        const sd=sided(i), seen=((J.doc&&J.doc.order)||[]).map(id=>LAB_MODELS.find(x=>id.endsWith("_"+x.k))).filter(Boolean);
        const sn=sd?(sd.length?"Sided with "+sd.map(mname).join(" and ")+(sd.length<seen.length?", not "+seen.filter(x=>!sd.includes(x.k)).map(x=>x.name).join(" or "):""):"Sided with none of the answers")+".":"";
        return el("div",{class:"lab-j"},row,sn||r.reason?el("p",{class:"lab-why"},sn?el("span",{class:"lab-sided",text:sn+" "}):null,r.reason?P("reason","judge's reason",r.reason,r.reason,"why"):null):null);
      }
      return row;
    };
    LAB_MODELS.forEach(m=>{ const n=rowFor(m,L.runs[m.k]); if(n) rows.push(n); });
    const jn=rowFor(LAB_JUDGE,L.runs.judge); if(jn) rows.push(jn);
    // the page's own verdict(s) for this thing
    const pv=t.cells.map(c=>{ const rr=ui.res.cells[c]; if(!rr) return null; const by=rr.by==="claude"?" (checked by Claude)":""; const lab_=({ok:"fits",bad:"does not fit",cmp:"not checked"})[rr.v]||rr.v; return {c,txt:CELL_NAME[c]+": "+lab_+by}; }).filter(Boolean);
    const pr=el("div",{class:"lab-r page"},el("span",{class:"mn",text:"Page"}),el("span",{class:"lps"},pv.map(x=>flagPart(Object.assign({},base,{part:"verdict",partLabel:"page verdict",n:x.c,shown:x.txt}),"t"+i,x.txt))));
    const head=el("p",{class:"lab-t"},el("b",{lang:"en",text:"“"+t.text+"”"}),el("span",{class:"you",text:" you put it in "+t.cells.map(c=>CELL_NAME[c]).join(", ")}),
      flagPart(Object.assign({},base,{part:"check",partLabel:"the whole check",shown:"all runs"}),"t"+i,"Flag all","all"));
    const agreeAll=!J&&st.runs.length>=2&&!L.busy&&!L.judgeWhy&&new Set(st.runs.map(s=>s.doc.recs[i].cell)).size===1;
    box.append(el("div",{class:"lab-c"},head,rows,agreeAll?el("p",{class:"lab-nj",text:"All answers agree: "+CELL_NAME[st.runs[0].doc.recs[i].cell]+". No judge asked."}):null,pr,flagEditorNode("t"+i)));
  });
  const acts=el("div",{class:"actions left"});
  if(!L.busy&&LAB_MODELS.some(m=>!L.runs[m.k]||L.runs[m.k].status!=="ok")) acts.append(el("button",{type:"button",class:"btn ghost",onclick:labAgain,text:"Run the missing ones again"}));
  if(!L.busy&&!(J&&J.status!=="err"&&J.status!=="bad")&&st.runs.length>=2) acts.append(el("button",{type:"button",class:"btn ghost",onclick:labJudgeNow,text:"Ask the judge"}));
  if(acts.childNodes.length) box.append(acts);
  box.append(el("p",{class:"note faint",text:"Tap any value to flag it. Each run is stored for the model comparison; your page verdicts are not changed by it."}));
  if(flagErr) box.append(el("p",{class:"status",text:flagErr}));
  return box;
}
/* ---------- a flag on every box that shows text written by Claude (v59) ---------- */
// A small flag in the top-right corner of the box, never beside Close: the Why panel and the chat show the word with it, the small ? notes only the icon.
// The editor opens inside the same box. A flag is the same document whichever box it was made in (the note on a cell is one flag in the ? note and in the question row).
const flagKey=()=>ui.lab&&ui.lab.kase?ui.lab.kase.key:(ui.col||"answers")+"_"+(ui.saveId||ui.fkey||(ui.fkey="t"+Date.now().toString(36)));
function aiCase(part,partLabel,shown,n){
  return {caseKey:flagKey(),part,partLabel,shown:String(shown||"").slice(0,400),n:n==null?null:String(n),pair:{a:cur.p.a,b:cur.p.b,relation:cur.p.relation,tab:ui.debate?"debate":"practice"}};
}
function aiFlag(c,where,word){
  if(!db||!ui||!cur||!cur.p) return null;
  const on=!!flagOf(c), F=ui.flagEdit, active=!!(F&&flagId(F.c)===flagId(c));
  return el("button",{type:"button","data-fid":flagId(c),class:"aiflag"+(word?" wd":"")+(on?" flagged":"")+(active?" active":""),"aria-pressed":on?"true":"false",
    "aria-label":(on?"Flagged: ":"Flag ")+c.partLabel,title:on?"Flagged. Tap to change":"Flag "+c.partLabel,onclick:e=>{ e.stopPropagation(); openFlag(c,where); }},
    el("span",{class:"flg","aria-hidden":"true"}),word?el("span",{class:"fw",text:on?"Flagged":"Flag"}):null);
}
// one answer of Claude in the Why panel (explain turn) or the chat: the flag first, so it floats to the top-right, and the editor last
function decorateAns(a,t,idx,over){
  if(!ui||t.pending||!t.content||a.childNodes.length===1&&a.firstChild.classList&&a.firstChild.classList.contains("status")) return;
  const where=(over?"o":"i")+idx, expl=t.kind==="explain";
  const fl=aiFlag(aiCase(expl?"explain":"chat",expl?"Claude’s explanation":"Claude’s answer",t.content,expl?null:idx),where,true);
  if(fl){ a.prepend(fl); a.classList.add("hasflag"); }
  const ed=flagEditorNode(where); if(ed) a.append(ed);
}

/* ---------- Review: flags, disagreements, model summary ---------- */
function labStats(){
  const by={}, cases={};
  for(const r of Object.values(labRuns())){
    const cs=cases[r.caseKey]||(cases[r.caseKey]={runs:[],judge:null,kase:r.case});
    if(r.kind==="judge") cs.judge=r; else cs.runs.push(r);
  }
  for(const cs of Object.values(cases)){
    for(const r of cs.runs){
      const o=by[r.model]||(by[r.model]={n:0,ok:0,counted:0,ms:0,agree:0,cmp:0});
      o.n++; if(r.ok) o.ok++; if(r.ok&&r.valid){ o.counted++; o.ms+=r.ms||0; }
      if(r.ok&&r.valid&&cs.judge&&cs.judge.ok) r.recs.forEach((x,i)=>{ const j=cs.judge.recs[i]; if(j){ o.cmp++; if(j.cell===x.cell) o.agree++; } });
    }
  }
  return {by,cases};
}
function labReview(box){
  const fl=Object.values(flags).sort((x,y)=>(y.updatedAt||y.at||"").localeCompare(x.updatedAt||x.at||"")), nNew=fl.filter(f=>f.state==="new").length;
  const sec=el("div",{class:"section"},el("p",{class:"label"},"Lab",el("span",{class:"hint",text:fl.length?fl.length+" flagged"+(nNew?", "+nNew+" new":""):"no flags yet"})));
  const {by,cases}=labStats(), models=LAB_MODELS.filter(m=>by[m.id]);
  if(models.length) sec.append(el("table",{class:"tbl labt"},el("thead",null,el("tr",null,["Model","Runs","Time","Judge agrees"].map(h=>el("th",{text:h})))),
    el("tbody",null,models.map(m=>{ const o=by[m.id]; return el("tr",null,el("td",{text:m.name}),el("td",{class:"num",text:o.counted+(o.n>o.counted?" / "+o.n:"")}),el("td",{class:"num",text:o.counted?(o.ms/o.counted/1000).toFixed(1)+" s":"–"}),el("td",{class:"num",text:o.cmp?o.agree+" / "+o.cmp:"–"})); }))));
  else sec.append(el("p",{class:"empty-note",text:lab?"Runs appear here after you check an answer.":"The lab is off (Options)."}));
  // cases where the models disagree
  const dis=[];
  for(const [k,cs] of Object.entries(cases)){
    const ok=cs.runs.filter(r=>r.ok&&r.valid); if(ok.length<2||!cs.kase) continue;
    cs.kase.things.forEach((t,i)=>{ const set=[...new Set(ok.map(r=>r.recs[i].cell))]; if(set.length>1) dis.push({k,t,set,pair:cs.kase.a+" / "+cs.kase.b,at:cs.runs[0].at}); });
  }
  dis.sort((x,y)=>(y.at||"").localeCompare(x.at||""));
  if(dis.length){
    sec.append(el("p",{class:"sublabel",text:"Models disagree ("+dis.length+")"}));
    sec.append(el("ul",{class:"sum"},dis.slice(0,12).map(d=>el("li",null,el("span",{class:"m part","aria-hidden":"true",text:"?"}),el("span",null,"“"+d.t.text+"”",el("span",{class:"sub",text:d.pair+" · "+d.set.map(c=>CELL_NAME[c]).join(" / ")+" · you: "+d.t.cells.map(c=>CELL_NAME[c]).join(", ")}))))));
  }
  if(fl.length){
    sec.append(el("p",{class:"sublabel",text:"Flags"}));
    sec.append(el("ul",{class:"sum flagl"},fl.slice(0,40).map(f=>el("li",{class:f.state},el("span",{class:"m","aria-hidden":"true"},el("span",{class:"flg"})),
      el("span",null,(f.thing?"“"+f.thing+"” · ":"")+(f.model?mname(f.model)+" · ":"")+f.part,
        el("span",{class:"sub",text:(f.shown?"shown: "+f.shown:"")+(f.suggest?" · should be: "+f.suggest:"")}),
        f.note?el("span",{class:"sub",text:f.note}):null,
        el("span",{class:"skact"},
          el("span",{class:"fstate",text:f.state+" · "+dayOf(f.at)}),
          f.state==="new"?el("button",{type:"button",class:"btn",onclick:()=>setFlagState(f.id,"reviewed"),text:"Reviewed"}):null,
          f.state!=="resolved"?el("button",{type:"button",class:"btn ghost",onclick:()=>setFlagState(f.id,"resolved"),text:"Resolved"}):null,
          el("button",{type:"button",class:"btn ghost",onclick:()=>removeFlag(f.id),text:"Delete"})))))));
  }
  if(flagErr) sec.append(el("p",{class:"status",text:flagErr}));
  box.append(sec);
}


/* ---------- tutor: per-pair card plus two lookup tools ---------- */
function termFacts(name){
  const t=DATA.terms[name]; if(!t) return null;
  const f={term:t.name, definition:t.d, chapter:t.ch, chain:(DATA.chains[name]||[]).join(" > ")};
  if(t.d_ru) f.definition_ru=t.d_ru;
  if(t.mi&&t.mi.length) f.mutually_inclusive=t.mi;
  if(t.contra&&t.contra.length) f.contradictory=t.contra;
  // three and four possibilities the knowledge base states for this term
  if(t.included_in&&t.included_in.length) f.three_possibilities_included_in=t.included_in;
  if(t.overlaps&&t.overlaps.length) f.four_possibilities_with=t.overlaps;
  if(t.note) f.kb_note=t.note.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g,"$1");
  if(t.wylie) f.wylie=t.wylie;
  return f;
}
function catFacts(cid,label){
  const c=CAT[cid]; if(!c) return null;
  if(c.kind==="dudra") return Object.assign({label, type:c.type}, termFacts(c.term));
  return {label, everyday_category:true, maps_to:c.type};
}
const DEBATE_NOTE=`This is the four-questions debate mode. The learner is the defender; the challenger asks four questions about A and B, and the defender answers "Accept", or "Why?" followed by an example.
Q1 If it is A, it follows it is not B? Accept is right only if nothing is both; Why? needs something that is both.
Q2 If it is A, it follows it is B? Why? needs an A that is not B.
Q3 If it is B, it follows it is A? Why? needs a B that is not A.
Q4 If it is not A, it follows it is B? Why? needs something that is neither; a non-existent such as the horn of a rabbit is a valid example (the class convention), an existent is better.
Q1 to Q3 give the relation: accept only Q1 = mutually exclusive; accept Q2 and Q3 = mutually inclusive; accept only Q2 = three possibilities, A inside B; accept only Q3 = three possibilities, B inside A; accept none = four possibilities. Accepting Q1 together with Q2 or Q3 contradicts itself. In blitz mode, running out of time counts as accepting the statement.`;
function tutorCard(p,u){
  const [ca,cb]=pairCats(p);
  const card={A:ca?catFacts(ca,p.a):{label:p.a,type:p.typeA}, B:cb?catFacts(cb,p.b):{label:p.b,type:p.typeB}};
  const notes=[...new Set([ca,cb].flatMap(c=>c&&DATA.notes&&DATA.notes[c]||[]))];
  const refTxt=c=>refOf(p,c)?JSON.stringify(refOf(p,c)):"EMPTY ("+((p.why&&p.why[c])||"no example")+")";
  let mid;
  if(u.debate){
    const imp=u.res.implied;
    const lines=QCELL.map((c,i)=>{
      const a=u.ans[i], r=u.res.cells[c];
      const said=a.say==="accept"?"ACCEPT"+(a.timeout?" (time ran out, which counts as accepting)":""):a.say==="why"?"WHY"+(a.text?" with the example "+JSON.stringify(a.text):" without an example"):"nothing (time ran out)";
      const it=a.text?matchItem(a.text):null;
      return "- Q"+(i+1)+" ("+qPlain(i)+") counter-example cell: "+cellLabel(c,p)+"; learner said "+said+
        (it?" [in the practice list as: "+it.n+", type "+it.t+"]":"")+"; reference "+refTxt(c)+"; page verdict "+r.v;
    }).join("\n");
    mid=`${DEBATE_NOTE}
A = ${JSON.stringify(p.a)}, B = ${JSON.stringify(p.b)}.
Correct relation: ${REL[p.relation].name}. The learner's Q1 to Q3 answers give: ${imp==="bad"?"a self-contradiction":imp?REL[imp].name:"nothing (time ran out)"}. Learner chose: ${u.late?"nothing (time ran out; the page then showed the right relation)":REL[u.rel].name}.
Reference note: ${p.note||"none"}
Questions (verdict cmp = learner wrote an example the page could not classify):
${lines}`;
  } else {
    const lines=CELLS.map(c=>{
      const none=REL[u.rel].empty.includes(c)||u.cells[c].none, t=u.cells[c].t.trim(), r=u.res.cells[c];
      const it=t?matchItem(t):null;
      return "- "+cellLabel(c,p)+": learner wrote "+(none?"NONE":(t?JSON.stringify(t):"(blank)"))+
        (it?" [in the practice list as: "+it.n+", type "+it.t+"]":"")+
        "; reference "+refTxt(c)+"; page verdict "+r.v;
    }).join("\n");
    mid=`Correct relation: ${REL[p.relation].name}. Learner chose: ${u.late?"nothing (time ran out; the page then showed the right relation)":REL[u.rel].name}.${u.exLate?" Time ran out on the examples: cells the learner had not reached are blank.":""}
Reference note: ${p.note||"none"}
Cells (verdict cmp = learner wrote something the page could not classify):
${lines}`;
  }
  return GUIDE+`

CARD (from the course booklet's term data; the relation and reference examples were computed from a list of classified examples):
${JSON.stringify(card)}
${mid}`+(notes.length?"\nFine points (from the sources; apply them):\n"+notes.map(n=>"- "+n).join("\n"):"");
}
const FIRST_ASK=`Explain this answer. Use these lines, in this order:
- one line per cell where the learner wrote an example or the page marked it wrong, labelled with the cell name ("Both", "A not B", "B not A", "Neither"). Fixed order inside the line: the learner's example, its Dudra type, then the conclusion ("so it fits" or "so it does not fit", with the reason in a few words). Never put the conclusion first. If the learner wrote nothing or NONE, say what kind of thing would fit, or why nothing can;
- "Common locus:" yes or no, with one example or the reason there is none;
- "Pervasion:" whether whatever is A is necessarily B, and the reverse;
- "Explanation:" only if the learner was wrong: two sentences on what to look at to get it right, without repeating the lines above;
- "Misconception:" only if the learner was wrong, one sentence.`;
const CELL_NAME={both:"Both", anb:"A not B", bna:"B not A", nei:"Neither"};
const DEBATE_ASK=`Explain this debate. Use these lines, in this order:
- one line per question, labelled "Q1" to "Q4", where the learner asked Why? with an example, answered wrongly, or ran out of time. Fixed order inside the line: what the learner said (Accept, or Why? and the example with its Dudra type), then the conclusion ("so it holds" or "so it fails", with the reason in a few words). Never put the conclusion first. For a wrong Accept, name a counter-example; for a Why? where nothing can be posited, say why that cell is empty;
- "Relation:" what Q1 to Q3 give and whether it matches the correct relation;
- "Pervasion:" whether whatever is A is necessarily B, and the reverse;
- "Explanation:" only if the learner was wrong: two sentences on what to look at to get it right, without repeating the lines above;
- "Misconception:" only if the learner was wrong, one sentence.`;
// Explain also verifies the examples the page could not check: those cell lines end in a machine-readable verdict.
function explainAsk(U){
  const dbt=!!U.debate, open=CELLS.filter(c=>U.res.cells[c].v==="cmp");
  const base=dbt?DEBATE_ASK:FIRST_ASK;
  if(!open.length) return base;
  const nm=c=>dbt?"Q"+(CELLS.indexOf(c)+1):CELL_NAME[c];
  return base+`
The page could not check the examples in: ${open.map(nm).join(", ")}. End each of those cell lines with " => yes" if the example belongs in that cell (an existent thing; in Neither a non-existent such as the horn of a rabbit counts too), " => no" if it does not, or " => unsure".`+(dbt?`
Q1 is the Both cell, Q2 A not B, Q3 B not A, Q4 Neither.`:"")+`
How to decide: read the example in its ordinary sense (a song is the sound of someone singing or playing; a stone is an ordinary stone at room temperature). Place it under A or B first, then use the correct relation above: it is computed and right, so if whatever is B is A, a B belongs in Both. Use classify_example or lookup_term when a classification is not obvious.
Say "unsure" only when the sources disagree on how to classify the thing (see the fine points) or when you cannot tell what the example names. Then the line names each reading and the cell it gives, in a few words. A word that could also mean something else is not a reason for "unsure": decide on the ordinary reading and mention the other one briefly.`;
}
const VERDICT_RE=/\s*=>\s*(yes|no|unsure)\W*$/i;
const NAME_CELL={"both":"both","a not b":"anb","b not a":"bna","neither":"nei","q1":"both","q2":"anb","q3":"bna","q4":"nei"};
function applyVerify(text,U,C){
  let n=0;
  for(const ln of (text||"").split("\n")){
    const m=ln.replace(/^[-•*\s]+/,"").replace(/\*\*/g,"").match(/^(both|a not b|b not a|neither|q[1-4])\s*:\s*(.*?)\s*=>\s*(yes|no|unsure)\W*$/i);
    if(!m) continue;
    const c=NAME_CELL[m[1].toLowerCase()], r=U.res.cells[c]; if(!r||r.v!=="cmp") continue;
    const ok=m[3].toLowerCase(), ref=refOf(C.p,c);
    r.v=ok==="yes"?"ok":ok==="no"?"bad":"cmp"; r.uns=ok==="unsure"; r.by="claude"; n++;
    r.msg=ok==="yes"?["Verified","","by Claude"]:ok==="no"?["Does not fit",ref?". Example: "+ref+".":"","by Claude"]:["Unsure. ","Claude could not settle it; see below."+(ref?" Reference: "+ref+".":"")];
  }
  summarize(U.res);
  if(n&&db&&U.doc&&U.saveId){
    for(const c of CELLS){ U.doc.cells[c].verdict=U.res.cells[c].v; if(U.res.cells[c].by) U.doc.cells[c].by="claude"; }
    if(U.doc.qs) for(const q of U.doc.qs){ const r=U.res.cells[q.c]; q.verdict=r.v; if(r.by) q.by="claude"; }
    U.doc.grade=U.res.overall; U.doc.verifiedAt=new Date().toISOString();
    persist(U,"The verification");
  }
  return n;
}
// The explanation is kept with the answer (applyVerify saves it along with the verdicts), so verdicts can be audited later.
function saveExplain(U){ persist(U,U.debate?"Your debate":"Your answer"); }
const TOOLS=[
  {name:"lookup_term", description:"Look up a Dudra term in the course booklet's term data. Returns its definition (English, Russian), chapter, place in the hierarchy, mutually inclusive and contradictory terms, the terms it is included in (three possibilities), the terms it has four possibilities with, and the knowledge base's note. Use it for any term not on the card.",
   inputSchema:{type:"object",properties:{name:{type:"string",description:"Term in English, e.g. 'Non-associated compositional factor', or in Russian"}},required:["name"]},
   execute:(input)=>{
     const q=norm(input&&input.name); if(!q) throw new Error("empty name");
     const ts=Object.values(DATA.terms);
     const hit=ts.find(t=>norm(t.name)===q)||ts.find(t=>(t.aliases||[]).some(a=>norm(a)===q))||ts.find(t=>norm(t.ru)===q)||ts.find(t=>norm(t.name).includes(q));
     if(!hit) return {found:false, close:ts.filter(t=>norm(t.name).split(" ").some(w=>q.includes(w)&&w.length>3)).slice(0,8).map(t=>t.name)};
     return Object.assign({found:true}, termFacts(hit.name));
   }},
  {name:"classify_example", description:"Check how the practice list classifies a concrete thing (e.g. 'a dog', 'the smell of coffee'). Returns its Dudra type and the practice categories it belongs to, or found:false if the list does not contain it.",
   inputSchema:{type:"object",properties:{thing:{type:"string"}},required:["thing"]},
   execute:(input)=>{
     const it=matchItem(input&&input.thing); if(!it) return {found:false};
     return {found:true, item:it.n, existent:!it.ne, dudra_type:it.t, chain:(DATA.chains[it.t]||[it.t]).join(" > "), categories:it.c.map(c=>CAT[c].labels[0])};
   }},
];
async function ask(text,kind){
  const U=ui, C=cur;                       // the pair this question belongs to, even if you switch tabs meanwhile
  if(!sample||!U||U.ctl) return;
  const p=C.p;
  const body=kind==="explain"?explainAsk(U):text;
  if(!U.chat) U.chat=[{role:"user",content:tutorCard(p,U)+"\n\n"+body, hidden:true}];
  else U.chat.push({role:"user",content:body,hidden:!!kind});
  if(kind==="explain"){ U.explained=true; U.rtab="tutor"; }
  U.chat.push({role:"assistant",content:"",pending:true,kind});
  U.chatErr=""; const ctl=U.ctl=new AbortController(); render(); if(U===ui) revealTutor();
  const turns=U.chat.filter(t=>!t.pending).map(t=>({role:t.role,content:t.content}));
  const slot=U.chat[U.chat.length-1];
  const opts={signal:ctl.signal,modelTier:TIER,cache:false,onText:({text})=>{slot.content=text; if(U===ui){ const o=$("ans-live"); if(o){ fillTurn(o,{kind,pending:true,content:text},!o.closest("#chatscroll")); const sc=$("chatscroll"); if(sc) sc.scrollTop=0; } }}};
  if(DATA) opts.tools=TOOLS;
  try{
    let r;
    try{ r=await sample(turns,opts); }
    catch(e){ if(e&&e.code==="tools_unavailable"){ delete opts.tools; r=await sample(turns,opts); } else throw e; }
    slot.content=r.text+(r.truncated?"\n(Cut short.)":""); delete slot.pending;
    if(kind==="explain"){ if(U.doc) U.doc.explain=String(r.text||"").slice(0,3000); if(!(U.res.exOpen&&applyVerify(r.text,U,C))) saveExplain(U); }
  }catch(e){
    if(e&&e.text){ slot.content=e.text; delete slot.pending; } else U.chat.pop();
    if(kind==="explain") U.explained=false;
    if(U.chat.length===1) U.chat=null;
    U.chatErr=errCopy(e);
    if(e&&ERR_OFF.includes(e.code)) sample=null;
  }
  U.ctl=null;
  if(U===ui){ render(); if(kind==="explain") revealTutor(); const i=$("ask-in"); if(i&&!("ontouchstart" in window)) i.focus(); }
}
function fillAns(node,text){
  node.replaceChildren();
  const lines=(text||"").split("\n").map(s=>s.trim()).filter(Boolean);
  if(!lines.length){ node.append(el("p",{class:"status thinking"},"Thinking",el("span",{class:"dots","aria-hidden":"true"},el("i"),el("i"),el("i")))); return; }
  for(const ln0 of lines){
    const ln=ln0.replace(VERDICT_RE,"");
    const m=ln.replace(/^[-•]\s*/,"").match(/^([A-Za-z][A-Za-z0-9 ,'’-]{0,28}):\s+(.*)$/);
    node.append(m?el("p",null,el("b",{text:m[1]+": "}),m[2]):el("p",{text:ln.replace(/^[-•]\s*/,"")}));
  }
}
function errCopy(e){
  const c=e&&e.code;
  if(c==="cancelled") return "";
  if(c==="rate_limited") return "Claude is busy or your usage limit is reached. Try again later.";
  if(c==="session_expired") return "Sign in to Claude again, then retry.";
  if(c==="prompt_too_large") return "This conversation is too long. Move to the next pair.";
  if(ERR_OFF.includes(c)) return "Claude is not enabled for this page.";
  return "Claude could not answer just now. Try again.";
}

/* ---------- rendering ---------- */
// One layout state for every tab: wide screens show a rail, the workspace and a coach panel side by side;
// narrow screens show a top bar, one screen at a time (steps) and a tab bar. Both are built from the same parts.
const TABS=[["practice","Relations"],["debate","Pervasions"],["review","Review"]];
const CELL_FULL={both:"Both A and B", anb:"A, not B", bna:"B, not A", nei:"Neither A nor B"};
function top0(){ for(const id of ["stage","coach","over"]){ const n=$(id); if(n) n.scrollTop=0; } }
function ago(iso){
  const m=Math.round((Date.now()-new Date(iso))/6e4); if(!(m>=0)) return "";
  if(m<1) return "now"; if(m<60) return m+" min";
  const h=Math.round(m/60); if(h<24) return h+" h";
  const d=Math.round(h/24); return d===1?"1 day":d+" days";
}
function renderTabs(){
  const rail=$("tabs"), bar=$("tabbar"); rail.replaceChildren(); bar.replaceChildren();
  for(const [k,l] of TABS){
    const sel=tab===k?"true":"false", go=()=>setTab(k);
    rail.append(el("button",{type:"button",role:"tab",class:"nv","aria-selected":sel,onclick:go},el("i",{"aria-hidden":"true"}),l));
    bar.append(el("button",{type:"button",role:"tab","aria-selected":sel,onclick:go},el("i",{"aria-hidden":"true"}),l));
  }
}
// the rail's "Today" block
function renderSession(){
  const s=$("today"); s.replaceChildren();
  const list=Object.values(tab==="debate"?debates:answers).filter(a=>dayOf(a.at)===today());
  s.append(el("span",{text:"Today"}),el("b",{text:String(list.length)}),
    el("span",{text:list.length?(tab==="debate"?"debated":"answered")+", "+list.filter(a=>gradeOf(a)==="ok").length+" fully right":"nothing answered yet"}));
}
// the star in the narrow top bar (the wide layout has the Favourite button next to Check)
function syncFavBtn(){
  const b=$("mfav"), ok=!!(db&&mode==="quiz"&&cur&&cur.p&&tab!=="review");
  b.hidden=!ok; if(!ok) return;
  const on=isFav(cur.p), t=on?"Remove from favourites":"Add to favourites";
  b.replaceChildren(tbIcon("star")); b.setAttribute("aria-pressed",on?"true":"false"); b.setAttribute("aria-label",t); b.title=t+" (F)";
}
// the three steps of a narrow screen; go[i] makes step i a button
function setSteps(labels,on,go){
  const st=$("steps"); st.replaceChildren(); st.hidden=false;
  labels.forEach((l,i)=>st.append(el("button",{type:"button",class:i<on?"done":i===on?"on":"","aria-current":i===on?"step":null,disabled:!(go&&go[i]),onclick:go&&go[i]?go[i]:null,text:(i+1)+" "+l})));
}
function focusKey(){
  const a=document.activeElement;
  return a&&(a.tagName==="INPUT"||a.tagName==="TEXTAREA")&&a.id?{id:a.id,s:a.selectionStart,e:a.selectionEnd}:null;
}
function restoreFocus(f){
  const n=f&&$(f.id); if(!n||n.disabled||document.activeElement===n) return;
  n.focus({preventScroll:true}); try{ n.setSelectionRange(f.s,f.e); }catch(e){}
}
const focusCin=()=>{ const i=$("cin"); if(i) i.focus({preventScroll:true}); };
// A draw replaces the whole screen, which would send the scroll back to the top. While the screen is the same one (the same pair, step and
// result, with a row opened or a chip changed), the scroll stays where it was; a new screen starts at the top, as the callers ask with top0().
let lastSig="";
function screenSig(){
  const p=cur&&cur.p;
  return [tab,mode,view,optsOpen?1:0,isWide()?1:0,p?(p.id||p.a+"|"+p.b):"",ui?[ui.checked?1:0,ui.step||0,ui.ci||0,ui.rel?1:0,ui.open?1:0,ui.debate?1:0].join(""):""].join("/");
}
function render(){
  const sig=screenSig(), keep=sig===lastSig?["stage","coach","over"].map(id=>{ const n=$(id); return [id,n?n.scrollTop:0]; }):null;
  lastSig=sig;
  renderNow();
  if(keep) for(const [id,y] of keep){ const n=$(id); if(n&&y&&!n.hidden) n.scrollTop=y; }
}
function renderNow(){
  ensureRelTimer();
  const w=isWide(); if(w&&view==="chat") view=null;
  const app=$("app"), s=$("stage"), c=$("coach"), f=focusKey();
  app.dataset.tab=tab; app.dataset.wide=w?"1":"0";
  renderOptionsBtn(); renderTabs(); renderSession(); syncFavBtn(); syncSkipBtn(); syncBlitzBtn();
  s.replaceChildren(); c.replaceChildren(); $("steps").replaceChildren(); $("steps").hidden=true;
  s.className="card"+(tab==="review"?" rv":"");
  if(mode==="nodb"){ s.append(el("p",{class:"status",text:"Open this page in Claude while signed in to save your answers."})); }
  if(mode==="loading"){ s.append(el("p",{class:"status",text:"Loading."})); renderOver(); return; }
  if(mode==="nodata"){ s.append(el("p",{class:"status",text:"The practice data could not be loaded. Reload the page to try again."})); renderOver(); return; }
  if(tab==="review") renderReview(s);
  else if(mode==="quiz"){ if(tab==="debate"&&ui&&ui.debate) renderDebate(s,c); else renderQuiz(s,c); }
  renderOver(); restoreFocus(f); placePops();
}

// Fit the terms around the fixed chips and diamond. The diamond stays in the middle and each term has
// its half: a term too long for one line there first tries text up to 15% smaller, then wraps in its half.
// A single word too long for its half first tries text up to 20% smaller; failing that it moves the diamond over, just enough
// for that word; if the other term's words then do not fit, the text shrinks to 13px, and below that long words break.
// The relation name under the diamond follows it when it moves off centre.
function fitPair(){
  const pr=document.querySelector(".pair"); if(!pr) return;
  const [a,b]=pr.querySelectorAll(".tx"), ch=pr.querySelectorAll(".L");
  pr.style.removeProperty("--tsz"); pr.style.removeProperty("grid-template-columns");
  const gap=parseFloat(getComputedStyle(pr).columnGap)||0;
  const W=Math.floor(pr.clientWidth-(ch[1].getBoundingClientRect().right-ch[0].getBoundingClientRect().left)-2*gap), h=Math.floor(W/2);
  const size=(t,k)=>{ t.style.width=k; t.style.hyphens="manual"; const w=Math.ceil(t.getBoundingClientRect().width); t.style.width=t.style.hyphens=""; return w; };
  const f0=parseFloat(getComputedStyle(a).fontSize); let f=f0, z, wa, wb;
  const font=g=>{ f=g; pr.style.setProperty("--tsz",g+"px"); };
  const meas=()=>{ z={xa:size(a,"max-content"),xb:size(b,"max-content"),na:size(a,"min-content"),nb:size(b,"min-content")}; };
  const line=()=>z.xa<=h&&z.xb<=h, words=()=>z.na<=h&&z.nb<=h;
  // smaller text (by at most k), if that makes ok() hold; otherwise back to full size
  const shrink=(need,ok,k)=>{ const g=Math.floor(f0*(h-1)/need*10)/10; if(g<Math.max(13,f0*(1-k))) return false; font(g); meas(); if(ok()) return true; font(f0); meas(); return false; };
  meas();
  if(!line()&&!shrink(Math.max(z.xa,z.xb),line,.15)&&!words()&&!shrink(Math.max(z.na,z.nb),words,.2)){
    for(;;){
      if(words()) break;
      if(f<=13){ if(z.na<=h){ wa=z.na; wb=W-z.na; } else if(z.nb<=h){ wb=z.nb; wa=W-z.nb; } else { wa=wb=h; } break; }
      font(Math.max(13,f-1)); meas();
    }
  }
  if(wa!=null) pr.style.gridTemplateColumns=Math.floor(wa)+"px auto auto auto "+Math.floor(wb)+"px";
  const sub=pr.parentElement.querySelector(".subrow,.subt"); if(!sub) return;
  sub.style.translate="";
  const hd=pr.parentElement.getBoundingClientRect(), m=pr.querySelector(".mid").getBoundingClientRect(), sw=sub.getBoundingClientRect().width;
  const room=Math.max(0,(hd.width-sw)/2), dx=m.left+m.width/2-(hd.left+hd.width/2);
  sub.style.translate=Math.round(Math.max(-room,Math.min(room,dx)))+"px 0";
}
let fitQ=0;
const refit=()=>{ cancelAnimationFrame(fitQ); fitQ=requestAnimationFrame(fitPair); };
addEventListener("resize",refit);
// The first fit can run before EB Garamond has loaded and measure the fallback font, so fit again once it is in.
if(document.fonts){
  document.fonts.ready.then(refit);
  document.fonts.addEventListener("loadingdone",refit);
  document.fonts.load('500 20px "EB Garamond"').then(refit,()=>{});
}

/* ---------- practice: one pair ---------- */
// the heading: A [relation diamond] B, relation name below. On a wide screen the strip under it picks the relation, so the diamond only shows it.
function quizHead(s,w){
  const p=cur.p;
  if(cur.retry) s.append(el("span",{class:"retry-tag",text:(cur.tag||"Retry")+(retryQ.length?" · "+retryQ.length+" more":"")}));
  const np=ui.rel?notaParts(ui.rel):null;
  let midCls="mid"+(ui.rel?" set":" empty");
  if(ui.checked) midCls+=ui.res.relOk?" key":" wrong";
  const toggle=()=>{ if(!ui.checked&&ui.rel&&!w&&!ui.late){ ui.open=!ui.open; render(); } };
  const label=ui.rel?"Relation: "+REL[ui.rel].name+(ui.checked||w?"":". Change"):"Pick a relation";
  const mid=el("button",{type:"button",class:midCls,disabled:ui.checked||!ui.rel||w||ui.late,"aria-expanded":w?null:(ui.open?"true":"false"),"aria-label":label,onclick:toggle},
    np?el("span",{class:"sym math",text:np[0]+(np[1]?" "+np[1]:"")}):el("span",{class:"pip"}));
  const tail=np&&np[2]?el("span",{class:"tail math"+(ui.checked?(ui.res.relOk?" key":" wrong"):""),text:np[2]}):null;
  const subTxt=!ui.rel?"pick a relation":ui.late&&!ui.checked?REL[ui.rel].name+" · time ran out":REL[ui.rel].name;
  s.append(el("div",{class:"head"},
    el("div",{class:"pair",lang:"en"}, el("span",{class:"tx ta",text:p.a}), L("A"), mid, L("B"), el("span",{class:"tx tb"},p.b,tail)),
    subRowNode({text:subTxt,cls:ui.checked?(ui.res.relOk?" key":" wrong"):"",disabled:ui.checked||!ui.rel||w||ui.late,onclick:toggle,why:relWhy()})));
  const rp=relPopNode(); if(rp) s.append(rp);
  fitPair();
}
// the five relations as a list (narrow screens, and the last step of a debate) ...
function relList(onPick,heading){
  const p=cur.p, list=el("div",{class:"rels",role:"group","aria-label":"Relation"});
  ORDER.forEach((k,i)=>{
    const r=REL[k];
    list.append(el("button",{type:"button",class:"rel","aria-pressed":ui.rel===k?"true":"false",onclick:()=>onPick(k)},
      el("span",null, el("span",{class:"name",text:r.name}), el("span",{class:"gloss",text:r.gloss(p.a,p.b)})),
      el("span",{class:"nota math",text:notaOf(k)})));
  });
  // the countdown row is always there (empty with Blitz off), so the switch never moves the list
  const timed=ui.debate?relTimedD():relTimed(), lab=heading?el("p",{class:"label rel-label"},heading):null;
  return el("div",{class:"section"}, el("div",{class:"lrow"},lab,timerSlot(ui.debate||!ui.rel?"rel":"ex",timed)), list);
}
// ... and as a strip of five chips (wide screens), with the chosen relation explained under it
function relStrip(onPick,done){
  const p=cur.p, box=el("div",{class:"strip"+(done?" done":""),role:"group","aria-label":"Relation"});
  ORDER.forEach((k,i)=>{
    const r=REL[k], mine=ui.rel===k;
    // once checked: the chosen chip is lapis when right and vermilion when wrong, and the right one is ringed
    const st=done?(ui.late?(p.relation===k?" right":""):mine?(ui.res&&ui.res.relOk?" key":" wrong"):p.relation===k?" right":""):"";
    box.append(el("button",{type:"button",class:"chip"+st,"aria-pressed":mine?"true":"false",disabled:done,title:r.gloss(p.a,p.b),onclick:()=>onPick(k)},
      el("span",{class:"n math",text:notaOf(k)}), el("small",{text:r.name.replace(/, ([AB]) in ([AB])$/,", $1\u00a0in\u00a0$2")})));
  });
  return box;
}
function relCap(hint){
  if(!ui.rel) return el("p",{class:"cap",text:hint||"Pick the relation (keys 1–5), then give examples."});
  const r=REL[ui.rel];
  if(ui.late) return el("p",{class:"cap"},el("b",{text:"Time ran out. "}),"The relation is "+lcRel(r.name)+": "+r.gloss(cur.p.a,cur.p.b)+".");
  return el("p",{class:"cap"},el("b",{text:r.name+". "}),r.gloss(cur.p.a,cur.p.b)+".");
}
// one cell of the 2x2 table: an example field, or the verdict on it once checked
function quizCell(c){
  const p=cur.p, implied=ui.rel?REL[ui.rel].empty:[], r=ui.checked&&ui.res.cells[c];
  const vcls=r?" v-"+(r.uns?"uns":r.v):"";
  if(implied.includes(c)){
    return el("div",{class:"cell locked"+vcls,"aria-label":cellLabel(c,p)+": nothing, by your relation"},
      r&&r.v==="bad"?fbNode(r):el("span",{class:"empty",text:"∅"}),whyBtn(c,p));
  }
  const off=ui.checked||!ui.rel||ui.cells[c].none;
  const inp=el("input",{type:"text",id:"in-"+c,placeholder:ui.cells[c].none?"∅":"example",value:ui.cells[c].t,disabled:off,"aria-label":cellLabel(c,p),autocomplete:"off"});
  inp.addEventListener("input",e=>{ui.cells[c].t=e.target.value;});
  inp.addEventListener("keydown",e=>{ if(e.key==="Enter"){ e.preventDefault(); const nx=nextInput(c); if(nx) nx.focus(); else check(); } });
  return el("div",{class:"cell"+vcls}, el("div",{class:"field"},inp), r?fbNode(r):null, whyBtn(c,p));
}
// Claude's explanation split by where it belongs: a line per cell (or Q1 to Q4) goes to that cell, the lines on the common locus,
// the pervasion and the relation to the "?" beside the relation. Anything else (the explanation, the misconception) belongs to the Why panel.
const REL_LABEL=/^(common locus|pervasion|relation)$/i;
function explainParts(){
  const out={cells:{},rest:[]};
  const a=ui&&ui.chat&&ui.chat.find(t=>t.role==="assistant"&&t.kind==="explain"&&!t.pending&&t.content);
  if(!a) return out;
  for(const ln0 of a.content.split("\n")){
    const ln=ln0.replace(/^[-•*\s]+/,"").replace(/\*\*/g,"").replace(VERDICT_RE,"").trim(); if(!ln) continue;
    const m=ln.match(/^(both|a not b|b not a|neither|q[1-4])\s*:\s*(.+)$/i);
    if(m){ out.cells[NAME_CELL[m[1].toLowerCase()]]=m[2]; continue; }
    const g=ln.match(/^([A-Za-z][A-Za-z0-9 ,'’-]{0,28}):\s+(.*)$/);
    if(g&&REL_LABEL.test(g[1])) out.rest.push([g[1],g[2]]);
  }
  return out;
}
// the "?" on a cell that Claude explained; it opens a small note as a row of the table, right under the cell's row
function whyBtn(c,p){
  if(!ui||!ui.checked||!explainParts().cells[c]) return null;
  return el("button",{type:"button",class:"qm","aria-label":"Claude's explanation: "+cellLabel(c,p),"aria-expanded":ui.pop===c?"true":"false",
    onclick:e=>{ e.stopPropagation(); ui.pop=ui.pop===c?null:c; render(); }},"?");
}
// the "?" beside the relation's name: Claude's lines on the common locus, the pervasion and the relation itself
function relWhy(){
  if(!ui||!ui.checked||!explainParts().rest.length) return null;
  return el("button",{type:"button",class:"qm rq","aria-label":"Claude's explanation of the relation","aria-expanded":ui.pop==="rel"?"true":"false",
    onclick:e=>{ e.stopPropagation(); ui.pop=ui.pop==="rel"?null:"rel"; render(); }},"?");
}
function relPopNode(){
  if(!ui||!ui.checked||ui.pop!=="rel") return null;
  const rest=explainParts().rest; if(!rest.length) return null;
  const fl=aiFlag(aiCase("explain","Claude’s note on the relation",rest.map(([k,t])=>k+": "+t).join("\n"),"rel"),"pop:rel");
  return el("div",{class:"pop rpop",role:"dialog","aria-label":"Claude's explanation of the relation",tabindex:"-1"},el("p",{class:"clh",text:"Claude"}),fl,
    rest.map(([k,t])=>el("p",null,k?el("b",{text:k+": "}):null,t)),flagEditorNode("pop:rel"),
    el("button",{type:"button",class:"popx",onclick:e=>{ e.stopPropagation(); ui.pop=null; render(); },text:"Close"}));
}
function popNode(){
  if(!ui||!ui.checked||!ui.pop||ui.pop==="rel") return null;
  const t=explainParts().cells[ui.pop]; if(!t) return null;
  const fl=aiFlag(aiCase("explain","Claude’s note on "+(ui.debate?"Q"+(QCELL.indexOf(ui.pop)+1):CELL_NAME[ui.pop]),t,ui.pop),"pop:"+ui.pop);
  return el("div",{class:"pop",role:"dialog","aria-label":"Claude's explanation",tabindex:"-1"},el("p",{class:"clh",text:"Claude"}),fl,el("p",{text:t}),flagEditorNode("pop:"+ui.pop),
    el("button",{type:"button",class:"popx",onclick:e=>{ e.stopPropagation(); ui.pop=null; render(); },text:"Close"}));
}
function placePops(){
  const pop=document.querySelector(".pop"), m=document.querySelector(".qm[aria-expanded=true]");
  if(!pop||!m) return;
  const g=pop.getBoundingClientRect(), r=m.getBoundingClientRect();
  pop.style.setProperty("--ax",Math.round(r.left+r.width/2-g.left)+"px");
  pop.scrollIntoView({block:"nearest"});
}
// The result section: a headline, one chip per aspect, and the details of one chip below them (like tabs; tapping the open chip closes it).
// With nothing chosen yet, the first chip that is not fine opens.
function resultBlock(r,head,items){
  let open=ui.rtab==="auto"?((items.find(i=>i.st==="bad"||i.st==="open")||{}).key||null):ui.rtab;
  if(open&&!items.some(i=>i.key===open)) open=null;
  const cur=items.find(i=>i.key===open);
  const chips=el("div",{class:"vchips",role:"tablist","aria-label":"Result details"},items.map(i=>el("button",{type:"button",role:"tab",id:"vt-"+i.key,class:"vchip "+i.st,"aria-selected":open===i.key?"true":"false","aria-controls":"vpanel",
    onclick:()=>{ ui.rtab=open===i.key?null:i.key; render(); if(ui.rtab&&i.onopen) i.onopen(); }},
    i.st==="ok"||i.st==="bad"||i.st==="open"?el("span",{class:"ic","aria-hidden":"true",text:{ok:"✓",bad:"✗",open:"?"}[i.st]}):i.ic?el("span",{class:"ic","aria-hidden":"true",text:i.ic}):null,i.label)));
  return el("div",{class:"verdict "+r.overall},
    el("p",{class:"vl"},el("span",{class:"v",text:head})),
    chips,
    cur?el("div",{class:"vpanel",id:"vpanel",role:"tabpanel","aria-labelledby":"vt-"+cur.key},cur.body()):null);
}
const tutorItem=()=>ui.chat?{key:"tutor",label:"Why",st:"none",body:()=>isWide()?renderTutor():inlineExplain()}:null;
const termsItem=p=>({key:"terms",label:"Terms",st:"none",body:()=>termsNode(p)});
function quizResult(){
  const p=cur.p, r=ui.res, k=REL[p.relation], ex=explainParts();
  const head={ok:"Right.",part:"Relation right, but not everything else.",pend:"Relation and cells right.",bad:"Not quite."}[r.overall];
  return resultBlock(r,head,[
    {key:"rel",label:"Relation",st:r.relOk?"ok":"bad",body:()=>[
      el("p",null,el("b",{text:"Relation: "}),ui.late?"time ran out.":r.relOk?"right.":"wrong."),
      el("p",null,(r.relOk?k.name:"The relation is "+lcRel(k.name))+": "+k.gloss(p.a,p.b).toLowerCase()+".",notaOf(p.relation)&&nota!=="codes"?[" ",el("span",{class:"nota math",text:notaOf(p.relation)})]:null)]},
    {key:"cells",label:"Cells",st:r.occBad?"bad":"ok",body:()=>el("p",null,el("b",{text:"Cells: "}),r.occBad?(r.occBad+" filled or left empty wrongly."):"the right ones are filled and empty.")},
    {key:"ex",label:"Examples",st:r.exBad?"bad":r.exOpen?"open":"ok",body:()=>el("p",null,el("b",{text:"Examples: "}),exLine(r,CELLS),ui.exLate?" Time ran out; cells you had not reached count as empty.":null)},
    termsItem(p),tutorItem(),labItem()].filter(Boolean));
}
// Where a category sits: the Dudra term with its higher categories, or, for an everyday category, the Dudra term it falls under.
function lineageOf(cid){
  const c=CAT[cid]; if(!c||!DATA) return null;
  const ch=DATA.chains||{};
  if(c.kind==="dudra"&&c.term) return {names:ch[c.term]||[c.term],everyday:false};
  const head=(c.type||"").split(":")[0].trim(), T=cap(head);
  return {names:T?(ch[T]||[T]):[],everyday:true};
}
const isaChain=names=>names.map(n=>n.toLowerCase()).flatMap((n,i)=>i?[" ",el("i",{class:"isa",text:isA(n)})," ",n]:[n]);
// The Terms panel: how the two terms relate, where each one belongs, and on request the booklet's definitions of the terms involved.
function termsNode(p){
  const box=el("div",{class:"terms"}), ca=p.catA||catByLabel(p.a), cb=p.catB||catByLabel(p.b), lis=[ca&&lineageOf(ca),cb&&lineageOf(cb)];
  box.append(el("p",{class:"tm-sum"},el("b",{text:REL[p.relation].name+". "}),p.note||""));
  box.append(el("div",{class:"tm-rows"},[["A",p.a,p.typeA,lis[0]],["B",p.b,p.typeB,lis[1]]].map(([x,label,type,li])=>
    el("div",{class:"tm-row"},L(x),el("div",null,el("p",{class:"tm-t",text:cap(label)}),
      li&&li.names.length?[li.everyday?el("p",{class:"tm-n",text:"An everyday category, not a Dudra term. It falls under:"}):null,el("p",{class:"tm-c"},isaChain(li.names))]:el("p",{class:"tm-c",text:type||""}))))));
  // the Dudra terms behind the two categories first, then the categories above them
  const names=[], add=n=>{ if(n&&DATA&&DATA.terms[n]&&!names.includes(n)) names.push(n); };
  for(const li of lis) if(li&&!li.everyday&&li.names.length) add(li.names[0]);
  for(const li of lis) if(li) li.names.slice(li.everyday?0:1).forEach(add);
  if(!names.length) return box;
  box.append(el("button",{type:"button",class:"tm-tog","aria-expanded":ui.defs?"true":"false",onclick:()=>{ ui.defs=!ui.defs; render(); if(ui.defs) requestAnimationFrame(()=>{ const b=document.querySelector(".tm-tog"); if(b) b.scrollIntoView({block:"start"}); }); }},ui.defs?"Hide definitions":"Definitions ("+names.length+")"));
  if(ui.defs) box.append(el("dl",{class:"tm-defs"},names.map(n=>{
    const t=DATA.terms[n], en=defParts(t.d), ru=defParts(t.d_ru), ruOn=defLang==="enru", src=en.src||(ruOn?ru.src:"");
    // with the Russian definition shown, the Russian name of the term is named beside the English one
    return el("div",{class:"tm-d"},el("dt",null,t.name,ruOn&&t.ru?el("span",{class:"tm-ru",lang:"ru",text:" · "+t.ru}):null,t.ch?el("small",{text:" · "+t.ch}):null),
      el("dd",{class:src?"out":""},
        src?el("p",{class:"src",text:src+(en.body?":":".")}):null,
        en.body?el("p",{lang:"en",text:endp(cap(en.body))}):null,
        ruOn&&ru.body?el("p",{class:"ru",lang:"ru",text:endp(cap(ru.body))}):null));
  })));
  return box;
}
// The term data marks where a definition comes from with a leading "(source)"; the booklet's own wording has none or "(Purbuchok)".
function defParts(s){
  const m=/^\(([^)]*)\)\s*([\s\S]*)$/.exec((s||"").trim());
  let tag=m?m[1]:"", body=m?m[2]:(s||"").trim();
  const tail=/\s*\((tables|Dampilon)\)\s*$/.exec(body);
  if(tail){ body=body.slice(0,tail.index); tag=tag||tail[1]; }
  if(!tag||tag==="Purbuchok") return {src:"",body};
  const lab={tables:"From the Dampilon tables",Dampilon:"From Dampilon"}[tag];
  return {src:lab||cap(tag),body};
}
const endp=s=>s.replace(/[.;,\s]+$/,"")+".";
const explainBtn=()=>sample&&ui.checked&&!ui.explained&&!ui.ctl?el("button",{class:"btn ghost",type:"button",onclick:()=>ask(null,"explain"),text:ui.res.exOpen?"Check and explain":"Explain"}):null;
const nextBtn=()=>el("button",{class:"btn",type:"button",onclick:next,text:cur.retry&&!retryQ.length?"Back to new pairs":"Next pair"});
const kbHints=(...rows)=>el("div",{class:"kbh"},rows.map(([k,t])=>el("span",null,el("b",{text:k}),t)));
// the last answers, newest first, in the coach panel
// The heading folds the list away (a per-device choice, kept in the browser); folded, the panel shows just the heading.
let recentOpen=true;
try{ recentOpen=localStorage.getItem("rd-recent")!=="0"; }catch(e){}
function recentNode(c,list){
  if(!list.length) return;
  c.append(el("details",{class:"recent",open:recentOpen,ontoggle:e=>{ recentOpen=e.target.open; try{ localStorage.setItem("rd-recent",recentOpen?"1":"0"); }catch(_){} }},
    el("summary",{class:"label"},el("span",{class:"rmk","aria-hidden":"true"}),"Recent",el("span",{class:"hint",text:String(list.length)})),
    el("ul",{class:"hist"},list.map(a=>{
      const g=gradeOf(a);
      return el("li",null,el("span",{class:"s "+g,text:{ok:"✓",part:"~",bad:"✗",pend:"?"}[g]||"✗"}),
        el("span",null,a.a+" / "+a.b,el("small",{text:REL[a.key]?REL[a.key].name:""})),el("small",{text:ago(a.at)}));
    }))));
}

function renderQuiz(s,c){
  if(isWide()) quizWide(s,c); else quizNarrow(s);
  if(favErr) s.append(el("p",{class:"status",text:favErr}));
  if(skipErr) s.append(el("p",{class:"status",text:skipErr}));
}
function quizWide(s,c){
  const p=cur.p;
  quizHead(s,true);
  s.append(relStrip(choose,ui.checked||ui.late));
  if(!ui.checked) s.append(timerSlot(ui.rel?"ex":"rel",relTimed()));
  s.append(relCap());
  s.append(el("div",{class:"section"}, el("p",{class:"label"},"Examples",el("span",{class:"hint",text:"∅ = nothing exists. Neither also takes a non-existent."})), exGrid(p,quizCell,true)));
  const acts=el("div",{class:"actions"});
  const fb=favBtn(p); if(fb) acts.append(fb);
  acts.append(blitzBtn());
  if(!ui.checked){
    skipActs(ui.rel?"Enter moves to the next cell, then shows the result":"").forEach(n=>{ if(n) acts.append(n); });
    if(ui.rel) acts.append(el("button",{class:"btn",type:"button",onclick:check,text:"Show result"}));      // before a relation is picked the cells are closed and there is nothing to show
  } else acts.append(nextBtn());
  s.append(acts);
  if(!ui.checked){
    recentNode(c,answerList().slice(-5).reverse());
    c.append(kbHints(["1–5","relation"],["Enter","next cell"],["S","skip"],["F","favourite"]));
    return;
  }
  c.append(el("p",{class:"label"},"Result"), quizResult());
  if(ui.saveErr) c.append(el("p",{class:"status",text:ui.saveErr}));
  const eb=explainBtn(); if(eb) c.append(el("div",{class:"actions left"},eb));
  c.append(kbHints(["Enter","next pair"],["F","favourite"]));
}
const SKIPPED=()=>CELLS.filter(k=>REL[ui.rel].empty.includes(k));
const fillable=()=>CELLS.filter(k=>!REL[ui.rel].empty.includes(k));
// what to name for each cell, in the page's own style: terms in italic after their A/B chips, bold connectors
function cellPrompt(c){
  const A=termNode("A"), B=termNode("B"), K=w=>el("b",{class:"conn",text:w});
  const t={both:["Name something that is ",K("both")," ",A," ",K("and")," ",B,"."],
    anb:["Name something that is ",A,", ",K("but not")," ",B,"."],
    bna:["Name something that is ",B,", ",K("but not")," ",A,"."],
    nei:["Name something that is ",K("neither")," ",A," ",K("nor")," ",B,"."]}[c];
  return el("p",{class:"cq"},t);
}
// narrow screens: one cell at a time, the field near the top so the on-screen keyboard never covers it.
// The last cell's Done shows the result at once; there is no review list.
function cellView(s){
  const order=fillable();
  ui.ci=Math.max(0,Math.min(ui.ci||0,order.length-1)); ui.seen=Math.max(ui.seen||0,ui.ci);
  const c=order[ui.ci], last=ui.ci===order.length-1;
  // the 2x2 map has the table's layout; a square carries the number of its cell, as in "Cell 2 of 3", and a skipped one stays blank
  const map=el("div",{class:"cmap","aria-hidden":"true"},CELLS.map(k=>el("i",{class:REL[ui.rel].empty.includes(k)?"lock":k===c?"now":ui.cells[k].t.trim()?"fill":"",text:REL[ui.rel].empty.includes(k)?"":String(order.indexOf(k)+1)})));
  const skipped=SKIPPED(), skipTxt=skipped.length?"Skipped by your relation: "+skipped.map(k=>CELL_FULL[k]).join("; ")+".":"";
  const inp=el("input",{type:"text",id:"cin",placeholder:"example",value:ui.cells[c].t,"aria-label":cellLabel(c,cur.p),autocomplete:"off",autocapitalize:"off",enterkeyhint:last?"done":"next"});
  inp.addEventListener("input",e=>{ui.cells[c].t=e.target.value;});
  const go=()=>{
    if(last){ if(document.activeElement) document.activeElement.blur(); check(); }
    else { ui.ci++; render(); focusCin(); }
  };
  inp.addEventListener("keydown",e=>{ if(e.key==="Enter"){ e.preventDefault(); go(); } });
  s.append(el("div",{class:"cview"},
    el("div",{class:"cmeta"},map,el("div",{class:"cwho"},el("span",{class:"n",text:"Cell "+(ui.ci+1)+" of "+order.length}),el("small",{text:CELL_FULL[c]}))),
    cellPrompt(c),
    el("div",{class:"cin"},inp,el("button",{class:"btn",type:"button",onclick:go,text:last?"Done":"Next"})),
    timerSlot("ex",relTimed()),
    el("p",{class:"chint"},
      ui.ci>0?el("button",{type:"button",class:"back",onclick:()=>{ui.ci--; render(); focusCin();},text:"‹ Back"}):null,
      "Leave it empty if nothing exists here."+(skipTxt?" "+skipTxt:""))));
}
// the explanation on the narrow result screen; follow-up questions go to the chat view
// The Why panel repeats nothing the "?" marks show: not the cells, not the common locus, the pervasion or the relation. When the answer was right it shows
// only a pointer to the marks; when it was wrong, the explanation and the misconception. The chat view ("Discuss with AI") shows the whole answer.
const CELL_LN=/^[-•*\s]*(?:\*\*)?(?:both|a not b|b not a|neither|q[1-4])(?:\*\*)?\s*:/i;
const REL_LN=/^[-•*\s]*(?:\*\*)?(?:common locus|pervasion|relation)(?:\*\*)?\s*:/i;
function fillTurn(node,t,lean){
  if(!lean||t.kind!=="explain"||!t.content){ fillAns(node,t.content); return; }
  const raw=String(t.content), lines=raw.split("\n");
  if(t.pending&&!/\n\s*$/.test(raw)) lines.pop();           // the last line may still be growing
  const wrong=!!(ui&&ui.res&&(ui.res.overall==="bad"||ui.res.overall==="part"));
  const rest=wrong?lines.filter(l=>l.trim()&&!CELL_LN.test(l.trim())&&!REL_LN.test(l.trim())).join("\n"):"";
  if(rest||t.pending){ fillAns(node,rest); return; }
  node.replaceChildren(el("p",{class:"status",text:"Claude's notes on the cells and the relation are on the ? marks."}));
}
function inlineExplain(){
  if(!ui.chat) return null;
  const box=el("div",{class:"tutor"}), first=ui.chat.find(t=>t.role==="assistant");
  if(first){ const a=el("div",{class:"ans",id:first.pending&&view!=="chat"?"ans-live":null}); fillTurn(a,first,true); decorateAns(a,first,ui.chat.indexOf(first),false); box.append(a); }
  if(ui.chatErr&&view!=="chat") box.append(el("p",{class:"status",text:ui.chatErr}));
  return box;
}
// the left button of the action row, beside Next pair: Explain, while Claude answers Stop, afterwards the follow-up chat
function tutorAct(){
  const eb=explainBtn(); if(eb) return eb;
  if(!ui.chat||!sample) return null;
  if(ui.ctl) return el("button",{class:"btn ghost",type:"button",onclick:()=>ui.ctl&&ui.ctl.abort(),text:"Stop"});
  const n=ui.chat.filter(t=>t.role==="user"&&!t.hidden).length;
  return el("button",{class:"btn ghost stage-chat",type:"button",onclick:openChat,text:n?"Discuss with AI · "+n:"Discuss with AI"});
}
function quizNarrow(s){
  const p=cur.p, stp=ui.checked?2:(!ui.rel||ui.open)?0:1;
  setSteps(["Relation","Examples","Result"],stp,[(ui.checked||ui.late)?null:()=>{ ui.open=true; render(); },(ui.checked||!ui.rel)?null:()=>{ ui.open=false; render(); focusCin(); },null]);
  quizHead(s,false);
  if(stp===0) s.append(relList(choose,"Relation"));
  else if(stp===1) cellView(s);
  else {
    // the table is fixed once filled in, the verdict below it changes length with the chip: the table goes first so it never moves
    s.append(el("div",{class:"section"},exGrid(p,quizCell,true)),quizResult());
    if(ui.saveErr) s.append(el("p",{class:"status",text:ui.saveErr}));
    const acts=el("div",{class:"actions"}), ta=tutorAct(); if(ta) acts.append(ta);
    acts.append(nextBtn()); s.append(acts);
  }
}

// after Explain on a narrow screen the answer is below the table: bring it into view (the sticky action bar is allowed for by scroll-margin)
function revealTutor(){ if(isWide()||view==="chat") return; const t=document.querySelector("#stage .tutor"); if(t) t.scrollIntoView({block:"nearest"}); }
// the tutor conversation with its own follow-up field (wide screens: in the coach panel)
function renderTutor(){
  const box=el("div",{class:"tutor"}); tutorTurns(box,false,true);
  if(ui.ctl) box.append(el("div",{class:"actions"},el("button",{class:"btn ghost",type:"button",onclick:()=>ui.ctl&&ui.ctl.abort(),text:"Stop"})));
  else if(sample) box.append(askRow("ask-in"));
  return box;
}
function askRow(id){
  const inp=el("input",{type:"text",id,placeholder:"Ask a follow-up question",value:ui.q,autocomplete:"off","aria-label":"Follow-up question",enterkeyhint:"send"});
  inp.addEventListener("input",e=>{ui.q=e.target.value;});
  const send=()=>{const q=ui.q.trim(); if(!q) return; ui.q=""; ask(q);};
  inp.addEventListener("keydown",e=>{ if(e.key==="Enter"){ e.preventDefault(); e.stopPropagation(); send(); } });
  return el("div",{class:"ask"}, inp, el("button",{class:"btn ghost",type:"button",onclick:send,text:"Ask"}));
}

/* ---------- review ---------- */
function pct(n,d){ return d?Math.round(100*n/d):0; }
function barNode(p){ return el("span",{class:"bar"+(p<50?" b-low":p<80?" b-mid":""),style:"width:"+Math.max(4,Math.round(p*.6))+"px"}); }
// Review in three groups: Overview, Mistakes, Favourites. Wide screens show the three side by side; narrow screens switch between them.
function revOverview(box,all){
  const relOk=all.filter(a=>a.correct).length, G={ok:0,pend:0,part:0,bad:0};
  for(const a of all){ const g=gradeOf(a); G[g in G?g:"bad"]++; }
  const segs=[["ok","Fully right"],["pend","Examples unchecked"],["part","Partly right"],["bad","Wrong"]].filter(([g])=>G[g]);
  box.append(el("div",{class:"split"},
    el("div",{class:"big"},el("span",{class:"n",text:String(all.length)}),el("span",{class:"l",text:"pairs answered"})),
    el("div",{class:"sbar",role:"img","aria-label":segs.map(([g,l])=>l+" "+pct(G[g],all.length)+"%").join(", ")},
      segs.map(([g,l])=>el("span",{class:"g-"+g,style:"flex:"+G[g],title:l+": "+G[g]}))),
    el("ul",{class:"legend"},segs.map(([g,l])=>el("li",null,el("i",{class:"g-"+g}),l+" ",el("b",{text:pct(G[g],all.length)+"%"}))),
      el("li",null,"Relation right ",el("b",{text:pct(relOk,all.length)+"%"})))));

  // last 14 days
  const days=[]; for(let i=13;i>=0;i--){ const d=new Date(Date.now()-i*864e5).toISOString().slice(0,10); days.push([d,all.filter(a=>dayOf(a.at)===d).length]); }
  const mx=Math.max(1,...days.map(d=>d[1]));
  box.append(el("div",{class:"section"},el("p",{class:"label"},"Last 14 days",el("span",{class:"hint",text:"pairs per day"})),
    el("div",{class:"days"},days.map(([d,n],i)=>el("div",{class:"day"+(i===13?" today":""),title:d+": "+n},
      el("div",{class:"col"},el("span",{class:"dbar"+(n?" has":""),style:"height:"+Math.max(2,Math.round(44*n/mx))+"px"})),
      el("span",{class:"dn",text:n?String(n):""}))))));

  // by relation
  const byRel=["mi","3","4","con"].map(r=>{ const xs=all.filter(a=>(a.key==="3ab"||a.key==="3ba"?"3":a.key)===r); return [r,xs.length,xs.filter(a=>a.correct).length]; });
  const rname={mi:"Mutually inclusive",con:"Mutually exclusive","3":"Three possibilities","4":"Four possibilities"};
  box.append(el("div",{class:"section"},el("p",{class:"label"},"By relation",el("span",{class:"hint",text:"relation chosen right"})),
    el("table",{class:"tbl"},el("tbody",null,byRel.map(([r,n,k])=>el("tr",null,el("td",{text:rname[r]}),el("td",{class:"num"},n?k+" / "+n:"–",n?barNode(pct(k,n)):null)))))));

  renderDebateStats(box);
  if(labShown()) labReview(box);
}
function revMistakes(box,all,miss){
  // mistakes
  const sec=el("div",{class:"section"},el("p",{class:"label"},"Mistakes",el("span",{class:"hint",text:miss.length+" in total"})));
  if(!miss.length) sec.append(el("p",{class:"empty-note",text:"None yet."}));
  else sec.append(el("ul",{class:"sum"},miss.slice(0,25).map(a=>{
    const g=gradeOf(a), bad=CELLS.filter(c=>a.cells&&a.cells[c]&&a.cells[c].verdict==="bad");
    const sub=(a.correct?"Relation right ("+lcRel(REL[a.key].name)+"), ":(a.chosen==null?"No pick, time ran out":"Chose "+(REL[a.chosen]?lcRel(REL[a.chosen].name):a.chosen))+"; correct: "+(REL[a.key]?lcRel(REL[a.key].name):a.key)+". ")+
      (bad.length?"wrong cell"+(bad.length>1?"s":"")+": "+bad.map(c=>({both:"both",anb:"A not B",bna:"B not A",nei:"neither"}[c])).join(", ")+".":"")+(a.timeout==="examples"||a.timeout==="both"?" Time ran out on the examples.":"")+" "+dayOf(a.at);
    return el("li",null,el("span",{class:"m "+g,text:g==="part"?"~":"✗"}),el("span",null,a.a+" / "+a.b,el("span",{class:"sub",text:sub})));
  })));
  const retryable=uniqueMistakePairs(miss);
  if(retryable.length) sec.append(el("div",{class:"actions left"},el("button",{class:"btn",type:"button",onclick:()=>startRetry(retryable),text:"Retry "+Math.min(10,retryable.length)+(Math.min(10,retryable.length)>1?" mistakes":" mistake")})));
  box.append(sec);

  // weak categories
  const cs={};
  for(const a of all){ for(const c of [a.catA,a.catB]){ if(!c||!CAT[c]) continue; const o=cs[c]||(cs[c]={n:0,bad:0}); o.n++; if(isMiss(a)) o.bad++; } }
  const weak=Object.entries(cs).filter(([,o])=>o.n>=2&&o.bad).sort((x,y)=>y[1].bad/y[1].n-x[1].bad/x[1].n||y[1].n-x[1].n).slice(0,6);
  if(weak.length) box.append(el("div",{class:"section"},el("p",{class:"label"},"Weak spots",el("span",{class:"hint",text:"categories in pairs you missed"})),
    el("table",{class:"tbl"},el("tbody",null,weak.map(([c,o])=>el("tr",null,el("td",null,CAT[c].labels[0],el("span",{class:"types",text:CAT[c].type})),el("td",{class:"num",text:o.bad+" of "+o.n+" missed"})))))));
}
function renderReview(s){
  const all=answerList(), nsk=Object.keys(skips).length;
  if(!all.length){
    const pane=el("div",{class:"rpane"}); s.append(pane);
    pane.append(el("p",{class:"empty-note",text:"No practice answers yet. Your history and weak spots will show up here."})); favSection(pane); if(nsk) skipSection(pane); renderDebateStats(pane); return;
  }
  const miss=all.filter(isMiss).reverse(), nf=Object.keys(favs).length;
  const parts=[["overview","Overview",revOverview,""],["mistakes","Mistakes",revMistakes,miss.length?String(miss.length):""],["favs","Favourites",(b)=>favSection(b),db&&nf?String(nf):""]];
  if(nsk) parts.push(["skips","Skipped",(b)=>skipSection(b),String(nsk)]);
  if(isWide()){
    // three columns; the skipped pairs sit under the favourites, both lists of pairs picked by hand
    s.append(el("div",{class:"rev3"},parts.filter(p=>p[0]!=="skips").map(([k,,fn])=>{ const col=el("div",{class:"rcol","data-part":k}); fn(col,all,miss); if(k==="favs"&&nsk) skipSection(col); return col; })));
    return;
  }
  if(!parts.some(p=>p[0]===reviewSeg)) reviewSeg="overview";
  s.append(el("div",{class:"seg rseg"+(parts.length>3?" r4":""),role:"group","aria-label":"Review sections"},
    parts.map(([k,l,,n])=>el("button",{type:"button","aria-pressed":reviewSeg===k?"true":"false",onclick:()=>{ reviewSeg=k; render(); top0(); }},
      l,n?el("span",{class:"cnt",text:" "+n}):null))));
  const pane=el("div",{class:"rpane"}), cur_=parts.find(p=>p[0]===reviewSeg);
  cur_[2](pane,all,miss); s.append(pane);
}
// the 2x2 table of examples: B and not B across, A and not A down; cell(c) builds one cell
function gridHead(letter,name,neg,cls){ return el("div",{class:"h "+cls,title:(neg?"not ":"")+name}, neg?el("span",{class:"not",text:"not"}):null, L(letter), el("span",{class:"nm",text:name})); }
function exGrid(p,cell,pop){
  const pn=pop?popNode():null, top=!!pn&&(ui.pop==="both"||ui.pop==="anb");
  return el("div",{class:"grid"},
    el("div"), gridHead("B",p.b,false,"col"), gridHead("B",p.b,true,"col"),
    gridHead("A",p.a,false,"row"), cell("both"), cell("anb"), top?pn:null,
    gridHead("A",p.a,true,"row"), cell("bna"), cell("nei"), top?null:pn);
}
function pairFromAnswer(a){
  if(a.pair) return a.pair;
  for(const b of batches){ const q=pairsOf(b).find(p=>p.id===a.pairId); if(q) return q; }
  return null;
}
function uniqueMistakePairs(miss){
  const seen=new Set(), out=[];
  for(const a of miss){
    if(a.retryOf&&answerList().some(x=>x.retryOf===a.retryOf&&x.at>a.at&&gradeOf(x)==="ok")) continue;
    const p=pairFromAnswer(a); if(!p) continue;
    const k=p.a+"|"+p.b; if(seen.has(k)) continue;
    // skip pairs already put right in a later retry
    if(answerList().some(x=>x.retryOf===p.id&&x.at>a.at&&gradeOf(x)==="ok")) continue;
    seen.add(k); out.push(p);
  }
  return out;
}
function startRetry(ps){ retryQ=ps.slice(0,10); retryTag="Retry"; switchTo("practice"); advance(); render(); top0(); }

function choose(k){
  if(ui.checked||ui.late) return;
  if(!ui.rel) stopTimer();
  ui.rel=k; ui.open=false; ui.ci=0; ui.seen=0; ui.review=false; for(const c of REL[k].empty){ ui.cells[c].t=""; ui.cells[c].none=false; }
  render();
  if(!isWide()){ focusCin(); return; }
  const first=CELLS.find(c=>!REL[k].empty.includes(c));
  const i=first&&$("in-"+first); if(i&&!("ontouchstart" in window)) i.focus();
}
function nextInput(c){
  const order=CELLS.filter(x=>!REL[ui.rel].empty.includes(x)&&!ui.cells[x].none);
  const i=order.indexOf(c); const n=order[i+1]; return n?$("in-"+n):null;
}
// The Examples line of a verdict. When some examples could not be checked, a chip in the line asks Claude to check and explain.
const askChip=()=>el("button",{type:"button",class:"pill act","aria-label":"Ask Claude to check and explain",onclick:()=>ask(null,"explain"),text:"Ask Claude"});
function exLine(r,keys){
  if(!r.exN) return "none to check.";
  // while Claude works on the open ones, a line says so (asking is done by the Check and explain button in the action row)
  const cl=r.exOpen&&ui.ctl?el("span",{class:"exl",text:"Claude is checking."}):null;
  if(r.exBad) return [r.exBad+" of "+r.exN+" wrong"+(r.exOpen?", "+r.exOpen+" not checked yet":"")+".",cl];
  if(r.exOpen) return [r.exOpen+" of "+r.exN+" not checked yet.",cl];
  return "all "+r.exN+" fit"+(keys.some(c=>r.cells[c].by)?" (checked with Claude).":".");
}
// in a lineage the terms are joined by "is a" (short for "is a kind of"), small and italic; the sign > would read as "greater than"
const isA=n=>/^[aeiou]/i.test(n)?"is\u00a0an":"is\u00a0a";
const isaTxt=s=>String(s).split("\uE000").flatMap((x,i)=>i?[" ",el("i",{class:"isa",text:isA(x)})," ",x]:[x]);
function fbNode(r){ return el("div",{class:"fb"}, el("b",{text:r.msg[0]}), r.msg[2]?[" ",el("i",{text:r.msg[2]})]:null, isaTxt(r.msg[1]||"")); }

document.addEventListener("click",e=>{ if(ui&&ui.pop&&!(e.target.closest&&e.target.closest(".pop,.why"))){ ui.pop=null; render(); } });
document.addEventListener("keydown",e=>{
  if(e.key==="Escape"){ if(optsOpen){ toggleOpts(false); return; } if(view==="chat"){ closeChat(); return; } if(ui&&ui.pop){ ui.pop=null; render(); return; } }
  if(mode!=="quiz"||!ui||optsOpen||view||e.metaKey||e.ctrlKey||e.altKey) return;
  const t=e.target&&e.target.tagName;
  if((e.key==="f"||e.key==="F")&&!e.shiftKey&&t!=="INPUT"&&t!=="TEXTAREA"&&db&&cur&&cur.p&&tab!=="review"){ e.preventDefault(); toggleFav(cur.p); return; }
  if(tab==="practice"&&!ui.debate){
    if(!ui.checked&&t!=="INPUT"&&/^[1-5]$/.test(e.key)&&(isWide()||!ui.rel||ui.open)){ e.preventDefault(); choose(ORDER[+e.key-1]); }
    else if(!ui.checked&&t!=="INPUT"&&t!=="TEXTAREA"&&(e.key==="s"||e.key==="S")&&!e.shiftKey){ e.preventDefault(); skipPair(); }
    else if(ui.checked&&e.key==="Enter"&&t!=="BUTTON"&&t!=="INPUT"&&t!=="TEXTAREA"){ e.preventDefault(); next(); }
  } else if(tab==="debate"&&ui.debate){
    if(t==="INPUT"||t==="TEXTAREA") return;
    const k=e.key.toLowerCase();
    if(!ui.checked&&ui.step<4){
      if(ui.pickWhy) return;
      if(k==="a"||k==="y"){ e.preventDefault(); sayQ("accept"); } else if(k==="w"||k==="n"||k==="?"){ e.preventDefault(); sayQ("why"); } else if(k==="s"&&!e.shiftKey){ e.preventDefault(); skipPair(); }
    } else if(!ui.checked){
      if(/^[1-5]$/.test(k)&&(isWide()||ui.open)){ e.preventDefault(); chooseD(ORDER[+k-1]); }
      else if(k==="enter"&&ui.rel&&!ui.open&&t!=="BUTTON"){ e.preventDefault(); checkDebate(); }
      else if(k==="s"&&!e.shiftKey){ e.preventDefault(); skipPair(); }
    } else if(k==="enter"&&t!=="BUTTON"){ e.preventDefault(); next(); }
  }
});

/* ---------- debate: the four questions ---------- */
// The learner is the defender. The challenger asks four questions about A and B; each is answered Accept or Why?
// (then posit an example). Each question has one counter-example cell of the practice grid:
//   Q1 if it is A, it follows it is not B  -> a thing that is both
//   Q2 if it is A, it follows it is B      -> an A that is not B
//   Q3 if it is B, it follows it is A      -> a B that is not A
//   Q4 if it is not A, it follows it is B  -> a thing that is neither (plain form: a non-existent counts)
// "Accept" is right when that cell has nothing; "Why?" is right when it has something, and then the example is checked.
const QCELL=["both","anb","bna","nei"];
// How the challenger's statement is worded and answered; which form the class uses is Alexey's pick (see notes/debate-question-form.md).
// The saved data and the tutor card keep the same four questions whatever the wording. "A" and "B" become the pair's own terms,
// and N marks a "not" that the page emphasises.
const N={not:1};
const WORDINGS={
  mine:{name:"Statement",lead:"Do you accept that…",acc:"Accept",acd:"Accepted",why:"Why?",wyd:"Asked why",ak:"A",wk:"W",q:[["If it is ","A",", it follows it is ",N," ","B","."],["If it is ","A",", it follows it is ","B","."],["If it is ","B",", it follows it is ","A","."],["If it is ",N," ","A",", it follows it is ","B","."]]},
  cons:{name:"Consequence",lead:"Do you accept that…",acc:"I accept",acd:"Accepted",why:"Why?",wyd:"Asked why",ak:"A",wk:"W",q:[["It follows that whatever is ","A"," is necessarily ",N," ","B","."],["It follows that whatever is ","A"," is necessarily ","B","."],["It follows that whatever is ","B"," is necessarily ","A","."],["It follows that whatever is ",N," ","A"," is necessarily ","B","."]]},
  plain:{name:"Plain",lead:"",acc:"Yes",acd:"Yes",why:"No",wyd:"No",ak:"Y",wk:"N",q:[["Is whatever is ","A"," necessarily ",N," ","B","?"],["Is whatever is ","A"," necessarily ","B","?"],["Is whatever is ","B"," necessarily ","A","?"],["Is whatever is ",N," ","A"," necessarily ","B","?"]]}
};
// Each label of the 42 categories in the singular, with its article, so the questions read as a real debate would.
const SING={"functional things":"a functional thing","impermanent things":"an impermanent thing","composed things":"a composed thing","products":"a product","causes":"a cause","effects":"an effect","things that change":"a thing that changes","things that arise from causes":"a thing that arises from causes","momentary things":"a momentary thing","things that disintegrate":"a thing that disintegrates","things able to perform a function":"a thing able to perform a function","manifest phenomena":"a manifest phenomenon",
"permanent phenomena":"a permanent phenomenon","non-produced phenomena":"a non-produced phenomenon","uncomposed phenomena":"an uncomposed phenomenon","things that do not change moment by moment":"a thing that does not change moment by moment",
"forms":"a form","physical things":"a physical thing","matter":"matter","things made of atoms":"a thing made of atoms","external forms":"an external form","physical things outside a person's continuum":"a physical thing outside a person's continuum","internal forms":"an internal form","sense powers":"a sense power",
"colours":"a colour","hues":"a hue","shapes":"a shape","visible forms":"a visible form","objects of eye consciousness":"an object of eye consciousness","sounds":"a sound","things heard by the ear consciousness":"a thing heard by the ear consciousness","smells":"a smell","odours":"an odour","objects of nose consciousness":"an object of nose consciousness","tastes":"a taste","objects of tongue consciousness":"an object of tongue consciousness","tangible objects":"a tangible object","objects of body consciousness":"an object of body consciousness",
"consciousnesses":"a consciousness","minds":"a mind","awarenesses":"an awareness","knowers":"a knower","sense consciousnesses":"a sense consciousness","sense perceptions":"a sense perception","eye consciousnesses":"an eye consciousness","acts of seeing":"an act of seeing","mental consciousnesses":"a mental consciousness",
"non-associated compositional factors":"a non-associated compositional factor","impermanent things that are neither matter nor mind":"an impermanent thing that is neither matter nor mind","persons":"a person","sentient beings":"a sentient being","hidden phenomena":"a hidden phenomenon","expressive sounds":"an expressive sound","sounds that express a meaning":"a sound that expresses a meaning",
"wooden things":"a wooden thing","metal things":"a metal thing","white things":"a white thing","red things":"a red thing","green things":"a green thing","round things":"a round thing","square things":"a square thing","liquids":"a liquid","food":"food","things you can eat":"a thing you can eat","drinks":"a drink","hot things":"a hot thing","furniture":"furniture","musical instruments":"a musical instrument","plants":"a plant","bodies and body parts":"a body or a body part","animals":"an animal","humans":"a human","emotions":"an emotion","feelings":"a feeling","memories":"a memory","thoughts":"a thought","dreams":"a dream",
/* labels of older prepared pairs */
"permanent things":"a permanent thing","things that are produced":"a thing that is produced","things that exist":"a thing that exists","things that can be known":"a thing that can be known","things that can be heard":"a thing that can be heard","things that have causes":"a thing that has causes","things with colour":"a thing with colour","hard things":"a hard thing","cold things":"a cold thing","muscles":"a muscle","people":"a person","monks":"a monk","tables":"a table","bodies":"a body","mental factors":"a mental factor","dogs":"a dog","instruments":"an instrument"};
let wording="mine";
// display switches (Options): the A/B chips in statements and answers, and the Why? answer spelled out as a sentence
let showAB=true, fullPh=true;
try{ if(localStorage.getItem("rd-ab")==="0") showAB=false; if(localStorage.getItem("rd-full")==="0") fullPh=false; }catch(e){}
try{ const v=localStorage.getItem("rd-wording"); if(WORDINGS[v]) wording=v; }catch(e){}
const Wd=()=>WORDINGS[wording];
// the canonical form, with the letters A and B, is what the tutor card and the Review tab use
const qPlain=i=>WORDINGS.mine.q[i].map(x=>x===N?"not":x).join("").replace(/\.$/,"?");
// the chip and the first word of its term stay on one line
const termNode=x=>{ const lab=x==="A"?cur.p.a:cur.p.b, [w,...r]=(SING[lab]||lab.replace(/^(\w+) things$/,"a $1 thing")).split(" ");
  return el("span",{class:"qterm"},el("span",{class:"keep"},showAB?[L(x)," "]:null,el("span",{class:"t",text:w})),r.length?el("span",{class:"t",text:" "+r.join(" ")}):null); };
const qNode=i=>Wd().q[i].map(x=>x==="A"||x==="B"?termNode(x):x===N?el("span",{class:"not",text:"not"}):x);
// an answer at a glance: Accept is a filled tag, Why? an outlined one followed by the example
// a Why? answer is spelled out as the sentence it asserts, so the example is tied to its cell:
// both: "X is both [A] a … and [B] a …"; A not B: "X is [A] a …, but not [B] a …"; B not A: the reverse; neither: "X is neither [A] a … nor [B] a …"
// The words that name the cell (both … and, but not, neither … nor) are bold, a mark the chips, the italic terms and the red "not" do not use.
function exSentence(i,t){
  if(!fullPh) return el("span",{class:"exn",text:t});
  const A=termNode("A"), B=termNode("B"), K=w=>el("b",{class:"conn",text:w});
  const tail={both:[" is ",K("both")," ",A," ",K("and")," ",B], anb:[" is ",A,", ",K("but not")," ",B], bna:[" is ",B,", ",K("but not")," ",A], nei:[" is ",K("neither")," ",A," ",K("nor")," ",B]}[QCELL[i]];
  return el("span",{class:"exs"},t,tail);
}
function ansNode(a,ms,i){
  const w=Wd(), tm=ms!=null?el("span",{class:"mut",text:(ms/1000).toFixed(1)+" s"}):null;
  if(a.say==="accept") return el("span",{class:"ans-l"},el("span",{class:"pill acc",text:w.acd}),a.timeout?el("span",{class:"mut",text:"time ran out"}):tm);
  if(a.say==="why") return el("span",{class:"ans-l"},el("span",{class:"pill why",text:w.wyd}),a.text?(i!=null?exSentence(i,a.text):el("span",{class:"exn",text:a.text})):el("span",{class:"mut",text:"no example"}),a.timeout?null:tm);
  return el("span",{class:"ans-l"},el("span",{class:"pill why",text:"Time out"}));
}
function freshDebateUi(){
  const u=freshUi();
  return Object.assign(u,{debate:true, step:0, ans:[0,1,2,3].map(()=>({say:null,text:"",ms:null,msEx:null,limit:0,timeout:false})),
    pickWhy:false, exText:"", open:true, tq:null, tid:null, qStart:0, col:"debates"});
}
const debateList=()=>Object.values(debates).sort((x,y)=>(x.at||"").localeCompare(y.at||""));
function advanceDebate(){ cur={p:nextGenerated(debateList()), debate:true}; ui=freshDebateUi(); mode="quiz"; startQ(); }
// Practice and Debate each keep their own pair while you look at the other tab or at Review.
// Relations and Pervasions work on one pair: leaving one with its pair unfinished, the other opens the same pair at its first step (and keeps its own
// progress if it already holds that pair). A pair that is finished gives the other tab a new pair, as Next pair does.
const sameP=(x,y)=>!!x&&!!y&&((x.id&&x.id===y.id)||(x.a===y.a&&x.b===y.b&&x.relation===y.relation));
function adoptPair(k,p){
  const [ca,cb]=skipCats(p); if(!ca||!cb) return false;
  const q=Object.assign({},p,{catA:ca,catB:cb});
  if(k==="debate"){ cur={p:q,debate:true}; ui=freshDebateUi(); mode="quiz"; startQ(); }
  else { cur={p:q}; ui=freshUi(); mode="quiz"; }
  return true;
}
function switchTo(k){
  stopTimer();
  if(k!=="review"&&own!==k){
    const left=cur&&cur.p&&ui&&!ui.checked?cur.p:null, was=cur&&cur.p;
    hold[own]={cur,ui}; own=k;
    const h=hold[k];
    if(h&&h.cur&&was&&sameP(h.cur.p,was)){ cur=h.cur; ui=h.ui; }
    else if(left&&adoptPair(k,left)){}
    else if(k==="debate") advanceDebate(); else advance();
  }
  tab=k;
  if(k==="debate"&&ui&&ui.debate&&!ui.checked&&ui.step<4) startQ();
}
function setTab(k){ if(mode!=="quiz"&&k!=="review") return; switchTo(k); render(); top0(); }

/* the blitz timer: a switch above the questions turns it on; its length is set in the options. A slim bar under the
   question drains over the limit and flashes gently at the end. When time runs out, the statement counts as accepted. */
let timerMs=10000, blitz=false, timeEdit=false, timeDraft="";
try{
  const v=+localStorage.getItem("rd-timer"); if(v>=2000&&v<=120000) timerMs=v;
  const b=localStorage.getItem("rd-blitz"); blitz=b!==null?b==="1":v>0;     // an earlier version stored only the length: a length meant the timer was on
}catch(e){}
let relMs=timerMs;                                          // the relation has its own time; it starts from the one time of earlier versions
try{ const v=+localStorage.getItem("rd-timer-rel"); if(v>=2000&&v<=120000) relMs=v; }catch(e){}
const limitMs=()=>blitz?timerMs:0;
function stopTimer(){ if(ui&&ui.tid){ clearTimeout(ui.tid); ui.tid=null; } if(ui) ui.tq=null; }
function startQ(){
  stopTimer();
  if(!ui||!ui.debate||ui.checked||ui.step>3) return;
  const a=ui.ans[ui.step], lim=limitMs(); a.limit=lim;
  ui.qStart=performance.now();
  if(lim){ const u=ui; u.tq={t0:ui.qStart,limit:lim}; u.tid=setTimeout(()=>expireQ(u),lim); }
}
const asking=()=>tab==="debate"&&ui&&ui.debate&&!ui.checked&&ui.step<4;
function setBlitz(on){
  blitz=on; try{ localStorage.setItem("rd-blitz",on?"1":"0"); }catch(e){}
  if(asking()) startQ(); else relReset();
  render();
}
// kind "rel": the relation's time; otherwise the time of an example (Relations) or a question (Pervasions). Only the countdown that is running restarts.
function setTimer(ms,kind){
  if(kind==="rel"){ relMs=ms; try{ localStorage.setItem("rd-timer-rel",String(ms)); }catch(e){} }
  else { timerMs=ms; try{ localStorage.setItem("rd-timer",String(ms)); }catch(e){} }
  if(blitz&&(kind||"ex")===tkind()){ if(asking()) startQ(); else relReset(); }
  render();
}
// Time up: an example already typed after Why? stands; anything else counts as accepting the statement.
function expireQ(u){
  if(u!==ui||tab!=="debate"||u.checked||u.step>3) return;
  const a=u.ans[u.step], t=(u.exText||"").trim(); u.tid=null; a.timeout=true;
  if(a.say==="why"&&t){ a.text=t; a.msEx=a.limit; } else { a.say="accept"; a.text=""; a.ms=a.limit; a.msEx=null; }
  nextQ();
}
function nextQ(){
  ui.step++; ui.pickWhy=false; ui.exText=""; ui.ro=null;
  if(ui.step>3){ stopTimer(); ui.open=true; } else startQ();
  render();
}
function sayQ(say){
  if(!ui||!ui.debate||ui.checked||ui.step>3||ui.pickWhy) return;
  const a=ui.ans[ui.step]; a.say=say; a.ms=Math.round(performance.now()-ui.qStart);
  if(say==="accept"){ nextQ(); return; }
  ui.pickWhy=true; ui.exText=""; render();
  const i=$("dex"); if(i) i.focus();
}
// An empty example is not an answer: Next stays off until something is written (Back returns to Accept / Why?).
function submitWhy(){
  if(!ui||!ui.debate||ui.checked||ui.step>3||!ui.pickWhy) return;
  const t=(ui.exText||"").trim(); if(!t) return;
  const a=ui.ans[ui.step]; a.text=t; a.msEx=Math.round(performance.now()-ui.qStart);
  nextQ();
}
function backWhy(){
  if(!ui||!ui.debate||ui.checked||!ui.pickWhy) return;
  const a=ui.ans[ui.step]; a.say=null; a.ms=null; ui.pickWhy=false; ui.exText=""; render();
}
function chooseD(k){
  if(!ui||!ui.debate||ui.checked||ui.step<4) return;
  ui.rel=k; ui.open=false; checkDebate();
}

/* what three answers give: Q1 accepted = no common locus; Q2 and Q3 accepted = pervasion each way */
function deriveRel(ans){
  const s=ans.slice(0,3).map(a=>a.say);
  if(s.some(x=>x!=="accept"&&x!=="why")) return null;      // time ran out on one of them
  const [x,y,z]=s.map(v=>v==="accept");
  if(x&&!y&&!z) return "con";
  if(!x&&y&&z) return "mi";
  if(!x&&y&&!z) return "3ab";
  if(!x&&!y&&z) return "3ba";
  if(!x&&!y&&!z) return "4";
  return "bad";                                            // accepting no-common-locus together with a pervasion
}
function gradeDebate(p,u){
  const res={relOk:u.rel===p.relation&&!u.late, cells:{}, dec:{}, implied:deriveRel(u.ans)};
  QCELL.forEach((c,i)=>{
    const a=u.ans[i], ref=refOf(p,c), has=!!ref, why=(p.why&&p.why[c])||"", t=(a.text||"").trim();
    let v,msg,kind="occ",dec=false;
    if(a.say==="accept"){
      if(!has){ v="ok"; msg=["Right. ",why]; dec=true; } else { v="bad"; msg=["Counter-example: ",ref]; }
    } else if(a.say==="why"){
      if(!has){ v="bad"; msg=["Nothing can be posited. ",why]; }
      else {
        dec=true; kind="ex";
        if(!t){ v="bad"; msg=[a.timeout?"Time ran out. ":"No example. ","For example: "+ref+"."]; }
        else {
          const j=judgeText(p,c,t,[p.catA,p.catB]);
          if(j){ v=j.v; msg=j.msg.slice(); if(v==="bad") msg[1]+=" Example: "+ref+"."; }
          else { v="cmp"; msg=["Not checked. ","Reference: "+ref+"."]; }
        }
      }
    } else { v="bad"; msg=["Time ran out. ",has?"For example: "+ref+".":why]; }
    res.cells[c]={v,msg,kind}; res.dec[c]=dec;
  });
  return summarize(res);
}
async function checkDebate(){
  if(!ui||!ui.debate||ui.checked||ui.step<4||!ui.rel) return;
  stopTimer();
  const p=cur.p;
  QCELL.forEach((c,i)=>{ ui.cells[c].t=(ui.ans[i].text||"").trim(); ui.cells[c].none=ui.ans[i].say==="accept"; });
  clearSkip(p); ui.res=gradeDebate(p,ui); ui.checked=true; ui.open=false; render();
  top0(); const bs=document.querySelectorAll("#stage .actions .btn"); if(bs.length) bs[bs.length-1].focus({preventScroll:true});
  if(!db) return;
  const cells={}; for(const c of CELLS) cells[c]={text:ui.cells[c].t, none:ui.cells[c].none, verdict:ui.res.cells[c].v};
  const qs=QCELL.map((c,i)=>({c, say:ui.ans[i].say, text:ui.cells[c].t, dok:ui.res.dec[c], verdict:ui.res.cells[c].v,
    ms:ui.ans[i].ms, msEx:ui.ans[i].msEx, limit:ui.ans[i].limit||0, timeout:!!ui.ans[i].timeout}));
  const id=ui.saveId="q-"+p.id.replace(/^g-/,"");
  ui.doc={pairId:id,mode:"debate",a:p.a,b:p.b,catA:p.catA,catB:p.catB,key:p.relation,chosen:ui.late?null:ui.rel,implied:ui.res.implied||null,
    correct:ui.res.relOk,grade:ui.res.overall,cells,qs,at:new Date().toISOString(),pair:p};
  if(ui.late) ui.doc.timeout="relation";
  persist(ui,"Your answers");
  labStart(ui,cur);
}

/* ---------- debate: rendering ---------- */
/* ---------- options: notation, wording of the questions, blitz time ---------- */
// what the symbols of the chosen notation mean, for the options panel
const SYMS={
  codes:["Perdue's course book abbreviates the relations like this.",[["MI","mutually inclusive"],["MX","mutually exclusive"],["3P","three possibilities"],["4P","four possibilities"]]],
  sets:["Each term stands for the set of things it covers.",[["∩","intersection: what is both"],["∅","the empty set: nothing"],["≠ ∅","not empty"],["⊂","contained in"],["⊃","contains"],["=","the same set"]]],
  logic:["Each term stands for a statement: it is A, it is B.",[["⇒","follows: A ⇒ B, if A then B"],["⇐","follows from"],["⇔","each follows from the other"],["⇏","does not follow"],["¬","negation: not"]]]
};
function symsNode(){
  const [intro,rows]=SYMS[nota]||SYMS.codes;
  return el("span",{class:"symbox"},el("span",{class:"onote",text:intro}),
    el("span",{class:"syms"},rows.map(([k,t])=>el("span",{class:"sy"},el("b",{class:"math",text:k}),t))));
}
const segOf=(label,rows,cur_,on)=>el("div",{class:"seg",role:"group","aria-label":label},
  rows.map(([k,l])=>el("button",{type:"button","aria-pressed":cur_===k?"true":"false",onclick:()=>on(k),text:l})));
function setNota(k){ nota=k; try{ localStorage.setItem("rd-notation",k); }catch(e){} render(); }
function setDefLang(k){ defLang=k==="enru"?"enru":"en"; try{ localStorage.setItem("rd-deflang",defLang); }catch(e){} render(); }
function setShow(key,on){ if(key==="ab") showAB=on; else fullPh=on; try{ localStorage.setItem("rd-"+key,on?"1":"0"); }catch(e){} render(); }
function setWording(k){ wording=k; try{ localStorage.setItem("rd-wording",k); }catch(e){} render(); }
// Options and the tutor chat are not tabs: they open over the workspace (the chat only on narrow screens) and close with Back or Escape.
function renderOptionsBtn(){
  for(const id of ["obtn","mopt"]){ const b=$(id); b.setAttribute("aria-expanded",optsOpen?"true":"false"); b.classList.toggle("open",optsOpen); }
}
function toggleOpts(on){
  optsOpen=on===undefined?!optsOpen:on; render();
  if(optsOpen){ const b=document.querySelector("#over .oc"); if(b) b.focus({preventScroll:true}); }
  else { const b=[$("obtn"),$("mopt")].find(x=>x.offsetParent); if(b) b.focus({preventScroll:true}); }
}
function openChat(){
  if(!ui||!ui.chat||isWide()) return;
  const first=!ui.chat.some(t=>t.role==="user"&&!t.hidden);
  view="chat"; render();
  const i=first&&$("ask-in"); if(i) i.focus({preventScroll:true});
}
function closeChat(){ view=null; render(); const b=document.querySelector(".stage-chat"); if(b) b.focus({preventScroll:true}); }
function overHead(title,onBack,label){
  return el("div",{class:"oh"},el("button",{type:"button",class:"oc",onclick:onBack,"aria-label":label,text:"‹ Back"}),el("h2",{text:title}));
}
// the conversation turns, shared by the coach panel (wide, in order) and the chat view (narrow, newest exchange first under the field).
// An exchange is a question and its answer in one block, with a hairline between exchanges, so an answer never reads as part of the next question.
// In the chat view the answer is above its question (the "Thinking" placeholder takes the answer's place at once), as the newest exchange is first.
function tutorTurns(box,newestFirst,lean){
  const groups=[];
  ui.chat.forEach((t,idx)=>{
    if(t.hidden) return;
    if(t.role==="user") groups.push({q:el("p",{class:"q",text:t.content})});
    else {
      const a=el("div",{class:"ans",id:t.pending?"ans-live":null}); fillTurn(a,t,lean); decorateAns(a,t,idx,!!newestFirst);
      const g=groups[groups.length-1];
      if(g&&g.q&&!g.a) g.a=a; else groups.push({a});
    }
  });
  (newestFirst?groups.reverse():groups).forEach(g=>box.append(el("div",{class:"xch"},...(newestFirst?[g.a||null,g.q||null]:[g.q||null,g.a||null]))));
  if(ui.chatErr){ const e=el("p",{class:"status",text:ui.chatErr}); if(newestFirst) box.prepend(e); else box.append(e); }
}
// The chat view keeps the field right under the heading, because the on-screen keyboard covers the lower third of the screen.
function chatInto(o){
  const p=cur.p;
  o.append(overHead("Discuss with AI",closeChat,"Back to the result"));
  const v=ui.checked&&ui.res?{ok:"all right",part:"relation right, not everything else",pend:"relation and cells right",bad:"not quite"}[ui.res.overall]:"";
  o.append(el("p",{class:"ctx"},el("b",{text:p.a+" / "+p.b}),el("small",{text:REL[p.relation].name+(v?" · "+v:"")})));
  const dock=el("div",{class:"dock"});
  if(ui.ctl) dock.append(el("button",{class:"btn ghost",type:"button",onclick:()=>ui.ctl&&ui.ctl.abort(),text:"Stop"}));
  else if(sample) dock.append(askRow("ask-in"));
  o.append(dock);
  const sc=el("div",{class:"chat",id:"chatscroll"}), box=el("div",{class:"tutor"});
  tutorTurns(box,true); sc.append(box); o.append(sc);
}
function renderOver(){
  const o=$("over"), chat=view==="chat"&&!isWide()&&ui&&ui.chat, show=optsOpen||!!chat, was=!o.hidden;
  o.replaceChildren(); o.hidden=!show; o.dataset.kind=optsOpen?"options":"chat"; o.setAttribute("aria-label",optsOpen?"Options":"Discuss with AI");
  document.documentElement.classList.toggle("ov",show);
  if(!show) return;
  if(optsOpen) optionsInto(o); else chatInto(o);
  const sc=$("chatscroll"); if(sc) sc.scrollTop=0;
  if(!was&&!optsOpen&&!document.activeElement.matches("input")){ const b=o.querySelector(".oc"); if(b) b.focus({preventScroll:true}); }
}
function optionsInto(o){
  o.append(overHead("Options",()=>toggleOpts(false),"Close options"));
  const box=el("div",{class:"opts"});
  const row=(label,ctl,note)=>el("div",{class:"orow"},el("span",{class:"tl",text:label}),el("div",{class:"octl"},ctl,note?(typeof note==="string"?el("p",{class:"onote",text:note}):note):null));
  // one row per Blitz time: the relation's, and the one of an example (Relations) or a question (Pervasions); each sets only its own
  const timeRow=(kind,label,note)=>{
    const now=Math.round(kindMs(kind)/1000), preset=[5,10,15,30].includes(now);
    const inp=el("input",{type:"number",min:"2",max:"120",inputmode:"numeric",class:"tcustom",placeholder:"sec","aria-label":"Custom "+label.toLowerCase()+" in seconds",value:preset?"":String(now)});
    inp.addEventListener("change",e=>{ const v=Math.round(+e.target.value); if(v>=2&&v<=120) setTimer(v*1000,kind); else render(); });
    inp.addEventListener("keydown",e=>{ e.stopPropagation(); if(e.key==="Escape") toggleOpts(false); });
    return row(label,el("div",{class:"tset"},segOf(label,[[5,"5 s"],[10,"10 s"],[15,"15 s"],[30,"30 s"]],preset?now:-1,s=>setTimer(s*1000,kind)),inp),note);
  };
  box.append(...[
    row("Notation",segOf("Notation",[["codes","Shorthand"],["sets","Sets"],["logic","Logic"]],nota,setNota),
      symsNode()),
    row("Questions",segOf("Wording of the questions",Object.entries(WORDINGS).map(([k,w])=>[k,w.name]),wording,setWording),
      "How the statement of pervasion is worded in Pervasions: the four statements you accept or answer with Why?."),
    row("Definitions",segOf("Languages of the definitions",[["en","English"],["enru","English + Russian"]],defLang,setDefLang),
      "In the Terms panel. With Russian on, each entry also shows the Russian name of the term and, where the booklet translation has one, its Russian definition."),
    row("Show",el("div",{class:"octl"},
      el("button",{type:"button",class:"sw",role:"switch","aria-checked":showAB?"true":"false",onclick:()=>setShow("ab",!showAB)},el("i",{class:"knob","aria-hidden":"true"}),el("span",{class:"swl",text:"A/B markers"}),el("span",{class:"swt",text:"before the terms"})),
      el("button",{type:"button",class:"sw",role:"switch","aria-checked":fullPh?"true":"false",onclick:()=>setShow("full",!fullPh)},el("i",{class:"knob","aria-hidden":"true"}),el("span",{class:"swl",text:"Full phrases"}),el("span",{class:"swt",text:"spell out Why? answers"}))),
      "Applies to the statements and to your answers."),
    sample&&db?row("Check lab",el("button",{type:"button",class:"sw",role:"switch","aria-checked":lab?"true":"false",onclick:()=>setLab(!lab)},el("i",{class:"knob","aria-hidden":"true"}),el("span",{class:"swl",text:"Three models check every answer"}),el("span",{class:"swt",text:lab?"on":"off"})),
      "For development. After each check, Haiku, Sonnet and Opus classify your examples independently: three Claude calls from your own usage. Opus rules as judge only when they differ, and on about one answer in ten as a spot check; when all three agree, that is the verdict. Every run is stored so the models can be compared, and any box with Claude\u2019s text has a flag. Your page verdicts do not change."):null,
    timeRow("rel","Relation time","The Blitz countdown for choosing the relation, in Relations and in Pervasions."),
    timeRow("ex","Example time","The Blitz countdown for each example in Relations (a table of three cells gets three times this) and for each question in Pervasions.")].filter(Boolean));
  o.append(box);
}
$("obtn").addEventListener("click",()=>toggleOpts());
$("mopt").addEventListener("click",()=>toggleOpts());
$("mfav").addEventListener("click",()=>{ if(cur&&cur.p) toggleFav(cur.p); });
$("mbz").addEventListener("click",()=>setBlitz(!blitz));
$("mskip").append(tbIcon("skip")); $("mskip").addEventListener("click",skipPair);
wideMq.addEventListener("change",()=>{ syncVv(); if(mode!=="loading") render(); });
// The blitz switch sits above the questions, since it is used often; its length is in the options.
// Blitz: a bolt in the top bar, left, next to the heading (the mode of practice): outline when off, filled when on. No box, no number: the seconds are in its name
// and editable in Options and beside the countdown. Two independent times: the relation (Relations and Pervasions) and the examples (each example in
// Relations, each question in Pervasions). The countdown that is running is the one the in-place field shows; changing one never changes the other.
// The toolbar icons (bolt, star, skip) share one line style: 24 px, stroke 1.75, outline when off, filled when on.
function tbIcon(name){
  const P={
  bolt:'<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  star:'<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  skip:'<polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/>'
  };
  const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
  svg.setAttribute("viewBox","0 0 24 24"); svg.setAttribute("class","tbi"); svg.setAttribute("aria-hidden","true"); svg.innerHTML=P[name];
  return svg;
}
// which countdown belongs to the screen: "rel" while the relation is to be picked, "ex" for the examples (Relations) or the four questions (Pervasions)
const tkind=()=>{
  if(!ui||ui.checked||mode!=="quiz"||tab==="review") return null;
  if(ui.debate) return ui.step<4?"ex":ui.rel?null:"rel";
  return ui.rel?"ex":"rel";
};
const kindMs=k=>k==="rel"?relMs:timerMs;
const bzLabel=()=>blitz?"Blitz on: "+Math.round(relMs/1000)+" s relation, "+Math.round(timerMs/1000)+" s "+(ui&&ui.debate?"question":"example"):"Blitz off";
function fillBz(b){
  b.replaceChildren(tbIcon("bolt"));
  b.setAttribute("aria-checked",blitz?"true":"false"); b.setAttribute("aria-label",bzLabel()); b.title=bzLabel();
}
// the button in the action row (wide screens)
function blitzBtn(){
  const b=el("button",{type:"button",class:"bz",role:"switch",onclick:()=>setBlitz(!blitz)}); fillBz(b); return b;
}
// the button in the narrow top bar, at the left; Relations and Pervasions share the one switch
function syncBlitzBtn(){
  const b=$("mbz"), ok=mode==="quiz"&&(tab==="debate"||tab==="practice");
  b.hidden=!ok; if(ok) fillBz(b);
}
// the countdown bar with the seconds beside it: tap the number to change it right here (Enter or leaving the field saves, Escape cancels).
// kind "rel" is the relation's time, "ex" the time of one example or one question.
function timerRow(kind){
  kind=kind||"ex";
  const ms=kindMs(kind), secs=Math.round(ms/1000), mul=kind==="ex"?exMul():1;
  const what=kind==="rel"?"relation":ui&&ui.debate?"question":"example";
  let tv;
  if(timeEdit===kind){
    const inp=el("input",{type:"number",class:"tin",min:"2",max:"120",inputmode:"numeric",value:timeDraft||String(secs),"aria-label":"Blitz time for the "+what+" in seconds, 2 to 120"});
    let over=false;
    const leave=save=>{
      if(over) return; over=true; timeEdit=false;
      const v=Math.round(+inp.value);
      if(save&&v>=2&&v<=120&&v*1000!==ms){ setTimer(v*1000,kind); return; }
      if(blitz&&asking()) startQ(); else relReset();
      render();
    };
    inp.addEventListener("input",()=>{ timeDraft=inp.value; });
    inp.addEventListener("keydown",e=>{
      e.stopPropagation();
      if(e.key==="Enter"){ e.preventDefault(); leave(true); }
      else if(e.key==="Escape"){ e.preventDefault(); leave(false); }
    });
    inp.addEventListener("blur",()=>leave(true));
    tv=el("span",{class:"tedit"},inp,el("span",{class:"swt",text:"s"}));
    setTimeout(()=>{ if(inp.isConnected&&document.activeElement!==inp){ inp.focus(); inp.select(); } },0);
  } else {
    tv=el("button",{type:"button",class:"tval","aria-label":"Blitz time for the "+what+": "+secs+" seconds"+(mul>1?" for each of the "+mul+" examples":"")+". Change",onclick:()=>{ timeEdit=kind; timeDraft=String(secs); if(blitz) stopTimer(); render(); }},(mul>1?mul+" × ":"")+secs+" s");
  }
  return el("div",{class:"trow"},timerBar()||el("div",{class:"tbar","aria-hidden":"true"}),tv);
}
// the countdown row, or an empty one of the same height, so that the Blitz switch never moves what is below it
const timerSlot=(kind,on)=>on?timerRow(kind):el("div",{class:"trow ph","aria-hidden":"true"});

// Relations tab, Blitz on: the relation pick has a countdown and the examples have one (the seconds for each example). Time up on the pick marks it wrong,
// shows the right relation and goes on to the examples. Time up on the examples checks whatever was typed; cells not reached count as left empty.
// Pervasions tab: each question has its countdown, and after the four, the relation pick has the relation's. Time up on the pick marks it wrong and shows the result.
const relTimed=()=>!!(blitz&&ui&&!ui.debate&&!ui.checked&&mode==="quiz"&&tab==="practice");
const relTimedD=()=>!!(blitz&&ui&&ui.debate&&ui.step>3&&!ui.rel&&!ui.checked&&mode==="quiz"&&tab==="debate");
const exMul=()=>(relTimed()&&ui.rel)?Math.max(1,fillable().length):1;
function ensureRelTimer(){
  const u=ui;
  if(!u||mode!=="quiz"||u.checked||!blitz||timeEdit||u.tq) return;
  const now=performance.now();
  if(u.debate){
    if(tab!=="debate"||u.step<4||u.rel||!relMs) return;
    u.tph="rel"; u.tq={t0:now,limit:relMs}; u.tid=setTimeout(()=>expireRelD(u),relMs);
    return;
  }
  if(tab!=="practice") return;
  const lim=limitMs(); if(!lim) return;
  if(!u.rel){ u.tph="pick"; u.tq={t0:now,limit:relMs}; u.tid=setTimeout(()=>expireRel(u),relMs); }
  else { const total=lim*exMul(); u.tph="ex"; u.tq={t0:now,limit:total}; u.tid=setTimeout(()=>expireEx(u),total); }
}
function expireRel(u){
  if(u!==ui||u.checked||u.rel||tab!=="practice") return;
  const k=cur.p.relation;
  u.tid=null; u.tq=null; u.late=true; u.rel=k; u.open=false; u.ci=0; u.seen=0; u.pop=null;
  for(const c of REL[k].empty){ u.cells[c].t=""; u.cells[c].none=false; }
  render(); if(!isWide()) focusCin();
}
function expireEx(u){
  if(u!==ui||u.checked||!u.rel||tab!=="practice") return;
  u.tid=null; u.tq=null; u.exLate=true;
  if(document.activeElement&&document.activeElement.blur) document.activeElement.blur();
  check();
}
// Pervasions: time up on the relation. The answers are checked with no relation chosen; the result shows the right one.
function expireRelD(u){
  if(u!==ui||u.checked||u.rel||tab!=="debate"||u.step<4) return;
  u.tid=null; u.tq=null; u.late=true; u.rel=cur.p.relation; u.open=false;
  if(document.activeElement&&document.activeElement.blur) document.activeElement.blur();
  checkDebate();
}
// a new start: after a change of the switch or the time, the running countdown begins again with its full time
function relReset(){ if(ui&&!ui.checked&&(!ui.debate||ui.step>3)) stopTimer(); }
function timerBar(){
  if(!ui.tq) return null;
  const e=Math.max(0,Math.round(performance.now()-ui.tq.t0));
  return el("div",{class:"tbar","aria-hidden":"true",style:"--t:"+ui.tq.limit+"ms;--e:"+e+"ms"},el("i"));
}
function pairHead(s,p,o){
  const np=o.rel?notaParts(o.rel):null;
  let midCls="mid"+(o.rel?" set":" empty"); if(o.checked) midCls+=o.relOk?" key":" wrong";
  const label=o.rel?"Relation: "+REL[o.rel].name+(o.canToggle?". Change":""):"Relation not picked yet";
  const mid=el("button",{type:"button",class:midCls,disabled:!o.canToggle,"aria-expanded":o.canToggle?(o.open?"true":"false"):null,"aria-label":label,onclick:o.toggle},
    np?el("span",{class:"sym math",text:np[0]+(np[1]?" "+np[1]:"")}):el("span",{class:"pip"}));
  const tail=np&&np[2]?el("span",{class:"tail math"+(o.checked?(o.relOk?" key":" wrong"):""),text:np[2]}):null;
  s.append(el("div",{class:"head"},
    el("div",{class:"pair",lang:"en"}, el("span",{class:"tx ta",text:p.a}), L("A"), mid, L("B"), el("span",{class:"tx tb"},p.b,tail)),
    o.sub?subRowNode({text:o.sub,cls:o.checked?(o.relOk?" key":" wrong"):"",disabled:true,why:relWhy()}):null));
  const rp=relPopNode(); if(rp) s.append(rp);
}
// the result of a debate: a headline and one chip per aspect (see resultBlock)
function debateResult(u,p){
  const r=u.res, k=REL[p.relation], imp=r.implied, ex=explainParts();
  const head={ok:"Right.",part:"Relation right, but not everything else.",pend:"Relation and questions right.",bad:"Not quite."}[r.overall];
  const decOk=QCELL.filter(c=>r.dec[c]).length;
  const impTxt=imp==="bad"?"your answers contradict each other. If no A is B, A cannot also be inside B (or B inside A), because that leaves one of them with no instances. The challenger would declare you finished."
    :imp?"your answers give "+lcRel(REL[imp].name)+(u.late?", and time ran out before you chose.":imp===u.rel?".":", but you chose "+lcRel(REL[u.rel].name)+"."):"";
  return resultBlock(r,head,[
    {key:"rel",label:"Relation",st:r.relOk?"ok":"bad",body:()=>[
      el("p",null,el("b",{text:"Relation: "}),u.late?"time ran out.":r.relOk?"right.":"wrong."),
      el("p",null,(r.relOk?k.name:"The relation is "+lcRel(k.name))+": "+k.gloss(p.a,p.b).toLowerCase()+".",notaOf(p.relation)&&nota!=="codes"?[" ",el("span",{class:"nota math",text:notaOf(p.relation)})]:null)]},
    imp?{key:"imp",label:"Implied",st:u.late?"none":imp===u.rel?"ok":"bad",body:()=>el("p",null,el("b",{text:"From your answers: "}),impTxt)}:null,
    {key:"q",label:"Questions "+decOk+"/4",st:decOk===4?"ok":"bad",body:()=>questionRows(u)},
    {key:"ex",label:"Examples",st:r.exBad?"bad":r.exOpen?"open":"ok",body:()=>el("p",null,el("b",{text:"Examples: "}),exLine(r,QCELL))},
    termsItem(p),tutorItem(),labItem()].filter(Boolean));
}
// the four questions as short rows; a tap opens one with the statement, the answer and what it earned (the first wrong one is open to begin with)
function questionRows(u){
  const r=u.res, ex=explainParts();
  const open=u.qopen===undefined?QCELL.findIndex(c=>r.cells[c].v==="bad"):u.qopen;
  return el("ul",{class:"qd"},QCELL.map((c,i)=>{
    const rr=r.cells[c], a=u.ans[i], on=open===i, st=rr.v==="ok"?"ok":rr.v==="bad"?"bad":"part";
    return el("li",{class:on?"open":""},
      el("button",{type:"button",class:"qs","aria-expanded":on?"true":"false",onclick:()=>{ u.qopen=on?null:i; render(); }},
        el("span",{class:"m "+st,"aria-hidden":"true",text:{ok:"✓",bad:"✗",part:"?"}[st]}),
        el("span",{class:"qh"},el("b",{text:"Question "+(i+1)}),ansNode(a,null,null))),
      on?el("div",{class:"qb"},
        el("span",{class:"qq"},qNode(i)),
        ansNode(a,a.limit&&a.ms!=null?a.ms:null,i),
        el("span",{class:"fbq"},el("b",{text:rr.msg[0]}),rr.msg[2]?[" ",el("i",{text:rr.msg[2]})]:null,isaTxt(rr.msg[1]||"")),
        ex.cells[c]?el("span",{class:"cl"},el("span",{class:"clh",text:"Claude"}),aiFlag(aiCase("explain","Claude’s note on Q"+(i+1),ex.cells[c],c),"q:"+c),ex.cells[c]):null,
        ex.cells[c]?flagEditorNode("q:"+c):null):null);
  }));
}
// each question's counter-example cell, filled in as the learner answered; an accepted question leaves its cell empty
function debateCell(u,p){
  const r=u.res;
  return c=>{
    const rr=r.cells[c], a=u.ans[QCELL.indexOf(c)], t=(u.cells[c].t||"").trim(), vcls=" v-"+(rr.uns?"uns":rr.v);
    if(a.say!=="why"||!t) return el("div",{class:"cell locked"+vcls,"aria-label":cellLabel(c,p)+": "+(a.say==="accept"?"accepted, nothing here":"no example")},
      rr.v==="bad"?fbNode(rr):el("span",{class:"empty",text:"∅"}),whyBtn(c,p));
    return el("div",{class:"cell"+vcls,"aria-label":cellLabel(c,p)},el("span",{class:"cx",text:t}),fbNode(rr),whyBtn(c,p));
  };
}
// the table before Check: the example posited for a question, or ∅ where it was accepted
function debateDraftCell(u,p){
  return c=>{
    const a=u.ans[QCELL.indexOf(c)], t=(a.text||"").trim();
    if(a.say!=="why"||!t) return el("div",{class:"cell locked","aria-label":cellLabel(c,p)+": "+(a.say==="accept"?"accepted, nothing here":"no example")},el("span",{class:"empty",text:"∅"}));
    return el("div",{class:"cell","aria-label":cellLabel(c,p)},el("span",{class:"cx",text:t}));
  };
}
// progress of the questions: one rhombus each, answered filled, the current one marked, no numbers (the order of the questions carries no meaning)
const progStrip=i=>el("span",{class:"prog","aria-hidden":"true"},[0,1,2,3].map(k=>el("i",{class:k<i?"done":k===i?"now":""})));
const qnParts=i=>[progStrip(i),"Question "+(i+1),el("span",{class:"sr",text:" of 4"}),Wd().lead?el("span",{class:"lead",text:Wd().lead}):null];
// the answers given so far, kept above the next question on a phone so none looks discarded: "Q1 ✓   Q2 ?! an example ...".
// No verdict yet, that comes with the result. An example is cut at about eight letters of width; the table shows it whole.
function receiptNode(u,count,enter){
  const w=Wd();
  const items=[...Array(count).keys()].map(i=>{
    const a=u.ans[i], kind=a.say==="accept"?"acc":a.say==="why"?"why":"to";
    // a mark for each answer, no words: ✓ accepted, ?! asked why; the open tag spells it out
    const word=kind==="acc"?w.acd:kind==="why"?w.wyd:"Time out", mark=kind==="acc"?"\u2713":kind==="why"?"?!":"";
    const extra=a.say==="why"&&a.text?a.text:a.timeout&&a.say==="accept"?"time ran out":"";
    const on=u.ro===i;
    return el("button",{type:"button",class:"ri "+kind+(on?" on":""),"aria-expanded":on?"true":"false",title:word,"aria-label":"Question "+(i+1)+": "+word+(extra?", "+extra:"")+". "+(on?"Hide":"Show")+" the statement and your answer",
      onclick:()=>{ u.ro=on?null:i; render(); }},
      el("b",{class:"n",text:"Q"+(i+1)}),el("span",{class:"rw"+(mark?" rmk":""),"aria-hidden":mark?"true":null,text:mark||word}),extra?el("span",{class:"exn",text:extra,title:extra}):null);
  });
  // a tag opens the statement and the answer in full under the row; the row itself stays as it is
  const o=u.ro;
  if(o!=null&&o<count) items.push(el("div",{class:"rdet"},el("span",{class:"qq"},qNode(o)),ansNode(u.ans[o],null,o)));
  return el("div",{class:"rcpt"+(enter?" enter":""),role:"group","aria-label":"Your answers so far"},items);
}
function renderDebate(s,c){
  const w=isWide(), p=cur.p, u=ui, stage=u.checked?"done":u.step<4?"ask":"rel";
  // the card of a new question slides in, so it is plain that this is the next one; the first card and a re-draw stay still
  const enter=stage==="ask"&&u.qseen!==undefined&&u.qseen!==u.step; if(stage==="ask") u.qseen=u.step;
  const relName=u.rel?REL[u.rel].name:"";
  if(!w) setSteps(["Questions","Relation","Result"],stage==="done"?2:stage==="rel"?1:0,[null,stage==="rel"&&!u.open?()=>{ u.open=true; render(); }:null,null]);
  const canToggle=!w&&stage==="rel"&&!!u.rel;
  pairHead(s,p,{rel:u.rel,checked:u.checked,relOk:u.checked&&u.res.relOk,open:u.open,canToggle,
    toggle:()=>{ if(canToggle){ u.open=!u.open; render(); } },
    sub:u.checked?relName:stage==="ask"?"":u.rel?relName:"which relation do your answers give?"});
  fitPair();
  const done=stage==="ask"?u.step:4;
  const qlog=()=>el("ul",{class:"qlog"},[...Array(done).keys()].map(i=>
    el("li",null,el("span",{class:"n",text:String(i+1)}),el("span",null,el("span",{class:"qq"},qNode(i)),ansNode(u.ans[i],null,i)))));
  // wide: the answered questions stay above the card. Phone: nothing sits above the field while asking (the keyboard would cover the card);
  // at the relation step the answers show as a table like the result
  if(done&&stage!=="done"&&w) s.append(qlog());
  else if(stage==="ask"&&u.step>0&&!w) s.append(receiptNode(u,u.step,enter));
  // the relation step shows the answers in the same place and form (a tag opens its statement); the question they answer is in the line under the diamond
  if(stage==="rel"&&!w) s.append(receiptNode(u,4,false));
  if(stage==="rel"&&!w) s.append(el("div",{class:"section"+(u.open?" opt":"")},el("p",{class:"label"},"Your examples",el("span",{class:"hint",text:"∅ = you accepted: nothing exists there."})),exGrid(p,debateDraftCell(u,p))));

  if(stage==="ask"){
    const i=u.step;
    const card=el("div",{class:"qcard"+(enter?" enter":"")},el("p",{class:"qn"},el("span",{class:"qnl"},qnParts(i))),el("p",{class:"qt"},qNode(i)));
    if(!u.pickWhy){
      card.append(el("div",{class:"ansrow"},
        el("button",{type:"button",class:"btn",onclick:()=>sayQ("accept")},Wd().acc,el("span",{class:"kbd",text:Wd().ak})),
        el("button",{type:"button",class:"btn ghost",onclick:()=>sayQ("why")},Wd().why,el("span",{class:"kbd",text:Wd().wk}))));
    } else {
      const inp=el("input",{type:"text",id:"dex",placeholder:"Posit a counter-example","aria-label":"Posit a counter-example",value:u.exText,autocomplete:"off",autocapitalize:"off",enterkeyhint:"next"});
      const nx=el("button",{type:"button",class:"btn",onclick:submitWhy,disabled:!u.exText.trim(),text:"Next"});
      inp.addEventListener("input",e=>{ u.exText=e.target.value; nx.disabled=!u.exText.trim(); });
      inp.addEventListener("keydown",e=>{
        if(e.key==="Enter"){ e.preventDefault(); e.stopPropagation(); submitWhy(); }
        else if(e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); backWhy(); }
      });
      card.append(el("div",{class:"ansrow"},inp,nx),el("button",{type:"button",class:"back",onclick:backWhy,text:"Back"}));
    }
    // the countdown sits under the response; with Blitz off its space stays, so the switch never moves the card
    card.append(timerSlot("ex",blitz));
    s.append(card);
  }

  if(stage==="rel"||stage==="done"){
    if(w) s.append(relStrip(chooseD,stage==="done"),stage==="rel"?timerSlot("rel",relTimedD()):null,relCap("Pick the relation your answers give (keys 1–5). Picking it checks your answers."));
    else if(stage==="rel"&&u.open) s.append(relList(chooseD,null));
  }
  if(stage==="done"){
    // the table first (it is fixed), the verdict under it (its length changes with the chip)
    s.append(el("div",{class:"section"},el("p",{class:"label"},"Your examples",el("span",{class:"hint",text:"∅ = you accepted: nothing exists there."})),exGrid(p,debateCell(u,p),true)));
    if(!w) s.append(debateResult(u,p));
    if(!w&&u.saveErr) s.append(el("p",{class:"status",text:u.saveErr}));
  }

  const acts=el("div",{class:"actions"});
  if(w){ const fb=favBtn(p); if(fb) acts.append(fb); acts.append(blitzBtn()); if(stage!=="done") skipActs().forEach(n=>{ if(n) acts.append(n); }); }
  if(stage==="done"){
    if(!w){ const ta=tutorAct(); if(ta) acts.append(ta); }
    acts.append(nextBtn());
  }
  if(acts.childNodes.length) s.append(acts);
  if(favErr) s.append(el("p",{class:"status",text:favErr}));
  if(skipErr) s.append(el("p",{class:"status",text:skipErr}));

  if(!w) return;
  // the coach panel
  if(stage!=="done"){
    recentNode(c,debateList().slice(-5).reverse());
    c.append(stage==="ask"?kbHints([Wd().ak,Wd().acc.toLowerCase()],[Wd().wk,Wd().why.toLowerCase()],["S","skip"],["F","favourite"]):kbHints(["1–5","relation, checks"],["S","skip"],["F","favourite"]));
    return;
  }
  c.append(el("p",{class:"label"},"Result"),debateResult(u,p));
  if(u.saveErr) c.append(el("p",{class:"status",text:u.saveErr}));
  const eb=explainBtn(); if(eb) c.append(el("div",{class:"actions left"},eb));
  c.append(kbHints(["Enter","next pair"],["F","favourite"]));
}

/* ---------- debate: statistics in the Review tab ---------- */
function renderDebateStats(s){
  const all=Object.values(debates).sort((x,y)=>(x.at||"").localeCompare(y.at||""));
  if(!all.length) return;
  const relOk=all.filter(a=>a.correct).length;
  const rows=[0,1,2,3].map(i=>{ const xs=all.map(a=>a.qs&&a.qs[i]).filter(Boolean); return [i,xs.length,xs.filter(q=>q.dok).length]; });
  const times=all.flatMap(a=>(a.qs||[]).filter(q=>q.limit&&q.say!=="time"&&!q.timeout&&q.ms!=null).map(q=>q.ms)).sort((x,y)=>x-y);
  const med=times.length?times[Math.floor(times.length/2)]:null;
  const timedN=all.reduce((n,a)=>n+(a.qs||[]).filter(q=>q.limit).length,0), outN=all.reduce((n,a)=>n+(a.qs||[]).filter(q=>q.timeout).length,0);
  s.append(el("div",{class:"section"},el("p",{class:"label"},"Pervasions",el("span",{class:"hint",text:all.length+" pairs, relation right "+pct(relOk,all.length)+"%"})),
    el("table",{class:"tbl"},el("tbody",null,
      rows.map(([i,n,k])=>el("tr",null,el("td",{text:"Question "+(i+1)+": "+qPlain(i)}),el("td",{class:"num"},n?k+" / "+n:"–",n?barNode(pct(k,n)):null))),
      med!=null?el("tr",null,el("td",{text:"Median time to answer, blitz"}),el("td",{class:"num",text:(med/1000).toFixed(1)+" s"})):null,
      timedN?el("tr",null,el("td",{text:"Ran out of time (counted as accepted)"}),el("td",{class:"num",text:outN+" / "+timedN})):null))));
}

/* ---------- boot ---------- */
// The page knows its host only through the platform it is started with (src/platform/types.ts): the term data and the
// two capabilities `db` and `sample`, either of which may be missing.
export function startApp(platform){
  render();
  boot(platform);
  exposeTestHook();
}
async function boot(platform){
  try{ DATA=await platform.loadData(); indexData(); buildPool(); }
  catch(e){ mode="nodata"; render(); return; }
  try{ db=await platform.db(); }catch(e){ db=null; }
  try{ sample=await platform.sample(); }catch(e){ sample=null; }
  if(!db){ gotA=gotB=gotS=true; advance(); mode="quiz"; render(); return; }
  db.collection("batches").orderBy("order","asc").onSnapshot(snap=>{
    batches=snap.docs.map(d=>Object.assign({id:d.id},d.data())); gotB=true; settle();
  },()=>{ gotB=true; settle(); });
  db.collection("answers").onSnapshot(snap=>{
    const m={}; snap.docs.forEach(d=>{m[d.id]=d.data();}); answers=m; gotA=true; settle();
  },()=>{ gotA=true; settle(); });
  db.collection("favorites").onSnapshot(snap=>{
    const m={}; snap.docs.forEach(d=>{m[d.id]=d.data();});
    const same=Object.keys(m).sort().join()===Object.keys(favs).sort().join(); favs=m;
    if(!same&&mode!=="loading") render();
  },()=>{});
  db.collection("skips").onSnapshot(snap=>{
    const m={}; snap.docs.forEach(d=>{m[d.id]=d.data();});
    const same=Object.keys(m).sort().join()===Object.keys(skips).sort().join(); skips=m; gotS=true;
    if(mode==="loading") settle(); else if(!same&&tab==="review") render();
  },()=>{ gotS=true; settle(); });
  setTimeout(()=>{ if(!gotS){ gotS=true; settle(); } },2500);       // never hold the first pair for the skips
  labSubscribe();
  db.collection("debates").onSnapshot(snap=>{
    const m={}; snap.docs.forEach(d=>{m[d.id]=d.data();}); debates=m; settle();
  },()=>{});
}
function settle(){
  if(!gotB||!gotA||!gotS) return;
  if(mode==="loading"){ advance(); render(); return; }
  if(tab==="review") render(); else renderSession();
}

/* ---------- test hook (begin): lets the browser tests in tests/ read internals; inert unless a test defines window.__riglamTest ---------- */
function exposeTestHook(){
if(typeof window.__riglamTest==="function") window.__riglamTest({get cur(){return cur},get ui(){return ui},get tab(){return tab},get favs(){return favs},get mode(){return mode},get view(){return view},get optsOpen(){return optsOpen},favKey,refOf,render,choose,fbNode,defParts,termsNode,setDefLang,get defLang(){return defLang},get DATA(){return DATA},next,advance,get skips(){return skips},set skips(v){skips=v},skipPair,undoSkip,isSkipped,hiddenKeys,get POOL(){return POOL},nextGenerated,SKIP_DAYS,get lab(){return lab},setLab,labThings,get flags(){return flags},get labruns(){return labruns},labRuns,LAB_MODELS,labRef,labParse,flagId,labAgain,openFlag,saveFlag,removeFlag,setFlagState,get labPause(){return labPause},set labPause(v){labPause=v},get labSpotN(){return labSpotN},set labSpotN(v){labSpotN=v},labJudgeNow,aiCase,aiFlag,decorateAns});
}
/* ---------- test hook (end) ---------- */
