import { state } from "../state.js";
import { el } from "../core/dom.js";
import { isWide } from "../core/viewport.js";
import { next } from "../practice/queue.js";
import { kbHints } from "../practice/screen.js";
import { pairBar } from "../shell/pbar.js";
import { ago } from "../shell/render.js";
import { REPLIES, consequencePieces } from "../../domain/consequence.ts";
import { backCq, cqKey, cqList, cqOf, exampleCq, sayCq } from "./flow.js";

/* ---------- Syllogisms: the screen ---------- */
// One card holds the syllogism (the code calls it a consequence), set in its three parts (the subject, the predicate, the reason). Under it the three replies, in the
// order of the checks; after a right "there is no pervasion" the card asks for a counter-example instead; then the result: whether the reply was right, what was mixed
// up if it was not, and one sheet with the three checks (the reason, the pervasion, the thesis), each with the line that shows it. See flow.js for the steps.
const SAY={accept:"Accept",reason:"The reason is not established",pervasion:"There is no pervasion"};
const SAID={accept:"accept it",reason:"the reason is not established",pervasion:"there is no pervasion"};
// what a check is called, and what it comes to when it holds and when it does not (a check that does not hold is the fault to find, not a wrong answer)
const CHECKS=/** @type {const} */([["e","Reason","established","not established"],["v","Pervasion","pervasion","no pervasion"],["t","Thesis","true","false"]]);

// the sentence, with the subject, the predicate and the reason set apart
const sentence=c=>el("p",{class:"cqt",lang:"en"},consequencePieces(c,state.cqWording).map(x=>typeof x==="string"?x:el("b",{class:"cq-"+x.part,text:x.text})));

// the replies in the order of the checks, each with its own tint and its number (the key that gives it)
function replies(){
  return el("div",{class:"cqask",role:"group","aria-label":"Your reply"},REPLIES.map(r=>
    el("button",{type:"button",class:"btn ghost cqsay "+r,onclick:()=>sayCq(r)},el("span",{class:"cqn","aria-hidden":"true",text:cqKey(r)}),SAY[r])));
}
// after a right "there is no pervasion": a thing that is the reason and is not the predicate; empty goes on without one
function exampleStep(c){
  const u=state.ui;
  const inp=el("input",{type:"text",id:"cqex",placeholder:"Name a counter-example","aria-label":"A counter-example: something that is "+c.reason+" and is not "+c.predicate,value:u.exText,autocomplete:"off",autocapitalize:"off",spellcheck:"false",enterkeyhint:"done"});
  inp.addEventListener("input",e=>{ u.exText=e.target.value; });
  inp.addEventListener("keydown",e=>{
    if(e.key==="Enter"){ e.preventDefault(); e.stopPropagation(); exampleCq(); }
    else if(e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); backCq(); }
  });
  return el("div",{class:"cqex"},
    el("p",{class:"cqright"},el("span",{class:"m ok","aria-hidden":"true",text:"✓"}),el("b",{text:"Right: "}),SAID.pervasion+"."),
    el("p",{class:"cqask2"},"Name something that is ",el("b",{class:"cq-reason",text:c.reason})," and is not ",el("b",{class:"cq-predicate",text:c.predicate}),"."),
    el("div",{class:"ansrow"},inp),
    el("p",{class:"chint"},el("button",{type:"button",class:"back",onclick:backCq,text:"‹ Back"}),"Leave it empty to go on without one."));
}

// the result: the reply, what was mixed up and the counter-example (in the box that says right or not), then the three checks on one sheet. A check that does not
// hold is marked in its own way, not as a wrong answer: it is the fault the reply had to find. The first one that fails is the one the reply is about.
function result(){
  const u=state.ui, c=cqOf(), g=u.grade, first=(CHECKS.find(([k])=>!c.checks[k].ok)||[])[0];
  return [
    el("div",{class:"verdict cqres "+u.overall},
      el("p",{class:"vl"},el("span",{class:"v",text:g.correct?u.overall==="part"?"Right, but the counter-example is not one.":"Right.":"Not quite."})),
      g.correct?null:el("p",{class:"cqwhat"},"You said “"+SAID[g.said]+"”. The right reply is “"+SAID[g.expected]+"”."),
      g.correct?null:el("p",{class:"cqconf",text:g.confusion}),
      u.ex?el("p",{class:"cqmine"},el("span",{class:"m "+(u.ex.v==="ok"?"ok":u.ex.v==="bad"?"bad":"cmp"),"aria-hidden":"true",text:{ok:"✓",bad:"✗",cmp:"?"}[u.ex.v]}),el("b",{text:"Your counter-example: "}),u.ex.text+". "+u.ex.line):null),
    el("ol",{class:"cqchecks","aria-label":"The three checks, in the order they are made"},CHECKS.map(([k,label,yes,no],i)=>
      el("li",{class:"cqchk "+(c.checks[k].ok?"holds":"fails")+(k===first?" first":"")},
        el("span",{class:"cqcn","aria-hidden":"true",text:String(i+1)}),
        el("div",{class:"cqcb"},
          el("p",{class:"cqch"},el("b",{text:label}),el("span",{class:"cqst",text:c.checks[k].ok?yes:no})),
          el("p",{class:"cqcl",text:c.checks[k].line})))))
  ];
}

// the last answers, newest first, in the panel at the right of a wide screen
function recent(box){
  const list=cqList().slice(-5).reverse(); if(!list.length) return;
  box.append(el("details",{class:"recent",open:state.recentOpen,ontoggle:e=>{ state.recentOpen=e.target.open; try{ localStorage.setItem("rd-recent",state.recentOpen?"1":"0"); }catch(_){} }},
    el("summary",{class:"label"},el("span",{class:"rmk","aria-hidden":"true"}),"Recent",el("span",{class:"hint",text:String(list.length)})),
    el("ul",{class:"hist"},list.map(a=>el("li",null,el("span",{class:"s "+a.grade,text:{ok:"✓",part:"~",bad:"✗"}[a.grade]||"✗"}),
      el("span",null,a.subject,el("small",{text:"because "+a.reason+", so "+a.predicate})),el("small",{text:ago(a.at)}))))));
}

export function renderCq(s,c){
  const u=state.ui, k=cqOf(), w=isWide();
  s.append(el("p",{class:"cap"},u.checked?"The three checks, in the order they are made. The first one that fails gives the reply; if none fails, accept."
    :"Is the syllogism right? Deny the reason, deny the pervasion, or accept it."));
  const card=el("div",{class:"qcard cqcard"},el("p",{class:"qn"},el("span",{class:"qnl"},"Syllogism")),sentence(k));
  if(u.step===0) card.append(replies());
  if(u.step===1) card.append(exampleStep(k));
  s.append(card);
  if(u.checked) s.append(...result(),...(u.saveErr?[el("p",{class:"status",text:u.saveErr})]:[]));
  s.append(pairBar(u.checked?{label:"Next",hint:"N",onclick:()=>next()}:u.step===1?{label:"Check",onclick:()=>exampleCq()}:null));
  if(!w||!state.coachOpen) return;
  recent(c);
  c.append(kbHints(...(u.checked?[["N","next syllogism"]]
    :u.step===1?[["Enter","check"],["Esc","back"],["S","skip"]]
    :[...REPLIES.map(r=>[cqKey(r),SAID[r]]),["S","skip"]])));
}
