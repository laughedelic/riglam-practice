const {open,go}=require('./harness.js');
const D=require('./harness.js').SHOTS;
const out=[]; const ok=(n,c,x)=>{out.push((c?'PASS ':'FAIL ')+n+(c?'':'  '+JSON.stringify(x)));};
(async()=>{
 for(const [name,vp,o] of [['phone',{width:390,height:554},{isMobile:true,hasTouch:true}],['wide',{width:1280,height:800},{}]]){
  const W=name==='wide';
  let bad=[], n=0;
  for(let mask=0;mask<16;mask++){
   for(const relIdx of (mask===5||mask===0?[0,1,2,3,4]:[mask%5])){
    const {br,pg,errs}=await open(vp,o);
    await go(pg,'Pervasions'); await pg.waitForTimeout(120);
    for(let q=0;q<4;q++){
     if(mask>>q&1){ await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(30); }
     else { await pg.locator('.qcard .btn.ghost').click(); await pg.waitForTimeout(30); await pg.fill('#dex','example '+q); await pg.keyboard.press('Enter'); await pg.waitForTimeout(40); }
    }
    await pg.evaluate(()=>document.activeElement&&document.activeElement.blur());
    const st1=await pg.evaluate(()=>window.__t.ui.step);
    const empty1=await pg.evaluate(()=>{const s=document.getElementById('stage'); return {cells:s.querySelectorAll('.grid .cell').length, log:s.querySelectorAll('.qlog li').length, txt:s.innerText.length, check:[...s.querySelectorAll('.btn')].some(b=>/^check$/i.test(b.textContent.trim()))}});
    if(!W&&(empty1.cells!==4||empty1.log!==0||empty1.check)) bad.push(['rel-step',mask,relIdx,empty1]);
    if(W&&(empty1.log!==4||empty1.check)) bad.push(['rel-step-wide',mask,relIdx,empty1]);
    await pg.locator(W?'.strip .chip':'.rels .rel').nth(relIdx).click(); await pg.waitForTimeout(200);
    const res=await pg.evaluate(()=>{const s=document.getElementById('stage'),c=document.getElementById('coach'); return {checked:window.__t.ui.checked, cells:s.querySelectorAll('.grid .cell').length, verdict:!!document.querySelector('.verdict'), sum:document.querySelectorAll('.vchips .vchip').length>=4}});
    if(!(res.checked&&res.verdict&&res.sum&&res.cells===4)) bad.push(['result',mask,relIdx,res]);
    const e=errs.filter(x=>!/ERR_CERT|ERR_NAME|net::/.test(x)); if(e.length) bad.push(['errors',mask,relIdx,e]);
    n++;
    if(mask===5&&relIdx===0&&!W){ }
    await br.close();
   }
  }
  ok(name+': '+n+' answer/relation combinations show the table at the relation step and a full result',bad.length===0,bad.slice(0,4));
 }
 console.log(out.join('\n'));
})().catch(e=>{console.log(out.join('\n'));console.log('CRASH',e.message.split('\n').slice(0,6).join(' | '));process.exit(1)});
