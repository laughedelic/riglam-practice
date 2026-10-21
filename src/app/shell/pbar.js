import { el } from "../core/dom.js";
import { isWide } from "../core/viewport.js";
import { favBtn, favTarget } from "../practice/favorites.js";
import { skipBtn, skipNoteNode } from "../practice/skips.js";
import { micButton } from "./voice.js";

/* ---------- the pair bar ---------- */
// What belongs to the pair on screen, at its foot, where the thumb is: Skip and the star at the left, the microphone in the middle (while Voice is on and Answer by voice
// is chosen, shell/voice.js), the forward button at the right (Next cell, Check, Next pair; on a wide screen the key is hinted on it). After a skip the note with Undo is a line above the buttons. What belongs to the exercise as a whole (the menu, Blitz, the practice options, the tutor) is in the top bar.
// The bar is the last child of the stage and sticks to its foot. A press on its buttons does not take the focus from the field being typed in, so the on-screen
// keyboard of a phone stays up while the pair moves on.
/**
 * @param {{label:string, hint?:string, onclick:(e?:Event)=>void, disabled?:boolean, title?:string}|null} fwd the forward button, or none where there is nothing to go forward to
 * @param {(Node|null)[]} [extra] more buttons for the left group (wide screens)
 */
export function pairBar(fwd,extra=[]){
  const bar=el("div",{class:"actions pbar"});
  const note=skipNoteNode(); if(note) bar.append(note);
  const fp=favTarget(), fb=fp?favBtn(fp):null;
  bar.append(el("div",{class:"prow"},
    el("div",{class:"pl"},skipBtn(),fb,...extra.filter(Boolean)),
    micButton(),
    fwd?el("button",{type:"button",class:"btn fwd",disabled:!!fwd.disabled,title:fwd.title||null,onclick:fwd.onclick},fwd.label,fwd.hint&&isWide()?el("span",{class:"kbd","aria-hidden":"true",text:fwd.hint}):null):null));
  bar.addEventListener("mousedown",e=>{ if(/** @type {Element} */(e.target).closest("button")) e.preventDefault(); });
  return bar;
}
