const {open}=require('./harness.js');
const ORDER={mi:0,'3ab':1,'3ba':2,'4':3,con:4};
const scan=()=>{
  const W=innerWidth, res=[];
  const de=document.documentElement;
  if(de.scrollWidth>W+0.5) res.push('PAGE scrollWidth '+de.scrollWidth+' > '+W);
  if(document.body.scrollWidth>W+0.5) res.push('BODY scrollWidth '+document.body.scrollWidth);
  for(const n of document.querySelectorAll('body *')){
    const cs=getComputedStyle(n); if(cs.display==='none') continue;
    const r=n.getBoundingClientRect(); if(!r.width&&!r.height) continue;
    const sc=/(auto|scroll)/.test(cs.overflowX)&&n.scrollWidth>n.clientWidth+0.5;
    const cl=/hidden|clip/.test(cs.overflowX)&&n.scrollWidth>n.clientWidth+0.5&&n.clientWidth>0;
    if(sc||cl) res.push((sc?'SCROLLX ':'CLIPX ')+n.tagName+'.'+(n.className&&n.className.baseVal===undefined?n.className:'')+'#'+n.id+' sw='+n.scrollWidth+' cw='+n.clientWidth);
  }
  return res;
};
(async()=>{
 const ORDER={mi:0,'3ab':1,'3ba':2,'4':3,con:4};
 const LONG='antidisestablishmentarianismantidisestablishmentarianism';
 for(const [w,h,m] of [[320,640,1],[390,844,1],[1100,800,0],[1440,900,0]]){
  const {br,pg}=await open({width:w,height:h},m?{isMobile:true,hasTouch:true}:{});
  const wide=await pg.evaluate(()=>matchMedia('(min-width:1100px)').matches);
  const rep=[]; const st=async(n)=>{const r=await pg.evaluate(scan).then(a=>a.filter(x=>!/INPUT/.test(x))); if(r.length) rep.push(n+': '+r.join(' | '));};
  const rel=await pg.evaluate(()=>window.__t.cur.p.relation);
  await pg.locator(wide?'.strip .chip':'.rels .rel').nth(ORDER[rel]).click(); await pg.waitForTimeout(100);
  if(wide){ const ids=await pg.locator('.cell input:not([disabled])').evaluateAll(a=>a.map(x=>x.id)); for(const id of ids) await pg.fill('#'+id,LONG); await pg.click('#stage .actions .btn:not(.ghost):not(.fav)'); }
  else { const n=await pg.evaluate(()=>['both','anb','bna','nei'].filter(c=>!({mi:['anb','bna'],con:['both'],'3ab':['anb'],'3ba':['bna'],'4':[]}[window.__t.ui.rel]).includes(c)).length);
    for(let i=0;i<n;i++){ await pg.fill('#cin',LONG); await pg.keyboard.press('Enter'); await pg.waitForTimeout(60); }
    await st('review-long'); await pg.locator('#stage > .actions .btn').click(); }
  await pg.waitForTimeout(250); await st('result-long');
  await pg.evaluate(()=>document.activeElement&&document.activeElement.blur());
  await pg.locator('#stage .actions button:has-text("xplain")').click().catch(()=>{}); await pg.waitForTimeout(300);
  if(!wide){ await pg.locator('#stage .stage-chat').click().catch(()=>{}); await pg.waitForTimeout(200); await st('chat'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(100); }
  await pg.locator('[role=tab]:visible:has-text("Pervasions")').click(); await pg.waitForTimeout(200);
  for(let q=0;q<4;q++){ const ok=await pg.locator('.dbtn:has-text("Accept"), button:has-text("Accept")').first().click({timeout:1500}).then(()=>true).catch(()=>false); await pg.waitForTimeout(80); }
  await st('questions');
  console.log(w+'x'+h+(wide?' wide':'')+': '+(rep.length?'\n  '+rep.join('\n  '):'clean'));
  await br.close();
 }
})().catch(e=>{console.log('CRASH',e.message.split('\n').slice(0,6).join(' | '));process.exit(1)});
