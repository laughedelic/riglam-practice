import { state } from "../state.js";
import { quorumThings } from "./quorum.js";
import { explainByItself, saveVerdicts } from "./tutor.js";
import { noteData } from "../practice/screen.js";
import { renderKeepFocus } from "../shell/render.js";
import { makeExampleIndex, readExamples } from "../../ai-shared/examples.ts";
import { pairCats } from "../../ai-shared/lookup.ts";
import { openExamples, referenceLines } from "../../domain/known.ts";
import { applyVerdicts, parseVerdicts } from "../../domain/verdict.ts";

/* ---------- examples known without the AI ---------- */
// After a check, an example the page could not check (verdict "cmp") is looked up before anything asks the tutor about it: first in the course's
// reference examples this device holds (by its classes, src/domain/known.ts), then in what the app's server learned from earlier checks of the same
// example (platform.known, POST /api/known). Both come as the tutor's lines, so the cells settle as Claude's lines settle them (with the term data);
// the cell's tag says where the verdict came from. What is left is the tutor's, as ever (Explain, or "Check every answer with AI"), and the
// explanation then treats the settled examples as checked.

const WAIT_MS = 4000;           // the server's answer is worth a short wait, not a slow check

/** Reads what the platform has of both: on start, and again after the Magic Key changed. */
export async function loadKnown(platform){
  try{ state.known=platform.known?await platform.known():null; }catch(e){ state.known=null; }
  try{ const ex=platform.examples?readExamples(await platform.examples()):null; state.EX=ex&&ex.items.length?makeExampleIndex(ex):null; }catch(e){ state.EX=null; }
}

/**
 * Called where a check used to ask for the explanation by itself. It waits for the check's own saving (the caller writes the answer's document right
 * after it), settles what is known, saves and draws again, and then asks for the explanation of what is left. Explain tapped meanwhile waits for it (ask()).
 */
export function afterCheck(U){
  const C=state.cur;
  U.knowing=settleKnown(U,C).catch(()=>{}).finally(()=>{ U.knowing=null; if(U===state.ui) explainByItself(U); });
}
async function settleKnown(U,C){
  await null;                                         // the caller saves the answer first: the verdicts below then go into its document
  if(!U.res||!U.res.exOpen||!C||!C.p) return;
  const p=C.p, d=noteData(p);
  let n=0;
  const open=()=>openExamples(p,U.res,quorumThings(U));
  if(state.EX) n+=applyVerdicts(p,U.res,parseVerdicts(referenceLines(state,state.EX,p,open()).join("\n"),d),false,"course");
  const left=open(), cats=pairCats(state,p);
  if(state.known&&left.length&&cats[0]&&cats[1]){
    const stop=new AbortController(), timer=setTimeout(()=>stop.abort(),WAIT_MS);
    try{
      const known=await state.known({cats,examples:left},{signal:stop.signal});
      // the learner may have moved on meanwhile: the answer still belongs to the answer it was asked for, which is saved; only the screen waits for its own
      n+=applyVerdicts(p,U.res,parseVerdicts(known.map(k=>k.line).join("\n"),d),false,"learned");
    }finally{ clearTimeout(timer); }
  }
  if(!n) return;
  saveVerdicts(U,C);
  if(U===state.ui) renderKeepFocus();            // the result is on the screen with the focus on its last button: it stays there
}
