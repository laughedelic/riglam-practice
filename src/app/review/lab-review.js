import { state } from "../state.js";
import { removeFlag, setFlagState } from "../ai/flags.js";
import { mname } from "../ai/lab-panel.js";
import { LAB_MODELS, labRuns } from "../ai/lab.js";
import { CELL_NAME } from "../ai/tutor.js";
import { el } from "../core/dom.js";
import { dayOf } from "../core/util.js";

/* ---------- Review: flags, disagreements, model summary ---------- */
function labStats(){
  const by={}, cases={};
  for(const r of Object.values(labRuns())){
    const cs=cases[r.caseKey]||(cases[r.caseKey]={runs:[],judge:null,kase:r.case});
    if(r.kind==="judge") cs.judge=r; else cs.runs.push(r);
  }
  for(const cs of Object.values(cases)){
    for(const r of cs.runs){
      const o=by[r.model]||(by[r.model]={n:0,ok:0,counted:0,ms:0,agree:0,cmp:0});
      o.n++; if(r.ok) o.ok++; if(r.ok&&r.valid){ o.counted++; o.ms+=r.ms||0; }
      if(r.ok&&r.valid&&cs.judge&&cs.judge.ok) r.recs.forEach((x,i)=>{ const j=cs.judge.recs[i]; if(j){ o.cmp++; if(j.cell===x.cell) o.agree++; } });
    }
  }
  return {by,cases};
}
export function labReview(box){
  const fl=Object.values(state.flags).sort((x,y)=>(y.updatedAt||y.at||"").localeCompare(x.updatedAt||x.at||"")), nNew=fl.filter(f=>f.state==="new").length;
  const sec=el("div",{class:"section"},el("p",{class:"label"},"Lab",el("span",{class:"hint",text:fl.length?fl.length+" flagged"+(nNew?", "+nNew+" new":""):"no flags yet"})));
  const {by,cases}=labStats(), models=LAB_MODELS.filter(m=>by[m.id]);
  if(models.length) sec.append(el("table",{class:"tbl labt"},el("thead",null,el("tr",null,["Model","Runs","Time","Judge agrees"].map(h=>el("th",{text:h})))),
    el("tbody",null,models.map(m=>{ const o=by[m.id]; return el("tr",null,el("td",{text:m.name}),el("td",{class:"num",text:o.counted+(o.n>o.counted?" / "+o.n:"")}),el("td",{class:"num",text:o.counted?(o.ms/o.counted/1000).toFixed(1)+" s":"–"}),el("td",{class:"num",text:o.cmp?o.agree+" / "+o.cmp:"–"})); }))));
  else sec.append(el("p",{class:"empty-note",text:state.lab?"Runs appear here after you check an answer.":"The lab is off (Options)."}));
  // cases where the models disagree
  const dis=[];
  for(const [k,cs] of Object.entries(cases)){
    const ok=cs.runs.filter(r=>r.ok&&r.valid); if(ok.length<2||!cs.kase) continue;
    cs.kase.things.forEach((t,i)=>{ const set=[...new Set(ok.map(r=>r.recs[i].cell))]; if(set.length>1) dis.push({k,t,set,pair:cs.kase.a+" / "+cs.kase.b,at:cs.runs[0].at}); });
  }
  dis.sort((x,y)=>(y.at||"").localeCompare(x.at||""));
  if(dis.length){
    sec.append(el("p",{class:"sublabel",text:"Models disagree ("+dis.length+")"}));
    sec.append(el("ul",{class:"sum"},dis.slice(0,12).map(d=>el("li",null,el("span",{class:"m part","aria-hidden":"true",text:"?"}),el("span",null,"“"+d.t.text+"”",el("span",{class:"sub",text:d.pair+" · "+d.set.map(c=>CELL_NAME[c]).join(" / ")+" · you: "+d.t.cells.map(c=>CELL_NAME[c]).join(", ")}))))));
  }
  if(fl.length){
    sec.append(el("p",{class:"sublabel",text:"Flags"}));
    sec.append(el("ul",{class:"sum flagl"},fl.slice(0,40).map(f=>el("li",{class:f.state},el("span",{class:"m","aria-hidden":"true"},el("span",{class:"flg"})),
      el("span",null,(f.thing?"“"+f.thing+"” · ":"")+(f.model?mname(f.model)+" · ":"")+f.part,
        el("span",{class:"sub",text:(f.shown?"shown: "+f.shown:"")+(f.suggest?" · should be: "+f.suggest:"")}),
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
