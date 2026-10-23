import { state } from "../state.js";
import { namesTerm, termMentions } from "../../ai-shared/mentions.ts";
import { $, L, el } from "../core/dom.js";
import { lockIcon } from "../core/icons.js";
import { REL } from "../core/rel.js";
import { cap } from "../core/util.js";
import { isA } from "./screen.js";
import { catByLabel } from "./universe.js";
import { negSides, plainLabel } from "../../ai-shared/relations.ts";
import { exampleStage, examplesFor } from "../../domain/reference.ts";
import { newCategories, topStage } from "../../domain/stages.ts";
import { render } from "../shell/render.js";

// Where a category sits: the Dudra term with its higher categories, or, for an everyday category, the Dudra term it falls under.
export function lineageOf(cid){
  const c=state.CAT[cid]; if(!c||!state.DATA) return null;
  const ch=state.DATA.chains||{};
  if(c.kind==="dudra"&&c.term) return {names:ch[c.term]||[c.term],everyday:false};
  const head=(c.type||"").split(":")[0].trim(), T=cap(head);
  return {names:T?(ch[T]||[T]):[],everyday:true};
}
// the chain of higher categories as the Terms panel reads it ("form is a functional thing is an existent"); each name whose
// definition can be read is a term mark (every time it occurs), the card of the tapped one opens under the chain (`where`)
const isaChain=(names,where)=>names.flatMap((n,i)=>{
  const low=n.toLowerCase(), t=state.DATA&&state.DATA.terms[n], word=hasDef(t)?termMark(low,n,where+"/"+i):low;
  return i?[" ",el("i",{class:"isa",text:isA(low)})," ",word]:[word];
});
// The Terms panel: how the two terms relate and where each one belongs. The terms in it whose definition this device can read are
// dot-underlined, every time they occur, and open the definition under the text (see withTerms); without the Magic Key one
// note says how to read them.
export function termsNode(p){
  // a negated side ("non-(wooden things)") is not under the lineage of what it negates: it says what it takes in instead
  const box=el("div",{class:"terms"}), ca=p.catA||catByLabel(p.a), cb=p.catB||catByLabel(p.b), [na,nb]=negSides(p), lis=[!na&&ca&&lineageOf(ca),!nb&&cb&&lineageOf(cb)];
  const negType=(label,on,type)=>on?"Everything outside “"+plainLabel(String(label))+"”, including what does not exist.":type;
  // the pair's own words that name a Dudra term: its label, when it is worded as the term is (not a plainer paraphrase of it),
  // which the note quotes and the title shows
  const termOf=(li,label)=>{ const n=li&&!li.everyday&&li.names[0]||""; return n&&namesTerm(state,n,String(label))?n:""; };
  const own={}; [[p.a,lis[0]],[p.b,lis[1]]].forEach(([label,li])=>{ const n=termOf(li,label); if(n) own[String(label).toLowerCase()]=n; });
  box.append(el("p",{class:"tm-sum"},el("b",{text:REL[p.relation].name+". "}),withTerms(p.note||"","tm:s",null,{quoted:true,own})));
  const sumCard=defCard("tm:s"); if(sumCard) box.append(sumCard);
  box.append(el("div",{class:"tm-rows"},[["A",p.a,negType(p.a,na,p.typeA),lis[0]],["B",p.b,negType(p.b,nb,p.typeB),lis[1]]].map(([x,label,type,li])=>{
    const w="tm:"+x, term=termOf(li,label);
    return el("div",{class:"tm-row"},L(x),el("div",null,
      el("p",{class:"tm-t"},hasDef(state.DATA&&state.DATA.terms[term])?termMark(cap(label),term,w+"t/0"):cap(label)),defCard(w+"t"),
      li&&li.names.length?[li.everyday?el("p",{class:"tm-n",text:"An everyday category, not a Dudra term. It falls under:"}):null,el("p",{class:"tm-c"},isaChain(li.names,w+"c")),defCard(w+"c")]
        :el("p",{class:"tm-c",text:type||""})));
  })));
  if(state.unlock&&state.DATA&&lis.some(li=>li&&li.names.some(n=>state.DATA.terms[n]))) box.append(unlockNote());
  return box;
}
// Without the Magic Key the terms have no definitions to open: one note says how to read them.
function unlockNote(){
  return el("div",{class:"tm-locked"},el("p",{class:"tm-key",text:"To read the definitions of the terms here, enter the Magic Key from your study group's link."}),
    el("button",{type:"button",class:"btn ghost",onclick:()=>state.unlock.open()},lockIcon(),"Unlock definitions"));
}
// The term data marks where a definition comes from with a leading "(source)"; the course's own wording has none or "(Purbuchok)",
// and a definition that the course does not give has a tag that says so, which is not worth a label (`ref` is false: the
// chapter is not where it is from).
export function defParts(s){
  const m=/^\(([^)]*)\)\s*([\s\S]*)$/.exec((s||"").trim());
  let tag=m?m[1]:"", body=m?m[2]:(s||"").trim();
  const tail=/\s*\((tables|Dampilon)\)\s*$/.exec(body);
  if(tail){ body=body.slice(0,tail.index); tag=tag||tail[1]; }
  if(!tag||tag==="Purbuchok") return {src:"",body,ref:true};
  if(/booklet/i.test(tag)) return {src:"",body,ref:false};
  const lab={tables:"From the Dampilon tables",Dampilon:"From Dampilon"}[tag];
  return {src:lab||cap(tag),body,ref:true};
}
const endp=s=>s.replace(/[.;,\s]+$/,"")+".";
/** Whether this device can read the definition of the term: it has one, and the Magic Key is in. */
export const hasDef=t=>!!t&&!state.unlock&&!!defParts(t.d).body;

/* ---------- terms in the text ---------- */
// A text with the Dudra terms it names dot-underlined, when this device can read their definition. Tapping one opens the definition
// under the text (defCard), inside the note; with a mouse, pointing at a term shows it in a card that floats under the term
// until the pointer leaves. `where` names the text, so the open definition (state.ui.dterm) shows under that text only. With
// `seen`, a term is marked only the first time (the set collects the terms marked so far); without it, every time it occurs.
// `opts.quoted` also marks the words in quotation marks, and `opts.own` maps words to the term they name ({"minds":"Mind"}).
export function withTerms(text,where,seen,opts={}){
  const found=termMentions(state,text,{quoted:!!opts.quoted}), own=opts.own||{};
  // the words the caller knows name a term, where the matching of names does not find them (an everyday word that is also a name)
  for(const [word,term] of Object.entries(own)) for(const m of text.matchAll(new RegExp("(?<![\\w-])"+word.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"(?![\\w-])","gi"))) found.push({start:m.index,end:m.index+m[0].length,term});
  found.sort((a,b)=>a.start-b.start||b.end-a.end);
  const out=[]; let at=0;
  found.forEach((m,i)=>{
    if(m.start<at||!hasDef(state.DATA.terms[m.term])||(seen&&seen.has(m.term))) return;
    if(seen) seen.add(m.term);
    out.push(text.slice(at,m.start),termMark(text.slice(m.start,m.end),m.term,where+"/"+i));
    at=m.end;
  });
  out.push(text.slice(at));
  return out;
}
// the mark of the term with this id, when the page shows it
const markOf=id=>/** @type {HTMLElement|null} */(document.querySelector('.dterm[data-dt="'+CSS.escape(id)+'"]'));
/** Forgets an open definition whose term is not on the page any more (another note was opened, or the note was closed). */
export function dropStaleDef(){
  const d=state.ui&&state.ui.dterm;
  if(d&&!markOf(d.id)) state.ui.dterm=null;
}
/** Closes the open definition and puts the focus back on its term, so that the keyboard goes on from there. */
export function closeDef(){
  const d=state.ui&&state.ui.dterm; if(!d) return;
  state.ui.dterm=null; render();
  const m=markOf(d.id); if(m) m.focus({preventScroll:true});
}
const press=f=>e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); f(e); } };
function termMark(txt,term,id){
  const on=!!state.ui.dterm&&state.ui.dterm.id===id;
  const toggle=e=>{
    e.stopPropagation(); state.ui.dterm=on?null:{id,term,trail:[]}; render();
    const m=markOf(id); if(m) m.focus({preventScroll:true});
    const c=$("ddef"); if(c) c.scrollIntoView({block:"nearest"});
  };
  return el("span",{class:"dterm"+(on?" on":""),role:"button",tabindex:"0","data-dt":id,"aria-expanded":on?"true":"false","aria-controls":on?"ddef":null,
    onclick:toggle,onkeydown:press(toggle),onmouseenter:e=>peek(e.currentTarget,term),onmouseleave:()=>peek(null,null)},txt);
}
/** The definition opened from the text marked as `where`, to go right after that text; null when none is open there. */
export function defCard(where){
  const d=state.ui&&state.ui.dterm;
  return d&&d.id.startsWith(where+"/")&&state.DATA.terms[d.term]?cardNode(d.term,"ddef",d.trail||[]):null;
}
// A parent in the card's chain: tapping it puts that term's definition in the same card (the card keeps the way back), so a
// definition never opens another one on top of it.
function goTo(n){
  const d=state.ui.dterm; if(!d) return;
  state.ui.dterm={id:d.id,term:n,trail:[...(d.trail||[]),d.term]}; render(); focusCard();
}
function goBack(){
  const d=state.ui.dterm, trail=d&&(d.trail||[]).slice(); if(!d||!trail.length) return;
  state.ui.dterm={id:d.id,term:/** @type {string} */(trail.pop()),trail}; render(); focusCard();
}
const focusCard=()=>{ const c=$("ddef"); if(c){ c.focus({preventScroll:true}); c.scrollIntoView({block:"nearest"}); } };
function parentMark(n){
  const go=e=>{ e.stopPropagation(); goTo(n); };
  return el("span",{class:"dterm",role:"button",tabindex:"0","data-dp":n,onclick:go,onkeydown:press(go)},n.toLowerCase());
}
// where the term sits, under its name: "is a functional thing is an existent", each higher category that has a readable definition
// can be opened (`live`; a floating card is not)
function upLine(n,live){
  const names=((state.DATA.chains||{})[n]||[n]).slice(1); if(!names.length) return null;
  return el("dd",{class:"tm-up"},el("p",null,names.flatMap((m,i)=>{
    const low=m.toLowerCase(), word=live&&hasDef(state.DATA.terms[m])?parentMark(m):low;
    return [i?" ":"",el("i",{class:"isa",text:isA(low)})," ",word];
  })));
}
// How well the sources confirm an example (the reference examples, docs/DATA.md), as the card says it. No source is named.
export const CONFIRMATION={confirmed:"in two or more sources",textbook:"in the course textbook",commentator:"from a commentary"};
// Examples of the term, under its definition: a few, the plainest first, each with its stage and how well it is confirmed; tapping one says why it is a good example.
function examplesNode(n){
  if(!state.EX) return null;
  const list=examplesFor(state,state.EX.items,n); if(!list.length) return null;
  const open=state.ui&&state.ui.dex;
  return el("dd",{class:"tm-ex"},el("p",{class:"tm-exh",text:list.length>1?"Examples":"Example"}),el("ul",null,list.map(x=>{
    const key=n+"|"+x.n, on=open===key, meta=["stage "+exampleStage(x),CONFIRMATION[x.cf||""]].filter(Boolean).join(" \u00b7 ");
    const head=[el("span",{class:"tm-exn",text:x.n}),el("small",{text:meta})];
    if(!x.gloss) return el("li",null,el("div",{class:"tm-exr"},head));
    const toggle=e=>{ e.stopPropagation(); state.ui.dex=on?null:key; render(); const b=document.querySelector('.tm-ex button[data-dex="'+CSS.escape(key)+'"]'); if(b) /** @type {HTMLElement} */(b).focus({preventScroll:true}); };
    return el("li",null,el("button",{type:"button",class:"tm-exr tm-exb"+(on?" on":""),"data-dex":key,"aria-expanded":on?"true":"false",onclick:toggle},head),
      on?el("p",{class:"tm-why",text:x.gloss+(x.cn?" (this reading is less certain)":"")}):null);
  })));
}
// The same entry as the Terms panel had: the name and chapter, where the term sits, then the definition, in English and, if chosen, Russian.
// `trail` holds the terms looked at before this one in the same card, `live` is false for the floating card.
function cardNode(n,id,trail,live=true){
  const t=state.DATA.terms[n], en=defParts(t.d), ru=defParts(t.d_ru), ruOn=state.defLang==="enru", src=en.src||(ruOn?ru.src:"");
  const back=live&&trail&&trail.length?trail[trail.length-1]:"";
  return el("div",{class:"ddef",id,tabindex:id?"-1":null},
    back?el("button",{type:"button",class:"ddback","aria-label":"Back to "+back,onclick:e=>{ e.stopPropagation(); goBack(); }},"\u2190 "+back):null,
    el("dl",{class:"tm-defs"},el("div",{class:"tm-d"},
      el("dt",null,t.name,ruOn&&t.ru?el("span",{class:"tm-ru",lang:"ru",text:" \u00b7 "+t.ru}):null,t.ch&&en.ref?el("small",{text:" \u00b7 "+t.ch}):null),
      upLine(n,live),
      el("dd",{class:src?"out":""},
        src?el("p",{class:"src",text:src+(en.body?":":".")}):null,
        en.body?el("p",{lang:"en",text:endp(cap(en.body))}):null,
        ruOn&&ru.body?el("p",{class:"ru",lang:"ru",text:endp(cap(ru.body))}):null),
      live?examplesNode(n):null)));
}
/** Of these categories (ids: a pair's two, or the ones Categories asks about), the terms of those that opened at the highest stage that is on, at stages 1 to 3, whose definition this device can read (domain/stages.ts, newCategories). */
export function newTerms(cats){
  if(!state.DATA) return [];
  return newCategories(state,cats,state.stages).map(c=>state.CAT[c].term).filter(t=>hasDef(state.DATA.terms[t]));
}
/** The categories of a pair, as newTerms takes them: also a pair of two labels of one category ("colors" and "hues"), which pairCats leaves out. */
export const pairCatIds=p=>[p.catA||catByLabel(p.a),p.catB||catByLabel(p.b)];
/** The definition card of a term on its own, without its examples: what the question shows of a newly opened category. */
export const plainDefCard=n=>cardNode(n,null,[],false);
/** The classic page's definitions with the question: a newly opened category's, until the stages go past 3, when the definitions are a tap away. */
export function newTermsNode(cats){
  const terms=newTerms(cats); if(!terms.length) return null;
  return el("div",{class:"section newdefs"},el("p",{class:"label"},"New at stage "+topStage(state.stages),el("span",{class:"hint",text:"what "+(terms.length>1?"these terms mean":"this term means")})),terms.map(plainDefCard));
}
// Pointing at a term with a mouse shows its card while the pointer stays, over the note; it is not kept in the state, so a render drops it.
function peek(mark,term){
  for(const n of document.querySelectorAll(".ddef.peek")) n.remove();
  if(!mark||mark.classList.contains("on")||!matchMedia("(hover:hover)").matches) return;
  const box=mark.closest(".pop,.cl,.terms"); if(!box) return;
  const c=cardNode(term,null,[],false); c.classList.add("peek"); box.append(c); placeCard(c,mark);
}
// The floating card hangs under the line where the term ends, as far left as the term begins but inside the note, its arrow on the term.
function placeCard(c,mark){
  const box=c.parentElement, rs=mark.getClientRects(), r=rs[rs.length-1]; if(!box||!r) return;
  const b=box.getBoundingClientRect(), x0=b.left+box.clientLeft, y0=b.top+box.clientTop, w=c.offsetWidth;
  const left=Math.max(0,Math.min(Math.round(r.left-x0)-12,box.clientWidth-w));
  c.style.left=left+"px"; c.style.top=Math.round(r.bottom-y0+7)+"px";
  c.style.setProperty("--ax",Math.round(Math.max(12,Math.min(w-12,r.left+r.width/2-x0-left)))+"px");
}
