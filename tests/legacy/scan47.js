const {open}=require('./harness.js');
const ORDER={mi:0,'3ab':1,'3ba':2,'4':3,con:4};
(async()=>{
 for(const w of [320,360,390,768]){
  for(let k=0;k<4;k++){
   const {br,pg}=await open({width:w,height:w<500?700:1000},{isMobile:w<500,hasTouch:w<500});
   const rel=await pg.evaluate(()=>window.__t.cur.p.relation);
   await pg.locator('.rels .rel').nth(ORDER[rel]).click(); await pg.waitForTimeout(80);
   const n=await pg.evaluate(()=>['both','anb','bna','nei'].filter(c=>!({mi:['anb','bna'],con:['both'],'3ab':['anb'],'3ba':['bna'],'4':[]}[window.__t.ui.rel]).includes(c)).length);
   for(let i=0;i<n;i++){ await pg.fill('#cin','zzz '+i); await pg.keyboard.press('Enter'); await pg.waitForTimeout(40); }
   /* Done on the last cell already shows the result */ await pg.waitForTimeout(120);
   await pg.evaluate(()=>document.activeElement&&document.activeElement.blur());
   const t=pg.locator('[role=tab]:has-text("Terms")'); await t.click(); await pg.waitForTimeout(60);
   const tog=pg.locator('.tm-tog'); if(await tog.count()){ await tog.click(); await pg.waitForTimeout(120); }
   const r=await pg.evaluate(()=>{const s=document.getElementById('stage'); return [document.documentElement.scrollWidth-innerWidth, s.scrollWidth-s.clientWidth, [...document.querySelectorAll('.terms *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).length];});
   console.log(w,k,JSON.stringify(r)); await br.close();
  }
 }
})();
