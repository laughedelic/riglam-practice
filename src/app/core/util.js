export const pairsOf=b=>Array.isArray(b&&b.pairs)?b.pairs:[];
export const gradeOf=a=>a?(a.grade||(a.correct?"ok":"bad")):"";
export const isMiss=a=>{ const g=gradeOf(a); return g==="bad"||g==="part"; };
export const cap=s=>s?s[0].toUpperCase()+s.slice(1):s;
export const pick=a=>a[Math.floor(Math.random()*a.length)];
export const dayOf=iso=>(iso||"").slice(0,10);
export const today=()=>new Date().toISOString().slice(0,10);
