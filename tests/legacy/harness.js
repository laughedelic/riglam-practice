// Test harness for the browser tests in this folder (migrated from the practice session, page version 63).
// It loads the ARTIFACT build (dist/artifact/index.html, made by `npm run build:artifact`), wraps it in the same
// document skeleton the Claude artifact frame uses, and mocks `window.claude`: `db` (five collections plus
// `labruns` and `flags`) and `sample` (the AI). Tests reach the page's internals through `window.__t`, which the
// page itself exports through its test hook (see the end of src/app/app.js) when the harness defines
// `window.__riglamTest` before the page runs.
const {chromium}=require('@playwright/test');
const fs=require('fs');
const path=require('path');
const process_env_lab=process.env.LAB==='1';
const ROOT=path.resolve(__dirname,'../..');
const SHOTS=path.join(__dirname,'out','t')+'/';
fs.mkdirSync(SHOTS,{recursive:true});
function load(){
  const page_=fs.readFileSync(path.join(ROOT,'dist/artifact/index.html'),'utf8');
  const mock=`<script>
const S={answers:{},debates:{},batches:{},favorites:{},skips:{},labruns:{},flags:{}};window.__S=S;window.__ops=[];
const subs={answers:[],debates:[],batches:[],favorites:[],skips:[],labruns:[],flags:[]};window.__subs=subs;
function snap(n){const docs=Object.entries(S[n]).map(([id,d])=>({id,exists:true,data:()=>d}));return {docs,size:docs.length,empty:!docs.length};}
const db={collection(n){const q={orderBy(){return q},limit(){return q},onSnapshot(f){subs[n].push(f);setTimeout(()=>f(snap(n)),10);return()=>{}},
 doc(id){return{set:async d=>{ if((window.__failSet||{})[n]) throw {code:'quota_exceeded'}; window.__ops.push(['set',n,id]); S[n][id]=d; setTimeout(()=>subs[n].forEach(f=>f(snap(n))),5); },delete:async()=>{ window.__ops.push(['delete',n,id]); delete S[n][id]; setTimeout(()=>subs[n].forEach(f=>f(snap(n))),5); } }}};return q;}};
window.__asks=[];window.__labcalls=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
// default lab answer: everything is in both categories and exists; a test overrides per model with window.__labAns[model]=(thing,i)=>record, "judge" included
const short=id=>/haiku/.test(id)?'haiku':/sonnet/.test(id)?'sonnet':'opus';
function labReply(prompt,model){
  const judge=String(prompt).includes('You are the judge');
  const m=String(prompt).split('Things:\\n')[1]||''; const things=[...m.matchAll(/^\\d+\\. (".*")$/gm)].map(x=>JSON.parse(x[1]));
  const f=(window.__labAns||{})[judge?'judge':short(model)]||((t,i)=>({}));
  const arr=things.map((t,i)=>Object.assign({thing:t,reading:'mock '+t,inA:true,inB:true,exists:true,unsure:false},judge?{right:[1,2,3],reason:'mock reason'}:{},f(t,i)));
  return JSON.stringify({things:arr});
}
const sample=async(turns,opts)=>{
  window.__asks.push(turns.length);
  if(opts&&opts.model){
    const judge=String(turns).includes('You are the judge');
    window.__labcalls.push({model:opts.model,tier:opts.modelTier,effort:opts.effort,cache:opts.cache,judge,len:String(turns).length,prompt:String(turns)});
    await sleep(((window.__labdelays||{})[judge?'judge':short(opts.model)])||window.__labdelay||25);
    const fail=(window.__labFail||{})[judge?'judge':short(opts.model)]; if(fail) throw {code:fail,message:fail};
    const raw=(window.__labRaw||{})[judge?'judge':short(opts.model)];
    const sh=judge?'judge':short(opts.model); const applied=(window.__applied&&sh in window.__applied)?window.__applied[sh]:opts.model;
    return {text:raw!==undefined?raw:labReply(turns,opts.model),truncated:false,modelTierApplied:opts.modelTier,modelApplied:applied||undefined};
  }
  if(window.__delay) await new Promise(r=>setTimeout(r,window.__delay)); const t1='Both: a clay pot fits.\\nNeither: a stone is B, not A.'; if(opts.onText) opts.onText({text:t1.slice(0,12)}); await new Promise(r=>setTimeout(r,60)); return {text:window.__reply||t1,truncated:false};
};
window.claude={use:async n=>n==='db'?db:n==='sample'?sample:null};
</script>`;
  const html='<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}html{scroll-padding-top:env(safe-area-inset-top,0px)}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#fff;color:#000}img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>'+mock+page_+'</body></html>';
  return {html};
}
async function open(vp,opts={}){
  const lab=opts.lab; delete opts.lab;
  const {html}=load();
  const br=await chromium.launch();
  const ctx=await br.newContext(Object.assign({viewport:vp,colorScheme:'light'},opts));
  // the lab is off in the old tests (it adds calls and renders); a test turns it on with {lab:true}
  await ctx.addInitScript(on=>{ try{ if(localStorage.getItem('rd-lab')===null) localStorage.setItem('rd-lab',on?'1':'0'); }catch(e){} },!!lab||process_env_lab);
  await ctx.addInitScript(()=>{ window.__riglamTest=t=>{ window.__t=t; }; });
  const pg=await ctx.newPage(); pg.setDefaultTimeout(4000);
  const errs=[]; pg.on('console',m=>{if(m.type()==='error')errs.push(m.text())}); pg.on('pageerror',e=>errs.push('ERR '+e.message));
  await pg.route('http://t/**',r=>r.fulfill({body:html,contentType:'text/html'}));
  await pg.goto('http://t/index.html',{waitUntil:'domcontentloaded'}); await pg.waitForTimeout(800);
  // old lab tests expect a judge on every case: the spot check is switched to "always" (a test sets window.__t.labSpotN itself to try the real rule)
  if(lab||process_env_lab) await pg.evaluate(()=>{ window.__t.labSpotN=1; });
  return {br,pg,errs};
}
module.exports={open,SHOTS};
