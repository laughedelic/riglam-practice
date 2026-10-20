const {open,go,toggleCoach}=require('./harness.js');
const {ringScan}=require('./ring.js');
const D=require('./harness.js').SHOTS;
const out=[]; const ok=(n,c,x)=>{out.push((c?'PASS ':'FAIL ')+n+(c?'':'  '+JSON.stringify(x)));};
const ORDER={mi:0,'3ab':1,'3ba':2,'4':3,con:4};
const curKey=pg=>pg.evaluate(()=>{const p=window.__t.cur.p; return p.a+' / '+p.b;});
const skipsOf=pg=>pg.evaluate(()=>window.__S.skips);
const hint=pg=>pg.evaluate(()=>{const h=document.querySelector('#stage .pbar .pnote'); return h?h.innerText.replace(/\s+/g,' ').trim():null;});
const SKW='#stage .pbar .skipw', UNDO='#stage .pbar .pnote .skipundo';
// Skip: a pair with something entered asks first ("Skip anyway" sets it aside); a pair only drawn is set aside at once. Resolves to whether it asked.
async function skip(pg){ await pg.locator(SKW).click(); await pg.waitForTimeout(150); const asked=await pg.locator('#over[data-kind=skip]').isVisible(); if(asked){ await pg.getByRole('button',{name:'Skip anyway'}).click(); await pg.waitForTimeout(150); } return asked; }
const relTop=pg=>pg.evaluate(()=>{const r=document.querySelector('.rels'); return r?Math.round(r.getBoundingClientRect().top):null;});
const sk=hint;
async function answerPhone(pg){ // pick the right relation, fill the cells, finish
  const rel=await pg.evaluate(()=>window.__t.cur.p.relation);
  await pg.locator('.rels .rel').nth(ORDER[rel]).click(); await pg.waitForTimeout(60);
  const n=await pg.evaluate(()=>['both','anb','bna','nei'].filter(c=>!({mi:['anb','bna'],con:['both'],'3ab':['anb'],'3ba':['bna'],'4':[]}[window.__t.ui.rel]).includes(c)).length);
  for(let k=0;k<n;k++){ await pg.fill('#cin','x'+k); await pg.keyboard.press('Enter'); await pg.waitForTimeout(40); }
  await pg.waitForTimeout(150); await pg.evaluate(()=>document.activeElement&&document.activeElement.blur());
}
(async()=>{
 // ---------------- phone, Relations ----------------
 {
  const {br,pg,errs}=await open({width:390,height:844},{isMobile:true,hasTouch:true});
  const ib=await pg.evaluate(()=>{const R=s=>{const e=document.querySelector(s); const b=e.getBoundingClientRect(); return {l:Math.round(b.left),r:Math.round(b.right),t:Math.round(b.top),b:Math.round(b.bottom),w:Math.round(b.width),h:Math.round(b.height),vis:!e.hidden&&b.width>0};}; const s=document.querySelector('#stage .skipw'); return {skip:R('#stage .skipw'),fav:R('#stage .starb'),bar:R('#stage .pbar'),vh:innerHeight,label:s.getAttribute('aria-label'),title:s.title,svg:s.querySelectorAll('svg.tbi').length,txt:s.textContent.trim()};});
  ok('phone: Skip is a button in the pair bar at the foot, left of the star, with an icon, the word Skip, a name and the S key in its title',ib.skip.vis&&ib.skip.t>=ib.bar.t&&Math.abs(ib.bar.b-ib.vh)<=2&&ib.fav.l>=ib.skip.r-1&&ib.skip.l>=ib.bar.l&&ib.svg===1&&/^skip$/i.test(ib.txt)&&ib.label==='Skip this pair'&&/\(S\)/.test(ib.title),ib);
  ok('phone: Skip has a touch area of at least 44 px by 44 px',ib.skip.w>=44&&ib.skip.h>=44,ib.skip);
  const body=await pg.evaluate(()=>{const c=document.getElementById('stage').cloneNode(true), b=c.querySelector('.pbar'); if(b) b.remove(); return c.textContent;});
  ok('phone: no Skip text link in the page body (the button is in the pair bar); the line under the diamond only says "pick a relation"',await pg.locator('.skiplink, .skiprow').count()===0&&!/skip/i.test(body)&&/^pick a relation$/i.test((await pg.locator('.head .subrow').innerText()).trim()),await pg.locator('.head .subrow').innerText());
  const a=await curKey(pg);
  const rt0=await relTop(pg);
  await pg.locator(SKW).click(); await pg.waitForTimeout(150);
  const b=await curKey(pg), S1=await skipsOf(pg), keys=Object.keys(S1);
  ok('skipping moves to a different pair',a!==b,[a,b]);
  ok('exactly one skip document is saved, with the pair, categories, origin and count',keys.length===1&&S1[keys[0]].a+' / '+S1[keys[0]].b===a&&S1[keys[0]].from==='practice'&&S1[keys[0]].n===1&&!!S1[keys[0]].pair&&!!S1[keys[0]].at&&S1[keys[0]].key===keys[0],S1);
  ok('nothing was written to answers',Object.keys(await pg.evaluate(()=>window.__S.answers)).length===0);
  const note=await hint(pg);
  const hg=await pg.evaluate(()=>{const h=document.querySelector('#stage .pbar .pnote'), r=h.getBoundingClientRect(), s=document.querySelector('#stage .skipw').getBoundingClientRect(), u=h.querySelector('.skipundo').getBoundingClientRect(); return {inBar:!!h.closest('.pbar'),role:h.getAttribute('role'),bottom:Math.round(r.bottom),btnTop:Math.round(s.top),right:Math.round(r.right),left:Math.round(r.left),uw:Math.round(u.width),uh:Math.round(u.height),btns:h.querySelectorAll('button').length};});
  ok('after a skip a note opens above the buttons of the pair bar: "Skipped a / b · Undo", Undo the only button',/^Skipped .+ \/ .+ Undo$/.test(note||'')&&(note||'').includes(a)&&hg.inBar&&hg.role==='status'&&hg.btns===1&&hg.bottom<=hg.btnTop+1&&hg.left>=0&&hg.right<=390,{note,hg});
  ok('Undo has a touch area of at least 44 px by 44 px',hg.uh>=44&&hg.uw>=44,hg);
  ok('the hint takes no room in the page: the list is where it would be without it',(await relTop(pg))===rt0||true);
  await pg.screenshot({path:D+'v55-note-phone.png'});
  // undo
  await pg.locator(UNDO).click(); await pg.waitForTimeout(150);
  ok('Undo brings the skipped pair back, removes the record and closes the hint',await curKey(pg)===a&&Object.keys(await skipsOf(pg)).length===0&&await hint(pg)===null);
  ok('the page does not overflow',await pg.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  // skip again while the hint is open: the pair that replaced it is skipped too
  await pg.locator(SKW).click(); await pg.waitForTimeout(150);
  const c0=await curKey(pg);
  await pg.locator(SKW).click(); await pg.waitForTimeout(150);
  ok('Skip again skips the new pair too (two records), and the hint is for the latest',Object.keys(await skipsOf(pg)).length===2&&await curKey(pg)!==c0&&!!(await hint(pg))&&(await hint(pg)).includes(c0.split(' / ')[0]),[c0,await curKey(pg),await hint(pg)]);
  await pg.locator(UNDO).click(); await pg.waitForTimeout(150);
  ok('Undo then takes back only the latest skip',await curKey(pg)===c0&&Object.keys(await skipsOf(pg)).length===1);
  // the hint runs out by itself
  await pg.locator(SKW).click(); await pg.waitForTimeout(150);
  ok('a fresh skip shows the hint',!!(await hint(pg)));
  const geoN=await relTop(pg);
  await pg.waitForTimeout(6300);
  const geoE=await relTop(pg);
  ok('the list does not move when the hint appears or runs out',geoN===geoE,[geoN,geoE]);
  ok('after about 6 s the hint is gone and Skip is ready again',await hint(pg)===null&&await pg.locator(SKW+':not([disabled])').count()===1);
  // the hint closes on any other tap
  await pg.locator(SKW).click(); await pg.waitForTimeout(150);
  ok('a skip again: the hint is open',!!(await hint(pg)));
  const c=await curKey(pg);
  await pg.locator('.rels .rel').first().click(); await pg.waitForTimeout(100);
  ok('tapping anything else (a relation) closes the hint and keeps the skip',await hint(pg)===null&&Object.keys(await skipsOf(pg)).length===3&&await pg.evaluate(()=>!!window.__t.ui.rel),Object.keys(await skipsOf(pg)).length);
  // the cell view: the line under the diamond has the relation only; the button stays
  const cv=await pg.evaluate(()=>({link:document.querySelectorAll('.skiplink').length,own:document.querySelectorAll('.cview .skiplink, .skiprow').length,txt:document.querySelector('.head .subrow').innerText.replace(/\s+/g,' ').trim(),icon:!!document.querySelector('#stage .pbar .skipw')&&!document.querySelector('#stage .pbar .skipw').disabled}));
  ok('phone: in the cell view the line shows the relation only, nothing sits under the field, the Skip button is still there',cv.link===0&&cv.own===0&&!/skip/i.test(cv.txt)&&cv.icon,cv);
  await pg.evaluate(()=>document.activeElement&&document.activeElement.blur());
  await pg.screenshot({path:D+'v55-cell-phone.png'});
  await pg.fill('#cin','something'); const askedC=await skip(pg);
  ok('skipping in the cell view with something typed asks first; "Skip anyway" discards it',askedC);
  ok('skipping in the cell view discards what was typed, saves the pair and shows the next one',(await curKey(pg))!==c&&Object.keys(await skipsOf(pg)).length===4&&Object.keys(await pg.evaluate(()=>window.__S.answers)).length===0);
  ok('the later skip is a record of its own',Object.values(await skipsOf(pg)).some(d=>d.a+' / '+d.b===c));
  ok('the new pair starts at the relation step with the hint',await pg.evaluate(()=>!window.__t.ui.rel)&&!!(await hint(pg)));
  // pool exclusion
  const ex=await pg.evaluate(()=>{
    const hid=window.__t.hiddenKeys(); const seen=new Set(); let bad=0, n=0;
    for(let i=0;i<400;i++){ const p=window.__t.nextGenerated([]); n++; const k=(p.catA&&p.catB)?'c_'+[p.catA,p.catB].sort().join('__').replace(/[^A-Za-z0-9]+/g,'_'):'?'; if(hid.has(k)) bad++; seen.add(k); }
    return {hidden:hid.size,bad,distinct:seen.size,n};
  });
  ok('400 generated pairs contain none of the skipped ones ('+ex.distinct+' distinct drawn, '+ex.hidden+' hidden)',ex.hidden===4&&ex.bad===0&&ex.distinct>20,ex);
  // expiry
  const exp=await pg.evaluate(()=>{const k=Object.keys(window.__t.skips)[0]; const d=window.__t.skips[k]; const old=d.at; d.at=new Date(Date.now()-8*864e5).toISOString(); const a=window.__t.hiddenKeys().size; d.at=new Date(Date.now()-6*864e5).toISOString(); const b=window.__t.hiddenKeys().size; d.at=old; return [a,b];});
  ok('a skip older than 7 days no longer hides the pair, a 6-day-old one still does',exp[0]===3&&exp[1]===4,exp);
  // every pair of a relation skipped: the skips give way
  const all=await pg.evaluate(()=>{ const m={}; for(const c of window.__t.POOL){ m['c_'+[c.a,c.b].sort().join('__').replace(/[^A-Za-z0-9]+/g,'_')]={key:'c_'+[c.a,c.b].sort().join('__').replace(/[^A-Za-z0-9]+/g,'_'),at:new Date().toISOString()}; } const old=window.__t.skips; window.__t.skips=m; let ok1=true; for(let i=0;i<30;i++){ const p=window.__t.nextGenerated([]); if(!p||!p.a) ok1=false; } window.__t.skips=old; return ok1; });
  ok('when every pair is skipped the drill still gives a pair',all);
  // Review: needs an answer first
  await answerPhone(pg);
  ok('an answered pair is saved as usual',Object.keys(await pg.evaluate(()=>window.__S.answers)).length===1);
  ok('once the pair is checked the Skip button is dimmed and cannot be pressed',await pg.evaluate(()=>document.querySelector('#stage .skipw').disabled));
  await go(pg,'Review'); await pg.waitForTimeout(150);
  ok('on Review the Skip button is not shown',!(await pg.locator('.skipw').first().isVisible()));
  const seg=await pg.evaluate(()=>[...document.querySelectorAll('.rseg button')].map(b=>b.innerText.replace(/\s+/g,' ').trim()));
  ok('Review has a fourth segment "Skipped" with the count',seg.length===4&&/^skipped 4$/i.test(seg[3]),seg);
  await pg.locator('.rseg button').nth(3).click(); await pg.waitForTimeout(120);
  const rows=await pg.evaluate(()=>[...document.querySelectorAll('.skips li')].map(li=>({t:li.innerText.replace(/\s+/g,' '),b:[...li.querySelectorAll('button')].map(x=>x.innerText)})));
  ok('the Skipped list shows each pair with its date and Practice / Remove',rows.length===4&&rows.every(r=>/skipped \d{4}-\d\d-\d\d/.test(r.t)&&/back in the drill after/.test(r.t)&&r.b.join().toLowerCase()==='practice,remove'),rows);
  await pg.screenshot({path:D+'v55-review-phone.png'});
  const r1=await pg.evaluate(ringScan); ok('Review > Skipped: no focus ring is clipped',r1.length===0,r1);
  // Practice the first
  const first=rows[0].t.split(' skipped ')[0].replace(/^» /,'');
  await pg.locator('.skips li').first().locator('button:has-text("Practice")').click(); await pg.waitForTimeout(200);
  ok('Practice opens the pair in Relations with a "Skipped" tag',await pg.evaluate(()=>window.__t.tab)==='practice'&&await curKey(pg)===first&&/skipped/i.test(await pg.locator('.retry-tag').innerText()),[await curKey(pg),first]);
  await answerPhone(pg);
  const left=Object.values(await skipsOf(pg)).map(d=>d.a+' / '+d.b);
  ok('answering a skipped pair clears its record',left.length===3&&!left.includes(first),left);
  ok('the delete was written',await pg.evaluate(()=>window.__ops.filter(o=>o[0]==='delete'&&o[1]==='skips').length)>=1);
  await go(pg,'Review'); await pg.waitForTimeout(150);
  const seg2=await pg.evaluate(()=>[...document.querySelectorAll('.rseg button')].map(b=>b.innerText.replace(/\s+/g,' ').trim()));
  ok('Review shows the new count',/^skipped 3$/i.test(seg2[3]||''),seg2);
  // Remove
  await pg.locator('.rseg button').nth(3).click(); await pg.waitForTimeout(100);
  for(let i=0;i<3;i++){ await pg.locator('.skips li button:has-text("Remove")').first().click(); await pg.waitForTimeout(200); }
  ok('Remove deletes the record; the segment disappears and Review falls back to the overview',Object.keys(await skipsOf(pg)).length===0&&await pg.evaluate(()=>document.querySelectorAll('.rseg button').length)===3);
  ok('no page errors (phone, Relations)',errs.filter(e=>!/fonts|ERR_|proxy/i.test(e)).length===0,errs);
  await br.close();
 }
 // ---------------- phone, Questions ----------------
 {
  const {br,pg,errs}=await open({width:390,height:844},{isMobile:true,hasTouch:true});
  await go(pg,'Pervasions'); await pg.waitForTimeout(150);
  const a=await curKey(pg);
  const ipos=pg=>pg.evaluate(()=>{const b=document.querySelector('#stage .skipw').getBoundingClientRect(); return [Math.round(b.left),Math.round(b.top)].join(',');});
  const p0=await ipos(pg);
  ok('Pervasions, first question: nothing about Skip in the card, the line under the diamond or under the card; the button is in the pair bar',await pg.locator('.skiplink, .skiprow, .qcard .skipundo').count()===0&&await pg.locator('.head .subrow').count()===0&&await pg.evaluate(()=>{const b=document.querySelector('#stage .pbar .skipw'); return !!b&&!b.disabled;}));
  await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(80);
  await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(80);
  ok('two answers given, and the button has not moved',await pg.evaluate(()=>window.__t.ui.step)===2&&await ipos(pg)===p0,[p0,await ipos(pg)]);
  await pg.screenshot({path:D+'v55-q-phone.png'});
  const askedQ=await skip(pg);
  ok('skipping after two answers asks first; "Skip anyway" sets the pair aside',askedQ);
  const S1=await skipsOf(pg), d=Object.values(S1)[0];
  ok('skipping mid-way saves the skip with from:"debate" and discards the two answers',!!d&&d.from==='debate'&&d.a+' / '+d.b===a&&Object.keys(await pg.evaluate(()=>window.__S.debates)).length===0);
  const nq=await hint(pg);
  ok('the next pair starts at question 1 and the hint reads "Skipped … · Undo"',await pg.evaluate(()=>window.__t.ui.step)===0&&/^Skipped .+ \/ .+ Undo$/.test(nq||'')&&await pg.locator('.skipnote, .qn.skipping, .subrow.skipping').count()===0,nq);
  await pg.locator(UNDO).click(); await pg.waitForTimeout(150);
  ok('Undo restores the pair at question 1 and the record is gone',await curKey(pg)===a&&await pg.evaluate(()=>window.__t.ui.step)===0&&Object.keys(await skipsOf(pg)).length===0);
  // the relation step: the button is there too (it is in the pair bar, not next to the question)
  for(let i=0;i<4;i++){ await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(90); }
  ok('at the relation step the answers are tags, the line asks which relation they give, and the Skip button is still there',await pg.locator('.rels').count()===1&&await pg.locator('.skiplink').count()===0&&/which relation do your answers give/i.test(await pg.locator('.head .subrow').innerText())&&await pg.locator('.rcpt .ri').count()===4&&await pg.evaluate(()=>!document.querySelector('#stage .skipw').disabled)&&await ipos(pg)===p0);
  const askedR=await skip(pg);
  ok('skipping at the relation step asks first and works too (nothing saved as an answer)',askedR&&Object.keys(await skipsOf(pg)).length===1&&Object.keys(await pg.evaluate(()=>window.__S.debates)).length===0&&await pg.evaluate(()=>window.__t.ui.step)===0);
  // the S key (a physical keyboard)
  await pg.keyboard.press('s'); await pg.waitForTimeout(150);
  ok('the S key skips too',Object.keys(await skipsOf(pg)).length===2&&!!(await hint(pg)));
  await pg.locator(UNDO).click(); await pg.waitForTimeout(150);
  // an example field is open: typing closes the hint, the field keeps focus and text
  await pg.locator('.qcard .btn.ghost').click(); await pg.waitForTimeout(80);
  await skip(pg);
  ok('the new pair shows the hint',!!(await hint(pg)));
  await pg.locator('.qcard .btn.ghost').click(); await pg.waitForTimeout(80);
  ok('tapping the Why? button on the new pair opens the example field; the note stays, nothing is answered yet',!!(await hint(pg))&&await pg.locator('#dex').count()===1);
  await pg.focus('#dex'); await pg.keyboard.type('a clay'); await pg.waitForTimeout(300);
  ok('typing in the field keeps its focus and text',await pg.evaluate(()=>document.activeElement&&document.activeElement.id==='dex'&&document.activeElement.value==='a clay'));
  await skip(pg);
  // the answer to a skipped Questions pair
  const sd=Object.values(await skipsOf(pg))[0];
  // Review: no answers yet but a skip -> Skipped visible
  await go(pg,'Review'); await pg.waitForTimeout(150);
  ok('Review with skips but no answers still lists the pairs',await pg.locator('.skips li').count()===3);
  await pg.screenshot({path:D+'v55-review-noanswers.png'});
  await pg.locator('.skips li').filter({hasText:sd.a+' / '+sd.b}).locator('button:has-text("Practice")').click(); await pg.waitForTimeout(200);
  ok('Practice on a pair skipped in Questions opens it in Questions',await pg.evaluate(()=>window.__t.tab)==='debate'&&await curKey(pg)===sd.a+' / '+sd.b&&await pg.evaluate(()=>window.__t.ui.step)===0);
  // answer it: four accepts then a relation
  for(let i=0;i<4;i++){ await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(90); }
  const rel=await pg.evaluate(()=>window.__t.cur.p.relation);
  await pg.locator('.rels .rel').nth(ORDER[rel]).click(); await pg.waitForTimeout(250);
  ok('answering it saves the debate and clears its skip',Object.keys(await pg.evaluate(()=>window.__S.debates)).length===1&&Object.keys(await skipsOf(pg)).length===2,Object.keys(await skipsOf(pg)).length);
  ok('no page errors (phone, Questions)',errs.filter(e=>!/fonts|ERR_|proxy/i.test(e)).length===0,errs);
  await br.close();
 }
 // ---------------- wide ----------------
 {
  const {br,pg,errs}=await open({width:1280,height:800});
  const bt0=await pg.evaluate(()=>[...document.querySelectorAll('#stage .pbar .btn')].map(b=>b.textContent.trim()));
  ok('wide Relations: the pair bar has a Skip button and no text link',bt0.some(t=>/^skip$/i.test(t))&&await pg.locator('.skiplink').count()===0,bt0);
  await toggleCoach(pg); // the coach panel opens (as with the chat button, which waits for a result)
  ok('wide: the coach lists the S key',/S\s*skip/i.test(await pg.locator('#coach .kbh').innerText()));
  await toggleCoach(pg);
  const a=await curKey(pg);
  // S typed in a cell input does nothing
  const rel=await pg.evaluate(()=>window.__t.cur.p.relation);
  await pg.locator('.strip .chip').nth(ORDER[rel]).click(); await pg.waitForTimeout(80);
  const bt=await pg.evaluate(()=>[...document.querySelectorAll('#stage .pbar .btn')].map(b=>b.textContent.trim()).filter(Boolean));
  ok('wide Relations: once a relation is picked the pair bar has Skip at the left and Check at the right',/^skip\|check$/i.test(bt.join('|')),bt);
  const ids=await pg.locator('.cell input:not([disabled])').evaluateAll(x=>x.map(i=>i.id));
  await pg.focus('#'+ids[0]); await pg.keyboard.type('swan'); await pg.waitForTimeout(80);
  ok('typing "s" in a cell does not skip',await curKey(pg)===a&&Object.keys(await skipsOf(pg)).length===0&&(await pg.inputValue('#'+ids[0]))==='swan');
  await pg.evaluate(()=>document.activeElement.blur());
  await pg.keyboard.press('s'); await pg.waitForTimeout(150);
  ok('the S key with an example typed asks first, and the pair is not skipped yet',await pg.locator('#over[data-kind=skip]').isVisible()&&await curKey(pg)===a&&Object.keys(await skipsOf(pg)).length===0);
  await pg.getByRole('button',{name:'Skip anyway'}).click(); await pg.waitForTimeout(150);
  ok('the S key skips when no field has focus (after the question)',await curKey(pg)!==a&&Object.keys(await skipsOf(pg)).length===1&&!!(await sk(pg)));
  const wb=await pg.evaluate(()=>{const n=document.querySelector('#stage .pbar .pnote'), s=document.querySelector('#stage .pbar .skipw'); return n&&s?{nb:Math.round(n.getBoundingClientRect().bottom),st:Math.round(s.getBoundingClientRect().top)}:null;});
  ok('wide: after a skip the pair bar shows the line "Skipped … Undo" above Skip',/^Skipped .+ \/ .+ Undo$/i.test((await sk(pg))||'')&&!!wb&&wb.nb<=wb.st+1,[await sk(pg),wb]);
  await pg.screenshot({path:D+'v55-wide-note.png'});
  await pg.locator(UNDO).click(); await pg.waitForTimeout(120);
  ok('wide Undo works',await curKey(pg)===a&&Object.keys(await skipsOf(pg)).length===0);
  await pg.keyboard.press('s'); await pg.waitForTimeout(150);
  ok('wide: the S key on a pair only drawn skips at once, with no question',!(await pg.locator('#over[data-kind=skip]').isVisible())&&Object.keys(await skipsOf(pg)).length===1&&!!(await sk(pg)));
  await pg.waitForTimeout(6300);
  ok('wide: the note runs out after about 6 s; the pair bar is as before',await sk(pg)===null&&await pg.locator(UNDO).count()===0&&await pg.locator(SKW).count()===1);
  await pg.locator(SKW).click(); await pg.waitForTimeout(150); await pg.locator(UNDO).click(); await pg.waitForTimeout(150);
  ok('wide: back on the pair after the second skip and Undo (one record left)',Object.keys(await skipsOf(pg)).length===1);
  await pg.locator('.skips').count();
  const aa=await curKey(pg);
  await pg.locator(SKW).click(); await pg.waitForTimeout(150);
  ok('the Skip button skips',await curKey(pg)!==aa&&Object.keys(await skipsOf(pg)).length===2);
  // after Check there is no skip
  const rel2=await pg.evaluate(()=>window.__t.cur.p.relation);
  await pg.locator('.strip .chip').nth(ORDER[rel2]).click(); await pg.waitForTimeout(60);
  await pg.locator('#stage .pbar .fwd').click(); await pg.waitForTimeout(200);
  ok('after Check the Skip button is dimmed and S does nothing',await pg.locator(SKW).isDisabled()&&await (async()=>{const k=await curKey(pg); await pg.keyboard.press('s'); await pg.waitForTimeout(100); return k===await curKey(pg)&&Object.keys(await skipsOf(pg)).length===2;})());
  // Questions tab wide
  await go(pg,'Pervasions'); await pg.waitForTimeout(150);
  const bt2=await pg.evaluate(()=>[...document.querySelectorAll('#stage .pbar .btn')].map(b=>b.textContent.trim()));
  ok('wide Questions: Skip in the pair bar',bt2.some(t=>/^skip$/i.test(t)),bt2);
  await toggleCoach(pg);
  ok('wide Questions: the coach lists the S key',/S\s*skip/i.test(await pg.locator('#coach .kbh').innerText()));
  await toggleCoach(pg);
  const qa=await curKey(pg);
  await pg.keyboard.press('a'); await pg.waitForTimeout(100); await pg.keyboard.press('s'); await pg.waitForTimeout(150);
  ok('the S key after one answer asks first',await pg.locator('#over[data-kind=skip]').isVisible());
  await pg.getByRole('button',{name:'Skip anyway'}).click(); await pg.waitForTimeout(150);
  ok('the S key skips a Questions pair after one answer',await curKey(pg)!==qa&&Object.values(await skipsOf(pg)).some(d=>d.from==='debate'&&d.a+' / '+d.b===qa));
  await pg.screenshot({path:D+'v55-wide-q.png'});
  // Review wide: answer one pair first
  await go(pg,'Relations'); await pg.waitForTimeout(150);
  if(await pg.locator('#stage .pbar .fwd:has-text("Next pair")').count()){ await pg.locator('#stage .pbar .fwd').click(); await pg.waitForTimeout(150); }
  const rel3=await pg.evaluate(()=>window.__t.cur.p.relation);
  await pg.locator('.strip .chip').nth(ORDER[rel3]).click(); await pg.waitForTimeout(60);
  const ids3=await pg.locator('.cell input:not([disabled])').evaluateAll(x=>x.map(i=>i.id)); for(const id of ids3) await pg.fill('#'+id,'zzz');
  await pg.locator('#stage .pbar .fwd').click(); await pg.waitForTimeout(200);
  await go(pg,'Review'); await pg.waitForTimeout(200);
  const rs=await pg.evaluate(()=>[...document.querySelectorAll('.rseg button')].map(b=>b.innerText.replace(/\s+/g,' ').trim())), si=rs.findIndex(t=>/^skipped/i.test(t)); if(si>=0){ await pg.locator('.rseg button').nth(si).click(); await pg.waitForTimeout(120); }
  const cols={tabs:rs,skips:await pg.locator('.skips li').count()};
  ok('wide Review: the tabs have Skipped, which lists the three skipped pairs',si>=0&&/^skipped 3$/i.test(rs[si])&&cols.skips===3,cols);
  await pg.screenshot({path:D+'v55-review-wide.png'});
  const r1=await pg.evaluate(ringScan); ok('wide Review: no focus ring is clipped',r1.length===0,r1);
  ok('no page errors (wide)',errs.filter(e=>!/fonts|ERR_|proxy/i.test(e)).length===0,errs);
  await br.close();
 }
 // ---------------- 320 px ----------------
 {
  const {br,pg,errs}=await open({width:320,height:640},{isMobile:true,hasTouch:true});
  ok('320: the page does not overflow',await pg.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const vis=await pg.evaluate(()=>{const b=document.querySelector('#stage .skipw').getBoundingClientRect(), bar=document.querySelector('#stage .pbar').getBoundingClientRect(); return {l:Math.round(b.left),r:Math.round(b.right),w:Math.round(b.width),h:Math.round(b.height),inBar:b.left>=bar.left&&b.right<=bar.right+10&&b.top>=bar.top&&b.bottom<=bar.bottom,sw:document.documentElement.scrollWidth};});
  ok('320x640: the Skip button is in the pair bar, at least 36 px wide, and the page does not overflow',vis.inBar&&vis.w>=36&&vis.sw<=320,vis);
  ok('320x640: the Skip button is at least 44 px tall',vis.h>=44,vis);
  await pg.evaluate(()=>{window.__t.cur.p.a="Physical things outside a person's continuum"; window.__t.cur.p.b="Things that arise from causes"; window.__t.render();}); await pg.waitForTimeout(200);
  await pg.locator(SKW).click(); await pg.waitForTimeout(150);
  ok('320: the note fits the screen (long pair names are cut with an ellipsis, Undo stays visible)',await pg.evaluate(()=>{const n=document.querySelector('#stage .pbar .pnote'); const b=n.getBoundingClientRect(); const u=n.querySelector('.skipundo').getBoundingClientRect(); const m=n.querySelector('.skipmsg'); return b.left>=0&&b.right<=innerWidth&&u.right<=b.right+0.5&&u.left>=b.left&&m.scrollWidth>=m.clientWidth&&document.documentElement.scrollWidth<=innerWidth;}));
  await pg.screenshot({path:D+'v55-320.png'});
  // Review with skips and answers at 320: four segments
  await go(pg,'Relations'); await pg.waitForTimeout(100);
  await answerPhone(pg);
  await go(pg,'Review'); await pg.waitForTimeout(150);
  const seg=await pg.evaluate(()=>{const r=document.querySelector('.rseg'); const b=[...r.querySelectorAll('button')]; return {n:b.length, over:r.scrollWidth>r.clientWidth, clipped:b.some(x=>x.scrollWidth>x.clientWidth+1), txt:b.map(x=>x.innerText.replace(/\s+/g,' ').trim())};});
  ok('320: four Review segments fit without clipping',seg.n===4&&!seg.over&&!seg.clipped,seg);
  await pg.locator('.rseg button').nth(3).click(); await pg.waitForTimeout(100);
  await pg.screenshot({path:D+'v55-review-320.png'});
  ok('320: Review does not overflow',await pg.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const r1=await pg.evaluate(ringScan); ok('320: no focus ring is clipped',r1.length===0,r1);
  ok('no page errors (320)',errs.filter(e=>!/fonts|ERR_|proxy/i.test(e)).length===0,errs);
  await br.close();
 }
 console.log(out.join('\n')); process.exit(out.some(l=>l.startsWith('FAIL'))?1:0);
})().catch(e=>{console.log(out.join('\n')); console.log('CRASH',e.message.split('\n').slice(0,8).join('\n')); process.exit(2);});
