import { state } from "../state.js";
import { el } from "../core/dom.js";
import { tbIcon } from "../core/icons.js";
import { REL, cellLabel, notaOf, refOf } from "../core/rel.js";
import { dayOf } from "../core/util.js";
import { put } from "./answers.js";
import { advance } from "./queue.js";
import { norm, pairCats } from "./universe.js";
import { exGrid } from "../review/review.js";
import { render, top0 } from "../shell/render.js";
import { switchTo } from "../shell/tabs.js";

 const openFavs=new Set(), favQ={};
/* ---------- favorite pairs ---------- */
// One favorite per pair of categories, whichever way round and whichever of their labels the pair showed;
// the pair itself (relation, reference examples, note) is stored with it so it can be looked up and practiced again.
export const favSafe=x=>String(x).replace(/[^A-Za-z0-9]+/g,"_");
export function favKey(p){ const [a,b]=pairCats(p); return a&&b?"c_"+favSafe([a,b].sort().join("__")):"l_"+favSafe([norm(p.a),norm(p.b)].sort().join("__")); }
export const isFav=p=>!!p&&!!state.favs[favKey(p)];
function favWrite(k,fn,undo){
  state.favErr="";
  favQ[k]=(favQ[k]||Promise.resolve()).catch(()=>{}).then(fn).catch(e=>{
    undo(); const c=(e&&e.code)||"error";
    state.favErr="The favorite could not be saved ("+c+"), so it was undone."; render();
  });
}
function setFav(p,on){
  if(!state.db||!p) return;
  const k=favKey(p), had=state.favs[k];
  if(on&&!had){
    const [ca,cb]=pairCats(p);
    /** @type {import("../types.ts").FavDoc} */
    const draft={key:k,a:p.a,b:p.b,catA:ca,catB:cb,relation:p.relation,pair:p,at:new Date().toISOString()};
    const doc=JSON.parse(JSON.stringify(draft));        // without the undefined fields
    state.favs[k]=doc; render();
    favWrite(k,()=>put("favorites",k,doc),()=>{ delete state.favs[k]; });
  } else if(!on&&had){
    delete state.favs[k]; render();
    favWrite(k,()=>state.db.collection("favorites").doc(k).delete(),()=>{ state.favs[k]=had; });
  }
}
export const toggleFav=p=>setFav(p,!isFav(p));
/** The pair the star and the key F act on: the one on screen, but not while Find a pair asks for the words of another (the old pair stays until "Use this pair"). */
export const favTarget=()=>{ const c=state.cur, u=state.ui; return c&&c.p&&!(u&&u.find&&!u.checked&&u.step===0)?c.p:null; };
/** The star of the pair bar: pressed while the pair is a favorite. Not there without storage, and not for a pair of the learner's own (it has no categories to keep). */
export function favBtn(p){
  if(!state.db||!p||p.own) return null;
  const on=isFav(p), t=on?"Remove from favorites":"Add to favorites";
  return el("button",{type:"button",class:"ib starb","aria-pressed":on?"true":"false","aria-label":t,title:t+" (F)",onclick:()=>toggleFav(p)},tbIcon("star"));
}
function startFav(p){ switchTo("practice"); state.retryQ=[p]; state.retryTag="Favorite"; advance(); render(); top0(); } // switch first: leaving another tab may draw a pair
export function favSection(s){
  if(!state.db) return;
  const list=Object.values(state.favs).sort((x,y)=>(y.at||"").localeCompare(x.at||""));
  const sec=el("div",{class:"section"},el("p",{class:"label"},"Favorites",el("span",{class:"hint",text:list.length?list.length+" saved":"star a pair to keep it here"})));
  if(!list.length) sec.append(el("p",{class:"empty-note",text:"Press the star (or F) on a pair while you practice. It stays here with its relation and examples, whether or not you answered it right."}));
  else sec.append(el("ul",{class:"favs"},list.map(f=>{
    const p=f.pair||/** @type {import("../types.ts").Pair} */({a:f.a,b:f.b,relation:f.relation,ex:{},why:{}}), k=REL[p.relation]||REL[f.relation];
    const cell=c=>{
      const ref=refOf(p,c);
      if(ref) return el("div",{class:"cell","aria-label":cellLabel(c,p)},el("span",{class:"cx",text:ref}));
      return el("div",{class:"cell locked","aria-label":cellLabel(c,p)+": nothing"},el("span",{class:"empty",text:"∅"}),(p.why&&p.why[c])?el("div",{class:"fb",text:p.why[c]}):null);
    };
    return el("li",null,el("details",{open:openFavs.has(f.key),ontoggle:e=>{ if(e.target.open) openFavs.add(f.key); else openFavs.delete(f.key); }},
      el("summary",null,el("span",{class:"m",text:"★"}),el("span",null,p.a+" / "+p.b,el("span",{class:"sub",text:(k?k.name:"")+(f.at?" · saved "+dayOf(f.at):"")}))),
      el("div",{class:"fbody"},
        k?el("p",{class:"note"},k.name+": "+k.gloss(p.a,p.b).toLowerCase()+".",notaOf(p.relation)&&state.nota!=="codes"?[" ",el("span",{class:"nota math",text:notaOf(p.relation)})]:null):null,
        exGrid(p,cell),
        el("p",{class:"note"},(p.typeA||p.typeB)?el("span",{class:"types",text:p.a+": "+(p.typeA||"?")+" · "+p.b+": "+(p.typeB||"?")}):null,p.note||""),
        el("div",{class:"actions"},
          el("button",{type:"button",class:"btn ghost",onclick:()=>{ openFavs.delete(f.key); const q=Object.assign({},f); delete state.favs[f.key]; render(); favWrite(f.key,()=>state.db.collection("favorites").doc(f.key).delete(),()=>{ state.favs[f.key]=q; }); },text:"Remove"}),
          el("button",{type:"button",class:"btn",onclick:()=>startFav(p),text:"Practice this pair"})))));
  })));
  if(state.favErr) sec.append(el("p",{class:"status",text:state.favErr}));
  s.append(sec);
}
