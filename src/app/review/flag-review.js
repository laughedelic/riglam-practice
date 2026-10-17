import { state } from "../state.js";
import { removeFlag, setFlagState } from "../ai/flags.js";
import { mname } from "../ai/quorum-panel.js";
import { el } from "../core/dom.js";
import { dayOf } from "../core/util.js";

/* ---------- Review: the flags (the ones raised by hand, and the ones Quorum raises by itself) ---------- */
export function flagReview(box){
  const fl=Object.values(state.flags).sort((x,y)=>(y.updatedAt||y.at||"").localeCompare(x.updatedAt||x.at||"")), nNew=fl.filter(f=>f.state==="new").length;
  const sec=el("div",{class:"section"},el("p",{class:"label"},state.quorumOffered?"Quorum":"Flags",el("span",{class:"hint",text:fl.length?fl.length+" flagged"+(nNew?", "+nNew+" new":""):"no flags yet"})));
  if(!fl.length) sec.append(el("p",{class:"empty-note",text:state.quorumOffered&&!state.quorum?"Quorum is off (Options).":"Flags appear here: tap the flag on anything Claude wrote"+(state.quorumOffered?", or let Quorum raise them where the models disagree":"")+"."}));
  if(fl.length){
    sec.append(el("ul",{class:"sum flagl"},fl.slice(0,40).map(f=>el("li",{class:f.state},el("span",{class:"m","aria-hidden":"true"},el("span",{class:"flg"})),
      el("span",null,(f.thing?"“"+f.thing+"” · ":"")+(f.model?mname(f.model)+" · ":"")+(f.auto?"Quorum (automatic)":f.part),
        el("span",{class:"sub",text:(f.shown?(f.auto?"":"shown: ")+f.shown:"")+(f.suggest?" · should be: "+f.suggest:"")}),
        f.note?el("span",{class:"sub",text:f.note}):null,
        el("span",{class:"skact"},
          el("span",{class:"fstate",text:f.state+" · "+dayOf(f.at)}),
          f.state==="new"?el("button",{type:"button",class:"btn",onclick:()=>setFlagState(f.id,"reviewed"),text:"Reviewed"}):null,
          f.state!=="resolved"?el("button",{type:"button",class:"btn ghost",onclick:()=>setFlagState(f.id,"resolved"),text:"Resolved"}):null,
          el("button",{type:"button",class:"btn ghost",onclick:()=>removeFlag(f.id),text:"Delete"})))))));
  }
  if(state.flagErr) sec.append(el("p",{class:"status",text:state.flagErr}));
  box.append(sec);
}
