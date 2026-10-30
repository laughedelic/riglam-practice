import { state } from "../state.js";

/* ---------- Pervasions: what Review counts (path/review.tsx draws it) ---------- */
// null without any answers
export function debateStats(){
  const all=Object.values(state.debates).sort((x,y)=>(x.at||"").localeCompare(y.at||""));
  if(!all.length) return null;
  const relOk=all.filter(a=>a.correct).length;
  const rows=[0,1,2,3].map(i=>{ const xs=all.map(a=>a.qs&&a.qs[i]).filter(Boolean); return [i,xs.length,xs.filter(q=>q.dok).length]; });
  const times=all.flatMap(a=>(a.qs||[]).filter(q=>q.limit&&q.say!=="time"&&!q.timeout&&q.ms!=null).map(q=>q.ms)).sort((x,y)=>x-y);
  const med=times.length?times[Math.floor(times.length/2)]:null;
  const timedN=all.reduce((n,a)=>n+(a.qs||[]).filter(q=>q.limit).length,0), outN=all.reduce((n,a)=>n+(a.qs||[]).filter(q=>q.timeout).length,0);
  return {n:all.length,relOk,rows,med,timedN,outN};
}
