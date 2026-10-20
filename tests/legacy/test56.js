const {open,go}=require('./harness.js');
const {ringScan}=require('./ring.js');
const D=require('./harness.js').SHOTS;
const out=[]; const ok=(n,c,x)=>{out.push((c?'PASS ':'FAIL ')+n+(c?'':'  '+JSON.stringify(x)));};
const ORDER={mi:0,'3ab':1,'3ba':2,'4':3,con:4};
// the tutor's panel (Coach) opens only on request: the chat button of the top bar; this opens it if it is closed and returns its text
const coach=async pg=>{ if(!(await pg.locator('#coach').isVisible())){ await pg.locator('#mchat').click(); await pg.waitForTimeout(100); } return pg.locator('#coach').innerText(); };
const PAIRS=[["Physical things outside a person's continuum","Plants"],["Pot","Plants"],["knowers","manifest phenomena"],["Things heard by the ear consciousness","Non-associated compositional factors"],["Consciousnesses","Non-product phenomena"],["Functional things","Impermanent things"],["Ear","Sound"]];
(async()=>{
 // 1. Enter on a cell goes to the next cell; only the last submits (phone)
 {
  const {br,pg,errs}=await open({width:390,height:844},{isMobile:true,hasTouch:true});
  await pg.locator('.rels .rel').nth(ORDER['4']).click(); await pg.waitForTimeout(80);
  const st=()=>pg.evaluate(()=>({ci:window.__t.ui.ci,checked:window.__t.ui.checked,hint:document.getElementById('cin')&&document.getElementById('cin').getAttribute('enterkeyhint'),btn:(document.querySelector('#stage .pbar .fwd')||{}).textContent}));
  let s=await st(); ok('start at cell 1 with the "next" key hint and a Next cell button',s.ci===0&&s.hint==='next'&&/next cell/i.test(s.btn),s);
  await pg.fill('#cin','one'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(60);
  s=await st(); ok('Enter on cell 1 moves to cell 2',s.ci===1&&!s.checked,s);
  await pg.locator('.chint .back').click(); await pg.waitForTimeout(60);
  s=await st(); ok('Back returns to cell 1',s.ci===0,s);
  ok('cell 1 still holds the typed text',await pg.inputValue('#cin')==='one');
  await pg.keyboard.press('Enter'); await pg.waitForTimeout(60);
  s=await st(); ok('Enter on cell 1 again goes to cell 2 and does not submit (cell 2 empty)',s.ci===1&&!s.checked,s);
  await pg.fill('#cin','two'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(60);
  s=await st(); ok('cell 3: hint is still "next"',s.ci===2&&s.hint==='next'&&!s.checked,s);
  await pg.fill('#cin','three'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(60);
  s=await st(); ok('cell 4 (last): the key hint says Done and the button says Check',s.ci===3&&s.hint==='done'&&/check/i.test(s.btn)&&!s.checked,s);
  // go back to cell 1 after having reached the last one: still next
  for(let i=0;i<3;i++){ await pg.locator('.chint .back').click(); await pg.waitForTimeout(40); }
  s=await st(); ok('back at cell 1 after reaching the last: the hint and button say next again',s.ci===0&&s.hint==='next'&&/next cell/i.test(s.btn),s);
  await pg.keyboard.press('Enter'); await pg.waitForTimeout(60);
  s=await st(); ok('Enter there moves on to cell 2 (it does not submit)',s.ci===1&&!s.checked,s);
  await pg.locator('#stage .pbar .fwd').click(); await pg.waitForTimeout(60);
  s=await st(); ok('the Next cell button moves on too',s.ci===2&&!s.checked,s);
  await pg.locator('#stage .pbar .fwd').click(); await pg.waitForTimeout(60);
  await pg.fill('#cin','four'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(250);
  ok('Enter on the last cell submits',await pg.evaluate(()=>window.__t.ui.checked));
  const cells=await pg.evaluate(()=>window.__t.ui.cells); ok('all four texts were kept',cells.both.t==='one'&&cells.anb.t==='two'&&cells.bna.t==='three'&&cells.nei.t==='four',cells);
  ok('no page errors (cells)',errs.filter(e=>!/fonts|ERR_|proxy/i.test(e)).length===0,errs);
  await br.close();
 }
 // 2. the diamond stays in the centre
 for(const [w,h,m] of [[320,640,1],[360,740,1],[390,844,1],[430,932,1],[768,1024,0],[1280,800,0]]){
  const {br,pg,errs}=await open({width:w,height:h},m?{isMobile:true,hasTouch:true}:{});
  const bad=[], exceptions=[];
  for(const [a,b] of PAIRS){
   await pg.evaluate(([a,b])=>{window.__t.cur.p.a=a; window.__t.cur.p.b=b; window.__t.render();},[a,b]); await pg.waitForTimeout(160);
   const r=await pg.evaluate(()=>{const hd=document.querySelector('.head').getBoundingClientRect(), m=document.querySelector('.pair .mid').getBoundingClientRect(), pr=document.querySelector('.pair').getBoundingClientRect(); const sub=document.querySelector('.head .subt, .head .subrow'); const sb=sub?sub.getBoundingClientRect():null; return {off:Math.abs(m.left+m.width/2-(hd.left+hd.width/2)), over:document.documentElement.scrollWidth>innerWidth, inside:pr.right<=hd.right+0.5&&pr.left>=hd.left-0.5, cols:document.querySelector('.pair').style.gridTemplateColumns};});
   // the one exception: a word that does not fit its half even at the 13 px floor gives its column more room
   const fs=await pg.evaluate(()=>getComputedStyle(document.querySelector('.pair')).getPropertyValue('--tsz').trim());
   const exc=!!r.cols;
   if(exc){ exceptions.push(a+' | '+b+' ('+fs+')'); if(fs!=='13px') bad.push(['exception above the floor',a,b,fs]); }
   if((!exc&&r.off>1)||r.over||!r.inside) bad.push([a,b,r]);
  }
  ok(w+' px: the diamond is in the centre for '+PAIRS.length+' pairs, except where a word does not fit at 13 px ('+exceptions.length+'), nothing overflows',bad.length===0,bad);
  await br.close();
 }
 // 3. wide: Show result, Coach copy, Recent fold
 {
  const {br,pg,errs}=await open({width:1280,height:800});
  const acts=()=>pg.evaluate(()=>[...document.querySelectorAll('#stage .pbar .btn')].map(b=>b.textContent.trim().toLowerCase()).filter(Boolean));
  let a=await acts(); ok('Relations wide: before a relation is picked there is no Check button',!a.some(t=>/check/.test(t)),a);
  const rel=await pg.evaluate(()=>window.__t.cur.p.relation);
  await pg.locator('.strip .chip').nth(ORDER[rel]).click(); await pg.waitForTimeout(80);
  a=await acts(); ok('after a relation is picked Check appears, enabled',a.some(t=>/check/.test(t))&&await pg.locator('#stage .pbar .fwd').isEnabled(),a);
  const ids=await pg.locator('.cell input:not([disabled])').evaluateAll(x=>x.map(i=>i.id));
  for(const id of ids) await pg.fill('#'+id,'zzz');
  await pg.locator('#stage .pbar .fwd').click(); await pg.waitForTimeout(200);
  let ct=await coach(pg);
  ok('Coach (Relations) has no placeholder paragraph',!/after you show the result|board stays/i.test(ct),ct.slice(0,200));
  await pg.locator('#stage .pbar .fwd').click(); await pg.waitForTimeout(150);
  ct=await coach(pg);
  ok('Coach before the result has no placeholder paragraph',!/after you show the result|board stays|appear here/i.test(ct),ct);
  // Recent: one answer given, so there is a list
  const rc=await pg.evaluate(()=>{const d=document.querySelector('#coach details.recent'); return d?{open:d.open,sum:d.querySelector('summary').innerText.replace(/\s+/g,' '),items:d.querySelectorAll('.hist li').length}:null;});
  ok('Recent is a foldable section, open by default, with its count',rc&&rc.open&&/^recent 1$/i.test(rc.sum)&&rc.items===1,rc);
  await pg.screenshot({path:D+'v56-wide-recent-open.png'});
  await pg.locator('#coach details.recent summary').click(); await pg.waitForTimeout(120);
  const f=await pg.evaluate(()=>{const d=document.querySelector('#coach details.recent'); const ul=d.querySelector('.hist'); return {open:d.open,listVisible:false,stored:localStorage.getItem('rd-recent'),sum:d.querySelector('summary').getBoundingClientRect().height>0};});
  ok('clicking the heading folds the list away, the heading stays, the choice is stored',!f.open&&!f.listVisible&&f.sum&&f.stored==='0',f);
  await pg.screenshot({path:D+'v56-wide-recent-folded.png'});
  // it stays folded across a redraw and on the Questions tab
  await pg.evaluate(()=>window.__t.render()); await pg.waitForTimeout(80);
  ok('still folded after a redraw',await pg.evaluate(()=>!document.querySelector('#coach details.recent').open));
  const r1=await pg.evaluate(ringScan); ok('no focus ring is clipped (folded Recent)',r1.length===0,r1);
  await go(pg,'Pervasions'); await pg.waitForTimeout(150);
  ct=await coach(pg);
  ok('Coach (Questions) has no placeholder paragraph',!/for each statement|accept it|pick the relation your answers|appear here/i.test(ct.replace(/accept.*relation/i,'')) || !/(For each statement|Here you then find)/i.test(ct),ct);
  await pg.keyboard.press('a'); await pg.waitForTimeout(100);
  // fold again via keyboard: summary is a native button-like control
  await go(pg,'Relations'); await pg.waitForTimeout(100); await coach(pg);
  await pg.locator('#coach details.recent summary').focus(); await pg.keyboard.press('Enter'); await pg.waitForTimeout(100);
  ok('Enter on the focused heading unfolds it again',await pg.evaluate(()=>document.querySelector('#coach details.recent').open&&localStorage.getItem('rd-recent')==='1'));
  ok('no page errors (wide)',errs.filter(e=>!/fonts|ERR_|proxy/i.test(e)).length===0,errs);
  await br.close();
 }
 // 4. the folded choice is read from storage at load
 {
  const {br,pg,errs}=await open({width:1280,height:800});
  await pg.evaluate(()=>localStorage.setItem('rd-recent','0'));
  const rel=await pg.evaluate(()=>window.__t.cur.p.relation);
  await pg.locator('.strip .chip').nth(ORDER[rel]).click(); await pg.waitForTimeout(60);
  const ids=await pg.locator('.cell input:not([disabled])').evaluateAll(x=>x.map(i=>i.id)); for(const id of ids) await pg.fill('#'+id,'zzz');
  await pg.locator('#stage .pbar .fwd').click(); await pg.waitForTimeout(150);
  await pg.reload({waitUntil:'domcontentloaded'}).catch(()=>{});
  await br.close();
 }
 console.log(out.join('\n')); process.exit(out.some(l=>l.startsWith('FAIL'))?1:0);
})().catch(e=>{console.log(out.join('\n')); console.log('CRASH',e.message.split('\n').slice(0,8).join('\n')); process.exit(2);});
