const {open,go}=require('./harness.js');
const D=require('./harness.js').SHOTS;
const out=[]; const ok=(n,c,x)=>{out.push((c?'PASS ':'FAIL ')+n+(c?'':'  '+JSON.stringify(x)));};
const ORDER={mi:0,'3ab':1,'3ba':2,'4':3,con:4};
async function phone(){
 const {br,pg,errs}=await open({width:390,height:844},{isMobile:true,hasTouch:true,reducedMotion:'no-preference'});
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
 // before Explain: Explain at the head of the result, Next pair on the pair bar below
 const btns=()=>pg.evaluate(()=>{const q=s=>[...document.querySelectorAll(s)].map(b=>b.textContent.trim()+'@'+Math.round(b.getBoundingClientRect().top)); return {x:q('#stage .verdict .vl .xpl'),f:q('#stage > .pbar .fwd')};});
 const row0=await btns();
 ok('before Explain: Explain at the head of the result, Next pair on the pair bar below it',row0.x.length===1&&row0.f.length===1&&/xplain/i.test(row0.x[0])&&/next pair/i.test(row0.f[0])&&+row0.x[0].split('@')[1]<+row0.f[0].split('@')[1],row0);
 await pg.locator('#stage .verdict .xpl').click(); await pg.waitForTimeout(150);
 const think=await pg.evaluate(()=>{const t=document.querySelector('.vpanel .thinking'); if(!t) return null; const d=[...t.querySelectorAll('.dots i')]; return {text:t.textContent,dots:d.length,anim:getComputedStyle(d[0]).animationName,w:Math.round(d[0].getBoundingClientRect().width)};});
 ok('while Claude works: "Thinking" with three animated dots',think&&think.text==='Thinking'&&think.dots===3&&think.anim==='dot'&&think.w>0,think);
 const row1=await btns();
 ok('while Claude works: Stop at the head of the result, Next pair stays on the pair bar',row1.x.length===1&&row1.f.length===1&&/stop/i.test(row1.x[0])&&/next pair/i.test(row1.f[0]),row1);
 await pg.screenshot({path:D+'v46-thinking.png'});
 await pg.waitForTimeout(1500);
 const row2=await pg.evaluate(()=>{const c=document.getElementById('mchat'), bs=[...document.querySelectorAll('.mbar button')].filter(b=>!b.hidden), f=document.querySelector('#stage > .pbar .fwd'); return {chat:c.getAttribute('aria-label'),disabled:c.disabled,last:bs[bs.length-1]===c,fwd:f&&f.textContent.trim(),xpl:document.querySelectorAll('#stage .xpl').length};});
 ok('after the answer: "Discuss with Claude" is the right-most button of the top bar, Next pair on the pair bar, no Explain or Stop left',/^discuss with claude/i.test(row2.chat)&&!row2.disabled&&row2.last&&/next pair/i.test(row2.fwd)&&row2.xpl===0,row2);
 ok('no follow-up button inside the explanation panel',await pg.locator('.vpanel .stage-chat').count()===0);
 await pg.screenshot({path:D+'v46-after.png'});
 await pg.locator('#mchat').click(); await pg.waitForTimeout(150);
 ok('the top bar button opens the chat view',await pg.locator('#over').isVisible()&&await pg.evaluate(()=>document.activeElement.id==='ask-in'));
 ok('no page errors',errs.filter(e=>!/ERR_CERT|net::/.test(e)).length===0,errs);
 await br.close();
}
async function dbg(){
 const {br,pg,errs}=await open({width:390,height:844},{isMobile:true,hasTouch:true});
 await go(pg,'Pervasions'); await pg.waitForTimeout(150);
 await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(40);
 await pg.locator('.qcard .btn.ghost').click(); await pg.waitForTimeout(40); await pg.fill('#dex','a stone'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(60);
 await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(40); await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(100);
 await pg.locator('.rels .rel').first().click(); await pg.waitForTimeout(250);
 await pg.evaluate(()=>document.activeElement&&document.activeElement.blur());
 await pg.locator('#stage .verdict .xpl').click(); await pg.waitForTimeout(400);
 const row=await pg.evaluate(()=>{const c=document.getElementById('mchat'), bs=[...document.querySelectorAll('.mbar button')].filter(b=>!b.hidden), f=document.querySelector('#stage > .pbar .fwd'); return {chat:c.getAttribute('aria-label'),disabled:c.disabled,last:bs[bs.length-1]===c,fwd:f&&f.textContent.trim()};});
 ok('debate: follow-up button (top bar, right-most) and Next pair (pair bar)',/^discuss with claude/i.test(row.chat)&&!row.disabled&&row.last&&/next pair/i.test(row.fwd),row);
 const q=await pg.locator('#stage .grid .fb').allInnerTexts();
 ok('debate: no stray character in feedback',!/|›/.test(q.join('')),q);
 ok('no page errors (debate)',errs.filter(e=>!/ERR_CERT|net::/.test(e)).length===0,errs);
 await br.close();
}
(async()=>{ await phone(); await dbg(); console.log(out.join('\n')); })().catch(e=>{console.log(out.join('\n'));console.log('CRASH',e.message.split('\n').slice(0,8).join(' | '));process.exit(1)});
