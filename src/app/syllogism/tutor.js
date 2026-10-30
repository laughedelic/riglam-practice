import { state } from "../state.js";
import { $ } from "../core/dom.js";
import { ERR_OFF, canAsk } from "../core/ask.js";
import { errCopy } from "../ai/tutor.js";
import { persist } from "../practice/answers.js";
import { refreshPath } from "../path/index.tsx";
import { render } from "../shell/render.js";
import { SYLLOGISM_ASK, syllogismBody, syllogismCard, syllogismCats } from "../../ai-shared/syllogism.ts";
import { tutorTools } from "../../ai-shared/tools.ts";
import { syllogismText } from "../../domain/syllogism.ts";
import { topStage } from "../../domain/stages.ts";
import { answered } from "../sound/play.ts";

/* ---------- Syllogisms: the tutor's explanation and chat ---------- */
// The same flow as ai/tutor.js `ask`, for a syllogism: the card (src/ai-shared/syllogism.ts) and the request to explain are built from the term data, the standing
// instructions are the server's (or, in the artifact, put first by the page), and the answer streams into the turn. There is no pair, no verdicts to read back and no
// Quorum: the page has settled the three checks itself, and the explanation is kept with the answer (`explain`). It is kept apart from `ask` on purpose, so that the changes
// to `ask` for the other exercises and this one do not meet.
const TIER="default";

/** What the card reads of the answer on screen. */
const answerView=U=>({sentence:syllogismText(state.cur.c,state.syllogismWording), grade:U.grade, ex:U.ex?{text:U.ex.text,v:U.ex.v}:null, stage:topStage(state.stages)});

/** The tutor's turn for the checked syllogism on screen: `kind` "explain" asks for the explanation, anything else is the learner's own question `text`. */
export async function askSyllogism(text,kind,byItself){
  const U=state.ui, c=state.cur.c;                     // the syllogism this question belongs to, even if you switch tabs meanwhile
  if(!canAsk()||!U||!U.syllogism||!U.checked||U.ctl) return;
  const direct=!!state.sample;                         // the host's own model call, or else the app's server
  const body=kind==="explain"?SYLLOGISM_ASK:text;
  const view=answerView(U);
  if(!U.chat) U.chat=[{role:"user",content:(direct?syllogismCard(state,c,view):syllogismBody(state,c,view))+"\n\n"+body,hidden:true,asked:kind?undefined:text}];
  else U.chat.push({role:"user",content:body,hidden:!!kind});
  if(kind==="explain") U.explained=true;
  U.chat.push({role:"assistant",content:"",pending:true,kind});
  U.chatErr=""; const ctl=U.ctl=new AbortController(); render();
  const turns=U.chat.filter(t=>!t.pending).map(t=>({role:t.role,content:t.content}));
  const slot=U.chat[U.chat.length-1];
  const onText=({text})=>{ slot.content=text; if(U===state.ui) refreshPath(); };
  const opts={signal:ctl.signal,modelTier:TIER,cache:false,onText};
  if(state.DATA) opts.tools=tutorTools(state);
  try{
    let r;
    if(direct){
      try{ r=await state.sample(turns,opts); }
      catch(e){ if(e&&e.code==="tools_unavailable"){ delete opts.tools; r=await state.sample(turns,opts); } else throw e; }
    }else r=await state.tutor({kind:kind==="explain"?"explain":"chat",cats:syllogismCats(c),turns},{signal:ctl.signal,onText});
    slot.content=r.text+(r.truncated?"\n(Cut short.)":""); delete slot.pending;
    if(kind==="explain"&&U.doc){ U.doc.explain=String(r.text||"").slice(0,3000); persist(U,"Your answer"); }
    if(U===state.ui) answered();                         // its sound (src/app/sound)
  }catch(e){
    if(e&&e.text){ slot.content=e.text; delete slot.pending; } else U.chat.pop();
    if(kind==="explain") U.explained=false;
    if(U.chat.length===1) U.chat=null;
    U.chatErr=errCopy(e,"syllogism");
    if(e&&ERR_OFF.includes(e.code)){ state.sample=null; state.tutor=null; }
  }
  U.ctl=null;
  if(U===state.ui){ render(); if(byItself) return; const i=$("ask-in"); if(i&&!("ontouchstart" in window)) i.focus(); }
}
