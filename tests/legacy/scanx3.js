const {open}=require('./harness.js');
const ORDER={mi:0,'3ab':1,'3ba':2,'4':3,con:4};
const scan=()=>{
  const W=innerWidth, res=[], de=document.documentElement;
  if(de.scrollWidth>W+0.5) res.push('PAGE scrollWidth '+de.scrollWidth+' > '+W);
  for(const n of document.querySelectorAll('body *')){
    const cs=getComputedStyle(n); if(cs.display==='none') continue;
    const r=n.getBoundingClientRect(); if(!r.width&&!r.height) continue;
    const sc=/(auto|scroll)/.test(cs.overflowX)&&n.scrollWidth>n.clientWidth+0.5;
    const cl=/hidden|clip/.test(cs.overflowX)&&n.scrollWidth>n.clientWidth+0.5&&n.clientWidth>0;
    if((sc||cl)&&n.tagName!=='INPUT') res.push((sc?'SCROLLX ':'CLIPX ')+n.tagName+'.'+(n.className&&n.className.baseVal===undefined?n.className:'')+'#'+n.id+' sw='+n.scrollWidth+' cw='+n.clientWidth);
  }
  return res;
};
(async()=>{
 const sizes=[[320,640,1],[360,740,1],[390,844,1],[430,932,1],[768,1024,0],[1100,800,0],[1280,800,0]];
 for(const [w,h,m] of sizes){
  const {br,pg,errs}=await open({width:w,height:h},m?{isMobile:true,hasTouch:true}:{});
  const wide=await pg.evaluate(()=>matchMedia('(min-width:1100px)').matches);
  const rep=[]; const st=async(name)=>{ const r=await pg.evaluate(scan); if(r.length) rep.push(name+': '+r.join(' | ')); };
  const rel=await pg.evaluate(()=>window.__t.cur.p.relation);
  await pg.locator(wide?'.strip .chip':'.rels .rel').nth(ORDER[rel]).click(); await pg.waitForTimeout(100);
  if(wide){ const ids=await pg.locator('.cell input:not([disabled])').evaluateAll(a=>a.map(x=>x.id)); for(const id of ids) await pg.fill('#'+id,'a very long example phrase that goes on and on '.repeat(2)); await pg.click('#stage .actions .btn:not(.ghost):not(.fav)'); }
  else { const n=await pg.evaluate(()=>['both','anb','bna','nei'].filter(c=>!({mi:['anb','bna'],con:['both'],'3ab':['anb'],'3ba':['bna'],'4':[]}[window.__t.ui.rel]).includes(c)).length);
    for(let i=0;i<n;i++){ await pg.fill('#cin','a very long example phrase that goes on and on '+i); await pg.keyboard.press('Enter'); await pg.waitForTimeout(60); }
    /* Done on the last cell already shows the result */ }
  await pg.waitForTimeout(200); await st('result');
  const root=wide?'.coach':'#stage';
  const nch=await pg.locator(root+' .vchip').count();
  for(let i=0;i<nch;i++){ const c=pg.locator(root+' .vchip').nth(i); if(await c.getAttribute('aria-selected')!=='true') await c.click(); await pg.waitForTimeout(60); await st('chip'+i); }
  await pg.evaluate(()=>document.activeElement&&document.activeElement.blur());
  await pg.locator((wide?'.coach':'#stage')+' button:has-text("xplain")').first().click().catch(()=>{}); await pg.waitForTimeout(300); await st('explained');
  const nw=await pg.locator('.grid .qm').count();
  for(let i=0;i<nw;i++){ await pg.locator('.grid .qm').nth(i).click(); await pg.waitForTimeout(80); await st('pop'+i); }
  await pg.keyboard.press('Escape');
  // debate
  await pg.locator('[role=tab]:visible:has-text("Pervasions")').click(); await pg.waitForTimeout(200);
  await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(40);
  await pg.locator('.qcard .btn.ghost').click(); await pg.waitForTimeout(40); await pg.fill('#dex','a very long example phrase that goes on and on and on and on'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(60);
  await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(40); await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(100);
  await st('debate-rel');
  await pg.locator(wide?'.strip .chip':'.rels .rel').first().click(); await pg.waitForTimeout(250); await st('debate-result');
  const dn=await pg.locator(root+' .vchip').count();
  for(let i=0;i<dn;i++){ const c=pg.locator(root+' .vchip').nth(i); if(await c.getAttribute('aria-selected')!=='true') await c.click(); await pg.waitForTimeout(60); await st('dchip'+i); if(await pg.locator(root+' .qs').count()){ await pg.locator(root+' .qs').nth(0).click(); await pg.waitForTimeout(40); await st('dq0'); await pg.locator(root+' .qs').nth(3).click(); await pg.waitForTimeout(40); await st('dq3'); } }
  console.log(w+'x'+h+(wide?' wide':'')+': '+(rep.length?'\n  '+rep.join('\n  '):'clean'), errs.filter(e=>!/CERT|net::/.test(e)));
  await br.close();
 }
})().catch(e=>{console.log('CRASH',e.message.split('\n').slice(0,6).join(' | '));process.exit(1)});
