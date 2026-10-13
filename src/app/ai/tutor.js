import { state } from "../state.js";
import { $, el } from "../core/dom.js";
import { CELLS, REL, cellLabel, refOf } from "../core/rel.js";
import { QCELL, qPlain } from "../debate/text.js";
import { persist } from "../practice/answers.js";
import { summarize } from "../practice/grading.js";
import { fillTurn, revealTutor } from "../practice/screen.js";
import { matchItem, norm, pairCats } from "../practice/universe.js";
import { render } from "../shell/render.js";

export const ERR_OFF=["not_granted","sampling_disabled","not_declared","capability_disabled","capability_removed"];
const TIER="default";

/* Standing instructions for the tutor. Facts about the two categories come from the per-pair card
   built from drill-data.json (the Dudra booklet's terms); anything else the tutor looks up with tools. */
const GUIDE = `You are a terse debate tutor for one learner of Gelug Collected Topics (Dudra, Purbuchok's textbook as taught in the course booklet). Ground every claim in the card below or in what the tools return; if neither covers a point, say it is your own reading.
Decision procedure for two phenomena A and B: is there a common locus (an existent that is both)? If not, mutually exclusive (the booklet data calls such terms contradictory). If so: whatever is A is B and whatever is B is A -> mutually inclusive; only one way -> three possibilities; neither way -> four possibilities. The "neither" cell takes anything that is neither, a non-existent such as the horn of a rabbit included (the class convention, Perdue 1992:393); an existent is the better example when there is one. The other three cells need existents.
Style: no greetings, praise, encouragement or filler. The learner sees your answer exactly as written, so settle every judgment silently before writing it; never state a judgment and then reverse it, never write "wait" or "actually". Plain text, no Markdown. Short lines; a line may start with a label and a colon ("Neither: ..."), which the page bolds. At most 110 words unless the learner asks for more.`;


/* ---------- tutor: per-pair card plus two lookup tools ---------- */
function termFacts(name){
  const t=state.DATA.terms[name]; if(!t) return null;
  const f={term:t.name, definition:t.d, chapter:t.ch, chain:(state.DATA.chains[name]||[]).join(" > ")};
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
  const c=state.CAT[cid]; if(!c) return null;
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
  const notes=[...new Set([ca,cb].flatMap(c=>c&&state.DATA.notes&&state.DATA.notes[c]||[]))];
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
export const CELL_NAME={both:"Both", anb:"A not B", bna:"B not A", nei:"Neither"};
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
export const VERDICT_RE=/\s*=>\s*(yes|no|unsure)\W*$/i;
export const NAME_CELL={"both":"both","a not b":"anb","b not a":"bna","neither":"nei","q1":"both","q2":"anb","q3":"bna","q4":"nei"};
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
  if(n&&state.db&&U.doc&&U.saveId){
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
     const ts=Object.values(state.DATA.terms);
     const hit=ts.find(t=>norm(t.name)===q)||ts.find(t=>(t.aliases||[]).some(a=>norm(a)===q))||ts.find(t=>norm(t.ru)===q)||ts.find(t=>norm(t.name).includes(q));
     if(!hit) return {found:false, close:ts.filter(t=>norm(t.name).split(" ").some(w=>q.includes(w)&&w.length>3)).slice(0,8).map(t=>t.name)};
     return Object.assign({found:true}, termFacts(hit.name));
   }},
  {name:"classify_example", description:"Check how the practice list classifies a concrete thing (e.g. 'a dog', 'the smell of coffee'). Returns its Dudra type and the practice categories it belongs to, or found:false if the list does not contain it.",
   inputSchema:{type:"object",properties:{thing:{type:"string"}},required:["thing"]},
   execute:(input)=>{
     const it=matchItem(input&&input.thing); if(!it) return {found:false};
     return {found:true, item:it.n, existent:!it.ne, dudra_type:it.t, chain:(state.DATA.chains[it.t]||[it.t]).join(" > "), categories:it.c.map(c=>state.CAT[c].labels[0])};
   }},
];
export async function ask(text,kind){
  const U=state.ui, C=state.cur;                       // the pair this question belongs to, even if you switch tabs meanwhile
  if(!state.sample||!U||U.ctl) return;
  const p=C.p;
  const body=kind==="explain"?explainAsk(U):text;
  if(!U.chat) U.chat=[{role:"user",content:tutorCard(p,U)+"\n\n"+body, hidden:true}];
  else U.chat.push({role:"user",content:body,hidden:!!kind});
  if(kind==="explain"){ U.explained=true; U.rtab="tutor"; }
  U.chat.push({role:"assistant",content:"",pending:true,kind});
  U.chatErr=""; const ctl=U.ctl=new AbortController(); render(); if(U===state.ui) revealTutor();
  const turns=U.chat.filter(t=>!t.pending).map(t=>({role:t.role,content:t.content}));
  const slot=U.chat[U.chat.length-1];
  const opts={signal:ctl.signal,modelTier:TIER,cache:false,onText:({text})=>{slot.content=text; if(U===state.ui){ const o=$("ans-live"); if(o){ fillTurn(o,{kind,pending:true,content:text},!o.closest("#chatscroll")); const sc=$("chatscroll"); if(sc) sc.scrollTop=0; } }}};
  if(state.DATA) opts.tools=TOOLS;
  try{
    let r;
    try{ r=await state.sample(turns,opts); }
    catch(e){ if(e&&e.code==="tools_unavailable"){ delete opts.tools; r=await state.sample(turns,opts); } else throw e; }
    slot.content=r.text+(r.truncated?"\n(Cut short.)":""); delete slot.pending;
    if(kind==="explain"){ if(U.doc) U.doc.explain=String(r.text||"").slice(0,3000); if(!(U.res.exOpen&&applyVerify(r.text,U,C))) saveExplain(U); }
  }catch(e){
    if(e&&e.text){ slot.content=e.text; delete slot.pending; } else U.chat.pop();
    if(kind==="explain") U.explained=false;
    if(U.chat.length===1) U.chat=null;
    U.chatErr=errCopy(e);
    if(e&&ERR_OFF.includes(e.code)) state.sample=null;
  }
  U.ctl=null;
  if(U===state.ui){ render(); if(kind==="explain") revealTutor(); const i=$("ask-in"); if(i&&!("ontouchstart" in window)) i.focus(); }
}
export function fillAns(node,text){
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
