import { state } from "../state.js";
import { quorumItem } from "../ai/quorum-panel.js";
import { canAsk } from "../core/ask.js";
import { L, el } from "../core/dom.js";
import { CELLS, ORDER, REL, lcRel, notaOf, notaParts } from "../core/rel.js";
import { isWide } from "../core/viewport.js";
import { favBtn } from "../practice/favorites.js";
import { next } from "../practice/queue.js";
import { cellView, exLine, explainBtn, kbHints, quizCell, recentNode, relPopNode, relWhy, resultBlock, termsItem, tutorAct, tutorItem } from "../practice/screen.js";
import { skipActs, subRowNode } from "../practice/skips.js";
import { exGrid } from "../review/review.js";
import { fitPair, render, setSteps } from "../shell/render.js";
import { sessBtn } from "../shell/session.js";
import { checkFind, chooseRel, editPair, findList, usePair } from "./flow.js";

/* ---------- Find a pair: the screen ---------- */
// The same parts as Relations (the heading with the diamond, the table of examples, one cell at a time on a phone, the result with its chips), with a first step
// in which the learner names the pair and a relation that is given, not picked. See flow.js for the steps.
const nextBtn=()=>el("button",{class:"btn",type:"button",onclick:next,text:"Next relation"});
// the relation asked for, in the words of the course, with the letters A and B since the pair is the learner's
const cap=()=>{ const r=REL[state.ui.rel]; return el("p",{class:"cap"},el("b",{text:r.name+". "}),r.gloss("A","B")+"."); };

// the diamond shows the relation asked for, with the pair on both sides once it is named; checked, it is lapis when the pair has the relation and vermilion when it has not.
// Until the result it is a button: it opens the choice of relation (relPicker).
function findHead(s){
  const u=state.ui, p=state.cur.p, r=u.checked?u.res:null, np=notaParts(u.rel), name=REL[u.rel].name;
  const st=r&&!r.relOpen?(r.relOk?" key":" wrong"):"";
  const toggle=()=>{ if(!u.checked){ u.open=!u.open; render(); } };
  const mid=el("button",{type:"button",class:"mid set"+st,disabled:u.checked,"aria-expanded":u.checked?null:(u.open?"true":"false"),"aria-label":"Relation asked for: "+name+(u.checked?"":". Change"),onclick:toggle},
    el("span",{class:"sym math",text:np[0]+(np[1]?" "+np[1]:"")}));
  const picked=!u.checked&&state.findRel?" · your choice":"";
  if(u.step===0){ s.append(el("div",{class:"head"},mid,subRowNode({text:name+picked,disabled:false,onclick:toggle}))); return; }
  const tail=np[2]?el("span",{class:"tail math"+st,text:np[2]}):null;
  s.append(el("div",{class:"head"},
    el("div",{class:"pair",lang:"en"},el("span",{class:"tx ta",text:p.a}),L("A"),mid,L("B"),el("span",{class:"tx tb"},p.b,tail)),
    subRowNode({text:r&&!r.relOpen&&!r.relOk?"Not "+lcRel(name):name+picked,cls:st,disabled:u.checked,onclick:toggle,why:relWhy()})));
  const rp=relPopNode(); if(rp) s.append(rp);
  fitPair();
}

// The choice of relation, in place of the step under the heading while it is open: Random (a different relation each time, the default) and the five relations.
// A relation picked here stays for the next pairs until Random is picked, and also applies to the pair on screen: the words and the examples stay.
function relPicker(){
  const u=state.ui, list=el("div",{class:"rels",role:"group","aria-label":"Relation to practice"});
  const item=(k,name,gloss,nota,on)=>el("button",{type:"button",class:"rel"+(k?"":" rand"),"aria-pressed":on?"true":"false",onclick:()=>chooseRel(k)},
    el("span",null,el("span",{class:"name",text:name}),el("span",{class:"gloss",text:gloss})),
    el("span",{class:"nota math",text:nota}));
  list.append(item(null,"Random",u.step===0?"A different relation each time":"A different relation for the next pairs","any",!state.findRel));
  for(const k of ORDER) list.append(item(k,REL[k].name,REL[k].gloss("A","B"),notaOf(k),state.findRel===k));
  return el("div",{class:"section fpick"},
    el("p",{class:"label"},"Relation",el("span",{class:"hint",text:"stays until you pick Random"})),
    el("p",{class:"note faint",text:u.step===0?"Pick the relation to work with. Your words stay.":"Pick another relation for this pair. Your examples stay, except one in a cell the new relation leaves empty."}),
    list,
    el("div",{class:"actions left"},el("button",{type:"button",class:"btn ghost",onclick:()=>{ u.open=false; render(); },text:"Cancel"})));
}

// step 0: the two phenomena, in the learner's words; a label of the practice categories is offered while typing
function pairStep(s,c){
  const u=state.ui;
  s.append(cap());
  const go=el("button",{type:"button",class:"btn",onclick:usePair,disabled:!(u.wordA.trim()&&u.wordB.trim()),text:"Use this pair"});
  const err=el("p",{class:"ferr",role:"alert",text:u.pairErr});
  const word=(k,key,what)=>{
    const inp=el("input",{type:"text",id:"fw-"+k,placeholder:what+" phenomenon",value:u[key],"aria-label":what+" phenomenon, "+k.toUpperCase(),autocomplete:"off",autocapitalize:"off",spellcheck:"false",list:state.findSuggest?"fw-terms":null,enterkeyhint:k==="a"?"next":"done"});
    inp.addEventListener("input",e=>{ u[key]=e.target.value; go.disabled=!(u.wordA.trim()&&u.wordB.trim()); if(u.pairErr){ u.pairErr=""; err.textContent=""; } });
    inp.addEventListener("keydown",e=>{
      if(e.key!=="Enter") return;
      e.preventDefault();
      const other=document.getElementById("fw-b");
      if(k==="a"&&other) other.focus(); else usePair(); // Enter in the first field always goes to the second, which is the one that submits
    });
    return el("div",{class:"fw"},L(k.toUpperCase()),inp);
  };
  s.append(el("div",{class:"section fpair"},
    el("p",{class:"label"},"Your pair",el("span",{class:"hint",text:state.findSuggest?"course terms or your own words":"whatever comes to mind"})),
    word("a","wordA","First"),word("b","wordB","Second"),err,
    state.findSuggest?el("datalist",{id:"fw-terms"},(state.DATA?state.DATA.cats:[]).map(cat=>el("option",{value:cat.labels[0]}))):null));
  s.append(el("div",{class:"actions"},
    el("button",{type:"button",class:"btn ghost",onclick:()=>{ u.open=true; render(); },text:state.findRel?"Change relation":"Choose relation"}),
    ...(isWide()?skipActs(""):[]),sessBtn(),go));
  if(u.focusA){ u.focusA=false; setTimeout(()=>{ const i=document.getElementById("fw-a"); if(i&&(document.activeElement===document.body||!document.activeElement)&&!("ontouchstart" in window)) i.focus({preventScroll:true}); }); }
  if(isWide()){
    recentNode(c,findList().slice(-5).reverse(),a=>a.chosen);
    c.append(kbHints(["Enter","next field, then the examples"],...(state.findRel?[]:[["S","another relation"]])));
  }
}

// the result of an answer: a headline and one chip per aspect (see resultBlock). The pair is the first aspect: a pair the course data cannot judge
// stays open until Claude has said whether it has the relation asked for.
function findResult(){
  const p=state.cur.p, u=state.ui, r=u.res, asked=REL[u.rel], actual=REL[p.relation];
  // the relation the pair has is known for a pair of the data, and for the learner's own once Claude has named another one
  const named=!p.own||p.relation!==u.rel, gl=k=>p.own?k.gloss("A","B"):k.gloss(p.a,p.b);
  const head=r.relUns?"Claude could not settle your pair."
    :r.relOpen?(u.ctl?"Claude is judging your pair.":u.explained?"Claude did not judge your pair.":"Your pair is waiting for Claude.")
    :!r.relOk?"That pair is not "+lcRel(asked.name)+"."
    :{ok:"Right.",part:"The pair has the relation, but not everything else is right.",pend:"Pair and cells right.",bad:"Not quite."}[r.overall];
  const nota=k=>notaOf(k)&&state.nota!=="codes"?[" ",el("span",{class:"nota math",text:notaOf(k)})]:null;
  const cellsOpen=r.relOpen||CELLS.some(c=>r.cells[c].v==="open"); // which cells stay empty is for the relation Claude finds, so nothing is said of them before
  return resultBlock(r,head,[
    {key:"rel",label:"Pair",st:r.relOpen?"open":r.relOk?"ok":"bad",body:()=>r.relOpen?[
        el("p",null,el("b",{text:"Pair: "}),r.relUns?"Claude could not settle it.":"not judged yet."),
        el("p",null,r.relUns?"Whether "+p.a+" and "+p.b+" are "+lcRel(asked.name)+" is not settled. Ask again, or try another pair."
          :u.explained&&!u.ctl?"Claude’s answer did not say whether they are "+lcRel(asked.name)+". Ask again."
          :"The course data does not cover this pair, so Claude judges whether it is "+lcRel(asked.name)+" ("+asked.gloss("A","B").toLowerCase()+")."+(canAsk()?"":" Claude is not available here, so it stays open."))]
      :r.relOk?[el("p",null,el("b",{text:"Pair: "}),"right."),el("p",null,asked.name+": "+gl(asked)+".",nota(u.rel))]
      :[el("p",null,el("b",{text:"Pair: "}),"wrong."),
        el("p",null,named?p.a+" and "+p.b+" are "+lcRel(actual.name)+" ("+lcRel(gl(actual))+"), not "+lcRel(asked.name)+".":"Claude says "+p.a+" and "+p.b+" are not "+lcRel(asked.name)+".",named?nota(p.relation):null)]},
    {key:"cells",label:"Cells",st:r.relOpen?"open":r.occBad?"bad":cellsOpen?"open":"ok",body:()=>el("p",null,el("b",{text:"Cells: "}),
      r.relOpen||(!r.occBad&&cellsOpen)?"which ones stay empty depends on the relation Claude finds.":r.occBad?(r.occBad+" filled or left empty wrongly."):"the right ones are filled and empty.")},
    {key:"ex",label:"Examples",st:r.exBad?"bad":r.exOpen?"open":"ok",body:()=>el("p",null,el("b",{text:"Examples: "}),exLine(r,CELLS))},
    p.own?null:termsItem(p),tutorItem(),quorumItem()].filter(Boolean));
}

export function renderFind(s,c){
  const u=state.ui, p=state.cur.p, w=isWide(), done=u.checked;
  if(!w) setSteps(["Pair","Examples","Result"],done?2:u.step,[done||u.step===0?null:editPair,null,null]);
  findHead(s);
  if(u.open&&!done){ s.append(relPicker()); return; }
  if(u.step===0){ pairStep(s,c); return; }
  const table=()=>el("div",{class:"section"},w&&!done?el("p",{class:"label"},"Examples",el("span",{class:"hint",text:"∅ = nothing exists. Neither also takes a non-existent."})):null,exGrid(p,quizCell,true));
  if(!w){
    if(!done){ cellView(s); return; }
    s.append(table(),findResult());
    if(u.saveErr) s.append(el("p",{class:"status",text:u.saveErr}));
    const acts=el("div",{class:"actions"}), ta=tutorAct(); if(ta) acts.append(ta);
    acts.append(nextBtn()); s.append(acts);
    return;
  }
  s.append(cap(),table());
  const acts=el("div",{class:"actions"}), fb=p.own?null:favBtn(p); if(fb) acts.append(fb);
  { const sb=sessBtn(); if(sb) acts.append(sb); }
  if(!done) acts.append(...skipActs("Enter moves to the next cell, then shows the result"),el("button",{type:"button",class:"btn ghost",onclick:editPair,text:"Change pair"}),el("button",{type:"button",class:"btn",onclick:checkFind,text:"Show result"}));
  else acts.append(nextBtn());
  s.append(acts);
  if(state.favErr) s.append(el("p",{class:"status",text:state.favErr}));
  if(!done){
    recentNode(c,findList().slice(-5).reverse(),a=>a.chosen);
    c.append(kbHints(["Enter","next cell"],["S","skip"],...(p.own?[]:[["F","favorite"]])));
    return;
  }
  c.append(el("p",{class:"label"},"Result"),findResult());
  if(u.saveErr) c.append(el("p",{class:"status",text:u.saveErr}));
  const eb=explainBtn(); if(eb) c.append(el("div",{class:"actions left"},eb));
  c.append(kbHints(["Enter","next relation"],...(p.own?[]:[["F","favorite"]])));
}
