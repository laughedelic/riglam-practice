const {open}=require('./harness.js');
const D=require('./harness.js').SHOTS;
const out=[]; const ok=(n,c,x)=>{out.push((c?'PASS ':'FAIL ')+n+(c?'':'  '+JSON.stringify(x)));};
const ORDER={mi:0,'3ab':1,'3ba':2,'4':3,con:4};
async function phone(){
 const {br,pg,errs}=await open({width:390,height:844},{isMobile:true,hasTouch:true});
 await pg.evaluate(()=>{window.__delay=1200;});
 const rel=await pg.evaluate(()=>window.__t.cur.p.relation);
 await pg.locator('.rels .rel').nth(ORDER[rel]).click(); await pg.waitForTimeout(100);
 const n=await pg.evaluate(()=>['both','anb','bna','nei'].filter(c=>!({mi:['anb','bna'],con:['both'],'3ab':['anb'],'3ba':['bna'],'4':[]}[window.__t.ui.rel]).includes(c)).length);
 const things=['a stone','a dog','a table','a thought'];
 for(let i=0;i<n;i++){ await pg.fill('#cin',things[i]); await pg.keyboard.press('Enter'); await pg.waitForTimeout(60); }
 /* Done on the last cell already shows the result */ await pg.waitForTimeout(150);
 await pg.evaluate(()=>document.activeElement&&document.activeElement.blur());
 const fb=await pg.locator('#stage .grid .fb').allInnerTexts();
 const html=await pg.locator('#stage .grid').innerHTML();
 const fbh=await pg.evaluate(()=>window.__t.fbNode({msg:["Right. ","a table: external form\uE000form\uE000functional thing."]}).outerHTML);
 ok('lineage uses "is a" in small italics, no chevron, no stray character',/external form <i class="isa">is&nbsp;a<\/i> form <i class="isa">is&nbsp;a<\/i> functional thing\./.test(fbh)&&!/›|\uE000/.test(fbh),fbh);
 ok('real feedback on the page never shows the stray character or the chevron',!/\uE000|›/.test(fb.join('')+html),fb);
 out.push('INFO feedback: '+fb.map(t=>t.replace(/\s+/g,' ')).join(' || '));
 // before Explain: Explain + Next pair in one row
 const row0=await pg.evaluate(()=>[...document.querySelectorAll('#stage > .actions .btn')].map(b=>b.textContent.trim()+'@'+Math.round(b.getBoundingClientRect().top)));
 ok('before Explain: Explain left, Next pair right, same row',row0.length===2&&/xplain/i.test(row0[0])&&/next pair/i.test(row0[1])&&row0[0].split('@')[1]===row0[1].split('@')[1],row0);
 await pg.locator('#stage .actions button:has-text("xplain")').click(); await pg.waitForTimeout(150);
 const think=await pg.evaluate(()=>{const t=document.querySelector('.vpanel .thinking'); if(!t) return null; const d=[...t.querySelectorAll('.dots i')]; return {text:t.textContent,dots:d.length,anim:getComputedStyle(d[0]).animationName,w:Math.round(d[0].getBoundingClientRect().width)};});
 ok('while Claude works: "Thinking" with three animated dots',think&&think.text==='Thinking'&&think.dots===3&&think.anim==='dot'&&think.w>0,think);
 const row1=await pg.evaluate(()=>[...document.querySelectorAll('#stage > .actions .btn')].map(b=>b.textContent.trim()+'@'+Math.round(b.getBoundingClientRect().top)));
 ok('while Claude works: Stop left of Next pair',row1.length===2&&/stop/i.test(row1[0])&&/next pair/i.test(row1[1]),row1);
 await pg.screenshot({path:D+'v46-thinking.png'});
 await pg.waitForTimeout(1500);
 const row2=await pg.evaluate(()=>{const bs=[...document.querySelectorAll('#stage > .actions .btn')]; return bs.map(b=>[b.textContent.trim(),Math.round(b.getBoundingClientRect().top),Math.round(b.getBoundingClientRect().left),b.className]);});
 ok('after the answer: "Discuss with AI" left of Next pair on one line',row2.length===2&&/discuss with ai/i.test(row2[0][0])&&/next pair/i.test(row2[1][0])&&row2[0][1]===row2[1][1]&&row2[0][2]<row2[1][2],row2);
 ok('no follow-up button inside the explanation panel',await pg.locator('.vpanel .stage-chat').count()===0);
 await pg.screenshot({path:D+'v46-after.png'});
 await pg.locator('#stage > .actions .stage-chat').click(); await pg.waitForTimeout(150);
 ok('the button opens the chat view',await pg.locator('#over').isVisible()&&await pg.evaluate(()=>document.activeElement.id==='ask-in'));
 ok('no page errors',errs.filter(e=>!/ERR_CERT|net::/.test(e)).length===0,errs);
 await br.close();
}
async function dbg(){
 const {br,pg,errs}=await open({width:390,height:844},{isMobile:true,hasTouch:true});
 await pg.locator('[role=tab]:visible:has-text("Pervasions")').click(); await pg.waitForTimeout(150);
 await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(40);
 await pg.locator('.qcard .btn.ghost').click(); await pg.waitForTimeout(40); await pg.fill('#dex','a stone'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(60);
 await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(40); await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(100);
 await pg.locator('.rels .rel').first().click(); await pg.waitForTimeout(250);
 await pg.evaluate(()=>document.activeElement&&document.activeElement.blur());
 await pg.locator('#stage button:has-text("xplain")').first().click(); await pg.waitForTimeout(400);
 const row=await pg.evaluate(()=>[...document.querySelectorAll('#stage > .actions .btn')].map(b=>b.textContent.trim()+'@'+Math.round(b.getBoundingClientRect().top)));
 ok('debate: follow-up button left of Next pair',row.length===2&&/discuss with ai/i.test(row[0])&&/next pair/i.test(row[1])&&row[0].split('@')[1]===row[1].split('@')[1],row);
 const q=await pg.locator('#stage .grid .fb').allInnerTexts();
 ok('debate: no stray character in feedback',!/|›/.test(q.join('')),q);
 ok('no page errors (debate)',errs.filter(e=>!/ERR_CERT|net::/.test(e)).length===0,errs);
 await br.close();
}
(async()=>{ await phone(); await dbg(); console.log(out.join('\n')); })().catch(e=>{console.log(out.join('\n'));console.log('CRASH',e.message.split('\n').slice(0,8).join(' | '));process.exit(1)});
