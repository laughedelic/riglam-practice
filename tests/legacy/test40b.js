const {open,go,settings}=require('./harness.js');
const out=[]; const ok=(n,c,x)=>{out.push((c?'PASS ':'FAIL ')+n+(c?'':'  '+JSON.stringify(x)));};
const ORDER={mi:0,'3ab':1,'3ba':2,'4':3,con:4};
(async()=>{
 for(const [name,vp,o] of [['phone',{width:390,height:844},{isMobile:true,hasTouch:true}]]){
  const {br,pg,errs}=await open(vp,o); const W=name==='wide';
  const chk=W?'.coach .vpanel p':'.vpanel p';
  // practice: unchecked examples -> chip in the verdict
  const rel=await pg.evaluate(()=>window.__t.cur.p.relation);
  await pg.locator(W?'.strip .chip':'.rels .rel').nth(ORDER[rel]).click(); await pg.waitForTimeout(100);
  const n=await pg.evaluate(()=>['both','anb','bna','nei'].filter(c=>!({mi:['anb','bna'],con:['both'],'3ab':['anb'],'3ba':['bna'],'4':[]}[window.__t.ui.rel]).includes(c)).length);
  if(W){ const ids=await pg.locator('.cell input:not([disabled])').evaluateAll(a=>a.map(x=>x.id)); for(const id of ids) await pg.fill('#'+id,'zzq flurb'); await pg.click('#stage .pbar .fwd'); }
  else { for(let i=0;i<n;i++){ await pg.fill('#cin','zzq flurb '+i); await pg.keyboard.press('Enter'); await pg.waitForTimeout(50);} /* Done on the last cell already shows the result */ }
  await pg.waitForTimeout(150);
  const panel=pg.locator(W?'.coach .vpanel':'.vpanel'); const line=panel.locator('p').first(); const txt=(await panel.innerText()).replace(/\s+/g,' ');
  ok(name+': Examples panel is open; no "Ask Claude" line (the button is at the head of the result)',/not checked yet\./i.test(txt)&&!/ask claude|;/i.test(txt)&&await panel.locator('.exl').count()===0,txt);
  const c0=await pg.evaluate(()=>window.__asks.length);
  await pg.locator('#stage .verdict .xpl',{hasText:/check and explain/i}).click(); await pg.waitForTimeout(300);
  ok(name+': the button triggers the check; Why chip open with the answer',(await pg.evaluate(()=>window.__asks.length))===c0+1&&await pg.locator('.vpanel .tutor .ans').count()===1&&/^why$/i.test((await pg.locator('.vchip[aria-selected=true]').innerText()).trim()));
  // debate with blitz
  await pg.evaluate(()=>document.activeElement&&document.activeElement.blur());
  await go(pg,'Pervasions'); await pg.waitForTimeout(150);
  await settings(pg);
  await pg.locator('.go2[aria-label="Blitz times: details"]').click(); await pg.waitForTimeout(80);
  await pg.fill('.orow:has-text("Example time") .tcustom','2'); await pg.keyboard.press('Tab'); await pg.waitForTimeout(100);
  ok(name+': custom time stored',await pg.locator('.orow:has-text("Example time") .tcustom').inputValue()==='2');
  await pg.click('#over .oc'); await pg.waitForTimeout(80);
  await pg.click('#mbz'); await pg.waitForTimeout(100);
  ok(name+': blitz on, timer bar runs',await pg.locator('.tbar').count()===1);
  await pg.waitForTimeout(2300);
  ok(name+': time ran out = accepted, next question',await pg.evaluate(()=>window.__t.ui.ans[0].say==='accept'&&window.__t.ui.ans[0].timeout===true&&window.__t.ui.step===1),await pg.evaluate(()=>[window.__t.ui.step,window.__t.ui.ans[0]]));
  await pg.click('#mbz'); await pg.waitForTimeout(80);
  ok(name+': blitz off, no bar',await pg.locator('.tbar').count()===0);
  // notation modes
  await settings(pg);
  await pg.locator('#over .seg[aria-label="Notation"] button:has-text("Sets")').first().click(); await pg.waitForTimeout(80);
  await pg.locator('#over .go2[aria-label="Notation: details"]').click(); await pg.waitForTimeout(80);
  ok(name+': settings stay open after a change',await pg.locator('#over').isVisible()&&/contained|intersection/i.test(await pg.locator('#over').innerText())&&/sets/i.test(await pg.locator('#over .pick[aria-pressed=true]').innerText()));
  await pg.click('#over .oc'); await pg.waitForTimeout(80);
  ok(name+': no page errors',errs.filter(e=>!/ERR_CERT|net::/.test(e)).length===0,errs);
  await br.close();
 }
 console.log(out.join('\n'));
})().catch(e=>{console.log(out.join('\n'));console.log('CRASH',e.message.split('\n').slice(0,8).join(' | '));process.exit(1)});
