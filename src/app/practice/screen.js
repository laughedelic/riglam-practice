import { state } from "../state.js";
import { aiCase, aiFlag, decorateAns, flagEditorNode } from "../ai/flags.js";
import { quorumItem } from "../ai/quorum-panel.js";
import { ask, fillAns } from "../ai/tutor.js";
import { CELL_NAME } from "../../ai-shared/prompts.ts";
import { canAsk } from "../core/ask.js";
import { NAME_CELL, VERDICT_RE, noteParts, parseFactLine, partsText } from "../../domain/verdict.ts";
import { $, L, el } from "../core/dom.js";
import { lockIcon } from "../core/icons.js";
import { CELLS, REL, cellLabel, lcRel, notaOf, notaParts, orderOf } from "../core/rel.js";
import { gradeOf } from "../core/util.js";
import { isWide } from "../core/viewport.js";
import { stopTimer } from "../debate/flow.js";
import { QCELL, singular, termNode } from "../debate/text.js";
import { check } from "./grading.js";
import { next } from "./queue.js";
import { subRowNode } from "./skips.js";
import { defCard, termsNode, withTerms } from "./terms.js";
import { answerList } from "./universe.js";
import { exGrid } from "../review/review.js";
import { tutorTurns } from "../shell/chat.js";
import { pairBar } from "../shell/pbar.js";
import { CELL_FULL, ago, fitPair, focusCin, render, setSteps } from "../shell/render.js";
import { voiceBar } from "../shell/voice.js";

/* ---------- practice: one pair ---------- */
// the heading: A [relation diamond] B, relation name below. On a wide screen the strip under it picks the relation, so the diamond only shows it.
function quizHead(s,w){
  const p=state.cur.p;
  if(state.cur.retry) s.append(el("span",{class:"retry-tag",text:(state.cur.tag||"Retry")+(state.retryQ.length?" · "+state.retryQ.length+" more":"")}));
  const np=state.ui.rel?notaParts(state.ui.rel):null;
  let midCls="mid"+(state.ui.rel?" set":" empty");
  if(state.ui.checked) midCls+=state.ui.res.relOk?" key":" wrong";
  const toggle=()=>{ if(!state.ui.checked&&state.ui.rel&&!w&&!state.ui.late){ state.ui.open=!state.ui.open; render(); } };
  const label=state.ui.rel?"Relation: "+REL[state.ui.rel].name+(state.ui.checked||w?"":". Change"):"Pick a relation";
  const mid=el("button",{type:"button",class:midCls,disabled:state.ui.checked||!state.ui.rel||w||state.ui.late,"aria-expanded":w?null:(state.ui.open?"true":"false"),"aria-label":label,onclick:toggle},
    np?el("span",{class:"sym math",text:np[0]+(np[1]?" "+np[1]:"")}):el("span",{class:"pip"}));
  const tail=np&&np[2]?el("span",{class:"tail math"+(state.ui.checked?(state.ui.res.relOk?" key":" wrong"):""),text:np[2]}):null;
  const subTxt=!state.ui.rel?"pick a relation":state.ui.late&&!state.ui.checked?REL[state.ui.rel].name+" · time ran out":REL[state.ui.rel].name;
  s.append(el("div",{class:"head"},
    el("div",{class:"pair",lang:"en"}, el("span",{class:"tx ta",text:p.a}), L("A"), mid, L("B"), el("span",{class:"tx tb"},p.b,tail)),
    subRowNode({text:subTxt,cls:state.ui.checked?(state.ui.res.relOk?" key":" wrong"):"",disabled:state.ui.checked||!state.ui.rel||w||state.ui.late,onclick:toggle,why:relWhy()})));
  const rp=relPopNode(); if(rp) s.append(rp);
  fitPair();
}
// the five relations as a list (narrow screens, and the last step of a debate) ...
export function relList(onPick,heading){
  const p=state.cur.p, list=el("div",{class:"rels",role:"group","aria-label":"Relation"});
  orderOf(p).forEach((k,i)=>{
    const r=REL[k];
    list.append(el("button",{type:"button",class:"rel","aria-pressed":state.ui.rel===k?"true":"false",onclick:()=>onPick(k)},
      el("span",null, el("span",{class:"name",text:r.name}), el("span",{class:"gloss",text:r.gloss(p.a,p.b)})),
      el("span",{class:"nota math",text:notaOf(k)})));
  });
  return el("div",{class:"section"}, heading?el("p",{class:"label rel-label"},heading):null, list);
}
// ... and as a strip of five chips (wide screens), with the chosen relation explained under it
export function relStrip(onPick,done){
  const p=state.cur.p, order=orderOf(p), box=el("div",{class:"strip"+(order.length>5?" six":"")+(done?" done":""),role:"group","aria-label":"Relation"});
  order.forEach((k,i)=>{
    const r=REL[k], mine=state.ui.rel===k;
    // once checked: the chosen chip is lapis when right and vermilion when wrong, and the right one is ringed
    const st=done?(state.ui.late?(p.relation===k?" right":""):mine?(state.ui.res&&state.ui.res.relOk?" key":" wrong"):p.relation===k?" right":""):"";
    box.append(el("button",{type:"button",class:"chip"+st,"aria-pressed":mine?"true":"false",disabled:done,title:r.gloss(p.a,p.b),onclick:()=>onPick(k)},
      el("span",{class:"n math",text:notaOf(k)}), el("small",{text:r.name.replace(/, ([AB]) in ([AB])$/,", $1\u00a0in\u00a0$2")})));
  });
  return box;
}
export function relCap(hint){
  if(!state.ui.rel) return el("p",{class:"cap",text:hint||"Pick the relation (keys 1–"+orderOf(state.cur.p).length+"), then give examples."});
  const r=REL[state.ui.rel];
  if(state.ui.late) return el("p",{class:"cap"},el("b",{text:"Time ran out. "}),"The relation is "+lcRel(r.name)+": "+r.gloss(state.cur.p.a,state.cur.p.b)+".");
  return el("p",{class:"cap"},el("b",{text:r.name+". "}),r.gloss(state.cur.p.a,state.cur.p.b)+".");
}
// one cell of the 2x2 table: an example field, or the verdict on it once checked
export function quizCell(c){
  const p=state.cur.p, implied=state.ui.rel?REL[state.ui.rel].empty:[], r=state.ui.checked&&state.ui.res.cells[c];
  const vcls=r?" v-"+(r.uns?"uns":r.v):"";
  if(implied.includes(c)){
    return el("div",{class:"cell locked"+vcls,"aria-label":cellLabel(c,p)+": nothing, by your relation"},
      r&&(r.v==="bad"||r.v==="open")?fbNode(r):el("span",{class:"empty",text:"∅"}),whyBtn(c,p),checkChip(r));
  }
  const off=state.ui.checked||!state.ui.rel||state.ui.cells[c].none;
  const inp=el("input",{type:"text",id:"in-"+c,placeholder:state.ui.cells[c].none?"∅":"example",value:state.ui.cells[c].t,disabled:off,"aria-label":cellLabel(c,p),autocomplete:"off"});
  inp.addEventListener("input",e=>{state.ui.cells[c].t=e.target.value;});
  inp.addEventListener("keydown",e=>{ if(e.key==="Enter"){ e.preventDefault(); const nx=nextInput(c); if(nx) nx.focus(); else check(); } });
  return el("div",{class:"cell"+vcls}, el("div",{class:"field"},inp), r?fbNode(r):null, whyBtn(c,p), checkChip(r));
}
// A cell the page could not judge (an example it cannot classify, or a cell of a pair of one's own) carries a dashed "check" chip: a tap asks Claude to check it, as Explain does.
// While Claude works it says so; with no tutor on this device there is no chip, since nothing could be done with it.
export function checkChip(r){
  if(!r||r.uns||(r.v!=="cmp"&&r.v!=="open")) return null;
  const u=state.ui; if(!u||!u.checked) return null;
  if(u.ctl) return el("span",{class:"cchip busy",role:"status",text:"checking"});
  if(u.explained&&!u.res.relOpen) return null;
  if(canAsk()) return el("button",{type:"button",class:"cchip",title:"Ask Claude to check this one",onclick:e=>{ e.stopPropagation(); ask(null,"explain"); },text:"check"});
  if(state.unlock&&state.unlock.tutor) return el("button",{type:"button",class:"cchip needs-key",title:"Checking needs the Magic Key",onclick:e=>{ e.stopPropagation(); askAfterKey(); },text:"check"});
  return null;
}
// Claude's explanation split by where it belongs: a line per cell (or Q1 to Q4) goes to that cell, the lines on the common locus,
// the pervasion and the relation to the "?" beside the relation. Anything else (the explanation, the misconception) belongs to the Why panel.
const REL_LABEL=/^(common locus|pervasion|relation)$/i;
// A note opens under the heading "Why?", so the "Why?" the tutor starts a debate line with would be said twice.
const WHY_LEAD=/^why\?\s+(?=\S)/i;
// A fact line's note (src/domain/verdict.ts) in the debate's form; in the debate it depends on whether the learner accepted that question.
const acceptedQ=f=>{ const u=state.ui, a=u&&u.debate&&u.ans&&u.ans[QCELL.indexOf(f.cell)]; return !!a&&a.say!=="why"; };
// the term data's steps (src/domain/ladder.ts) need the data, the pair and its terms as the note writes them
export const noteData=(p=state.cur.p)=>({ix:state,p,terms:{a:singular(p.a),b:singular(p.b)}});
// `ctx` ({p, accepted}) is given where a stored note is shown away from the exercise on screen (Review): its pair and what was accepted, not the live ones
const partsOf=(f,ctx)=>noteParts(f,ctx?ctx.accepted(f):acceptedQ(f),noteData(ctx?ctx.p:undefined));
export const factText=f=>partsText(partsOf(f),noteData().terms);
// the same for a stored note, read against its own pair and answers (`ctx`, review/exercise.js noteContext)
export const factTextIn=(f,ctx)=>partsText(partsOf(f,ctx),noteData(ctx.p).terms);
// the terms with their A/B markers and the "not" as the questions show them; why a denied term follows goes on a line under it
const notW=()=>el("span",{class:"not",text:"not"});
// `mark(text,key)` is the text with the Dudra terms it names underlined (withTerms), for a note that has a `where` to key them by
function partNode(p,mark,pair){
  switch(p.kind){
    case "term": return ["It follows it is ",p.not?[notW()," "]:null,termNode(p.side,pair),p.reason?[", because ",...mark(p.reason,"r")]:null,".",p.why?el("span",{class:"fwhy"},mark(p.why,"w")):null];
    case "unsure": return ["Whether it is ",termNode(p.side,pair)," is not settled",p.say?[": ",...mark(p.say,"s")]:"","."];
    default: return [p.text];
  }
}
export const whyHead=()=>el("span",{class:"clh",text:"Why?"});
/**
 * A fact line's note: "Take S:" after the given heading, the consequences as a list, and the conclusion when there is one. `where`
 * names the note: the terms its texts name are underlined, each once in a line of the list, and the definition of the one tapped
 * opens under that line.
 */
export function factNode(f,head,where,ctx){
  const parts=partsOf(f,ctx), mid=parts.filter(p=>p.kind!=="take"&&p.kind!=="end");
  return el("div",{class:"fnote"},el("p",{class:"ftake"},head?[head," "]:null,"Take ",el("i",{text:f.example}),":"),
    el("ul",{class:"fsteps"},mid.map((p,k)=>{
      const keys=[], seen=new Set(), mark=(t,kind)=>{ const key=where+"."+k+kind; keys.push(key); return withTerms(t,key,seen); };
      const body=partNode(p,where?mark:t=>t,ctx&&ctx.p);
      return el("li",null,...body,...keys.map(defCard));
    })),parts.filter(p=>p.kind==="end").map(p=>el("p",{text:p.text})));
}
// the newest explanation (a pair of one's own that Claude left unsettled can be asked again): the notes and the Why panel show that one, earlier turns stay in the chat
function latestExplain(ok=/** @type {(t:any)=>boolean} */(()=>true)){
  const chat=(state.ui&&state.ui.chat)||[];
  for(let i=chat.length-1;i>=0;i--){ const t=chat[i]; if(t.role==="assistant"&&t.kind==="explain"&&ok(t)) return t; }
  return null;
}
export function explainParts(){
  const out={cells:{},facts:{},rest:[]};
  const a=latestExplain(t=>!t.pending&&t.content);
  if(!a) return out;
  for(const ln0 of a.content.split("\n")){
    const f=parseFactLine(ln0); if(f){ out.cells[f.cell]=factText(f); out.facts[f.cell]=f; continue; }
    const ln=ln0.replace(/^[-•*\s]+/,"").replace(/\*\*/g,"").replace(VERDICT_RE,"").trim(); if(!ln) continue;
    const m=ln.match(/^(both|a not b|b not a|neither|q[1-4])\s*:\s*(.+)$/i);
    if(m){ out.cells[NAME_CELL[m[1].toLowerCase()]]=m[2].replace(WHY_LEAD,""); continue; }
    const g=ln.match(/^([A-Za-z][A-Za-z0-9 ,'’-]{0,28}):\s+(.*)$/);
    if(g&&REL_LABEL.test(g[1])) out.rest.push([g[1],g[2]]);
  }
  return out;
}
// the "?" on a cell that Claude explained; it opens a small note as a row of the table, right under the cell's row
export function whyBtn(c,p){
  if(!state.ui||!state.ui.checked||!explainParts().cells[c]) return null;
  return el("button",{type:"button",class:"qm","aria-label":"Claude's explanation: "+cellLabel(c,p),"aria-expanded":state.ui.pop===c?"true":"false",
    onclick:e=>{ e.stopPropagation(); state.ui.pop=state.ui.pop===c?null:c; render(); }},"?");
}
// the "?" beside the relation's name: Claude's lines on the common locus, the pervasion and the relation itself
export function relWhy(){
  if(!state.ui||!state.ui.checked||!explainParts().rest.length) return null;
  return el("button",{type:"button",class:"qm rq","aria-label":"Claude's explanation of the relation","aria-expanded":state.ui.pop==="rel"?"true":"false",
    onclick:e=>{ e.stopPropagation(); state.ui.pop=state.ui.pop==="rel"?null:"rel"; render(); }},"?");
}
export function relPopNode(){
  if(!state.ui||!state.ui.checked||state.ui.pop!=="rel") return null;
  const rest=explainParts().rest; if(!rest.length) return null;
  const fl=aiFlag(aiCase("explain","Claude’s note on the relation",rest.map(([k,t])=>k+": "+t).join("\n"),"rel"),"pop:rel");
  return el("div",{class:"pop rpop",role:"dialog","aria-label":"Claude's explanation of the relation",tabindex:"-1"},el("p",{class:"clh",text:"Why?"}),fl,
    rest.flatMap(([k,t],i)=>[el("p",null,k?el("b",{text:k+": "}):null,withTerms(t,"rel"+i,new Set())),defCard("rel"+i)]),flagEditorNode("pop:rel"),
    el("button",{type:"button",class:"popx",onclick:e=>{ e.stopPropagation(); state.ui.pop=null; render(); },text:"Close"}));
}
// The example a cell holds when a fact the app's server learned settled its verdict ("from an earlier check", ai/known.js); a flag on the cell's note names it, and the server
// disputes what it learned of it (docs/SERVER.md, "Learned facts"). undefined for any other cell.
export function learnedThing(c){
  const U=state.ui, r=U&&U.res&&U.res.cells[c]; if(!r||!r.learned) return undefined;
  const t=U.debate?(U.ans[QCELL.indexOf(c)]||{}).text:(U.cells[c]||{}).t;
  return String(t||"").trim().slice(0,200)||undefined;
}
export function popNode(){
  if(!state.ui||!state.ui.checked||!state.ui.pop||state.ui.pop==="rel") return null;
  const t=explainParts().cells[state.ui.pop]; if(!t) return null;
  const fl=aiFlag(aiCase("explain","Claude’s note on "+(state.ui.debate?"Q"+(QCELL.indexOf(state.ui.pop)+1):CELL_NAME[state.ui.pop]),t,state.ui.pop,undefined,learnedThing(state.ui.pop)),"pop:"+state.ui.pop), seen=new Set();
  const f=explainParts().facts[state.ui.pop];
  return el("div",{class:"pop",role:"dialog","aria-label":"Claude's explanation",tabindex:"-1"},f?null:el("p",{class:"clh",text:"Why?"}),fl,f?factNode(f,whyHead(),"pop:"+state.ui.pop):[el("p",null,withTerms(t,"pop:"+state.ui.pop,seen)),defCard("pop:"+state.ui.pop)],flagEditorNode("pop:"+state.ui.pop),
    el("button",{type:"button",class:"popx",onclick:e=>{ e.stopPropagation(); state.ui.pop=null; render(); },text:"Close"}));
}
export function placePops(){
  const pop=document.querySelector(".pop"), m=document.querySelector(".qm[aria-expanded=true]");
  if(!pop||!m) return;
  const g=pop.getBoundingClientRect(), r=m.getBoundingClientRect();
  pop.style.setProperty("--ax",Math.round(r.left+r.width/2-g.left)+"px");
  pop.scrollIntoView({block:"nearest"});
}
// The result section: a headline, one chip per aspect, and the details of one chip below them (like tabs; tapping the open chip closes it).
// With nothing chosen yet, the first chip that is not fine opens.
export function resultBlock(r,head,items){
  let open=state.ui.rtab==="auto"?((items.find(i=>i.st==="bad"||i.st==="open")||{}).key||null):state.ui.rtab;
  if(open&&!items.some(i=>i.key===open)) open=null;
  const cur=items.find(i=>i.key===open);
  const chips=el("div",{class:"vchips",role:"tablist","aria-label":"Result details"},items.map(i=>el("button",{type:"button",role:"tab",id:"vt-"+i.key,class:"vchip "+i.st,"aria-selected":open===i.key?"true":"false","aria-controls":"vpanel",
    onclick:()=>{ state.ui.rtab=open===i.key?null:i.key; render(); if(state.ui.rtab&&i.onopen) i.onopen(); }},
    i.st==="ok"||i.st==="bad"||i.st==="open"?el("span",{class:"ic","aria-hidden":"true",text:{ok:"✓",bad:"✗",open:"?"}[i.st]}):i.ic?el("span",{class:"ic","aria-hidden":"true",text:i.ic}):null,i.label)));
  const act=tutorAct();
  return el("div",{class:"verdict "+r.overall},
    el("p",{class:"vl"},el("span",{class:"v",text:head}),act),
    chips,
    cur?el("div",{class:"vpanel",id:"vpanel",role:"tabpanel","aria-labelledby":"vt-"+cur.key},cur.body()):null);
}
// Also shown when the first question failed (no conversation was kept), so that the message says why nothing came back.
// On a wide screen the tutor's conversation is in the panel at the right, not among the chips.
export const tutorItem=()=>!isWide()&&(state.ui.chat||state.ui.chatErr)?{key:"tutor",label:"Why",st:"none",body:()=>inlineExplain()}:null;
export const termsItem=p=>({key:"terms",label:"Terms",st:"none",body:()=>termsNode(p)});
function quizResult(){
  const p=state.cur.p, r=state.ui.res, k=REL[p.relation];
  const head={ok:"Right.",part:"Relation right, but not everything else.",pend:"Relation and cells right.",bad:"Not quite."}[r.overall];
  return resultBlock(r,head,[
    {key:"rel",label:"Relation",st:r.relOk?"ok":"bad",body:()=>[
      el("p",null,el("b",{text:"Relation: "}),state.ui.late?"time ran out.":r.relOk?"right.":"wrong."),
      el("p",null,(r.relOk?k.name:"The relation is "+lcRel(k.name))+": "+k.gloss(p.a,p.b).toLowerCase()+".",notaOf(p.relation)&&state.nota!=="codes"?[" ",el("span",{class:"nota math",text:notaOf(p.relation)})]:null)]},
    {key:"cells",label:"Cells",st:r.occBad?"bad":"ok",body:()=>el("p",null,el("b",{text:"Cells: "}),r.occBad?(r.occBad+" filled or left empty wrongly."):"the right ones are filled and empty.")},
    {key:"ex",label:"Examples",st:r.exBad?"bad":r.exOpen?"open":"ok",body:()=>el("p",null,el("b",{text:"Examples: "}),exLine(r,CELLS),state.ui.exLate?" Time ran out; cells you had not reached count as empty.":null)},
    termsItem(p),tutorItem(),quorumItem()].filter(Boolean));
}
// The grayed Explain opens the prompt for the Magic Key; once a key is taken, the question the reader asked for goes out (if this is still the same result).
function askAfterKey(){
  const U=state.ui;
  Promise.resolve(state.unlock.open()).then(taken=>{ if(taken&&state.ui===U&&canAsk()&&U.checked&&!U.explained&&!U.ctl) ask(null,"explain"); });
}
export const explainBtn=()=>{
  // a pair of one's own that Claude has not judged (Find a pair) can be asked again
  const r=/** @type {any} */(state.ui.res)||{};   // Syllogisms have no result of cells
  if(!state.ui.checked||(state.ui.explained&&!r.relOpen)||state.ui.ctl) return null;
  if(canAsk()) return el("button",{class:"btn ghost xpl",type:"button",onclick:()=>ask(null,"explain"),text:state.ui.explained?"Ask again":r.exOpen||r.relOpen?"Check and explain":"Explain"});
  // The server has a tutor but this device has no Magic Key: the button is there, grayed, and says what it needs when tapped.
  if(state.unlock&&state.unlock.tutor) return el("button",{class:"btn ghost xpl needs-key",type:"button","aria-disabled":"true",title:"Explain needs the Magic Key",onclick:askAfterKey},lockIcon(),"Explain");
  return null;
};
/** The forward button of a checked pair (shell/pbar.js). */
export const nextFwd=()=>({label:state.cur.retry&&!state.retryQ.length?"Back to new pairs":"Next pair",hint:"N",onclick:()=>next()});
export const kbHints=(...rows)=>el("div",{class:"kbh"},rows.map(([k,t])=>el("span",null,el("b",{text:k}),t)));
// `rel(a)` is the relation named under an answer: the pair's, or in Find a pair the one it was asked for
export function recentNode(c,list,rel=a=>a.key){
  if(!list.length) return;
  c.append(el("details",{class:"recent",open:state.recentOpen,ontoggle:e=>{ state.recentOpen=e.target.open; try{ localStorage.setItem("rd-recent",state.recentOpen?"1":"0"); }catch(_){} }},
    el("summary",{class:"label"},el("span",{class:"rmk","aria-hidden":"true"}),"Recent",el("span",{class:"hint",text:String(list.length)})),
    el("ul",{class:"hist"},list.map(a=>{
      const g=gradeOf(a);
      return el("li",null,el("span",{class:"s "+g,text:{ok:"✓",part:"~",bad:"✗",pend:"?"}[g]||"✗"}),
        el("span",null,a.a+" / "+a.b,el("small",{text:REL[rel(a)]?REL[rel(a)].name:""})),el("small",{text:ago(a.at)}));
    }))));
}

export function renderQuiz(s,c){
  if(isWide()) quizWide(s,c); else quizNarrow(s);
  errLines(s);
}
/** A favorite or a skip that could not be saved was undone: it is said on the screen, above the pair bar (which stays the last child of the stage). */
export function errLines(s){
  const bar=s.querySelector(":scope > .pbar");
  for(const m of [state.favErr,state.skipErr]) if(m){ const n=el("p",{class:"status",text:m}); if(bar) s.insertBefore(n,bar); else s.append(n); }
}
function quizWide(s,c){
  const p=state.cur.p, u=state.ui;
  quizHead(s,true);
  s.append(relStrip(choose,u.checked||u.late));
  s.append(relCap());
  if(!state.ui.checked){ const vb=voiceBar(); if(vb) s.append(vb); }
  s.append(el("div",{class:"section"}, el("p",{class:"label"},"Examples",el("span",{class:"hint",text:"∅ = nothing exists. Neither also takes a non-existent."})), exGrid(p,quizCell,true)));
  // the result stays in the middle, under the table; the tutor's conversation is in the panel at the right
  if(u.checked){ s.append(quizResult()); if(u.saveErr) s.append(el("p",{class:"status",text:u.saveErr})); }
  s.append(pairBar(u.checked?nextFwd():u.rel?{label:"Check",onclick:()=>check()}:null));       // before a relation is picked the cells are closed and there is nothing to check
  coachInto(c,answerList().slice(-5).reverse(),a=>a.key,u.checked?[["N","next pair"],["F","favorite"]]:[["1–5","relation"],["Enter","next cell"],["S","skip"],["F","favorite"]]);
}
/**
 * The panel at the right of a wide screen, when it is open: the tutor's conversation once there is one (a checked pair has its follow-up field from the start),
 * the last answers, and the keys. It opens with the chat button of the top bar, and by itself when an explanation is asked for; it closes with the pair it was
 * opened for.
 */
export function coachInto(c,list,rel,keys){
  if(!isWide()||!state.coachOpen||!state.ui) return;
  if(state.ui.chat||state.ui.chatErr||(state.ui.checked&&canAsk())) c.append(el("p",{class:"label"},"Tutor"),renderTutor()); // a checked pair has the follow-up field even before the first question, as on a phone
  recentNode(c,list,rel);
  c.append(kbHints(...keys));
}
const SKIPPED=()=>CELLS.filter(k=>REL[state.ui.rel].empty.includes(k));
export const fillable=()=>CELLS.filter(k=>!REL[state.ui.rel].empty.includes(k));
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
export function cellView(s){
  const order=fillable();
  state.ui.ci=Math.max(0,Math.min(state.ui.ci||0,order.length-1)); state.ui.seen=Math.max(state.ui.seen||0,state.ui.ci);
  const c=order[state.ui.ci], last=state.ui.ci===order.length-1;
  // the 2x2 map has the table's layout; a square carries the number of its cell, as in "Cell 2 of 3", and a skipped one stays blank
  const map=el("div",{class:"cmap","aria-hidden":"true"},CELLS.map(k=>el("i",{class:REL[state.ui.rel].empty.includes(k)?"lock":k===c?"now":state.ui.cells[k].t.trim()?"fill":"",text:REL[state.ui.rel].empty.includes(k)?"":String(order.indexOf(k)+1)})));
  const skipped=SKIPPED(), skipTxt=skipped.length?(state.ui.find?"Empty by this relation: ":"Skipped by your relation: ")+skipped.map(k=>CELL_FULL[k]).join("; ")+".":"";
  const inp=el("input",{type:"text",id:"cin",placeholder:"example",value:state.ui.cells[c].t,"aria-label":cellLabel(c,state.cur.p),autocomplete:"off",autocapitalize:"off",enterkeyhint:last?"done":"next"});
  inp.addEventListener("input",e=>{state.ui.cells[c].t=e.target.value;});
  const go=()=>{
    if(last){ if(document.activeElement) document.activeElement.blur(); check(); }
    else { state.ui.ci++; render(); focusCin(); }
  };
  inp.addEventListener("keydown",e=>{ if(e.key==="Enter"){ e.preventDefault(); go(); } });
  s.append(el("div",{class:"cview"},
    el("div",{class:"cmeta"},map,el("div",{class:"cwho"},el("span",{class:"n",text:"Cell "+(state.ui.ci+1)+" of "+order.length}),el("small",{text:CELL_FULL[c]}))),
    cellPrompt(c),
    el("div",{class:"cin"},inp),
    voiceBar(),
    el("p",{class:"chint"},
      state.ui.ci>0?el("button",{type:"button",class:"back",onclick:()=>{state.ui.ci--; render(); focusCin();},text:"‹ Back"}):null,
      "Leave it empty if nothing exists here."+(skipTxt?" "+skipTxt:""))),
    pairBar({label:last?"Check":"Next cell",onclick:go}));
}
// the explanation on the narrow result screen; follow-up questions go to the chat view
// The Why panel repeats nothing the "?" marks show: not the cells, not the common locus, the pervasion or the relation. When the answer was right it shows
// only a pointer to the marks; when it was wrong, the explanation and the misconception. The chat view ("Discuss with AI") shows the whole answer.
const CELL_LN=/^[-•*\s]*(?:\*\*)?(?:both|a not b|b not a|neither|q[1-4])(?:\*\*)?\s*:/i;
const REL_LN=/^[-•*\s]*(?:\*\*)?(?:common locus|pervasion|relation)(?:\*\*)?\s*:/i;
export function fillTurn(node,t,lean){
  if(!lean||t.kind!=="explain"||!t.content||(state.ui&&state.ui.syllogism)){ fillAns(node,t.content); return; }   // Syllogisms have no marks that show part of it
  const raw=String(t.content), lines=raw.split("\n");
  if(t.pending&&!/\n\s*$/.test(raw)) lines.pop();           // the last line may still be growing
  const wrong=!!(state.ui&&state.ui.res&&(state.ui.res.overall==="bad"||state.ui.res.overall==="part"||state.ui.res.relOpen)); // a pair Claude has not judged is not "right" either
  const rest=wrong?lines.filter(l=>l.trim()&&!CELL_LN.test(l.trim())&&!REL_LN.test(l.trim())).join("\n"):"";
  if(rest||t.pending){ fillAns(node,rest); return; }
  node.replaceChildren(el("p",{class:"status",text:"Claude's notes on the cells and the relation are on the ? marks."}));
}
function inlineExplain(){
  if(!state.ui.chat&&!state.ui.chatErr) return null;
  const box=el("div",{class:"tutor"}), first=latestExplain()||(state.ui.chat||[]).find(t=>t.role==="assistant");
  if(first){ const a=el("div",{class:"ans",id:first.pending&&state.view!=="chat"?"ans-live":null}); fillTurn(a,first,true); decorateAns(a,first,state.ui.chat.indexOf(first),false); box.append(a); }
  if(state.ui.chatErr&&state.view!=="chat") box.append(el("p",{class:"status",text:state.ui.chatErr}));
  return box;
}
// The tutor's button at the head of the result: Explain; while Claude answers, Stop. The follow-up conversation is the chat button of the top bar.
export function tutorAct(){
  const eb=explainBtn();
  if(eb) return eb;
  if(state.ui.ctl&&canAsk()) return el("button",{class:"btn ghost xpl",type:"button",onclick:()=>state.ui.ctl&&state.ui.ctl.abort(),text:"Stop"});
  return null;
}
function quizNarrow(s){
  const p=state.cur.p, stp=state.ui.checked?2:(!state.ui.rel||state.ui.open)?0:1;
  setSteps(["Relation","Examples","Result"],stp,[(state.ui.checked||state.ui.late)?null:()=>{ state.ui.open=true; render(); },(state.ui.checked||!state.ui.rel)?null:()=>{ state.ui.open=false; render(); focusCin(); },null]);
  quizHead(s,false);
  if(stp===0){ const vb=voiceBar(); s.append(relList(choose,"Relation"),...(vb?[vb]:[]),pairBar(null)); }
  else if(stp===1) cellView(s);
  else {
    // the table is fixed once filled in, the verdict below it changes length with the chip: the table goes first so it never moves
    s.append(el("div",{class:"section"},exGrid(p,quizCell,true)),quizResult());
    if(state.ui.saveErr) s.append(el("p",{class:"status",text:state.ui.saveErr}));
    s.append(pairBar(nextFwd()));
  }
}

// after Explain on a narrow screen the answer is below the table: bring it into view (the sticky action bar is allowed for by scroll-margin)
export function revealTutor(){ if(isWide()||state.view==="chat") return; const t=document.querySelector("#stage .tutor"); if(t) t.scrollIntoView({block:"nearest"}); }
// the tutor conversation with its own follow-up field (wide screens: in the coach panel)
export function renderTutor(){
  const box=el("div",{class:"tutor"}); tutorTurns(box,false,true);
  if(state.ui.ctl) box.append(el("div",{class:"actions"},el("button",{class:"btn ghost",type:"button",onclick:()=>state.ui.ctl&&state.ui.ctl.abort(),text:"Stop"})));
  else if(canAsk()) box.append(askRow("ask-in"));
  return box;
}
export function askRow(id){
  const inp=el("input",{type:"text",id,placeholder:"Ask a follow-up question",value:state.ui.q,autocomplete:"off","aria-label":"Follow-up question",enterkeyhint:"send"});
  inp.addEventListener("input",e=>{state.ui.q=e.target.value;});
  const send=()=>{const q=state.ui.q.trim(); if(!q) return; state.ui.q=""; ask(q);};
  inp.addEventListener("keydown",e=>{ if(e.key==="Enter"){ e.preventDefault(); e.stopPropagation(); send(); } });
  return el("div",{class:"ask"}, inp, el("button",{class:"btn ghost",type:"button",onclick:send,text:"Ask"}));
}

// `voiced` when the relation was spoken (shell/voice.js): no field takes the focus, so a phone keeps its keyboard down
export function choose(k,voiced){
  if(state.ui.checked||state.ui.late) return;
  if(!state.ui.rel) stopTimer();
  state.ui.rel=k; state.ui.open=false; state.ui.ci=0; state.ui.seen=0; state.ui.review=false; for(const c of REL[k].empty){ state.ui.cells[c].t=""; state.ui.cells[c].none=false; }
  render();
  if(voiced) return;
  if(!isWide()){ focusCin(); return; }
  const first=CELLS.find(c=>!REL[k].empty.includes(c));
  const i=first&&$("in-"+first); if(i&&!("ontouchstart" in window)) i.focus();
}
function nextInput(c){
  const order=CELLS.filter(x=>!REL[state.ui.rel].empty.includes(x)&&!state.ui.cells[x].none);
  const i=order.indexOf(c); const n=order[i+1]; return n?$("in-"+n):null;
}
// The Examples line of a verdict.
export function exLine(r,keys){
  if(!r.exN) return "none to check.";
  // while Claude works on the open ones, a line says so (asking is done by the Check and explain button in the action row)
  const cl=r.exOpen&&state.ui.ctl?el("span",{class:"exl",text:"Claude is checking."}):null;
  if(r.exBad) return [r.exBad+" of "+r.exN+" wrong"+(r.exOpen?", "+r.exOpen+" not checked yet":"")+".",cl];
  if(r.exOpen) return [r.exOpen+" of "+r.exN+" not checked yet.",cl];
  const by=b=>keys.some(c=>r.cells[c].by===b);
  return "all "+r.exN+" fit"+(by("claude")?" (checked with Claude).":by("course")?" (checked by the course examples).":".");
}
// in a lineage the terms are joined by "is a" (short for "is a kind of"), small and italic; the sign > would read as "greater than"
export const isA=n=>/^[aeiou]/i.test(n)?"is\u00a0an":"is\u00a0a";
export const isaTxt=s=>String(s).split("\uE000").flatMap((x,i)=>i?[" ",el("i",{class:"isa",text:isA(x)})," ",x]:[x]);
export function fbNode(r){ return el("div",{class:"fb"}, el("b",{text:r.msg[0]}), r.msg[2]?[" ",el("i",{text:r.msg[2]})]:null, isaTxt(r.msg[1]||"")); }
