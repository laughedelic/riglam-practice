// every text field made much wider by default (a font with wide letters), in the main states: nothing may pass its container or the page edge
const {open:open0}=require('./harness.js');
const open=async(...a)=>{ const r=await open0(...a); await r.pg.evaluate(SZ=>{ const f=()=>document.querySelectorAll('input').forEach(i=>{ if(!/checkbox|radio|range|hidden/.test(i.type)&&i.size!==SZ) i.size=SZ; }); new MutationObserver(f).observe(document.body,{childList:true,subtree:true}); f(); },SZ);
  if(process.env.UNFIX) await r.pg.addStyleTag({content:'.vpanel,.tutor,.xch,.ans{grid-template-columns:none!important}.ask input{width:auto!important}.vpanel .tutor,.ask{min-width:auto!important}'}); return r; };
const SZ=+process.env.SZ||45;
const ORDER={mi:0,'3ab':1,'3ba':2,'4':3,con:4};
const scan=(pg,label)=>pg.evaluate(([label,SZ])=>{
  document.querySelectorAll('input').forEach(i=>{ if(!/checkbox|radio|range|hidden/.test(i.type)) i.size=SZ; });
  const vis=e=>{const b=e.getBoundingClientRect(); return b.width>0&&b.height>0&&getComputedStyle(e).visibility!=='hidden';};
  const bad=[];
  const page={sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth};
  if(page.sw>page.cw) bad.push('PAGE '+page.sw+'/'+page.cw);
  for(const e of document.querySelectorAll('button,input,textarea,select')){
    if(!vis(e)) continue;
    const b=e.getBoundingClientRect();
    let p=e.parentElement; while(p&&p!==document.body&&getComputedStyle(p).overflowX==='visible') p=p.parentElement;
    const pr=p&&p!==document.body?p.getBoundingClientRect():{left:0,right:innerWidth};
    if(b.right>pr.right+0.5||b.left<pr.left-0.5) bad.push(e.tagName+'#'+e.id+'.'+String(e.className).slice(0,24)+' in '+(p&&p.id||p&&p.className||'body')+' R'+Math.round(b.right-pr.right)+' L'+Math.round(pr.left-b.left));
  }
  for(const c of document.querySelectorAll('#coach,#over,#stage,.card,.opts,.chat,.rcol')){ if(vis(c)&&c.scrollWidth>c.clientWidth+1) bad.push('SCROLLX '+(c.id||c.className)+' '+c.scrollWidth+'/'+c.clientWidth); }
  return bad.length?label+': '+bad.slice(0,6).join(' ; '):null;
},[label,SZ]);
(async()=>{
  const res=[];
  const push=r=>{ if(r) res.push(r); };
  // narrow
  for(const [w,h] of [[390,844],[320,640],[768,900]]){
    const {br,pg}=await open({width:w,height:h},{isMobile:w<700,hasTouch:w<700});
    push(await scan(pg,w+' relations question'));
    const rel=await pg.evaluate(()=>window.__t.cur.p.relation);
    await pg.locator('.strip .chip').nth(ORDER[rel]).click().catch(()=>{}); await pg.waitForTimeout(100);
    push(await scan(pg,w+' relations after relation'));
    for(let i=0;i<4;i++){ const f=pg.locator('input[type=text]:visible,input:not([type]):visible').first(); if(!await f.count()) break; await f.fill('a very long example phrase that goes on and on'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(80); }
    push(await scan(pg,w+' relations examples'));
    await pg.locator('#stage .actions .btn,#stage .btn',{hasText:/check|show result|explain/i}).first().click({timeout:1500}).catch(()=>{}); await pg.waitForTimeout(250);
    push(await scan(pg,w+' relations result'));
    const ex=pg.locator('button:has-text("Explain"), .stage-chat').first(); if(await ex.count()){ await ex.click().catch(()=>{}); await pg.waitForTimeout(500); push(await scan(pg,w+' after explain / chat')); }
    await pg.keyboard.press('Escape'); await pg.waitForTimeout(100);
    await pg.evaluate(()=>{ const b=[document.getElementById('mopt'),document.getElementById('obtn')].find(x=>x&&x.offsetParent); b&&b.click(); }); await pg.waitForTimeout(150);
    push(await scan(pg,w+' options'));
    await pg.keyboard.press('Escape'); await pg.waitForTimeout(100);
    for(const t of ['Pervasions','Review']){
      const tab=pg.locator('#tabbar [role=tab]:has-text("'+t+'"), #tabs .nv:has-text("'+t+'")').locator('visible=true').first();
      if(await tab.count()){ await tab.click().catch(()=>{}); await pg.waitForTimeout(200); push(await scan(pg,w+' '+t)); }
    }
    await br.close();
  }
  // wide
  for(const [w,h] of [[1100,800],[1280,800]]){
    const {br,pg}=await open({width:w,height:h});
    push(await scan(pg,w+' relations question'));
    { const rel=await pg.evaluate(()=>window.__t.cur.p.relation); await pg.locator('.strip .chip').nth(ORDER[rel]).click(); await pg.waitForTimeout(80);
      const n=await pg.locator('.grid input:not([disabled])').count(); for(let i=0;i<n;i++) await pg.locator('.grid input:not([disabled])').nth(i).fill('a very long example phrase that goes on and on');
      await pg.locator('#stage .actions .btn',{hasText:/check|show result/i}).first().click(); await pg.waitForTimeout(250); push(await scan(pg,w+' result'));
      await pg.locator('.coach button:has-text("Explain"), .coach button:has-text("Check and explain")').first().click().catch(()=>{}); await pg.waitForTimeout(500); push(await scan(pg,w+' result + explain')); }
    await pg.evaluate(()=>{ const b=document.getElementById('obtn'); b&&b.click(); }); await pg.waitForTimeout(150);
    push(await scan(pg,w+' options')); await pg.keyboard.press('Escape'); await pg.waitForTimeout(100);
    const tab=pg.locator('#tabs .nv:has-text("Pervasions")'); if(await tab.count()){ await tab.click(); await pg.waitForTimeout(250); push(await scan(pg,w+' pervasions')); }
    await br.close();
  }
  console.log(res.length?res.map(r=>'FAIL '+r).join('\n'):'SWEEP CLEAN');
})();
