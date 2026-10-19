const {open,go}=require('./harness.js');
const out=[]; const ok=(n,c,x)=>{out.push((c?'PASS ':'FAIL ')+n+(c?'':'  '+JSON.stringify(x)));};
(async()=>{
 // keyboard-open height: nothing may sit above the field, so each of the four Why? fields stays in the visible area
 const {br,pg,errs}=await open({width:390,height:554},{isMobile:true,hasTouch:true});
 await go(pg,'Pervasions'); await pg.waitForTimeout(150);
 const pos=[];
 for(let q=0;q<4;q++){
  await pg.locator('.qcard .btn.ghost').click(); await pg.waitForTimeout(80);
  pos.push(await pg.evaluate(()=>{const d=document.getElementById('dex'); const r=d.getBoundingClientRect(); return {q:window.__t.ui.step, focused:document.activeElement===d, top:Math.round(r.top), bottom:Math.round(r.bottom), log:document.querySelectorAll('#stage .qlog').length, qt:Math.round(document.querySelector('.qt').getBoundingClientRect().top)}}));
  await pg.fill('#dex','example '+q); await pg.keyboard.press('Enter'); await pg.waitForTimeout(80);
 }
 ok('no answers list above the card while asking',pos.every(p=>p.log===0),pos);
 ok('the Why? field is focused and fully visible at 554 px for all four questions',pos.every(p=>p.focused&&p.top>0&&p.bottom<=554-10),pos);
 ok('the question text stays visible above the field',pos.every(p=>p.qt>0&&p.qt<p.top),pos);
 await pg.evaluate(()=>document.activeElement&&document.activeElement.blur());
 ok('short phone, list open: the table gives way, the relations start right under the answer strip (the first one is in view) and there is no Check button',!(await pg.locator('#stage .grid').isVisible())&&await pg.evaluate(()=>{const s=document.getElementById('stage').getBoundingClientRect(), l=document.querySelector('.rels').getBoundingClientRect(), r=[...document.querySelectorAll('.rels .rel')]; return l.top-s.top<280&&r[0].getBoundingClientRect().top<s.bottom-20&&!document.querySelector('#stage > .actions')}));
 await pg.screenshot({path:'t/k-rel.png'});
 await pg.locator('.rels .rel').nth(1).click(); await pg.waitForTimeout(100);
 ok('after picking: the relation checks at once, the result shows the table with the four examples and no Check step',await pg.evaluate(()=>window.__t.ui.checked)===true&&(await pg.locator('#stage .grid').innerText()).includes('example 3')&&await pg.locator('#stage .grid .cell').count()===4&&await pg.locator('#stage .vchips .vchip').count()>=4&&!(await pg.locator('#stage .btn').allInnerTexts()).some(t=>/^check$/i.test(t.trim())));
 await pg.screenshot({path:'t/k-picked.png'});
 ok('no page errors',errs.filter(e=>!/ERR_CERT|net::/.test(e)).length===0,errs);
 console.log(out.join('\n')); await br.close();
})().catch(e=>{console.log(out.join('\n'));console.log('CRASH',e.message.split('\n').slice(0,6).join(' | '));process.exit(1)});
