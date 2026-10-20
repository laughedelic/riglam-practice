const {open,go,settings}=require('./harness.js');
const D=require('./harness.js').SHOTS;
const out=[]; const ok=(n,c,x)=>{out.push((c?'PASS ':'FAIL ')+n+(c?'':'  '+JSON.stringify(x)));};
// the Blitz time is set on the "Blitz times" page of the practice options: kind 'rel' is the relation time, 'ex' the time of each example (Relations) or question (Pervasions)
async function setTime(pg,kind,sec){
  await settings(pg); await pg.locator('.go2[aria-label="Blitz: details"]').click(); await pg.waitForTimeout(100);
  const f=pg.locator('input.tcustom[aria-label="Custom '+(kind==='rel'?'relation':'example')+' time in seconds"]');
  await f.fill(String(sec)); await pg.keyboard.press('Enter'); await pg.waitForTimeout(100);
  await pg.locator('#over .oc').click(); await pg.waitForTimeout(150);
}
(async()=>{
 // Blitz on Questions: skipping stops the old timer, the new question has its own
 {
  const {br,pg,errs}=await open({width:390,height:844},{isMobile:true,hasTouch:true});
  await go(pg,'Pervasions'); await pg.waitForTimeout(150);
  await pg.click('#mbz'); await pg.waitForTimeout(100);
  await setTime(pg,'ex',2);
  const id=await pg.evaluate(()=>window.__t.cur.p.id);
  await pg.waitForTimeout(900);
  await pg.locator('#stage .pbar .skipw').click(); await pg.waitForTimeout(150);
  const s0=await pg.evaluate(()=>({id:window.__t.cur.p.id, step:window.__t.ui.step, timeouts:window.__t.ui.ans.filter(x=>x.timeout).length}));
  ok('Questions Blitz: after skipping, the new pair is at question 1 with no timeout recorded yet',s0.id!==id&&s0.step===0&&s0.timeouts===0,s0);
  await pg.waitForTimeout(2500);
  const s1=await pg.evaluate(()=>({step:window.__t.ui.step, t:window.__t.ui.ans[0].timeout, say:window.__t.ui.ans[0].say, bar:!!document.querySelector('.tbar')}));
  ok('the new question timed out on its own clock (2 s), counted once',s1.step===1&&s1.t,s1);
  ok('no debate was saved for the skipped pair',Object.keys(await pg.evaluate(()=>window.__S.debates)).length===0);
  await br.close();
 }
 // Blitz on Relations
 {
  const {br,pg,errs}=await open({width:390,height:844},{isMobile:true,hasTouch:true});
  await pg.click('#mbz'); await pg.waitForTimeout(100);
  await setTime(pg,'rel',2);
  const id=await pg.evaluate(()=>window.__t.cur.p.id);
  await pg.waitForTimeout(800);
  await pg.locator('#stage .pbar .skipw').click(); await pg.waitForTimeout(150);
  const s0=await pg.evaluate(()=>({id:window.__t.cur.p.id, late:!!window.__t.ui.late, rel:window.__t.ui.rel}));
  ok('Relations Blitz: after skipping the new pair is fresh (not late, no relation)',s0.id!==id&&!s0.late&&!s0.rel,s0);
  await pg.waitForTimeout(2600);
  const s1=await pg.evaluate(()=>({late:!!window.__t.ui.late, rel:window.__t.ui.rel, ans:Object.keys(window.__S.answers).length}));
  ok('its relation countdown runs out normally; nothing saved for the skipped pair',s1.late&&s1.ans===0,s1);
  await br.close();
 }
 // dark theme screenshots
 {
  const {br,pg,errs}=await open({width:390,height:844},{isMobile:true,hasTouch:true,colorScheme:'dark'});
  await pg.locator('#stage .pbar .skipw').click(); await pg.waitForTimeout(150);
  await pg.screenshot({path:D+'v55-dark-note.png'});
  await go(pg,'Review'); await pg.waitForTimeout(150);
  await pg.screenshot({path:D+'v55-dark-review.png'});
  await br.close();
 }
 console.log(out.join('\n'));
})();
