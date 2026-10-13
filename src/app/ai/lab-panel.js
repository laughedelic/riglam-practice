import { state } from "../state.js";
import { flagEditorNode, flagPart } from "./flags.js";
import { LAB_JUDGE, LAB_MODELS, labAgain, labJudgeNow } from "./lab.js";
import { CELL_NAME } from "./tutor.js";
import { el } from "../core/dom.js";

/* ---------- the Lab panel of a result ---------- */
const yn=b=>b?"✓":"✗";
function labState(U){
  const L=U&&U.lab; if(!L) return null;
  const runs=LAB_MODELS.map(m=>L.runs[m.k]).filter(s=>s&&s.doc&&s.status==="ok");
  let diff=false, judgeDiff=false;
  L.kase.things.forEach((t,i)=>{
    const cs=new Set(runs.map(s=>s.doc.recs[i].cell)); if(cs.size>1) diff=true;
    const j=L.runs.judge&&L.runs.judge.status==="ok"?L.runs.judge.doc.recs[i].cell:null; if(j&&!t.cells.includes(j)) judgeDiff=true;
    else if(!j&&runs.length&&!t.cells.includes([...cs][0])&&cs.size===1) judgeDiff=true;
  });
  return {runs,diff,judgeDiff,busy:L.busy};
}
export function labItem(){
  if(!state.lab||!state.ui||!state.ui.lab) return null;
  const s=labState(state.ui);
  // the chip never opens by itself; its sign says whether the answers agree ("…" while running, "≠" when models differ from each other or from you, "=" when all agree)
  return {key:"lab",label:"Lab",st:"none",ic:s.busy?"…":!s.runs.length?"":(s.diff||s.judgeDiff)?"≠":"=",body:()=>labNode(),
    onopen:()=>requestAnimationFrame(()=>{ const v=document.querySelector(".vchips"); if(v) v.scrollIntoView({block:"start"}); })};
}
export const mname=k=>k==="judge"?"Judge":(LAB_MODELS.find(m=>m.k===k)||{}).name||k;
function labNode(){
  const L=state.ui.lab, box=el("div",{class:"lab"}), st=labState(state.ui);
  const done=LAB_MODELS.filter(m=>L.runs[m.k]&&L.runs[m.k].status!=="run").length;
  const J=L.runs.judge, jok=!!(J&&J.status==="ok"&&J.doc), jwhy={disagree:"the models differed",spot:"spot check",asked:"you asked"}[J&&J.doc&&J.doc.why]||"";
  const sum=L.busy?(J&&J.status==="run"?"Judge is ruling…":"Models running: "+done+" of 3 done"):"Done: "+st.runs.length+" of 3 models answered"+(jok?"; the judge ruled"+(jwhy?" ("+jwhy+")":""):st.runs.length>=2&&!(J&&J.status!=="ok")?"; all agree, no judge needed":"");
  // which models the judge sided with, from the answer numbers it was given (the order of the runs it saw)
  const sided=i=>{ const r=jok&&J.doc.recs&&J.doc.recs[i]; if(!r||!Array.isArray(r.right)||!J.doc.order) return null; const ids=r.right.map(n=>J.doc.order[n-1]).filter(Boolean); return LAB_MODELS.filter(m=>ids.some(id=>id.endsWith("_"+m.k))).map(m=>m.k); };
  box.append(el("p",{class:"lab-h"},el("b",{text:"Lab "}),el("span",{class:"lab-s",text:sum})));
  const errs=LAB_MODELS.concat([LAB_JUDGE]).map(m=>L.runs[m.k]&&["err","bad","mismatch"].includes(L.runs[m.k].status)?m.name+": "+({err:"failed ("+L.runs[m.k].doc.error+")",bad:"unreadable reply",mismatch:"another model answered, run not counted"}[L.runs[m.k].status]):null).filter(Boolean);
  if(errs.length) box.append(el("p",{class:"status",text:errs.join(". ")+"."}));
  L.kase.things.forEach((t,i)=>{
    const base={caseKey:L.kase.key,thing:t.text,pair:{a:L.kase.a,b:L.kase.b,relation:L.kase.relation,tab:L.kase.tab}};
    const rows=[];
    const rowFor=(m,s)=>{
      if(!s) return null;
      if(s.status==="run") return el("div",{class:"lab-r"},el("span",{class:"mn",text:m.name}),el("span",{class:"lab-w",text:"running…"}));
      if(!s.doc||!s.doc.recs) return el("div",{class:"lab-r"},el("span",{class:"mn",text:m.name}),el("span",{class:"lab-w",text:"no answer"}));
      const r=s.doc.recs[i], c=Object.assign({},base,{model:m.k,runId:s.id});
      const same=t.cells.includes(r.cell), P=(part,partLabel,shown,txt,cls)=>flagPart(Object.assign({},c,{part,partLabel,shown}),"t"+i,txt,cls);
      // against the judge's ruling: the models it sided with, or (when it did not say) the ones whose cell equals its cell
      let vs=null;
      if(jok&&m.k!=="judge"&&J.doc.recs[i]){ const sd=sided(i); vs=sd?sd.includes(m.k):r.cell===J.doc.recs[i].cell; }
      const row=el("div",{class:"lab-r"+(s.status==="mismatch"?" off":"")+(m.k==="judge"?" ruling":"")},
        el("span",{class:"mn",text:m.k==="judge"?"Judge’s ruling":m.name}),
        el("span",{class:"lps"},
          el("span",{class:"lcell "+(same?"ok":"diff"),title:same?"Same cell as yours":"A different cell from yours"},P("cell","cell",CELL_NAME[r.cell],CELL_NAME[r.cell])),
          P("inA","in A",yn(r.inA),"A "+yn(r.inA)),
          P("inB","in B",yn(r.inB),"B "+yn(r.inB)),
          P("exists","exists",yn(r.exists),"exists "+yn(r.exists)),
          r.unsure?P("unsure","unsure","unsure","unsure","uns"):null),
        el("span",{class:"lrd"},P("reading","reading",r.reading,"“"+r.reading+"”","rd")),
        el("span",{class:"lt"},vs===null?null:el("b",{class:"vs "+(vs?"yes":"no"),text:vs?"= ruling":"≠ ruling",title:vs?"The judge sided with this answer":"The judge ruled differently"}),s.doc.ms!=null?(s.doc.ms/1000).toFixed(1)+" s":""));
      if(m.k==="judge"){
        const sd=sided(i), seen=((J.doc&&J.doc.order)||[]).map(id=>LAB_MODELS.find(x=>id.endsWith("_"+x.k))).filter(Boolean);
        const sn=sd?(sd.length?"Sided with "+sd.map(mname).join(" and ")+(sd.length<seen.length?", not "+seen.filter(x=>!sd.includes(x.k)).map(x=>x.name).join(" or "):""):"Sided with none of the answers")+".":"";
        return el("div",{class:"lab-j"},row,sn||r.reason?el("p",{class:"lab-why"},sn?el("span",{class:"lab-sided",text:sn+" "}):null,r.reason?P("reason","judge's reason",r.reason,r.reason,"why"):null):null);
      }
      return row;
    };
    LAB_MODELS.forEach(m=>{ const n=rowFor(m,L.runs[m.k]); if(n) rows.push(n); });
    const jn=rowFor(LAB_JUDGE,L.runs.judge); if(jn) rows.push(jn);
    // the page's own verdict(s) for this thing
    const pv=t.cells.map(c=>{ const rr=state.ui.res.cells[c]; if(!rr) return null; const by=rr.by==="claude"?" (checked by Claude)":""; const lab_=({ok:"fits",bad:"does not fit",cmp:"not checked"})[rr.v]||rr.v; return {c,txt:CELL_NAME[c]+": "+lab_+by}; }).filter(Boolean);
    const pr=el("div",{class:"lab-r page"},el("span",{class:"mn",text:"Page"}),el("span",{class:"lps"},pv.map(x=>flagPart(Object.assign({},base,{part:"verdict",partLabel:"page verdict",n:x.c,shown:x.txt}),"t"+i,x.txt))));
    const head=el("p",{class:"lab-t"},el("b",{lang:"en",text:"“"+t.text+"”"}),el("span",{class:"you",text:" you put it in "+t.cells.map(c=>CELL_NAME[c]).join(", ")}),
      flagPart(Object.assign({},base,{part:"check",partLabel:"the whole check",shown:"all runs"}),"t"+i,"Flag all","all"));
    const agreeAll=!J&&st.runs.length>=2&&!L.busy&&!L.judgeWhy&&new Set(st.runs.map(s=>s.doc.recs[i].cell)).size===1;
    box.append(el("div",{class:"lab-c"},head,rows,agreeAll?el("p",{class:"lab-nj",text:"All answers agree: "+CELL_NAME[st.runs[0].doc.recs[i].cell]+". No judge asked."}):null,pr,flagEditorNode("t"+i)));
  });
  const acts=el("div",{class:"actions left"});
  if(!L.busy&&LAB_MODELS.some(m=>!L.runs[m.k]||L.runs[m.k].status!=="ok")) acts.append(el("button",{type:"button",class:"btn ghost",onclick:labAgain,text:"Run the missing ones again"}));
  if(!L.busy&&!(J&&J.status!=="err"&&J.status!=="bad")&&st.runs.length>=2) acts.append(el("button",{type:"button",class:"btn ghost",onclick:labJudgeNow,text:"Ask the judge"}));
  if(acts.childNodes.length) box.append(acts);
  box.append(el("p",{class:"note faint",text:"Tap any value to flag it. Each run is stored for the model comparison; your page verdicts are not changed by it."}));
  if(state.flagErr) box.append(el("p",{class:"status",text:state.flagErr}));
  return box;
}
