import { state } from "../state.js";
import { CELLS } from "../core/rel.js";
import { cap, isMiss, pick } from "../core/util.js";
import { catKey, hiddenKeys } from "./skips.js";
import { catByLabel as byLabel, makeIndex, matchItem as itemFor, norm, pairCats as catsOf } from "../../ai-shared/lookup.ts";

/* ---------- the practice universe ---------- */
// The lookup tables and the matching of words to items and categories are in src/ai-shared, where the tutor code
// shares them; the page passes `state` as the index (it holds DATA, CAT, ITEMIDX, ALIASIDX and LABELIDX).
export { norm };
export function indexData(){ Object.assign(state,makeIndex(state.DATA)); }
export function catByLabel(l){ return byLabel(state,l); }
export function pairCats(p){ return catsOf(state,p); }
export function matchItem(text,exactOnly){ return itemFor(state,text,exactOnly); }
// An alias ("table") names the thing without the feature the practice item has ("a wooden table"),
// so it cannot settle colour, material, shape or temperature.
export const FEATURE=new Set(["wooden","metal","white","red","green","round","square","hot"]);
export function inUniverse(it,a,b){
  const sense=state.CAT[a].sense||state.CAT[b].sense;
  if(sense&&it.comp) return false;
  if(it.body&&(state.DATA.bodySkip.includes(a)||state.DATA.bodySkip.includes(b))) return false;
  return true;
}
function cellsFor(a,b){
  const out={both:[],anb:[],bna:[],nei:[]};
  for(const it of state.DATA.items){
    if(!inUniverse(it,a,b)) continue;
    const x=it.c.includes(a), y=it.c.includes(b);
    out[x&&y?"both":x?"anb":y?"bna":"nei"].push(it);
  }
  return out;
}
/** @returns {import("../../ai-shared/relations.ts").RelKey} */
function relOfCells(c){
  if(!c.both.length) return "con";
  if(!c.anb.length&&!c.bna.length) return "mi";
  if(!c.anb.length) return "3ab";
  if(!c.bna.length) return "3ba";
  return "4";
}
const typeText=cid=>state.CAT[cid].type.split(":")[0];
function whyEmpty(cell,p){
  const A=p.a, B=p.b;
  const q=x=>"“"+x+"”";
  if(cell==="both") return q(A)+" are "+p.typeA+"; "+q(B)+" are "+p.typeB+". Nothing is both.";
  if(cell==="anb") return "Whatever falls under "+q(A)+" also falls under "+q(B)+".";
  if(cell==="bna") return "Whatever falls under "+q(B)+" also falls under "+q(A)+".";
  return "Whatever exists falls under "+q(A)+" or under "+q(B)+"; only a non-existent is neither.";
}
function noteFor(p){
  const t={mi:'"'+p.a+'" and "'+p.b+'" pick out the same class: '+p.typeA+".",
    con:cap(p.a)+" are "+p.typeA+" and "+p.b+" are "+p.typeB+": no common locus.",
    "3ab":"Whatever falls under “"+p.a+"” also falls under “"+p.b+"”, but not the reverse.",
    "3ba":"Whatever falls under “"+p.b+"” also falls under “"+p.a+"”, but not the reverse.",
    "4":cap(p.a)+" and "+p.b+" overlap without either containing the other."};
  return t[p.relation];
}
export function buildPool(){
  const ids=Object.keys(state.CAT), out=[];
  const nop=(state.DATA.nopair||[]).map(x=>x.join("|"));
  for(let i=0;i<ids.length;i++) for(let j=i+1;j<ids.length;j++){
    const a=ids[i], b=ids[j], A=state.CAT[a], B=state.CAT[b];
    if(nop.includes([a,b].sort().join("|"))) continue;
    if((A.kind==="everyday"||B.kind==="everyday")&&(A.sense||B.sense)) continue;
    const r=relOfCells(cellsFor(a,b));
    out.push({a,b,r:r==="3ab"||r==="3ba"?"3":r});
  }
  for(const id of ids) if(state.CAT[id].labels.length>1) out.push({a:id,b:id,r:"mi"});
  state.POOL=out;
}
export function answerList(){ return Object.values(state.answers).sort((x,y)=>(x.at||"").localeCompare(y.at||"")); }
/** @returns {import("../types.ts").Pair} */
function makePair(cand){
  let a=cand.a, b=cand.b, la, lb;
  if(a===b){ const ls=state.CAT[a].labels.slice().sort(()=>Math.random()-.5); la=ls[0]; lb=ls[1]; }
  else { if(Math.random()<.5){ [a,b]=[b,a]; } la=pick(state.CAT[a].labels); lb=pick(state.CAT[b].labels); }
  const cells=cellsFor(a,b), rel=relOfCells(cells);
  const p={id:"g-"+Date.now().toString(36)+Math.random().toString(36).slice(2,6), a:la, b:lb, catA:a, catB:b,
    typeA:typeText(a), typeB:typeText(b), relation:rel, ex:{}, why:{}, generated:true};
  for(const c of CELLS){
    // the neither cell prefers an existent, as in debate; a non-existent only when nothing existent fits
    const pool=c==="nei"&&cells.nei.some(i=>!i.ne)?cells.nei.filter(i=>!i.ne):cells[c];
    p.ex[c]=pool.length?pick(pool).n:null; if(!p.ex[c]) p.why[c]=whyEmpty(c,p);
  }
  p.note=noteFor(p);
  return p;
}
export function nextGenerated(hist){
  hist=hist||answerList();
  const last=hist.slice(-8).map(x=>x.key==="3ab"||x.key==="3ba"?"3":x.key);
  const seen=new Set(hist.slice(-60).map(x=>[x.catA,x.catB].sort().join("|")).concat(state.recent));
  const weak={};
  for(const x of hist.slice(-40)) if(isMiss(x)){ if(x.catA) weak[x.catA]=(weak[x.catA]||0)+1; if(x.catB) weak[x.catB]=(weak[x.catB]||0)+1; }
  // the relation least seen lately comes first, so the stream stays mixed
  const rw={mi:1,con:1,"3":1.3,"4":1};
  for(const r of last) rw[r]=Math.max(.15,rw[r]*.45);
  const rels=Object.keys(rw); let tot=rels.reduce((s,r)=>s+rw[r],0), x=Math.random()*tot, R=rels[0];
  for(const r of rels){ if((x-=rw[r])<=0){R=r;break;} }
  const hide=hiddenKeys(); let cands=state.POOL.filter(c=>c.r===R&&!hide.has(catKey(c.a,c.b)));
  if(!cands.length) cands=state.POOL.filter(c=>c.r===R);       // everything of this relation is skipped: the skips give way

  const w=cands.map(c=>{
    let v=1; const key=[c.a,c.b].sort().join("|");
    if(seen.has(key)) v*=.08;
    v*=1+1.5*((weak[c.a]||0)+(weak[c.b]||0));
    if(R==="con"&&state.CAT[c.a].kind==="everyday"&&state.CAT[c.b].kind==="everyday") v*=.35;
    return v;
  });
  tot=w.reduce((s,v)=>s+v,0); x=Math.random()*tot;
  let ci=0; for(;ci<w.length;ci++){ if((x-=w[ci])<=0) break; }
  const c=cands[Math.min(ci,cands.length-1)];
  state.recent.push([c.a,c.b].sort().join("|")); if(state.recent.length>20) state.recent.shift();
  return makePair(c);
}
