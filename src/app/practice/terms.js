import { state } from "../state.js";
import { cap } from "../core/util.js";
import { render } from "../shell/render.js";

// Where a category sits: the Dudra term with its higher categories, or, for an everyday category, the Dudra term it falls under.
export function lineageOf(cid){
  const c=state.CAT[cid]; if(!c||!state.DATA) return null;
  const ch=state.DATA.chains||{};
  if(c.kind==="dudra"&&c.term) return {names:ch[c.term]||[c.term],everyday:false};
  const head=(c.type||"").split(":")[0].trim(), T=cap(head);
  return {names:T?(ch[T]||[T]):[],everyday:true};
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
/** Whether this device can read the definition of the term: it has one, and the Magic Key is in. */
export const hasDef=t=>!!t&&!state.unlock&&!!defParts(t.d).body;

/* ---------- the definition of a term in the text ---------- */
// A text with the Dudra terms it names dot-underlined (path/terms.tsx), when this device can read their definition. Tapping one opens the definition under the text; the open one is
// `state.ui.dterm`.
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
