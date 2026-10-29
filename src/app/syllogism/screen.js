import { state } from "../state.js";
import { el } from "../core/dom.js";
import { isWide } from "../core/viewport.js";
import { canAsk } from "../core/ask.js";
import { next } from "../practice/queue.js";
import { kbHints, renderTutor, tutorAct, tutorItem } from "../practice/screen.js";
import { pairBar } from "../shell/pbar.js";
import { ago } from "../shell/render.js";
import { REPLIES, syllogismPieces } from "../../domain/syllogism.ts";
import { backSyllogism, keyOfReply, syllogismList, shownSyllogism, exampleSyllogism, saySyllogism } from "./flow.js";

/* ---------- Syllogisms: the screen ---------- */
// One card holds the syllogism, set in its three parts (the subject, the predicate, the reason). Under it the three replies, in the
// order of the checks; after a right "there is no pervasion" the card asks for a counter-example instead; then the result: whether the reply was right, what was mixed
// up if it was not, and one sheet with the three checks (the reason, the pervasion, the thesis), each with the line that shows it. See flow.js for the steps.
const SAY={accept:"Accept",reason:"The reason is not established",pervasion:"There is no pervasion"};
const SAID={accept:"accept it",reason:"the reason is not established",pervasion:"there is no pervasion"};
// what a check is called, and what it comes to when it holds and when it does not (a check that does not hold is the fault to find, not a wrong answer)
const CHECKS=/** @type {const} */([["e","Reason","established","not established"],["v","Pervasion","holds","no pervasion"],["t","Thesis","true","false"]]);

// the sentence, with the subject, the predicate and the reason set apart
const sentence=c=>el("p",{class:"sylt",lang:"en"},syllogismPieces(c,state.syllogismWording).map(x=>typeof x==="string"?x:el("b",{class:"syl-"+x.part,text:x.text})));

// the structure, for a beginner (the option "Show the structure"): which part is which, and what each reply says in S, P and R
const KEY=/** @type {const} */([["S","subject","the subject","what the syllogism is about"],["P","predicate","the predicate","what is said of it"],["R","reason","the reason","what is offered as proof"]]);
const MEANS={reason:"S is not R.",pervasion:"S is R, but not everything that is R is P.",accept:"S is R, and everything that is R is P."};
const structure=c=>el("ul",{class:"sylkey","aria-label":"The parts of the syllogism"},KEY.map(([letter,part,name,what])=>
  el("li",null,el("span",{class:"sylkl",text:letter}),el("span",{class:"sylkd"},el("b",{text:name+": "}),el("b",{class:"syl-"+part,text:c[part]}),el("small",{text:what})))));

// the replies in the order of the checks, each with its own tint and its number (the key that gives it); with the structure shown, each also says what it means (its name stays the reply, the meaning is its description)
function replies(){
  return el("div",{class:"sylask",role:"group","aria-label":"Your reply"},REPLIES.map(r=>
    el("button",{type:"button",class:"btn ghost sylsay "+r,onclick:()=>saySyllogism(r),...(state.syllogismGuide?{"aria-label":SAY[r],"aria-describedby":"sylmean-"+r}:{})},el("span",{class:"syln","aria-hidden":"true",text:keyOfReply(r)}),
      state.syllogismGuide?el("span",{class:"sylwords"},SAY[r],el("small",{class:"sylmeans",id:"sylmean-"+r,text:MEANS[r]})):SAY[r])));
}
// after a right "there is no pervasion": a thing that is the reason and is not the predicate; empty goes on without one
function exampleStep(c){
  const u=state.ui;
  const inp=el("input",{type:"text",id:"sylex",placeholder:"Name a counter-example","aria-label":"A counter-example: something that is "+c.reason+" and is not "+c.predicate,value:u.exText,autocomplete:"off",autocapitalize:"off",spellcheck:"false",enterkeyhint:"done"});
  const note=el("p",{class:"sylnote",role:"status",hidden:!u.exNote,text:u.exNote||""});   // "that is the subject itself": until something else is typed
  inp.addEventListener("input",e=>{ u.exText=e.target.value; if(u.exNote){ u.exNote=""; note.hidden=true; } });
  inp.addEventListener("keydown",e=>{
    if(e.key==="Enter"){ e.preventDefault(); e.stopPropagation(); exampleSyllogism(); }
    else if(e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); backSyllogism(); }
  });
  return el("div",{class:"sylex"},
    el("p",{class:"sylright"},el("span",{class:"m ok","aria-hidden":"true",text:"✓"}),el("b",{text:"Right: "}),SAID.pervasion+"."),
    el("p",{class:"sylask2"},"Name something that is ",el("b",{class:"syl-reason",text:c.reason})," and is not ",el("b",{class:"syl-predicate",text:c.predicate}),"."),
    el("div",{class:"ansrow"},inp),
    note,
    el("p",{class:"chint"},el("button",{type:"button",class:"back",onclick:backSyllogism,text:"‹ Back"}),"Leave it empty to go on without one."));
}

// the result: the reply and what was mixed up (in the box that says right or not), then the three checks on one sheet, with the learner's counter-example under the
// pervasion. A check that does not hold is marked in its own way, not as a wrong answer: it is the fault the reply had to find. The first one that fails is the one
// the reply is about.
function result(){
  const u=state.ui, c=shownSyllogism(), g=u.grade, first=(CHECKS.find(([k])=>!c.checks[k].ok)||[])[0];
  return [
    el("div",{class:"verdict sylres "+u.overall},
      el("p",{class:"vl"},el("span",{class:"v",text:g.correct?u.overall==="part"?"Right, but the counter-example is not one.":"Right.":u.timeout?"Time is up.":"Not quite."}),tutorAct()),
      g.correct?null:el("p",{class:"sylwhat"},(g.said?"You said “"+SAID[g.said]+"”. ":"")+"The right reply is “"+SAID[g.expected]+"”."),
      g.correct||!g.confusion?null:el("p",{class:"sylconf",text:g.confusion})),
    el("ol",{class:"sylchecks","aria-label":"The three checks, in the order they are made"},CHECKS.map(([k,label,yes,no],i)=>
      el("li",{class:"sylchk "+(c.checks[k].ok?"holds":"fails")+(k===first?" first":"")},
        el("span",{class:"sylcn","aria-hidden":"true",text:String(i+1)}),
        el("div",{class:"sylcb"},
          el("p",{class:"sylch"},el("b",{text:label}),el("span",{class:"sylst",text:c.checks[k].ok?yes:no})),
          el("p",{class:"sylcl",text:c.checks[k].line}),
          // the learner's counter-example is judged under the pervasion it is about, after the line that says the pervasion fails
          k==="v"&&u.ex?el("p",{class:"sylmine"},el("span",{class:"m "+(u.ex.v==="ok"?"ok":u.ex.v==="bad"?"bad":"cmp"),"aria-hidden":"true",text:{ok:"✓",bad:"✗",cmp:"?"}[u.ex.v]}),el("b",{text:"Your counter-example: "}),u.ex.text+". "+u.ex.line):null))))
  ];
}

// the tutor's explanation under the checks on a narrow screen (on a wide one it is in the panel at the right); follow-up questions go to the chat view
function explanation(){
  const t=tutorItem(); if(!t) return [];
  return [el("div",{class:"sylwhy"},el("p",{class:"label"},"Claude"),t.body())];
}

// the last answers, newest first, in the panel at the right of a wide screen
function recent(box){
  const list=syllogismList().slice(-5).reverse(); if(!list.length) return;
  box.append(el("details",{class:"recent",open:state.recentOpen,ontoggle:e=>{ state.recentOpen=e.target.open; try{ localStorage.setItem("rd-recent",state.recentOpen?"1":"0"); }catch(_){} }},
    el("summary",{class:"label"},el("span",{class:"rmk","aria-hidden":"true"}),"Recent",el("span",{class:"hint",text:String(list.length)})),
    el("ul",{class:"hist"},list.map(a=>el("li",null,el("span",{class:"s "+a.grade,text:{ok:"✓",part:"~",bad:"✗"}[a.grade]||"✗"}),
      el("span",null,a.subject,el("small",{text:"because "+a.reason+", so "+a.predicate})),el("small",{text:ago(a.at)}))))));
}

export function renderSyllogism(s,c){
  const u=state.ui, k=shownSyllogism(), w=isWide();
  const card=el("div",{class:"qcard sylcard"},sentence(k));
  if(u.step===0&&state.syllogismGuide) card.append(structure(k));
  if(u.step===0) card.append(replies());
  if(u.step===1) card.append(exampleStep(k));
  s.append(card);
  if(u.checked) s.append(...result(),...(explanation()),...(u.saveErr?[el("p",{class:"status",text:u.saveErr})]:[]));
  s.append(pairBar(u.checked?{label:"Next",hint:"N",onclick:()=>next()}:u.step===1?{label:"Check",onclick:()=>exampleSyllogism()}:null));
  if(!w||!state.coachOpen) return;
  if(u.chat||u.chatErr||(u.checked&&canAsk())) c.append(el("p",{class:"label"},"Claude"),renderTutor());   // a checked syllogism has the follow-up field even before the first question, as on a phone
  recent(c);
  c.append(kbHints(...(u.checked?[["N","next syllogism"]]
    :u.step===1?[["Enter","check"],["Esc","back"],["S","skip"]]
    :[...REPLIES.map(r=>[keyOfReply(r),SAID[r]]),["S","skip"]])));
}
