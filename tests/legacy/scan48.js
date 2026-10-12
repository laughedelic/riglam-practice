const {open}=require('./harness.js');
const ORDER={mi:0,'3ab':1,'3ba':2,'4':3,con:4};
const over=()=>{const s=document.getElementById('stage'); return {page:document.documentElement.scrollWidth-innerWidth, stage:s.scrollWidth-s.clientWidth, pop:[...document.querySelectorAll('.pop,.subrow,.trow,.cmap,.mbar *')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&(r.right>innerWidth+1||r.left<-1)}).length};};
(async()=>{
 for(const w of [320,360,390,430,768]){
  const {br,pg}=await open({width:w,height:w<500?700:1000},{isMobile:w<500,hasTouch:w<500});
  await pg.evaluate(()=>{window.__reply='Both: a clay pot fits.\nNeither: a stone is B, not A.\nCommon locus: yes, a clay pot, which is long enough to wrap over several lines on a narrow phone.\nPervasion: whatever is A is B.\nMisconception: none.';});
  const rel=await pg.evaluate(()=>window.__t.cur.p.relation);
  await pg.locator('.rels .rel').nth(ORDER[rel]).click(); await pg.waitForTimeout(80);
  const n=await pg.evaluate(()=>['both','anb','bna','nei'].filter(c=>!({mi:['anb','bna'],con:['both'],'3ab':['anb'],'3ba':['bna'],'4':[]}[window.__t.ui.rel]).includes(c)).length);
  const res=[]; res.push(['cell',await pg.evaluate(over)]);
  for(let i=0;i<n;i++){ await pg.fill('#cin','zzz '+i); await pg.keyboard.press('Enter'); await pg.waitForTimeout(50); }
  await pg.waitForTimeout(150); await pg.evaluate(()=>document.activeElement&&document.activeElement.blur());
  await pg.locator('#stage .actions button:has-text("xplain")').click(); await pg.waitForTimeout(350);
  await pg.locator('.rq').click(); await pg.waitForTimeout(120); res.push(['relpop',await pg.evaluate(over)]);
  await pg.keyboard.press('Escape');
  await pg.locator('[role=tab]:visible:has-text("Pervasions")').click(); await pg.waitForTimeout(150);
  await pg.click('#mbz'); await pg.waitForTimeout(100); res.push(['blitz on',await pg.evaluate(over)]);
  await pg.click('.trow .tval'); await pg.waitForTimeout(100); res.push(['editing',await pg.evaluate(over)]);
  console.log(w,JSON.stringify(res)); await br.close();
 }
})();
