const {open}=require('./harness.js');
const D=require('./harness.js').SHOTS;
const out=[]; const ok=(n,c,x)=>{out.push((c?'PASS ':'FAIL ')+n+(c?'':'  '+JSON.stringify(x)));};
const ORDER={mi:0,'3ab':1,'3ba':2,'4':3,con:4};
const noErr=e=>e.filter(x=>!/fonts|ERR_|proxy/i.test(x));
const S=(pg,n)=>pg.evaluate(n=>window.__S[n],n);
const labCalls=pg=>pg.evaluate(()=>window.__labcalls.map(c=>!!c.judge));
const settle=pg=>pg.waitForFunction(()=>{const u=window.__t.ui; return u&&u.lab&&!u.lab.busy;},null,{timeout:6000});
const blur=pg=>pg.evaluate(()=>document.activeElement&&document.activeElement.blur());
const other=r=>r==='mi'?'con':'mi';
// wide: pick the right relation, fill the open cells, Show result
async function answerWide(pg){
  const rel=await pg.evaluate(()=>window.__t.cur.p.relation);
  await pg.locator('.strip .chip').nth(ORDER[rel]).click(); await pg.waitForTimeout(60);
  const n=await pg.locator('.grid input:not([disabled])').count();
  for(let i=0;i<n;i++) await pg.locator('.grid input:not([disabled])').nth(i).fill('thing '+(i+1));
  await pg.locator('#stage .actions .btn',{hasText:/show result/i}).click(); await pg.waitForTimeout(60);
  return n;
}
async function relPhone(pg,relKey){
  const rel=relKey||await pg.evaluate(()=>window.__t.cur.p.relation);
  await pg.locator('.rels .rel').nth(ORDER[rel]).click(); await pg.waitForTimeout(80);
  for(let k=0;k<4;k++){ if(await pg.evaluate(()=>window.__t.ui.checked)) break; await pg.fill('#cin','thing '+(k+1)); await pg.keyboard.press('Enter'); await pg.waitForTimeout(80); }
  await blur(pg);
}
const flagDocs=async pg=>Object.values(await S(pg,'flags'));
const REPLY='Both: a clay pot fits.\nNeither: a stone is B, not A.\nCommon locus: yes, a clay pot.\nPervasion: whatever is A is B.\nExplanation: look at what both terms cover first.\nMisconception: you took A for B.';
(async()=>{
 // ================= the judge only rules where the models differ =================
 {
  const {br,pg,errs}=await open({width:1280,height:800},{lab:true});
  await pg.evaluate(()=>{ window.__t.labSpotN=0; });
  const n=await answerWide(pg); await settle(pg);
  let cl=await labCalls(pg);
  ok('all three agree: three calls, no judge',cl.length===3&&cl.every(j=>!j),cl);
  let runs=await S(pg,'labruns');
  ok('only the three runs are stored (no judge document)',Object.keys(runs).length===3&&!Object.values(runs).some(r=>r.kind==='judge'),Object.keys(runs));
  await pg.locator('.vchip',{hasText:/lab/i}).click(); await pg.waitForTimeout(120);
  ok('the panel says all agree and no judge was needed',/all agree, no judge needed/i.test(await pg.locator('.lab-h').innerText()),await pg.locator('.lab-h').innerText());
  ok('each thing says "All answers agree" and has no ruling row',await pg.locator('.lab-nj').count()===n&&await pg.locator('.lab-r.ruling').count()===0,[await pg.locator('.lab-nj').count(),n]);
  ok('the chip shows = when all agree with the learner too, or ≠ when they agree against the learner (not "…")',/[=≠]/.test(await pg.locator('.vchip',{hasText:/lab/i}).innerText()));
  const ask=pg.locator('.lab .btn',{hasText:/ask the judge/i});
  ok('an "Ask the judge" button is offered',await ask.count()===1);
  await ask.click(); await settle(pg); await pg.waitForTimeout(100);
  cl=await labCalls(pg);
  ok('asking calls only the judge',cl.length===4&&cl[3]===true,cl);
  runs=await S(pg,'labruns'); const jd=Object.values(runs).find(r=>r.kind==='judge');
  ok('the judge record says it was asked, and sees the three answers',!!jd&&jd.why==='asked'&&jd.order.length===3&&jd.ok,jd&&{why:jd.why,order:jd.order});
  ok('the ruling row is separate and labelled "Judge’s ruling"',await pg.locator('.lab-r.ruling').count()===n&&/judge’s ruling/i.test(await pg.locator('.lab-r.ruling .mn').first().innerText()));
  ok('each model row is marked against the ruling',await pg.locator('.lab-r .vs').count()===3*n&&await pg.locator('.lab-r .vs.yes').count()===3*n);
  ok('the ruling says which answers it sided with',/^Sided with \w+ and \w+ and \w+\./.test((await pg.locator('.lab-sided').first().innerText()).trim()),await pg.locator('.lab-sided').first().innerText());
  ok('the button is gone once the judge has ruled',await pg.locator('.lab .btn',{hasText:/ask the judge/i}).count()===0);
  ok('no page errors (judge asked)',noErr(errs).length===0,errs);
  await br.close();
 }
 {
  const {br,pg,errs}=await open({width:1280,height:800},{lab:true});
  await pg.evaluate(()=>{ window.__t.labSpotN=0; window.__labAns={haiku:()=>({inA:false,inB:false}),judge:()=>({right:[1,2]})}; });
  const n=await answerWide(pg); await settle(pg);
  const cl=await labCalls(pg);
  ok('the models differ: three calls and then the judge',cl.length===4&&cl.slice(0,3).every(j=>!j)&&cl[3]===true,cl);
  const jd=Object.values(await S(pg,'labruns')).find(r=>r.kind==='judge');
  ok('the judge record says the models differed',!!jd&&jd.why==='disagree',jd&&jd.why);
  await pg.locator('.vchip',{hasText:/lab/i}).click(); await pg.waitForTimeout(120);
  ok('the summary names the reason',/the judge ruled \(the models differed\)/i.test(await pg.locator('.lab-h').innerText()),await pg.locator('.lab-h').innerText());
  // the judge sided with the first two answers it saw (the order it was given is in the record)
  const nm={haiku:'Haiku',sonnet:'Sonnet',opus:'Opus'}, ord=jd.order.map(id=>id.split('_').pop());
  const inOrder=['haiku','sonnet','opus'].filter(k=>ord.slice(0,2).includes(k)), want='Sided with '+inOrder.map(k=>nm[k]).join(' and ')+', not '+nm[ord[2]]+'.';
  ok('the ruling names the models it sided with and the one it did not',(await pg.locator('.lab-sided').first().innerText()).trim()===want,[await pg.locator('.lab-sided').first().innerText(),want]);
  const marks=await pg.locator('.lab-c').first().locator('.lab-r:not(.ruling):not(.page) .vs').evaluateAll(v=>v.map(x=>x.className.replace('vs ','')));
  ok('two rows are marked "= ruling" and one "≠ ruling" on a thing',marks.filter(x=>x==='yes').length===2&&marks.filter(x=>x==='no').length===1,marks);
  ok('no judge button once it has ruled',await pg.locator('.lab .btn',{hasText:/ask the judge/i}).count()===0);
  ok('no page errors (differ)',noErr(errs).length===0,errs);
  await br.close();
 }
 // the spot check
 {
  const {br,pg,errs}=await open({width:1280,height:800},{lab:true});
  await pg.evaluate(()=>{ window.__t.labSpotN=1; });
  await answerWide(pg); await settle(pg);
  const cl=await labCalls(pg), jd=Object.values(await S(pg,'labruns')).find(r=>r.kind==='judge');
  ok('a spot check sends even a unanimous answer to the judge, marked as a spot check',cl.length===4&&!!jd&&jd.why==='spot',[cl,jd&&jd.why]);
  await pg.locator('.vchip',{hasText:/lab/i}).click(); await pg.waitForTimeout(100);
  ok('the summary says spot check',/spot check/i.test(await pg.locator('.lab-h').innerText()));
  await br.close();
 }
 // Options: the lab note and the Questions helper line
 {
  const {br,pg,errs}=await open({width:1280,height:800},{lab:true});
  await pg.locator('.rail .nv:has-text("Options")').click().catch(()=>{}); await pg.waitForTimeout(150);
  if(!(await pg.locator('.orow').count())){ await pg.locator('#optsbtn,.optsbtn,[aria-label="Options"]').first().click().catch(()=>{}); await pg.waitForTimeout(150); }
  const rows=await pg.locator('.orow').evaluateAll(r=>r.map(x=>x.innerText));
  const lab=rows.find(t=>/^check lab/i.test(t.trim())), q=rows.find(t=>/^questions/i.test(t.trim()));
  ok('the Check lab note says the judge rules only when the models differ',!!lab&&/only when they differ/i.test(lab)&&/three Claude calls/i.test(lab),lab);
  ok('the Questions row explains itself as the statement of pervasion',!!q&&/statement of pervasion/i.test(q),q);
  await br.close();
 }

 // ================= a flag in the top-right corner of every box with Claude's text (phone) =================
 {
  const {br,pg,errs}=await open({width:390,height:844},{isMobile:true,hasTouch:true});
  await pg.evaluate(r=>{window.__reply=r;},REPLY);
  const rel=await pg.evaluate(()=>window.__t.cur.p.relation);
  await relPhone(pg,other(rel));
  ok('a wrong relation: the result is not fully right',await pg.evaluate(()=>window.__t.ui.checked&&window.__t.ui.res.overall!=='ok'));
  await pg.locator('#stage .actions button:has-text("xplain")').first().click(); await pg.waitForTimeout(400);
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
  await pg.locator('#stage > .actions .stage-chat').click(); await pg.waitForTimeout(200);
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
  await pg.locator('#stage .actions button:has-text("xplain")').first().click(); await pg.waitForTimeout(400);
  ok('a right answer: no flag on the pointer text, the ? notes still have theirs',await pg.locator('.vpanel .ans .aiflag').count()===0&&await pg.locator('.qm').count()>=2);
  await pg.locator('.rq').click(); await pg.waitForTimeout(100);
  ok('the relation note of the next pair has an unflagged flag',await pg.locator('.rpop .aiflag').count()===1&&await pg.locator('.rpop .aiflag').getAttribute('aria-pressed')==='false');
  await pg.screenshot({path:D+'s59-pop.png'});
  await br.close();
 }

 // ================= Pervasions: the note on a question =================
 {
  const {br,pg,errs}=await open({width:390,height:844},{isMobile:true,hasTouch:true});
  await pg.locator('#tabbar [role=tab]:has-text("Pervasions")').click(); await pg.waitForTimeout(150);
  await pg.evaluate(()=>{window.__reply='Q1: you accepted, but a clay pot is both.\nQ2: fine.\nQ3: fine.\nQ4: fine.\nRelation: the four give four possibilities.\nPervasion: A does not entail B.\nMisconception: you took B for A.';});
  for(let i=0;i<4;i++){ await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(70); }
  const rel=await pg.evaluate(()=>window.__t.cur.p.relation);
  await pg.locator('.rels .rel').nth(ORDER[other(rel)]).click(); await pg.waitForTimeout(250);
  await pg.locator('#stage .actions button:has-text("xplain")').first().click(); await pg.waitForTimeout(400);
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
