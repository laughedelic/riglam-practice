import { state } from "../state.js";
import { L, el } from "../core/dom.js";
import { CELLS, REL, lcRel } from "../core/rel.js";
import { dayOf, gradeOf, isMiss, pairsOf } from "../core/util.js";
import { isWide } from "../core/viewport.js";
import { favSection } from "../practice/favorites.js";
import { advance } from "../practice/queue.js";
import { popNode } from "../practice/screen.js";
import { skipSection } from "../practice/skips.js";
import { answerList } from "../practice/universe.js";
import { renderDebateStats } from "./debate-stats.js";
import { renderFindStats } from "./find-stats.js";
import { exerciseNode, practiceAgain } from "./exercise.js";
import { flagCount, flagSection } from "./flag-list.js";
import { render, top0 } from "../shell/render.js";
import { switchTo } from "../shell/tabs.js";

/* ---------- review ---------- */
const openMiss=new Set();
export function pct(n,d){ return d?Math.round(100*n/d):0; }
export function barNode(p){ return el("span",{class:"bar"+(p<50?" b-low":p<80?" b-mid":""),style:"width:"+Math.max(4,Math.round(p*.6))+"px"}); }
// Review in three groups: Overview, Mistakes, Favorites. Wide screens show the three side by side; narrow screens switch between them.
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
  renderFindStats(box);
}
function revMistakes(box,all,miss){
  // mistakes
  const sec=el("div",{class:"section"},el("p",{class:"label"},"Mistakes",el("span",{class:"hint",text:miss.length+" in total"})));
  if(!miss.length) sec.append(el("p",{class:"empty-note",text:"None yet."}));
  else sec.append(el("ul",{class:"favs mist"},miss.slice(0,25).map(a=>{
    const g=gradeOf(a), bad=CELLS.filter(c=>a.cells&&a.cells[c]&&a.cells[c].verdict==="bad"), k=a.pairId+"|"+a.at;
    const sub=(a.correct?"Relation right ("+lcRel(REL[a.key].name)+"), ":(a.chosen==null?"No pick, time ran out":"Chose "+(REL[a.chosen]?lcRel(REL[a.chosen].name):a.chosen))+"; correct: "+(REL[a.key]?lcRel(REL[a.key].name):a.key)+". ")+
      (bad.length?"wrong cell"+(bad.length>1?"s":"")+": "+bad.map(c=>({both:"both",anb:"A not B",bna:"B not A",nei:"neither"}[c])).join(", ")+".":"")+(a.timeout==="examples"||a.timeout==="both"?" Time ran out on the examples.":"")+" "+dayOf(a.at);
    // a mistake opens to show the exercise as it was checked: your examples, the verdicts and Claude's explanation
    const p=pairFromAnswer(a);
    return el("li",null,el("details",{open:openMiss.has(k),ontoggle:e=>{ if(e.target.open) openMiss.add(k); else openMiss.delete(k); }},
      el("summary",null,el("span",{class:"m "+g,text:g==="part"?"~":"✗"}),el("span",null,a.a+" / "+a.b,el("span",{class:"sub",text:sub}))),
      el("div",{class:"fbody"},exerciseNode(a),p?el("div",{class:"actions left"},el("button",{type:"button",class:"btn",onclick:()=>practiceAgain(p,"Retry"),text:"Practice this pair"})):null)));
  })));
  const retryable=uniqueMistakePairs(miss);
  if(retryable.length) sec.append(el("div",{class:"actions left"},el("button",{class:"btn",type:"button",onclick:()=>startRetry(retryable),text:"Retry "+Math.min(10,retryable.length)+(Math.min(10,retryable.length)>1?" mistakes":" mistake")})));
  box.append(sec);

  // weak categories
  const cs={};
  for(const a of all){ for(const c of [a.catA,a.catB]){ if(!c||!state.CAT[c]) continue; const o=cs[c]||(cs[c]={n:0,bad:0}); o.n++; if(isMiss(a)) o.bad++; } }
  const weak=Object.entries(cs).filter(([,o])=>o.n>=2&&o.bad).sort((x,y)=>y[1].bad/y[1].n-x[1].bad/x[1].n||y[1].n-x[1].n).slice(0,6);
  if(weak.length) box.append(el("div",{class:"section"},el("p",{class:"label"},"Weak spots",el("span",{class:"hint",text:"categories in pairs you missed"})),
    el("table",{class:"tbl"},el("tbody",null,weak.map(([c,o])=>el("tr",null,el("td",null,state.CAT[c].labels[0],el("span",{class:"types",text:state.CAT[c].type})),el("td",{class:"num",text:o.bad+" of "+o.n+" missed"})))))));
}
export function renderReview(s){
  const all=answerList(), nsk=Object.keys(state.skips).length, nfl=state.db?flagCount():0;
  if(!all.length){
    const pane=el("div",{class:"rpane"}); s.append(pane);
    pane.append(el("p",{class:"empty-note",text:"No practice answers yet. Your history and weak spots will show up here."})); favSection(pane); if(nsk) skipSection(pane); if(nfl) flagSection(pane); renderDebateStats(pane); renderFindStats(pane); return;
  }
  const miss=all.filter(isMiss).reverse(), nf=Object.keys(state.favs).length;
  /** @type {[string, string, (box: HTMLElement, all: object[], miss: object[]) => void, string][]} */
  const parts=[["overview","Overview",revOverview,""],["mistakes","Mistakes",revMistakes,miss.length?String(miss.length):""],["favs","Favorites",(b)=>favSection(b),state.db&&nf?String(nf):""]];
  if(nsk) parts.push(["skips","Skipped",(b)=>skipSection(b),String(nsk)]);
  if(nfl) parts.push(["flags","Flags",(b)=>flagSection(b),String(nfl)]);
  if(isWide()){
    // three columns; the skipped pairs sit under the favorites, both lists of pairs picked by hand, and the flags under the mistakes
    s.append(el("div",{class:"rev3"},parts.filter(p=>p[0]!=="skips"&&p[0]!=="flags").map(([k,,fn])=>{ const col=el("div",{class:"rcol","data-part":k}); fn(col,all,miss); if(k==="favs"&&nsk) skipSection(col); if(k==="mistakes"&&nfl) flagSection(col); return col; })));
    return;
  }
  if(!parts.some(p=>p[0]===state.reviewSeg)) state.reviewSeg="overview";
  s.append(el("div",{class:"seg rseg"+(parts.length>4?" r5":parts.length>3?" r4":""),role:"group","aria-label":"Review sections"},
    parts.map(([k,l,,n])=>el("button",{type:"button","aria-pressed":state.reviewSeg===k?"true":"false",onclick:()=>{ state.reviewSeg=k; render(); top0(); }},
      l,n?el("span",{class:"cnt",text:" "+n}):null))));
  const pane=el("div",{class:"rpane"}), cur_=parts.find(p=>p[0]===state.reviewSeg);
  cur_[2](pane,all,miss); s.append(pane);
}
// the 2x2 table of examples: B and not B across, A and not A down; cell(c) builds one cell
function gridHead(letter,name,neg,cls){ return el("div",{class:"h "+cls,title:(neg?"not ":"")+name}, neg?el("span",{class:"not",text:"not"}):null, L(letter), el("span",{class:"nm",text:name})); }
export function exGrid(p,cell,pop){
  const pn=pop?popNode():null, top=!!pn&&(state.ui.pop==="both"||state.ui.pop==="anb");
  return el("div",{class:"grid"},
    el("div"), gridHead("B",p.b,false,"col"), gridHead("B",p.b,true,"col"),
    gridHead("A",p.a,false,"row"), cell("both"), cell("anb"), top?pn:null,
    gridHead("A",p.a,true,"row"), cell("bna"), cell("nei"), top?null:pn);
}
function pairFromAnswer(a){
  if(a.pair) return a.pair;
  for(const b of state.batches){ const q=pairsOf(b).find(p=>p.id===a.pairId); if(q) return q; }
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
function startRetry(ps){ state.retryQ=ps.slice(0,10); state.retryTag="Retry"; switchTo("practice"); advance(); render(); top0(); }
