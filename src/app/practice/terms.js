import { state } from "../state.js";
import { termMentions } from "../../ai-shared/mentions.ts";
import { $, L, el } from "../core/dom.js";
import { lockIcon } from "../core/icons.js";
import { REL } from "../core/rel.js";
import { cap } from "../core/util.js";
import { isA } from "./screen.js";
import { catByLabel } from "./universe.js";
import { render } from "../shell/render.js";

// Where a category sits: the Dudra term with its higher categories, or, for an everyday category, the Dudra term it falls under.
function lineageOf(cid){
  const c=state.CAT[cid]; if(!c||!state.DATA) return null;
  const ch=state.DATA.chains||{};
  if(c.kind==="dudra"&&c.term) return {names:ch[c.term]||[c.term],everyday:false};
  const head=(c.type||"").split(":")[0].trim(), T=cap(head);
  return {names:T?(ch[T]||[T]):[],everyday:true};
}
const isaChain=names=>names.map(n=>n.toLowerCase()).flatMap((n,i)=>i?[" ",el("i",{class:"isa",text:isA(n)})," ",n]:[n]);
// The Terms panel: how the two terms relate, where each one belongs, and on request the booklet's definitions of the terms involved.
export function termsNode(p){
  const box=el("div",{class:"terms"}), ca=p.catA||catByLabel(p.a), cb=p.catB||catByLabel(p.b), lis=[ca&&lineageOf(ca),cb&&lineageOf(cb)];
  box.append(el("p",{class:"tm-sum"},el("b",{text:REL[p.relation].name+". "}),p.note||""));
  box.append(el("div",{class:"tm-rows"},[["A",p.a,p.typeA,lis[0]],["B",p.b,p.typeB,lis[1]]].map(([x,label,type,li])=>
    el("div",{class:"tm-row"},L(x),el("div",null,el("p",{class:"tm-t",text:cap(label)}),
      li&&li.names.length?[li.everyday?el("p",{class:"tm-n",text:"An everyday category, not a Dudra term. It falls under:"}):null,el("p",{class:"tm-c"},isaChain(li.names))]:el("p",{class:"tm-c",text:type||""}))))));
  // the Dudra terms behind the two categories first, then the categories above them
  const names=[], add=n=>{ if(n&&state.DATA&&state.DATA.terms[n]&&!names.includes(n)) names.push(n); };
  for(const li of lis) if(li&&!li.everyday&&li.names.length) add(li.names[0]);
  for(const li of lis) if(li) li.names.slice(li.everyday?0:1).forEach(add);
  if(!names.length) return box;
  box.append(el("button",{type:"button",class:"tm-tog","aria-expanded":state.ui.defs?"true":"false",onclick:()=>{ state.ui.defs=!state.ui.defs; render(); if(state.ui.defs) requestAnimationFrame(()=>{ const b=document.querySelector(".tm-tog"); if(b) b.scrollIntoView({block:"start"}); }); }},state.ui.defs?"Hide definitions":"Definitions ("+names.length+")"));
  if(state.ui.defs&&state.unlock) box.append(lockedDefs(names));
  else if(state.ui.defs) box.append(el("dl",{class:"tm-defs"},names.map(n=>{
    const t=state.DATA.terms[n], en=defParts(t.d), ru=defParts(t.d_ru), ruOn=state.defLang==="enru", src=en.src||(ruOn?ru.src:"");
    // with the Russian definition shown, the Russian name of the term is named beside the English one
    return el("div",{class:"tm-d"},el("dt",null,t.name,ruOn&&t.ru?el("span",{class:"tm-ru",lang:"ru",text:" · "+t.ru}):null,t.ch?el("small",{text:" · "+t.ch}):null),
      el("dd",{class:src?"out":""},
        src?el("p",{class:"src",text:src+(en.body?":":".")}):null,
        en.body?el("p",{lang:"en",text:endp(cap(en.body))}):null,
        ruOn&&ru.body?el("p",{class:"ru",lang:"ru",text:endp(cap(ru.body))}):null));
  })));
  return box;
}
// Without the Magic Key there are no definitions to show. Each term says where to look it up (the chapter is in the open data),
// and one note says how to read them here.
const lookUp=ch=>/^[IVX]+ /.test(ch)?"Look it up in the booklet, chapter "+ch.replace(/^([IVX]+) /,"$1: ")+".":ch==="Dampilon tables"?"Look it up in the Dampilon tables.":ch?"Look it up in the booklet, section "+ch+".":"";
export function lockedDefs(names){
  const box=el("div",{class:"tm-locked"});
  box.append(el("dl",{class:"tm-defs"},names.map(n=>{
    const t=state.DATA.terms[n], line=lookUp(t.ch||""), ruOn=state.defLang==="enru";
    // the Russian name of a term is open data: with English + Russian selected it is shown here as it is beside a definition
    return el("div",{class:"tm-d"},el("dt",null,t.name,ruOn&&t.ru?el("span",{class:"tm-ru",lang:"ru",text:" · "+t.ru}):null),line?el("dd",{class:"out"},el("p",{class:"src",text:line})):null);
  })));
  box.append(el("p",{class:"tm-key",text:"To read the full definitions here, enter the Magic Key from your study group's link."}),
    el("button",{type:"button",class:"btn ghost",onclick:()=>state.unlock.open()},lockIcon(),"Unlock definitions"));
  return box;
}
// The term data marks where a definition comes from with a leading "(source)"; the booklet's own wording has none or "(Purbuchok)".
export function defParts(s){
  const m=/^\(([^)]*)\)\s*([\s\S]*)$/.exec((s||"").trim());
  let tag=m?m[1]:"", body=m?m[2]:(s||"").trim();
  const tail=/\s*\((tables|Dampilon)\)\s*$/.exec(body);
  if(tail){ body=body.slice(0,tail.index); tag=tag||tail[1]; }
  if(!tag||tag==="Purbuchok") return {src:"",body};
  const lab={tables:"From the Dampilon tables",Dampilon:"From Dampilon"}[tag];
  return {src:lab||cap(tag),body};
}
const endp=s=>s.replace(/[.;,\s]+$/,"")+".";

/* ---------- terms in the tutor's notes ---------- */
// A note's text with the Dudra terms it names dot-underlined, each the first time the note names it, and only when this device
// has its definition. Tapping one opens the definition under the text (defCard), inside the note; with a mouse, pointing at a term
// shows it in a card that floats under the term until the pointer leaves. `where` names the text, so the open definition
// (state.ui.dterm) shows under that text only; `seen` collects the terms marked in the note.
export function withTerms(text,where,seen){
  const out=[]; let at=0;
  termMentions(state,text).forEach((m,i)=>{
    const t=state.DATA.terms[m.term]; if(!t||!t.d||seen.has(m.term)) return;
    seen.add(m.term);
    out.push(text.slice(at,m.start),termMark(text.slice(m.start,m.end),m.term,where+"/"+i));
    at=m.end;
  });
  out.push(text.slice(at));
  return out;
}
function termMark(txt,term,id){
  const on=!!state.ui.dterm&&state.ui.dterm.id===id;
  const toggle=e=>{
    e.stopPropagation(); state.ui.dterm=on?null:{id,term}; render();
    const m=/** @type {HTMLElement} */(document.querySelector('.dterm[data-dt="'+CSS.escape(id)+'"]')); if(m) m.focus({preventScroll:true});
    const c=$("ddef"); if(c) c.scrollIntoView({block:"nearest"});
  };
  return el("span",{class:"dterm"+(on?" on":""),role:"button",tabindex:"0","data-dt":id,"aria-expanded":on?"true":"false","aria-controls":on?"ddef":null,
    onclick:toggle,onkeydown:e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); toggle(e); } },
    onmouseenter:e=>peek(e.currentTarget,term),onmouseleave:()=>peek(null,null)},txt);
}
/** The definition opened from the text marked as `where`, to go right after that text; null when none is open there. */
export function defCard(where){
  const d=state.ui&&state.ui.dterm;
  return d&&d.id.startsWith(where+"/")&&state.DATA.terms[d.term]?cardNode(d.term,"ddef"):null;
}
// The same entry as in the Terms panel: the name and chapter, then the definition with its source, in English and, if chosen, Russian.
function cardNode(n,id){
  const t=state.DATA.terms[n], en=defParts(t.d), ru=defParts(t.d_ru), ruOn=state.defLang==="enru", src=en.src||(ruOn?ru.src:"");
  return el("div",{class:"ddef",id},el("dl",{class:"tm-defs"},el("div",{class:"tm-d"},
    el("dt",null,t.name,ruOn&&t.ru?el("span",{class:"tm-ru",lang:"ru",text:" · "+t.ru}):null,t.ch?el("small",{text:" · "+t.ch}):null),
    el("dd",{class:src?"out":""},
      src?el("p",{class:"src",text:src+(en.body?":":".")}):null,
      en.body?el("p",{lang:"en",text:endp(cap(en.body))}):null,
      ruOn&&ru.body?el("p",{class:"ru",lang:"ru",text:endp(cap(ru.body))}):null))));
}
// Pointing at a term with a mouse shows its card while the pointer stays, over the note; it is not kept in the state, so a render drops it.
function peek(mark,term){
  for(const n of document.querySelectorAll(".ddef.peek")) n.remove();
  if(!mark||mark.classList.contains("on")||!matchMedia("(hover:hover)").matches) return;
  const box=mark.closest(".pop,.cl"); if(!box) return;
  const c=cardNode(term,null); c.classList.add("peek"); box.append(c); placeCard(c,mark);
}
// The floating card hangs under the line where the term ends, as far left as the term begins but inside the note, its arrow on the term.
function placeCard(c,mark){
  const box=c.parentElement, rs=mark.getClientRects(), r=rs[rs.length-1]; if(!box||!r) return;
  const b=box.getBoundingClientRect(), x0=b.left+box.clientLeft, y0=b.top+box.clientTop, w=c.offsetWidth;
  const left=Math.max(0,Math.min(Math.round(r.left-x0)-12,box.clientWidth-w));
  c.style.left=left+"px"; c.style.top=Math.round(r.bottom-y0+7)+"px";
  c.style.setProperty("--ax",Math.round(Math.max(12,Math.min(w-12,r.left+r.width/2-x0-left)))+"px");
}
