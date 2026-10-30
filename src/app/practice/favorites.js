import { state } from "../state.js";
import { negSides } from "../../ai-shared/relations.ts";
import { put } from "./answers.js";
import { advance } from "./queue.js";
import { norm, pairCats } from "./universe.js";
import { render, top0 } from "../shell/render.js";
import { switchTo } from "../shell/tabs.js";

const favQ={};
/** The class of each term of a kept pair, "furniture: form": a negated side has none (it is not in the class of what it negates), so it is left out. */
export const typesLine=p=>{ const [na,nb]=negSides(p); return [[p.a,p.typeA,na],[p.b,p.typeB,nb]].filter(x=>!x[2]).map(([l,t])=>l+": "+(t||"?")).join(" · "); };
/* ---------- favorite pairs ---------- */
// One favorite per pair of categories, whichever way round and whichever of their labels the pair showed (a negated side is
// another category: "non_" before its name); the pair itself (relation, reference examples, note) is stored with it so it can be looked up and practiced again.
export const favSafe=x=>String(x).replace(/[^A-Za-z0-9]+/g,"_");
export function favKey(p){
  const [a,b]=pairCats(p), [na,nb]=negSides(p), non=(c,n)=>(n?"non_":"")+c;
  return a&&b?"c_"+favSafe([non(a,na),non(b,nb)].sort().join("__")):"l_"+favSafe([norm(p.a),norm(p.b)].sort().join("__"));
}
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
export function startFav(p){ switchTo("practice"); state.retryQ=[p]; state.retryTag="Favorite"; advance(); render(); top0(); } // switch first: leaving another tab may draw a pair
// a favorite taken out of Review; a removal that fails is undone
export function removeFav(f){ const q=Object.assign({},f); delete state.favs[f.key]; render(); favWrite(f.key,()=>state.db.collection("favorites").doc(f.key).delete(),()=>{ state.favs[f.key]=q; }); }
