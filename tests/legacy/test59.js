const {open,go,settings}=require('./harness.js');
const D=require('./harness.js').SHOTS;
const out=[]; const ok=(n,c,x)=>{out.push((c?'PASS ':'FAIL ')+n+(c?'':'  '+JSON.stringify(x)));};
const ORDER={mi:0,'3ab':1,'3ba':2,'4':3,con:4};
const noErr=e=>e.filter(x=>!/fonts|ERR_|proxy/i.test(x));
const S=(pg,n)=>pg.evaluate(n=>window.__S[n],n);
const blur=pg=>pg.evaluate(()=>document.activeElement&&document.activeElement.blur());
const other=r=>r==='mi'?'con':'mi';
async function relPhone(pg,relKey){
  const rel=relKey||await pg.evaluate(()=>window.__t.cur.p.relation);
  await pg.locator('.rels .rel').nth(ORDER[rel]).click(); await pg.waitForTimeout(80);
  for(let k=0;k<4;k++){ if(await pg.evaluate(()=>window.__t.ui.checked)) break; await pg.fill('#cin','thing '+(k+1)); await pg.keyboard.press('Enter'); await pg.waitForTimeout(80); }
  await blur(pg);
}
const flagDocs=async pg=>Object.values(await S(pg,'flags'));
const REPLY='Both: a clay pot fits.\nNeither: a stone is B, not A.\nCommon locus: yes, a clay pot.\nPervasion: whatever is A is B.\nExplanation: look at what both terms cover first.\nMisconception: you took A for B.';
(async()=>{
 // ================= the settings of Pervasions: the Questions helper line =================
 {
  const {br,pg,errs}=await open({width:1280,height:800});
  await go(pg,'Relations'); await settings(pg);
  const cards=async()=>(await pg.locator('#over .ocard .om > b').allInnerTexts()).map(t=>t.trim());
  ok('Relations has no Questions option (the wording is Pervasions only)',(await cards()).length>0&&!(await cards()).some(t=>/questions/i.test(t)),await cards());
  await pg.keyboard.press('Escape'); await go(pg,'Pervasions'); await settings(pg);
  const q=(await cards()).find(t=>/questions/i.test(t));
  if(q){ await pg.getByRole('button',{name:q+': details'}).click(); await pg.waitForTimeout(100); }
  const qt=q?await pg.locator('#over').innerText():'';
  ok('the Questions option explains itself as the statement of pervasion',!!q&&/statement of pervasion/i.test(qt),[q,qt]);
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(100);
  const sw=(await pg.locator('#over .sw .swl').allInnerTexts()).map(t=>t.trim().toLowerCase());
  ok('the artifact has no Quorum switch under AI tutor: it asks its host\'s model, one model, and keeps no runs',sw.includes('check every answer with ai')&&!sw.some(t=>/quorum|several models/.test(t))&&!/quorum/i.test(await pg.locator('#over').innerText()),sw);
  await pg.locator('#over .oc').click(); await pg.waitForTimeout(100);
  await go(pg,'Settings'); await pg.waitForTimeout(150);
  const rows=await pg.locator('#over .orow').evaluateAll(r=>r.map(x=>x.innerText));
  ok('Settings no longer holds the settings of an exercise',!rows.some(t=>/^(notation|questions|definitions|show|relation time|example time)/i.test(t.trim())),rows.map(t=>t.slice(0,20)));
  ok('Settings has no Quorum row either',!rows.some(t=>/^quorum/i.test(t.trim())),rows.map(t=>t.slice(0,20)));
  await br.close();
 }

 // ================= a flag in the top-right corner of every box with Claude's text (phone) =================
 {
  const {br,pg,errs}=await open({width:390,height:844},{isMobile:true,hasTouch:true});
  await pg.evaluate(r=>{window.__reply=r;},REPLY);
  const rel=await pg.evaluate(()=>window.__t.cur.p.relation);
  await relPhone(pg,other(rel));
  ok('a wrong relation: the result is not fully right',await pg.evaluate(()=>window.__t.ui.checked&&window.__t.ui.res.overall!=='ok'));
  await pg.locator('#stage .xpl').first().click(); await pg.waitForTimeout(400);
  // the Why panel
  const fl=pg.locator('.vpanel .ans .aiflag');
  ok('the Why panel has one flag, with the word Flag',await fl.count()===1&&/^flag$/i.test((await fl.innerText()).trim()),await fl.count());
  const g=await pg.evaluate(()=>{ const a=document.querySelector('.vpanel .ans').getBoundingClientRect(), f=document.querySelector('.vpanel .ans .aiflag'), r=f.getBoundingClientRect(); return {right:Math.round(a.right-r.right),top:Math.round(r.top-a.top),pos:getComputedStyle(f).position,h:getComputedStyle(f,'::after').height,w:getComputedStyle(f,'::after').width,ansH:Math.round(a.height)}; });
  ok('it sits in the top-right corner of the box and does not take a line of its own',g.pos==='absolute'&&g.right<=14&&g.right>=-12&&Math.abs(g.top)<=10,g);
  ok('its touch area is at least 44 px',parseFloat(g.h)>=44&&parseFloat(g.w)>=44,g);
  await fl.click(); await pg.waitForTimeout(100);
  ok('the editor opens inside the same box',await pg.locator('.vpanel .ans .flagedit').count()===1);
  await pg.locator('#flag-note').fill('good, but too long'); await pg.locator('.flagedit .btn',{hasText:/^submit$/i}).click(); await pg.waitForTimeout(120);
  let fd=await flagDocs(pg), e1=fd.find(f=>f.part==='explain'&&!f.n);
  ok('the explanation flag is stored with the shown text and no cell',!!e1&&/look at/.test(e1.shown)&&e1.note==='good, but too long',fd);
  ok('the flag now reads Flagged',/^flagged$/i.test((await pg.locator('.vpanel .ans .aiflag').innerText()).trim())&&await pg.locator('.vpanel .ans .aiflag').getAttribute('aria-pressed')==='true');
  ok('no separate "Flag this explanation" line any more',await pg.locator('.flagrow').count()===0&&!/flag this explanation/i.test(await pg.locator('.vpanel').innerText()));
  // the ? beside the relation
  await pg.locator('.rq').click(); await pg.waitForTimeout(120);
  const rp=pg.locator('.rpop .aiflag');
  ok('the relation note has a flag: the icon alone',await rp.count()===1&&(await rp.innerText()).trim()==='',await rp.count());
  const gp=await pg.evaluate(()=>{ const p=document.querySelector('.rpop').getBoundingClientRect(), f=document.querySelector('.rpop .aiflag').getBoundingClientRect(), c=document.querySelector('.rpop .popx').getBoundingClientRect(); return {right:Math.round(p.right-f.right),top:Math.round(f.top-p.top),gapToClose:Math.round(c.top-f.bottom)}; });
  ok('the flag is in the top-right corner, well above Close',gp.right<=14&&gp.top<=10&&gp.gapToClose>=8,gp);
  await rp.click(); await pg.waitForTimeout(100);
  ok('the editor opens inside the note',await pg.locator('.rpop .flagedit').count()===1);
  await pg.locator('#flag-note').fill('x'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(100);
  ok('Escape in the editor closes only the editor, not the note',await pg.locator('.rpop').count()===1&&await pg.locator('.flagedit').count()===0);
  await pg.locator('.rpop .aiflag').click(); await pg.waitForTimeout(80);
  await pg.locator('#flag-note').fill('the common locus is wrong'); await pg.locator('.flagedit .btn',{hasText:/^submit$/i}).click(); await pg.waitForTimeout(120);
  fd=await flagDocs(pg); const e2=fd.find(f=>f.part==='explain'&&f.n==='rel');
  ok('the relation note flag is stored with n = rel and the lines it showed',!!e2&&/Common locus/.test(e2.shown)&&e2.note==='the common locus is wrong',fd);
  ok('the note stays open and the flag reads as flagged',await pg.locator('.rpop').count()===1&&await pg.locator('.rpop .aiflag').getAttribute('aria-pressed')==='true');
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(80);
  // a ? on a cell
  const qm=pg.locator('.qm:not(.rq)').first();
  ok('a cell with an explanation has its ?',await qm.count()===1);
  await qm.click(); await pg.waitForTimeout(120);
  ok('the cell note has a flag in its corner too',await pg.locator('.pop:not(.rpop) .aiflag').count()===1);
  await pg.locator('.pop:not(.rpop) .aiflag').click(); await pg.waitForTimeout(80);
  await pg.locator('#flag-note').fill('a clay pot is not both'); await pg.locator('.flagedit .btn',{hasText:/^submit$/i}).click(); await pg.waitForTimeout(120);
  fd=await flagDocs(pg); const e3=fd.find(f=>f.part==='explain'&&f.n&&f.n!=='rel');
  ok('the cell note flag is stored with the cell as n',!!e3&&/clay pot/.test(e3.shown),fd.map(f=>[f.part,f.n]));
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(80);
  // the chat view
  await pg.locator('#mchat').click(); await pg.waitForTimeout(200);
  const cf=pg.locator('#over .ans .aiflag');
  ok('the chat view flags the first answer: the same flag as the Why panel, already set',await cf.count()===1&&await cf.first().getAttribute('aria-pressed')==='true');
  await pg.fill('#ask-in','and why?'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(350);
  ok('each answer of Claude in the chat has a flag',await pg.locator('#over .ans .aiflag').count()===2,await pg.locator('#over .ans .aiflag').count());
  await pg.locator('#over .xch').first().locator('.aiflag').click(); await pg.waitForTimeout(120);
  ok('the editor opens under that answer in the chat view',await pg.locator('#over .xch').first().locator('.flagedit').count()===1&&await pg.locator('#over').isVisible());
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(100);
  ok('Escape closes the editor and leaves the chat view open',await pg.locator('#over').isVisible()&&await pg.locator('#over .flagedit').count()===0);
  await pg.locator('#over .xch').first().locator('.aiflag').click(); await pg.waitForTimeout(100);
  await pg.locator('#flag-note').fill('that did not answer it'); await pg.locator('.flagedit .btn',{hasText:/^submit$/i}).click(); await pg.waitForTimeout(120);
  fd=await flagDocs(pg); const e4=fd.find(f=>f.part==='chat');
  ok('a chat answer is stored as part chat with its turn number',!!e4&&e4.n&&e4.note==='that did not answer it',fd.map(f=>[f.part,f.n]));
  ok('four flags in all, none lost',fd.length===4,fd.map(f=>[f.part,f.n]));
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(150);
  ok('no page errors (flags on phone)',noErr(errs).length===0,errs);

  // a right answer: the Why panel only points to the ? marks, so it has no flag; the notes do
  await pg.locator('#stage .actions .btn',{hasText:/next pair/i}).click(); await pg.waitForTimeout(200);
  await pg.evaluate(r=>{window.__reply=r;},REPLY);
  await relPhone(pg);
  await pg.evaluate(()=>{ const u=window.__t.ui; u.res.overall='ok'; window.__t.render(); });
  await pg.locator('#stage .xpl').first().click(); await pg.waitForTimeout(400);
  ok('a right answer: no flag on the pointer text, the ? notes still have theirs',await pg.locator('.vpanel .ans .aiflag').count()===0&&await pg.locator('.qm').count()>=2);
  await pg.locator('.rq').click(); await pg.waitForTimeout(100);
  ok('the relation note of the next pair has an unflagged flag',await pg.locator('.rpop .aiflag').count()===1&&await pg.locator('.rpop .aiflag').getAttribute('aria-pressed')==='false');
  await pg.screenshot({path:D+'s59-pop.png'});
  await br.close();
 }

 // ================= Pervasions: the note on a question =================
 {
  const {br,pg,errs}=await open({width:390,height:844},{isMobile:true,hasTouch:true});
  await go(pg,'Pervasions'); await pg.waitForTimeout(150);
  await pg.evaluate(()=>{window.__reply='Q1: you accepted, but a clay pot is both.\nQ2: fine.\nQ3: fine.\nQ4: fine.\nRelation: the four give four possibilities.\nPervasion: A does not entail B.\nMisconception: you took B for A.';});
  for(let i=0;i<4;i++){ await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(70); }
  const rel=await pg.evaluate(()=>window.__t.cur.p.relation);
  await pg.locator('.rels .rel').nth(ORDER[other(rel)]).click(); await pg.waitForTimeout(250);
  await pg.locator('#stage .xpl').first().click(); await pg.waitForTimeout(400);
  await pg.locator('.vchip',{hasText:/questions/i}).click().catch(()=>{}); await pg.waitForTimeout(100);
  const rows=await pg.locator('.qd li').count();
  const q1=pg.locator('.qd .qs').first(); if((await q1.getAttribute('aria-expanded'))!=='true'){ await q1.click(); await pg.waitForTimeout(100); }
  const cf=pg.locator('.qd .cl .aiflag');
  ok('a question row with Claude\'s note has a flag in the corner of the note',rows===4&&await cf.count()>=1,[rows,await cf.count()]);
  await cf.first().click(); await pg.waitForTimeout(100);
  ok('its editor opens right under the note',await pg.locator('.qd .cl + .flagedit').count()===1);
  await pg.locator('#flag-note').fill('Q1 note is off'); await pg.locator('.flagedit .btn',{hasText:/^submit$/i}).click(); await pg.waitForTimeout(120);
  const fd=await flagDocs(pg), f1=fd.find(f=>f.part==='explain'&&f.n==='both');
  ok('stored as the note on the cell of that question',!!f1&&f1.pair&&f1.pair.tab==='debate',fd.map(f=>[f.part,f.n]));
  ok('no page errors (Pervasions)',noErr(errs).length===0,errs);
  await pg.screenshot({path:D+'s59-qrow.png'});
  await br.close();
 }
 console.log(out.join('\n')); process.exit(out.some(l=>l.startsWith('FAIL'))?1:0);
})().catch(e=>{console.log(out.join('\n')); console.log('CRASH',e.message.split('\n').slice(0,8).join('\n')); process.exit(2);});
