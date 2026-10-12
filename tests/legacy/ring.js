const {open}=require('./harness.js');
const ORDER={mi:0,'3ab':1,'3ba':2,'4':3,con:4};
const ringScan=()=>{
  const out=[];
  const els=[...document.querySelectorAll('button,input,select,textarea,summary,[tabindex]')].filter(n=>{const cs=getComputedStyle(n),r=n.getBoundingClientRect();return cs.display!=='none'&&cs.visibility!=='hidden'&&r.width>0&&r.height>0&&n.tabIndex>=0&&!n.disabled;});
  for(const n of els){
    const r=n.getBoundingClientRect(); let a=n.parentElement;
    while(a&&a!==document.documentElement){
      const cs=getComputedStyle(a);
      if(/hidden|clip|auto|scroll/.test(cs.overflowX)){
        const b=a.getBoundingClientRect(), L=b.left+parseFloat(cs.borderLeftWidth), R=b.right-parseFloat(cs.borderRightWidth);
        // only report when the element is inside the visible part of the container vertically
        if(r.bottom>b.top&&r.top<b.bottom&&(r.left-4<L-0.5||r.right+4>R+0.5)) out.push(n.tagName+'.'+String(n.className).split(' ')[0]+'#'+n.id+' ('+(n.textContent||n.placeholder||'').trim().slice(0,18)+') in '+a.tagName+'.'+String(a.className).split(' ')[0]+'#'+a.id+' gap L'+Math.round(r.left-L)+' R'+Math.round(R-r.right));
      }
      a=a.parentElement;
    }
  }
  return [...new Set(out)];
};
module.exports={ringScan,ORDER};
if(require.main===module)(async()=>{
 for(const [w,h,m] of [[390,844,1],[320,640,1],[1280,800,0]]){
  const {br,pg}=await open({width:w,height:h},m?{isMobile:true,hasTouch:true}:{});
  const wide=await pg.evaluate(()=>matchMedia('(min-width:1100px)').matches);
  const rep=[]; const st=async(name)=>{ const r=await pg.evaluate(ringScan); if(r.length) rep.push('  '+name+':\n    '+r.join('\n    ')); };
  await st('start');
  const rel=await pg.evaluate(()=>window.__t.cur.p.relation);
  await pg.locator(wide?'.strip .chip':'.rels .rel').nth(ORDER[rel]).click(); await pg.waitForTimeout(100); await st('relation picked');
  if(wide){ const ids=await pg.locator('.cell input:not([disabled])').evaluateAll(a=>a.map(x=>x.id)); for(const id of ids) await pg.fill('#'+id,'zzz'); await pg.focus('#'+ids[0]); await st('cells'); await pg.click('#stage .actions .btn:not(.ghost):not(.fav)'); }
  else { const n=await pg.evaluate(()=>['both','anb','bna','nei'].filter(c=>!({mi:['anb','bna'],con:['both'],'3ab':['anb'],'3ba':['bna'],'4':[]}[window.__t.ui.rel]).includes(c)).length);
    await pg.focus('#cin'); await st('cell input');
    for(let i=0;i<n;i++){ await pg.fill('#cin','zzz '+i); await pg.keyboard.press('Enter'); await pg.waitForTimeout(60); }
    await pg.waitForTimeout(100); await st('after cells'); const b=pg.locator('#stage > .actions .btn'); if(await b.count()&&await b.first().innerText()==='Check') await b.first().click(); await pg.waitForTimeout(150); }
  await pg.waitForTimeout(150); await st('result');
  const root=wide?'.coach':'#stage'; const nch=await pg.locator(root+' .vchip').count();
  for(let i=0;i<nch;i++){ await pg.locator(root+' .vchip').nth(i).click(); await pg.waitForTimeout(60); await pg.locator(root+' .vchip').nth(i).focus(); await st('chip'+i); }
  await pg.locator('[role=tab]:visible:has-text("Pervasions")').click(); await pg.waitForTimeout(200); await st('questions start');
  await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(40); await pg.locator('.qcard .btn.ghost').click(); await pg.waitForTimeout(40); await pg.focus('#dex'); await st('why field');
  await pg.fill('#dex','zzz'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(60);
  await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(40); await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(100); await st('relation step');
  await pg.locator('.rels .rel, .strip .chip').first().click().catch(()=>{}); await pg.waitForTimeout(250); await pg.locator('.vchip').first().focus().catch(()=>{}); await st('debate result');
  await pg.locator('[role=tab]:visible:has-text("Review")').click(); await pg.waitForTimeout(200); await st('review');
  const ob=pg.locator('button:has-text("Options"), [aria-label="Options"]').first(); if(await ob.count()){ await ob.click().catch(()=>{}); await pg.waitForTimeout(200); await st('options'); }
  console.log(w+'x'+h+(rep.length?'\n'+rep.join('\n'):' clean')); await br.close();
 }
})();
