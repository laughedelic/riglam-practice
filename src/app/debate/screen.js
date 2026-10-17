import { state } from "../state.js";
import { aiCase, aiFlag, flagEditorNode } from "../ai/flags.js";
import { labItem } from "../ai/lab-panel.js";
import { L, el } from "../core/dom.js";
import { REL, cellLabel, lcRel, notaOf, notaParts } from "../core/rel.js";
import { isWide } from "../core/viewport.js";
import { backWhy, chooseD, debateList, sayQ, submitWhy } from "./flow.js";
import { QCELL, Wd, ansNode, qNode } from "./text.js";
import { favBtn } from "../practice/favorites.js";
import { exLine, explainBtn, explainParts, factNode, fbNode, isaTxt, kbHints, nextBtn, recentNode, relCap, relList, relPopNode, relStrip, relWhy, resultBlock, termsItem, tutorAct, tutorItem, whyBtn, whyHead } from "../practice/screen.js";
import { skipActs, subRowNode } from "../practice/skips.js";
import { exGrid } from "../review/review.js";
import { fitPair, render, setSteps } from "../shell/render.js";
import { blitzBtn, relTimedD, timerSlot } from "../shell/timers.js";

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
      el("p",null,(r.relOk?k.name:"The relation is "+lcRel(k.name))+": "+k.gloss(p.a,p.b).toLowerCase()+".",notaOf(p.relation)&&state.nota!=="codes"?[" ",el("span",{class:"nota math",text:notaOf(p.relation)})]:null)]},
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
        // the tutor's note on an accepted question names its own counter-example, so the reference's is not shown beside it
        ex.facts[c]&&a.say!=="why"?null:el("span",{class:"fbq"},el("b",{text:rr.msg[0]}),rr.msg[2]?[" ",el("i",{text:rr.msg[2]})]:null,isaTxt(rr.msg[1]||"")),
        ex.cells[c]?el("span",{class:"cl"},ex.facts[c]?null:whyHead(),aiFlag(aiCase("explain","Claude’s note on Q"+(i+1),ex.cells[c],c),"q:"+c),ex.facts[c]?factNode(ex.facts[c],whyHead()):ex.cells[c]):null,
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
export function renderDebate(s,c){
  const w=isWide(), p=state.cur.p, u=state.ui, stage=u.checked?"done":u.step<4?"ask":"rel";
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
    card.append(timerSlot("ex",state.blitz));
    s.append(card);
  }

  if(stage==="rel"||stage==="done"){
    if(w) s.append(...[relStrip(chooseD,stage==="done"),stage==="rel"?timerSlot("rel",relTimedD()):null,relCap("Pick the relation your answers give (keys 1–5). Picking it checks your answers.")].filter(Boolean)); // append(null) would write the text "null"
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
  if(state.favErr) s.append(el("p",{class:"status",text:state.favErr}));
  if(state.skipErr) s.append(el("p",{class:"status",text:state.skipErr}));

  if(!w) return;
  // the coach panel
  if(stage!=="done"){
    recentNode(c,debateList().slice(-5).reverse());
    c.append(stage==="ask"?kbHints([Wd().ak,Wd().acc.toLowerCase()],[Wd().wk,Wd().why.toLowerCase()],["S","skip"],["F","favorite"]):kbHints(["1–5","relation, checks"],["S","skip"],["F","favorite"]));
    return;
  }
  c.append(el("p",{class:"label"},"Result"),debateResult(u,p));
  if(u.saveErr) c.append(el("p",{class:"status",text:u.saveErr}));
  const eb=explainBtn(); if(eb) c.append(el("div",{class:"actions left"},eb));
  c.append(kbHints(["Enter","next pair"],["F","favorite"]));
}
