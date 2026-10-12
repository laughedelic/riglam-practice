const {open}=require('./harness.js');
const {ringScan}=require('./ring.js');
const D=require('./harness.js').SHOTS;
const out=[]; const ok=(n,c,x)=>{out.push((c?'PASS ':'FAIL ')+n+(c?'':'  '+JSON.stringify(x)));};
const ORDER={mi:0,'3ab':1,'3ba':2,'4':3,con:4};
const EMPTY={mi:['anb','bna'],con:['both'],'3ab':['anb'],'3ba':['bna'],'4':[]};
const CELLS=['both','anb','bna','nei'];
async function toTerms(pg){
 // find a pair whose Terms panel has definitions with a Russian definition, answer it, open Terms and the definitions
 for(let i=0;i<40;i++){
  const rel=await pg.evaluate(()=>window.__t.cur.p.relation);
  await pg.locator('.rels .rel').nth(ORDER[rel]).click(); await pg.waitForTimeout(60);
  const n=await pg.evaluate(()=>['both','anb','bna','nei'].filter(c=>!({mi:['anb','bna'],con:['both'],'3ab':['anb'],'3ba':['bna'],'4':[]}[window.__t.ui.rel]).includes(c)).length);
  for(let k=0;k<n;k++){ await pg.fill('#cin','x'+k); await pg.keyboard.press('Enter'); await pg.waitForTimeout(40); }
  await pg.waitForTimeout(100); await pg.evaluate(()=>document.activeElement&&document.activeElement.blur());
  await pg.locator('.vchip:has-text("Terms")').click(); await pg.waitForTimeout(80);
  const b=pg.locator('.tm-tog'); if(await b.count()){ await b.click(); await pg.waitForTimeout(100); return true; }
  await pg.locator('#stage .actions button:has-text("Next")').first().click(); await pg.waitForTimeout(120);
 }
 return false;
}
(async()=>{
 let {br,pg,errs}=await open({width:390,height:844},{isMobile:true,hasTouch:true});
 ok('default: English only',await pg.evaluate(()=>window.__t.defLang)==='en');
 // find a pair with a Russian definition among the entries
 let found=false;
 for(let t=0;t<12&&!found;t++){
  if(!await toTerms(pg)){ break; }
  const c=await pg.evaluate(()=>({ru:document.querySelectorAll('.tm-defs .ru').length, name:document.querySelectorAll('.tm-defs .tm-ru').length, n:document.querySelectorAll('.tm-defs .tm-d').length}));
  ok('English only: no Russian definition and no Russian name in the entries ('+c.n+' entries)',c.ru===0&&c.name===0,c);
  // switch on from Options
  await pg.evaluate(()=>document.activeElement&&document.activeElement.blur());
  await pg.locator('#mopt').click(); await pg.waitForTimeout(150);
  const row=await pg.evaluate(()=>{const r=[...document.querySelectorAll('.orow')].find(x=>/definitions/i.test(x.querySelector('.tl').innerText)); return r?{txt:r.innerText, btns:[...r.querySelectorAll('button')].map(b=>b.innerText+':'+b.getAttribute('aria-pressed'))}:null;});
  ok('Options has a Definitions row with English and English + Russian',row&&/English/i.test(row.btns.join())&&/English \+ Russian/i.test(row.btns.join()),row);
  ok('English is selected at first',row&&/^English:true/i.test(row.btns[0]),row);
  await pg.screenshot({path:D+'v54-options.png'});
  const r1=await pg.evaluate(ringScan); ok('options with the new row: no focus ring is clipped',r1.length===0,r1);
  await pg.locator('.orow:has-text("Definitions") button:has-text("English + Russian")').click(); await pg.waitForTimeout(120);
  ok('choosing it is stored',await pg.evaluate(()=>localStorage.getItem('rd-deflang'))==='enru'&&await pg.evaluate(()=>window.__t.defLang)==='enru');
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(150);
  const c2=await pg.evaluate(()=>({ru:document.querySelectorAll('.tm-defs .ru').length, name:[...document.querySelectorAll('.tm-defs .tm-ru')].map(x=>x.innerText), n:document.querySelectorAll('.tm-defs .tm-d').length, lang:[...document.querySelectorAll('.tm-defs .tm-ru')].every(x=>x.getAttribute('lang')==='ru')}));
  ok('English + Russian: every entry names the Russian term beside the English one',c2.name.length===c2.n&&c2.n>0&&c2.lang,c2);
  const dt=await pg.evaluate(()=>{const d=document.querySelector('.tm-defs dt'); const ru=d.querySelector('.tm-ru'); return {txt:d.innerText.replace(/\s+/g,' '), w:getComputedStyle(ru).fontWeight, col:getComputedStyle(ru).color, dtCol:getComputedStyle(d).color};});
  ok('the Russian name is regular weight and muted, e.g. "Form · рупа · chapter"',/ · /.test(dt.txt)&&/[а-яё]/i.test(dt.txt)&&+dt.w<=400&&dt.col!==dt.dtCol,dt);
  await pg.screenshot({path:D+'v54-defs-ru.png'});
  if(c2.ru>0){ found=true; ok('English + Russian: the Russian definitions show too ('+c2.ru+')',true); }
  else { // switch off again and try another pair
   await pg.evaluate(()=>window.__t.setDefLang('en')); await pg.evaluate(()=>document.activeElement&&document.activeElement.blur());
   await pg.locator('#stage .actions button:has-text("Next")').first().click(); await pg.waitForTimeout(120);
  }
 }
 ok('some pair showed a Russian definition',found);
 // a Russian name without a Russian definition is still named
 ok('the page overflows nowhere',await pg.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 // back to English only
 await pg.evaluate(()=>window.__t.setDefLang('en')); await pg.waitForTimeout(120);
 ok('switching back removes the Russian again',await pg.evaluate(()=>document.querySelectorAll('.tm-defs .ru, .tm-defs .tm-ru').length===0));
 ok('no page errors',errs.filter(e=>!/fonts|ERR_|proxy/i.test(e)).length===0,errs);
 await br.close();
 // 320 px and wide: the options row fits
 for(const [w,h] of [[320,640],[1280,800]]){
  ({br,pg,errs}=await open({width:w,height:h},w<1000?{isMobile:true,hasTouch:true}:{}));
  await pg.locator(w<1000?'#mopt':'#obtn').click(); await pg.waitForTimeout(200);
  const o=await pg.evaluate(()=>({sw:document.documentElement.scrollWidth<=innerWidth, fit:(()=>{const r=[...document.querySelectorAll('.orow')].find(x=>/definitions/i.test(x.innerText)); if(!r) return false; const b=r.getBoundingClientRect(), p=document.querySelector('.opts').getBoundingClientRect(); return b.right<=p.right+0.5;})()}));
  ok(w+' px: the Definitions row fits in Options',o.sw&&o.fit,o);
  await pg.screenshot({path:D+'v54-options-'+w+'.png'});
  await br.close();
 }
 console.log(out.join('\n')); process.exit(out.some(l=>l.startsWith('FAIL'))?1:0);
})().catch(e=>{console.log(out.join('\n')); console.log('CRASH',e.message.split('\n').slice(0,6).join('\n')); process.exit(2);});
