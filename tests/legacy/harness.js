// Test harness for the browser tests in this folder (migrated from the practice session, page version 63).
// It loads the ARTIFACT build (dist/artifact/index.html, made by `npm run build:artifact`), wraps it in the same
// document skeleton the Claude artifact frame uses, and mocks `window.claude`: `db` (five collections plus
// `labruns` and `flags`) and `sample` (the AI). Tests reach the page's internals through `window.__t`, which the
// page itself exports through its test hook (see the end of src/app/app.js) when the harness defines
// `window.__riglamTest` before the page runs.
const {chromium}=require('@playwright/test');
const fs=require('fs');
const path=require('path');
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
window.__asks=[];
const sample=async(turns,opts)=>{
  window.__asks.push(turns.length);
  if(window.__delay) await new Promise(r=>setTimeout(r,window.__delay)); const t1='Both: a clay pot fits.\\nNeither: a stone is B, not A.'; if(opts.onText) opts.onText({text:t1.slice(0,12)}); await new Promise(r=>setTimeout(r,60)); return {text:window.__reply||t1,truncated:false};
};
window.claude={use:async n=>n==='db'?db:n==='sample'?sample:null};
</script>`;
  const html='<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}html{scroll-padding-top:env(safe-area-inset-top,0px)}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#fff;color:#000}img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>'+mock+page_+'</body></html>';
  return {html};
}
async function open(vp,opts={}){
  const autoExplain=opts.autoExplain; delete opts.autoExplain;
  const freshMenu=opts.freshMenu; delete opts.freshMenu; // the page's own default (a wide screen starts with the menu pinned); the old tests start with the menu away, as it came on demand
  const {html}=load();
  const br=await chromium.launch();
  const ctx=await br.newContext(Object.assign({viewport:vp,colorScheme:'light',reducedMotion:'reduce'},opts));
  // a checked answer does not ask for its explanation by itself in the old tests (they click Explain); a test turns it on with {autoExplain:true}
  await ctx.addInitScript(on=>{ try{ if(localStorage.getItem('rd-autoexplain')===null) localStorage.setItem('rd-autoexplain',on?'1':'0'); }catch(e){} },!!autoExplain);
  await ctx.addInitScript(()=>{ window.__riglamTest=t=>{ window.__t=t; }; });
  if(!freshMenu) await ctx.addInitScript(()=>{ try{ if(localStorage.getItem('rd-menu')===null) localStorage.setItem('rd-menu','0'); }catch(e){} });
  const pg=await ctx.newPage(); pg.setDefaultTimeout(4000);
  const errs=[]; pg.on('console',m=>{if(m.type()==='error')errs.push(m.text())}); pg.on('pageerror',e=>errs.push('ERR '+e.message));
  await pg.route('http://t/**',r=>r.fulfill({body:html,contentType:'text/html'}));
  await pg.goto('http://t/index.html',{waitUntil:'domcontentloaded'}); await pg.waitForTimeout(800);
  return {br,pg,errs};
}
// Goes to a screen as a learner would: the menu lists the exercises, Review and Settings (a drawer on a phone; on a wide screen the menu button pins it open).
// From Review the back arrow returns to the exercise first; an open overlay (Settings, the practice options) is closed.
const GO={Relations:'practice',Pervasions:'debate','Find a pair':'find',Review:'review',Settings:'settings'};
async function go(pg,name){
  const k=GO[name];
  if(await pg.locator('#over').isVisible()) await pg.keyboard.press('Escape');
  if(!(await pg.locator('#menu').isVisible())){
    if(!(await pg.locator('#menubtn').isVisible())) await pg.locator('#mback').click();
    await pg.locator('#menubtn').click();
  }
  await pg.locator('#menu :is(.mrow,.fbtn)[data-go="'+k+'"]').click(); // not the today line, which also opens Review
}
// Opens the practice options of the exercise on screen (the sliders button in the top bar).
async function settings(pg){ await pg.locator('#msess').click(); await pg.waitForTimeout(100); }
// Waits until `read` (a function run in the page) returns the same value on `times` reads in a row, `every` ms apart, and
// returns that value. A test uses it before it measures a position, so that a render that arrives late (the saved answer
// coming back from the db) or a transition in progress cannot change the layout between two measurements. It stops waiting
// after `timeout` ms and returns the last value, so a layout that never settles shows up as a failing check, not a hang.
async function settled(pg,read,{every=40,times=3,timeout=3000}={}){
  const t0=Date.now(); let last, same=0;
  for(;;){
    const v=JSON.stringify(await pg.evaluate(read));
    same=v===last?same+1:1; last=v;
    if(same>=times||Date.now()-t0>timeout) return v===undefined?undefined:JSON.parse(v);
    await pg.waitForTimeout(every);
  }
}
// The tutor's panel on a wide screen: the chat button opens it only once there is a result, so a check of what it holds before that (the key hints, Recent)
// opens it as the button used to, through the test hook.
async function toggleCoach(pg){ await pg.evaluate(()=>{ window.__t.coachOpen=!window.__t.coachOpen; window.__t.render(); }); await pg.waitForTimeout(100); }
module.exports={open,go,settings,toggleCoach,SHOTS,settled};
