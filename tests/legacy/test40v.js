const {open}=require('./harness.js');
const D=require('./harness.js').SHOTS;
const out=[]; const ok=(n,c,x)=>{out.push((c?'PASS ':'FAIL ')+n+(c?'':'  '+JSON.stringify(x)));};
const ORDER={mi:0,'3ab':1,'3ba':2,'4':3,con:4};
(async()=>{
 // ---- phone ----
 let {br,pg,errs}=await open({width:390,height:844},{isMobile:true,hasTouch:true});
 const rows=await pg.locator('.rels .rel .name').allInnerTexts();
 ok('phone: relation rows have no numbers and the two inside-relations say which way',await pg.locator('.rel .k').count()===0&&rows[1]==='Three possibilities, A in B'&&rows[2]==='Three possibilities, B in A'&&rows.length===5,rows);
 ok('phone: no key hint in the relation label',!(await pg.locator('.rel-label .kbd').count()));
 await pg.screenshot({path:D+'v-rows.png'});
 // result -> explain -> chat view
 const rel=await pg.evaluate(()=>window.__t.cur.p.relation);
 await pg.locator('.rels .rel').nth(ORDER[rel]).click(); await pg.waitForTimeout(100);
 const n=await pg.evaluate(()=>['both','anb','bna','nei'].filter(c=>!({mi:['anb','bna'],con:['both'],'3ab':['anb'],'3ba':['bna'],'4':[]}[window.__t.ui.rel]).includes(c)).length);
 for(let i=0;i<n;i++){ await pg.fill('#cin','thing '+i); await pg.keyboard.press('Enter'); await pg.waitForTimeout(60); }
 /* Done on the last cell already shows the result */ await pg.waitForTimeout(150);
 await pg.evaluate(()=>document.activeElement&&document.activeElement.blur());
 await pg.locator('#stage .actions button:has-text("xplain")').click(); await pg.waitForTimeout(250);
 await pg.click('#stage .stage-chat'); await pg.waitForTimeout(150);
 const g=await pg.evaluate(()=>{const f=document.getElementById('ask-in').getBoundingClientRect(), c=document.getElementById('chatscroll').getBoundingClientRect(), h=document.querySelector('#over .oh').getBoundingClientRect(); return {fieldTop:Math.round(f.top),fieldBottom:Math.round(f.bottom),chatTop:Math.round(c.top),headBottom:Math.round(h.bottom),focused:document.activeElement.id==='ask-in'}});
 ok('chat view: the field is under the heading, above the conversation, high on the screen and focused',g.focused&&g.fieldTop>=g.headBottom&&g.fieldBottom<=g.chatTop&&g.fieldBottom<260,g);
 await pg.fill('#ask-in','why is that?'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(300);
 const order=await pg.evaluate(()=>[...document.querySelectorAll('#over .tutor > .xch')].map(x=>[...x.children].map(n=>n.className.split(' ')[0]+':'+n.textContent.slice(0,12))));
 ok('chat view: newest exchange first, each one an answer above its question, the first answer last, hairline between',order.length===2&&order[0].length===2&&order[0][1].startsWith('q:why is that')&&order[0][0].startsWith('ans')&&order[1].length===1&&order[1][0].startsWith('ans')&&await pg.evaluate(()=>{const x=document.querySelectorAll('#over .tutor > .xch'); return getComputedStyle(x[1]).borderTopWidth!=='0px';}),order);
 await pg.screenshot({path:D+'v-chat.png'});
 ok('chat view: field still on top after the answer',await pg.evaluate(()=>{const f=document.getElementById('ask-in'); return !!f&&f.getBoundingClientRect().bottom<260;}));
 // ---- blitz on the Questions tab ----
 await pg.keyboard.press('Escape'); await pg.waitForTimeout(100);
 await pg.locator('#tabbar [role=tab]:has-text("Pervasions")').click(); await pg.waitForTimeout(150);
 ok('blitz: a bolt icon in the top bar, no number inside, no box, no row of its own',await pg.locator('#mbz:visible').count()===1&&await pg.locator('#mbz .bzn').count()===0&&(await pg.locator('#mbz').innerText()).trim()===''&&await pg.locator('#mbz svg.tbi').count()===1&&await pg.evaluate(()=>{const s=getComputedStyle(document.getElementById('mbz')); return s.backgroundColor==='rgba(0, 0, 0, 0)'&&s.boxShadow==='none';})&&await pg.locator('.trow:not(.ph)').count()===0,await pg.locator('#mbz').innerText());
 const bzbox=await pg.locator('#mbz').boundingBox(), starbox=await pg.locator('#mfav').boundingBox();
 const brandbox=await pg.locator('.mbar .brand').boundingBox();
 ok('the bolt sits at the left, next to the heading, on the same centre line as the star, with a 44 px touch area',bzbox&&starbox&&brandbox&&bzbox.x>=brandbox.x+brandbox.width-2&&bzbox.x-(brandbox.x+brandbox.width)<24&&bzbox.x+bzbox.width<=starbox.x&&Math.abs((bzbox.y+bzbox.height/2)-(starbox.y+starbox.height/2))<3&&bzbox.width>=44&&bzbox.height>=44,[bzbox,starbox,brandbox]);
 await pg.click('#mbz'); await pg.waitForTimeout(100);
 ok('switch is announced as on, with the seconds in its name',await pg.locator('#mbz').getAttribute('aria-checked')==='true'&&await pg.locator('#mbz').getAttribute('role')==='switch'&&/^Blitz on: \d+ s relation, \d+ s question$/.test(await pg.locator('#mbz').getAttribute('aria-label'))&&await pg.locator('#mbz').getAttribute('title')===await pg.locator('#mbz').getAttribute('aria-label'),await pg.locator('#mbz').getAttribute('aria-label'));
 ok('on: the bolt is filled, off it is an outline',await pg.evaluate(()=>getComputedStyle(document.querySelector('#mbz .tbi')).fill!=='none'));
 ok('blitz on: bar runs',await pg.locator('.tbar').count()===1);
 await pg.click('.trow .tval'); await pg.waitForTimeout(100);
 ok('tapping the seconds opens a number field, focused and selected; the bar pauses',await pg.evaluate(()=>document.activeElement.classList.contains('tin')&&document.activeElement.type==='number')&&await pg.locator('.tbar i').count()===0);
 await pg.screenshot({path:D+'v-blitz-edit.png'});
 await pg.keyboard.press('Control+a'); await pg.keyboard.type('7'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(150);
 ok('Enter saves: 7 s shown, bar restarts with 7 s',(await pg.locator('.trow .tval').innerText()).trim()==='7 s'&&(await pg.locator('.tbar').getAttribute('style')).includes('7000ms'),await pg.locator('.trow').innerText());
 ok('stored for next time',await pg.evaluate(()=>localStorage.getItem('rd-timer'))==='7000');
 await pg.click('.trow .tval'); await pg.waitForTimeout(80); await pg.keyboard.press('Control+a'); await pg.keyboard.type('99'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(120);
 ok('Escape cancels: still 7 s, bar running',(await pg.locator('.trow .tval').innerText()).trim()==='7 s'&&await pg.locator('.tbar').count()===1);
 await pg.click('.trow .tval'); await pg.waitForTimeout(80); await pg.keyboard.press('Control+a'); await pg.keyboard.type('1'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(120);
 ok('out of range (1) is refused: still 7 s',(await pg.locator('.trow .tval').innerText()).trim()==='7 s'&&await pg.evaluate(()=>localStorage.getItem('rd-timer'))==='7000');
 await pg.click('.trow .tval'); await pg.waitForTimeout(80); await pg.keyboard.press('Control+a'); await pg.keyboard.type('12'); await pg.locator('.qcard').click({position:{x:20,y:20}}); await pg.waitForTimeout(150);
 ok('leaving the field saves too (12 s)',(await pg.locator('.trow .tval').innerText()).trim()==='12 s');
 await pg.click('#mbz'); await pg.waitForTimeout(80);
 ok('switch off: no bar, the name is "Blitz off", the bolt is an outline',await pg.locator('.tbar').count()===0&&await pg.locator('#mbz').getAttribute('aria-label')==='Blitz off'&&await pg.locator('#mbz').getAttribute('aria-checked')==='false'&&await pg.evaluate(()=>getComputedStyle(document.querySelector('#mbz .tbi')).fill==='none'));
 // questions: relation names in the list
 for(let q=0;q<4;q++){ await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(40); }
 const rows2=await pg.locator('.rels .rel .name').allInnerTexts();
 ok('questions relation list has the same names',rows2[1]==='Three possibilities, A in B'&&rows2[2]==='Three possibilities, B in A',rows2);
 ok('phone: no page errors',errs.filter(e=>!/ERR_CERT|net::/.test(e)).length===0,errs);
 await br.close();
 // ---- wide ----
 ({br,pg,errs}=await open({width:1280,height:800}));
 const chips=await pg.locator('.strip .chip small').allInnerTexts();
 ok('wide: chips have no numbers and say A in B / B in A',chips.length===5&&chips.every(t=>!/^\d/.test(t))&&/^three possibilities, a\s+in\s+b$/i.test(chips[1])&&/^three possibilities, b\s+in\s+a$/i.test(chips[2]),chips);
 await pg.screenshot({path:D+'v-wide.png'});
 await pg.keyboard.press('2'); await pg.waitForTimeout(100);
 ok('wide: key 2 still picks the second chip, caption names the direction',await pg.evaluate(()=>window.__t.ui.rel)==='3ab'&&/A in B/.test(await pg.locator('.cap').innerText()),await pg.locator('.cap').innerText());
 ok('wide: coach hints the keys',/1–5/.test(await pg.locator('.coach').innerText()));
 await pg.locator('[role=tab]:visible:has-text("Pervasions")').click(); await pg.waitForTimeout(150);
 await pg.click('.actions .bz'); await pg.waitForTimeout(80);
 ok('wide: the Blitz icon sits in the action row next to Favourite',await pg.locator('.actions .fav + .bz').count()===1);
 await pg.click('.trow .tval'); await pg.waitForTimeout(80); await pg.keyboard.press('Control+a'); await pg.keyboard.type('20'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(120);
 ok('wide: blitz seconds editable too, shown in the name of the bolt',(await pg.locator('.trow .tval').innerText()).trim()==='20 s'&&/20 s (question|example)/.test(await pg.locator('.actions .bz').getAttribute('aria-label'))&&await pg.locator('.actions .bz .bzn').count()===0);
 ok('wide: no page errors',errs.filter(e=>!/ERR_CERT|net::/.test(e)).length===0,errs);
 console.log(out.join('\n')); await br.close();
})().catch(e=>{console.log(out.join('\n'));console.log('CRASH',e.message.split('\n').slice(0,8).join(' | '));process.exit(1)});
