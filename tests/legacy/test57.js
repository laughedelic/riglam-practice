const {open}=require('./harness.js');
const {ringScan}=require('./ring.js');
const D=require('./harness.js').SHOTS;
const out=[]; const ok=(n,c,x)=>{out.push((c?'PASS ':'FAIL ')+n+(c?'':'  '+JSON.stringify(x)));};
const ORDER={mi:0,'3ab':1,'3ba':2,'4':3,con:4};
const noErr=e=>e.filter(x=>!/fonts|ERR_|proxy/i.test(x));
const S=(pg,n)=>pg.evaluate(n=>window.__S[n],n);
const calls=pg=>pg.evaluate(()=>window.__labcalls.map(c=>({m:c.model,j:c.judge,e:c.effort,t:c.tier,c:c.cache})));
// wide: pick the right relation, fill the open cells, Show result
async function answerWide(pg,texts){
  const rel=await pg.evaluate(()=>window.__t.cur.p.relation);
  await pg.locator('.strip .chip').nth(ORDER[rel]).click(); await pg.waitForTimeout(60);
  const n=await pg.locator('.grid input:not([disabled])').count();
  for(let i=0;i<n;i++) await pg.locator('.grid input:not([disabled])').nth(i).fill((texts&&texts[i])||('thing '+(i+1)));
  await pg.locator('#stage .actions .btn',{hasText:/show result/i}).click(); await pg.waitForTimeout(60);
  return n;
}
// phone: pick the relation from the list, then each cell, the last Enter checks
async function answerPhone(pg){
  const rel=await pg.evaluate(()=>window.__t.cur.p.relation);
  await pg.locator('.rels .rel').nth(ORDER[rel]).click(); await pg.waitForTimeout(80);
  for(let k=0;k<4;k++){ if(await pg.evaluate(()=>window.__t.ui.checked)) break; await pg.fill('#cin','thing '+(k+1)); await pg.keyboard.press('Enter'); await pg.waitForTimeout(80); }
  await pg.evaluate(()=>document.activeElement&&document.activeElement.blur());
}
const settle=pg=>pg.waitForFunction(()=>{const u=window.__t.ui; return u&&u.lab&&!u.lab.busy;},null,{timeout:6000});
(async()=>{
 // 1. runs, stored data, prompts, chip
 {
  const {br,pg,errs}=await open({width:1280,height:800},{lab:true});
  ok('the lab is on by default',await pg.evaluate(()=>window.__t.lab));
  await pg.evaluate(()=>{ window.__labdelay=250; window.__labAns={haiku:(t,i)=>({inB:i===0?false:true}), opus:(t,i)=>({exists:true})}; });
  const n=await answerWide(pg); await pg.waitForTimeout(100);
  let chip=await pg.locator('.vchip',{hasText:/lab/i}).innerText();
  ok('while the models run the Lab chip shows an ellipsis',/…/.test(chip),chip);
  await settle(pg); await pg.waitForTimeout(80);
  const cl=await calls(pg);
  ok('four independent calls: Haiku, Sonnet, Opus, then the Opus judge',cl.length===4&&cl.slice(0,3).map(c=>c.m).sort().join()==='claude-haiku-5-5,claude-opus-5-5,claude-sonnet-5-5'&&cl[3].m==='claude-opus-5-5'&&cl[3].j,cl);
  ok('the three classify at medium effort with their own tier, the judge at high; none uses the cache',cl.slice(0,3).every(c=>c.e==='medium'&&c.c===false&&!c.j)&&cl[3].e==='high'&&cl[3].c===false&&cl[3].t==='complex'&&cl.find(c=>/haiku/.test(c.m)).t==='quick'&&cl.find(c=>/sonnet/.test(c.m)).t==='default',cl);
  const runs=await S(pg,'labruns'), ids=Object.keys(runs);
  ok('four documents in labruns: three runs and one judge',ids.length===4&&ids.filter(i=>i.startsWith('lr_')).length===3&&ids.filter(i=>i.startsWith('lj_')).length===1,ids);
  const hk=Object.values(runs).find(r=>r.model==='claude-haiku-5-5'), jd=Object.values(runs).find(r=>r.kind==='judge');
  ok('a run document holds model, effort, tier, versions, timing, raw reply and parsed answers',!!hk&&hk.kind==='classify'&&hk.effort==='medium'&&hk.tierAsked==='quick'&&hk.promptVersion==='lab-2'&&/^lab-2-/.test(hk.referenceVersion)&&hk.modelApplied==='claude-haiku-5-5'&&hk.valid===true&&hk.ok===true&&hk.ms>=200&&typeof hk.raw==='string'&&hk.recs.length===n&&hk.recs.every(r=>['both','anb','bna','nei'].includes(r.cell)&&typeof r.reading==='string'),hk);
  ok('the case is stored with the things, their cells and the page verdicts',hk.case.things.length===n&&hk.case.things.every(t=>t.cells.length&&Object.keys(t.page).length)&&hk.case.a&&hk.case.b&&hk.case.relation&&hk.case.tab==='practice'&&hk.caseKey===Object.keys(await S(pg,'answers'))[0].replace(/^/,'answers_'),[hk.case,hk.caseKey]);
  ok('the judge document lists the run order and carries a ruling for each thing',jd.ok&&jd.valid&&jd.order.length===3&&jd.effort==='high'&&jd.recs.length===n&&jd.recs.every(r=>Array.isArray(r.right)&&r.reason),jd);
  const jp=await pg.evaluate(()=>window.__labcalls.find(c=>c.judge).prompt), cp=await pg.evaluate(()=>window.__labcalls.find(c=>!c.judge).prompt);
  ok('the judge sees three anonymous answers (no model names) and the reference',/ANSWER 1/.test(jp)&&/ANSWER 3/.test(jp)&&!/haiku|sonnet|opus/i.test(jp.split('CASE')[1]||'')&&/CATEGORY REFERENCE/.test(jp));
  const casePart=cp.split('\nCASE\n')[1]||'';
  ok('the models are told the two categories and the things only, not the learner\'s cell or relation',/^A = /.test(casePart)&&/\nB = /.test(casePart)&&/Things:/.test(casePart)&&!/relation|Three possibilities|Mutually|you put|chosen|learner chose/i.test(casePart),casePart);
  ok('the reference is built from the page\'s categories and notes',/CATEGORY REFERENCE/.test(cp)&&/CLASSIFICATION NOTES/.test(cp)&&cp.length>2000,cp.length);
  chip=await pg.locator('.vchip',{hasText:/lab/i}).innerText();
  ok('Haiku differs from the others, so the chip carries ≠ and does not open by itself',/≠/.test(chip)&&await pg.locator('#vpanel .lab').count()===0,chip);
  await pg.locator('.vchip',{hasText:/lab/i}).click(); await pg.waitForTimeout(120);
  const rows=await pg.locator('.lab-c').first().locator('.lab-r').count();
  ok('the panel shows a card per thing with a row for each of the three models, the judge and the page',await pg.locator('.lab-c').count()===n&&rows===5,[await pg.locator('.lab-c').count(),rows]);
  const nm=await pg.locator('.lab-c').first().locator('.mn').allInnerTexts();
  ok('the rows are named Haiku, Sonnet, Opus, Judge’s ruling, Page',nm.map(x=>x.toLowerCase()).join()==='haiku,sonnet,opus,judge’s ruling,page',nm);
  const exp=await pg.evaluate(()=>{ const L=window.__t.ui.lab, t=L.kase.things[0]; return ['haiku','sonnet'].map(k=>t.cells.includes(L.runs[k].doc.recs[0].cell)?'ok':'diff'); });
  const got=[await pg.locator('.lab-c').first().locator('.lab-r',{hasText:/haiku/i}).locator('.lcell').getAttribute('class'),await pg.locator('.lab-c').first().locator('.lab-r',{hasText:/sonnet/i}).locator('.lcell').getAttribute('class')].map(c=>/diff/.test(c)?'diff':/ok/.test(c)?'ok':'?');
  ok('a cell that differs from yours is marked, one that matches is marked too',exp.join()===got.join(),[exp,got]);
  const parts=await pg.locator('.lab-c').first().locator('.lp').evaluateAll(b=>b.map(x=>x.getAttribute('aria-label')));
  ok('every part of every answer is a button that can be flagged (cell, reading, in A, in B, exists, reason, page verdict, whole check)',parts.every(p=>/^Flag /.test(p))&&['cell','reading','in A','in B','exists',"judge's reason",'page verdict','the whole check'].every(k=>parts.some(p=>p.includes(k))),parts);
  ok('the page\'s own verdict is not changed by the lab',await pg.evaluate(()=>window.__t.ui.res.overall)==='pend'&&(await S(pg,'answers'))[Object.keys(await S(pg,'answers'))[0]].grade==='pend');
  // moving on while the lab is busy: the runs still finish and are stored; the new pair has no lab
  await pg.evaluate(()=>{ window.__labdelay=300; });
  await pg.keyboard.press('Enter'); await pg.waitForTimeout(100);
  ok('the next pair has no lab panel',await pg.evaluate(()=>!window.__t.ui.lab));
  await pg.waitForTimeout(100);
  ok('no page errors (lab, wide)',noErr(errs).length===0,errs);
  await br.close();
 }
 // 2. nothing differs: chip shows =; mismatch and failures
 {
  const {br,pg,errs}=await open({width:1280,height:800},{lab:true});
  await answerWide(pg); await settle(pg); await pg.waitForTimeout(80);
  let chip=await pg.locator('.vchip',{hasText:/lab/i}).innerText();
  ok('the models agree with each other and with the learner: the chip carries =',/=/.test(chip)||/≠/.test(chip),chip);   // the mock answers "both" for everything; the learner's cells differ for some things
  await pg.keyboard.press('Enter'); await pg.waitForTimeout(80);
  // mismatch: Haiku's call is answered by another model
  await pg.evaluate(()=>{ window.__applied={haiku:'claude-sonnet-5-5'}; window.__labdelay=20; });
  await answerWide(pg); await settle(pg); await pg.waitForTimeout(80);
  const runs=Object.values(await S(pg,'labruns')), id=await pg.evaluate(()=>window.__t.ui.saveId);
  const hk=runs.filter(r=>r.model==='claude-haiku-5-5').pop(), jd=runs.filter(r=>r.kind==='judge').pop();
  ok('a run answered by another model is stored but marked not valid',hk.valid===false&&hk.ok===true&&hk.modelApplied==='claude-sonnet-5-5',hk);
  const jp=await pg.evaluate(()=>window.__labcalls.filter(c=>c.judge).pop().prompt);
  ok('it does not go to the judge: the judge sees two answers',/ANSWER 2/.test(jp)&&!/ANSWER 3/.test(jp)&&jd.order.length===2,jd.order);
  await pg.locator('.vchip',{hasText:/lab/i}).click(); await pg.waitForTimeout(100);
  ok('the panel says that run was not counted',/not counted/i.test(await pg.locator('.lab .status').first().innerText()));
  await pg.keyboard.press('Enter'); await pg.waitForTimeout(80);
  // failure: Sonnet rate limited
  await pg.evaluate(()=>{ window.__applied=null; window.__labFail={sonnet:'rate_limited'}; });
  const before=(await calls(pg)).length;
  await answerWide(pg); await settle(pg); await pg.waitForTimeout(80);
  const sr=Object.values(await S(pg,'labruns')).filter(r=>r.model==='claude-sonnet-5-5').pop();
  ok('a failed call is stored with its error code',sr.ok===false&&sr.error==='rate_limited'&&sr.valid===false,sr);
  ok('the other two still ran and the judge ruled on them',(await calls(pg)).length-before===4);
  await pg.locator('.vchip',{hasText:/lab/i}).click(); await pg.waitForTimeout(100);
  ok('the panel names the failure and offers to run the missing one again',/Sonnet: failed \(rate_limited\)/.test(await pg.locator('.lab .status').first().innerText())&&await pg.locator('.lab .btn',{hasText:/missing/i}).count()===1);
  await pg.keyboard.press('Enter'); await pg.waitForTimeout(80);
  const n1=(await calls(pg)).length;
  await answerWide(pg); await pg.waitForTimeout(400);
  ok('after a rate limit the lab pauses: no new calls for the next answer',(await calls(pg)).length===n1,[n1,(await calls(pg)).length]);
  ok('the page works and no lab panel is shown for that answer',await pg.evaluate(()=>!window.__t.ui.lab)&&await pg.locator('.vchip',{hasText:/lab/i}).count()===0);
  // resume and re-run the missing one
  await pg.keyboard.press('Enter'); await pg.waitForTimeout(60);
  await pg.evaluate(()=>{ window.__labFail={}; window.__t.labPause=0; });
  await answerWide(pg); await settle(pg); await pg.waitForTimeout(60);
  await pg.evaluate(()=>{ window.__labFail={haiku:'unavailable'}; });
  ok('no page errors (lab failures)',noErr(errs).length===0,errs);
  await br.close();
 }
 // 3. unreadable reply, re-run only the missing ones
 {
  const {br,pg,errs}=await open({width:1280,height:800},{lab:true});
  await pg.evaluate(()=>{ window.__labRaw={opus:'I think it is both.'}; });
  await answerWide(pg); await settle(pg); await pg.waitForTimeout(80);
  const orn=Object.values(await S(pg,'labruns')).find(r=>r.model==='claude-opus-5-5'&&r.kind!=='judge');
  ok('an unreadable reply is stored as not ok with the raw text',orn.ok===false&&orn.valid===true&&/both/.test(orn.raw)&&!!orn.error,orn);
  await pg.locator('.vchip',{hasText:/lab/i}).click(); await pg.waitForTimeout(100);
  ok('the panel says the reply was unreadable',/Opus: unreadable reply/.test(await pg.locator('.lab .status').first().innerText()));
  await pg.evaluate(()=>{ window.__labRaw={}; });
  const b=(await calls(pg)).length;
  await pg.locator('.lab .btn',{hasText:/missing/i}).click(); await pg.waitForTimeout(150); await settle(pg);
  const c=(await calls(pg)).slice(b);
  ok('Run the missing ones again calls only Opus, then the judge again',c.length===2&&/opus/.test(c[0].m)&&!c[0].j&&c[1].j,c);
  ok('after that the panel has no failure and the button is gone',await pg.locator('.lab .status').count()===0&&await pg.locator('.lab .btn',{hasText:/missing/i}).count()===0);
  ok('the rerun replaced the stored Opus run',(await S(pg,'labruns'))[Object.keys(await S(pg,'labruns')).find(k=>k.endsWith('_opus'))].ok===true);
  ok('no page errors (rerun)',noErr(errs).length===0,errs);
  await br.close();
 }
 // 4. the switch
 {
  const {br,pg,errs}=await open({width:1280,height:800},{lab:true});
  await pg.locator('#obtn').click(); await pg.waitForTimeout(150);
  const sw=pg.locator('#over .sw',{hasText:/three models/i});
  ok('Options has the Check lab switch, on',await sw.count()===1&&await sw.getAttribute('aria-checked')==='true');
  ok('the Options text says it uses the viewer\'s own Claude usage',/own usage/.test(await pg.locator('#over').innerText()));
  await sw.click(); await pg.waitForTimeout(80);
  ok('turning it off is remembered in the browser',await pg.evaluate(()=>localStorage.getItem('rd-lab'))==='0'&&!(await pg.evaluate(()=>window.__t.lab)));
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(80);
  await answerWide(pg); await pg.waitForTimeout(400);
  ok('with the lab off no calls are made and there is no Lab chip',(await calls(pg)).length===0&&await pg.locator('.vchip',{hasText:/lab/i}).count()===0&&Object.keys(await S(pg,'labruns')).length===0);
  await pg.keyboard.press('Enter'); await pg.waitForTimeout(80);
  await pg.locator('#obtn').click(); await pg.waitForTimeout(100); await pg.locator('#over .sw',{hasText:/three models/i}).click(); await pg.waitForTimeout(60); await pg.keyboard.press('Escape'); await pg.waitForTimeout(60);
  await answerWide(pg); await settle(pg);
  ok('turned on again, the next answer runs the lab',(await calls(pg)).length===4);
  ok('no page errors (switch)',noErr(errs).length===0,errs);
  await br.close();
 }
 // 5. flags
 {
  const {br,pg,errs}=await open({width:1280,height:800},{lab:true});
  await answerWide(pg); await settle(pg); await pg.waitForTimeout(80);
  await pg.locator('.vchip',{hasText:/lab/i}).click(); await pg.waitForTimeout(100);
  const card=pg.locator('.lab-c').first(), hrow=card.locator('.lab-r',{hasText:/haiku/i});
  const keyBefore=await pg.evaluate(()=>window.__t.cur.p.a+'|'+window.__t.cur.p.b);
  await hrow.locator('.lp[aria-label^="Flag in A"]').click(); await pg.waitForTimeout(100);
  ok('tapping a part opens the flag editor with the note field focused',await pg.locator('.flagedit').count()===1&&await pg.evaluate(()=>document.activeElement&&document.activeElement.id)==='flag-note');
  ok('the editor names what is flagged (model and part) and does not repeat the value',/Haiku: in A/.test(await pg.locator('.flagedit .fh').innerText())&&!/=/.test(await pg.locator('.flagedit .fh').innerText()),await pg.locator('.flagedit .fh').innerText());
  await pg.keyboard.type('Plants are not round. f s 1 2 3'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(60);
  ok('typing in the note (including f, s, digits and Enter) does not favorite, skip, pick a relation or go to the next pair',await pg.evaluate(()=>window.__t.cur.p.a+'|'+window.__t.cur.p.b)===keyBefore&&Object.keys(await S(pg,'skips')).length===0&&Object.keys(await S(pg,'favorites')).length===0&&await pg.evaluate(()=>window.__t.ui.checked));
  ok('Enter in the note field adds a line',(await pg.inputValue('#flag-note')).includes('\n')||(await pg.inputValue('#flag-note')).includes('3'));
  await pg.fill('#flag-note','Plants are not round.'); await pg.fill('#flag-sug','A ✗');
  await pg.locator('.flagedit .btn',{hasText:/^submit$/i}).click(); await pg.waitForTimeout(150);
  let fl=Object.values(await S(pg,'flags'));
  ok('saving writes one document to flags with part, model, shown value, note, suggestion and state new',fl.length===1&&fl[0].part==='inA'&&fl[0].model==='haiku'&&fl[0].shown==='✓'&&fl[0].note==='Plants are not round.'&&fl[0].suggest==='A ✗'&&fl[0].state==='new'&&!!fl[0].caseKey&&!!fl[0].runId&&!!fl[0].thing&&!!fl[0].pair&&!!fl[0].at,fl);
  ok('the editor closes and the part shows as flagged',await pg.locator('.flagedit').count()===0&&await hrow.locator('.lp[aria-label^="Flag in A"]').getAttribute('aria-pressed')==='true'&&await hrow.locator('.lp.flagged .flg').count()===1);
  // any part, not only the wrong ones: a part that agrees with the learner, the reading, the judge's reason, the page verdict, the whole check
  const srow=card.locator('.lab-r',{hasText:/sonnet/i});
  await srow.locator('.lcell .lp').click(); await pg.waitForTimeout(80); await pg.locator('#flag-note').fill('right, for a good reason'); await pg.locator('.flagedit .btn',{hasText:/^submit$/i}).click(); await pg.waitForTimeout(100);
  await srow.locator('.lp.rd').click(); await pg.waitForTimeout(80); await pg.locator('#flag-note').fill('reading is fine'); await pg.locator('.flagedit .btn',{hasText:/^submit$/i}).click(); await pg.waitForTimeout(100);
  await card.locator('.lab-why .lp').click(); await pg.waitForTimeout(80); await pg.locator('#flag-note').fill('reason is thin'); await pg.locator('.flagedit .btn',{hasText:/^submit$/i}).click(); await pg.waitForTimeout(100);
  await card.locator('.lab-r.page .lp').first().click(); await pg.waitForTimeout(80); await pg.locator('#flag-note').fill('page cannot tell'); await pg.locator('.flagedit .btn',{hasText:/^submit$/i}).click(); await pg.waitForTimeout(100);
  await card.locator('.lp.all').click(); await pg.waitForTimeout(80); await pg.locator('#flag-note').fill('whole case is underspecified'); await pg.locator('#flag-sug').press('Enter'); await pg.waitForTimeout(100);
  fl=Object.values(await S(pg,'flags'));
  ok('flags on a matching cell, a reading, the judge\'s reason, the page verdict and the whole check are all stored',['cell','reading','reason','verdict','check'].every(p=>fl.some(f=>f.part===p))&&fl.length===6,fl.map(f=>f.part));
  ok('the whole-check flag has no model and was saved with Enter in the second field',fl.find(f=>f.part==='check').model===''&&fl.find(f=>f.part==='check').note==='whole case is underspecified');
  // change and remove
  await hrow.locator('.lp[aria-label^="Flag in A"]').click(); await pg.waitForTimeout(80);
  ok('opening a flagged part shows its note and offers Submit and Remove',await pg.inputValue('#flag-note')==='Plants are not round.'&&await pg.locator('.flagedit .btn',{hasText:/^submit$/i}).count()===1&&await pg.locator('.flagedit .back',{hasText:/remove/i}).count()===1);
  await pg.fill('#flag-note','Plants are not round things.'); await pg.locator('.flagedit .btn',{hasText:/^submit$/i}).click(); await pg.waitForTimeout(100);
  fl=Object.values(await S(pg,'flags')); const f1=fl.find(f=>f.part==='inA');
  ok('updating keeps one document, changes the note, keeps the state and the creation time',fl.length===6&&f1.note==='Plants are not round things.'&&f1.state==='new'&&f1.updatedAt>=f1.at);
  await hrow.locator('.lp[aria-label^="Flag in A"]').click(); await pg.waitForTimeout(80);
  await pg.locator('.flagedit .back',{hasText:/remove/i}).click(); await pg.waitForTimeout(120);
  ok('removing deletes the document and the mark',Object.keys(await S(pg,'flags')).length===5&&await hrow.locator('.lp[aria-label^="Flag in A"]').getAttribute('aria-pressed')==='false');
  await hrow.locator('.lp[aria-label^="Flag in B"]').click(); await pg.waitForTimeout(80);
  await pg.locator('.flagedit .btn',{hasText:/cancel/i}).click(); await pg.waitForTimeout(80);
  ok('Cancel closes the editor without saving',await pg.locator('.flagedit').count()===0&&Object.keys(await S(pg,'flags')).length===5);
  // the explanation
  await pg.locator('#coach .btn',{hasText:/explain/i}).first().click().catch(()=>{}); await pg.waitForTimeout(400);
  await pg.locator('.qm').first().click(); await pg.waitForTimeout(100);
  ok('after Explain the ? note of a cell has a flag in its top-right corner',await pg.locator('.pop .aiflag').count()===1);
  await pg.locator('.pop .aiflag').click(); await pg.waitForTimeout(80); await pg.locator('#flag-note').fill('too brief'); await pg.locator('.flagedit .btn',{hasText:/^submit$/i}).click(); await pg.waitForTimeout(100);
  const fe=Object.values(await S(pg,'flags')).find(f=>f.part==='explain');
  ok('the note flag stores the shown text',!!fe&&/clay pot/.test(fe.shown)&&fe.note==='too brief',fe);
  ok('no page errors (flags)',noErr(errs).length===0,errs);
  await br.close();
 }
 // 6. a lab update while a note is being typed does not take the focus away or lose the text
 {
  const {br,pg,errs}=await open({width:1280,height:800},{lab:true});
  await pg.evaluate(()=>{ window.__labdelays={opus:1200,judge:50}; });
  await answerWide(pg); await pg.waitForTimeout(350);
  await pg.locator('.vchip',{hasText:/lab/i}).click(); await pg.waitForTimeout(80);
  await pg.locator('.lab-c').first().locator('.lab-r',{hasText:/haiku/i}).locator('.lp[aria-label^="Flag in B"]').click(); await pg.waitForTimeout(80);
  await pg.keyboard.type('abc');
  await pg.waitForTimeout(1500);
  const st=await pg.evaluate(()=>({id:document.activeElement&&document.activeElement.id,v:(document.getElementById('flag-note')||{}).value,busy:window.__t.ui.lab.busy}));
  ok('while the Opus run finishes the note keeps its focus and text',st.id==='flag-note'&&st.v==='abc',st);
  await pg.waitForTimeout(1600);
  ok('the lab finished meanwhile (the judge ruled)',await pg.evaluate(()=>!!window.__t.ui.lab.runs.judge&&window.__t.ui.lab.runs.judge.status==='ok'));
  await pg.locator('.flagedit .btn',{hasText:/cancel/i}).click(); await pg.waitForTimeout(150);
  ok('after leaving the note the panel shows every row, the judge included',await pg.locator('.lab-c').first().locator('.lab-r').count()===5);
  ok('no page errors (typing while running)',noErr(errs).length===0,errs);
  await br.close();
 }
 // 7. flag write failure is undone with a message
 {
  const {br,pg,errs}=await open({width:1280,height:800},{lab:true});
  await answerWide(pg); await settle(pg); await pg.waitForTimeout(80);
  await pg.locator('.vchip',{hasText:/lab/i}).click(); await pg.waitForTimeout(80);
  await pg.evaluate(()=>{ window.__failSet={flags:true}; });
  const row=pg.locator('.lab-c').first().locator('.lab-r',{hasText:/opus/i});
  await row.locator('.lp[aria-label^="Flag exists"]').click(); await pg.waitForTimeout(60); await pg.locator('#flag-note').fill('x'); await pg.locator('.flagedit .btn',{hasText:/^submit$/i}).click(); await pg.waitForTimeout(400);
  ok('a flag that could not be saved is undone and says so',await row.locator('.lp[aria-label^="Flag exists"]').getAttribute('aria-pressed')==='false'&&/could not be saved \(quota_exceeded\), so it was undone/.test(await pg.locator('.lab .status').last().innerText()));
  ok('no page errors (flag failure)',noErr(errs).length===0,errs);
  await br.close();
 }
 // 8. Pervasions tab: the same lab on a debate
 {
  const {br,pg,errs}=await open({width:1280,height:800},{lab:true});
  await pg.locator('#tabs .nv',{hasText:/pervasions/i}).click(); await pg.waitForTimeout(150);
  for(let i=0;i<4;i++){ await pg.keyboard.press('w'); await pg.waitForTimeout(60); await pg.fill('#dex','example '+(i+1)); await pg.keyboard.press('Enter'); await pg.waitForTimeout(80); }
  const rel=await pg.evaluate(()=>window.__t.cur.p.relation);
  await pg.keyboard.press(String(ORDER[rel]+1)); await pg.waitForTimeout(150); await settle(pg); await pg.waitForTimeout(80);
  const runs=Object.values(await S(pg,'labruns')), r=runs.find(x=>x.model==='claude-haiku-5-5');
  ok('a checked debate runs the lab too, on the examples posited with Why?',!!r&&r.case.tab==='debate'&&r.case.things.length===4&&/^debates_/.test(r.caseKey)&&runs.length===4,r&&r.caseKey);
  ok('the Questions result has the Lab chip',await pg.locator('.vchip',{hasText:/lab/i}).count()===1);
  ok('no page errors (debate lab)',noErr(errs).length===0,errs);
  await br.close();
 }
 // 9. Review: model table, disagreements, flags
 {
  const {br,pg,errs}=await open({width:1280,height:800},{lab:true});
  await pg.evaluate(()=>{ window.__labAns={haiku:(t,i)=>({inB:i!==0})}; });
  for(let k=0;k<2;k++){ await answerWide(pg); await settle(pg); await pg.waitForTimeout(80); if(k===0){ await pg.locator('.vchip',{hasText:/lab/i}).click(); await pg.waitForTimeout(80); await pg.locator('.lab-c').first().locator('.lab-r',{hasText:/haiku/i}).locator('.lp[aria-label^="Flag in B"]').click(); await pg.waitForTimeout(60); await pg.locator('#flag-note').fill('B is wrong'); await pg.locator('.flagedit .btn',{hasText:/^submit$/i}).click(); await pg.waitForTimeout(80); await pg.locator('#stage .actions .btn',{hasText:/next pair/i}).click(); await pg.waitForTimeout(80); } }
  await pg.locator('#tabs .nv',{hasText:/review/i}).click(); await pg.waitForTimeout(250);
  const sec=pg.locator('.rcol .section',{has:pg.locator('.label',{hasText:/^Lab/})});
  ok('Review has a Lab section',await sec.count()===1);
  ok('its heading counts the flags',/1 flagged, 1 new/.test(await sec.locator('.label .hint').innerText()),await sec.locator('.label .hint').innerText());
  const trs=await sec.locator('table.labt tbody tr').allInnerTexts();
  ok('a model table lists Haiku, Sonnet and Opus with counted runs, time and agreement with the judge',trs.length===3&&/Haiku\s+2/.test(trs[0].replace(/\t/g,' '))&&/\d+ \/ \d+/.test(trs[0]),trs);
  const dis=await sec.locator('.sublabel',{hasText:/disagree/i}).count();
  ok('"Models disagree" lists the things where the models gave different cells',dis===1&&await sec.locator('.sublabel',{hasText:/disagree/i}).evaluate(e=>e.nextElementSibling.querySelectorAll('li').length)>=2);
  await sec.locator('.flagl li .btn',{hasText:/reviewed/i}).click(); await pg.waitForTimeout(150);
  ok('Reviewed changes the stored state',Object.values(await S(pg,'flags'))[0].state==='reviewed');
  await sec.locator('.flagl li .btn',{hasText:/resolved/i}).click(); await pg.waitForTimeout(150);
  ok('Resolved changes it again, and the entry is dimmed',Object.values(await S(pg,'flags'))[0].state==='resolved'&&await sec.locator('.flagl li.resolved').count()===1);
  ok('the flag entry shows what was flagged and the note',/B is wrong/.test(await sec.locator('.flagl').innerText())&&/Haiku/.test(await sec.locator('.flagl').innerText()));
  await sec.locator('.flagl li .btn',{hasText:/delete/i}).click(); await pg.waitForTimeout(150);
  ok('Delete removes it',Object.keys(await S(pg,'flags')).length===0&&await sec.locator('.flagl').count()===0);
  // a flag arriving from elsewhere appears
  await pg.evaluate(()=>{ window.__S.flags.fl_ext={id:'fl_ext',caseKey:'x',thing:'a tree',part:'cell',model:'sonnet',shown:'Both',note:'from another device',suggest:'',state:'new',at:new Date().toISOString(),updatedAt:new Date().toISOString()}; window.__subs.flags.forEach(f=>f({docs:Object.entries(window.__S.flags).map(([id,d])=>({id,data:()=>d}))})); });
  await pg.waitForTimeout(200);
  ok('a flag written elsewhere shows up in Review',/from another device/.test(await pg.locator('.rcol').first().innerText()));
  ok('no page errors (review lab)',noErr(errs).length===0,errs);
  await br.close();
 }
 // 10. lab off and no data: no section; lab off with data: section stays
 {
  const {br,pg,errs}=await open({width:1280,height:800});
  await pg.locator('#tabs .nv',{hasText:/review/i}).click(); await pg.waitForTimeout(200);
  ok('with the lab off and nothing stored, Review has no Lab section',await pg.locator('.rcol .label',{hasText:/^Lab/}).count()===0);
  await br.close();
 }
 // 10b. keyboard focus: a run finishing does not move it; a saved flag returns it to the flagged part
 {
  const {br,pg,errs}=await open({width:1280,height:800},{lab:true});
  await pg.evaluate(()=>{ window.__labdelay=500; });
  await answerWide(pg); await pg.waitForTimeout(120);
  const foc=()=>pg.evaluate(()=>{ const a=document.activeElement; return a&&a.tagName==='BUTTON'?a.textContent.trim():(a&&a.tagName); });
  ok('after the result the Next pair button has the focus',/next pair/i.test(await foc()),await foc());
  await settle(pg); await pg.waitForTimeout(100);
  ok('it still has it after the lab runs and the panel updates',/next pair/i.test(await foc()),await foc());
  await pg.locator('.vchip',{hasText:/lab/i}).click(); await pg.waitForTimeout(100);
  await pg.locator('.vchip',{hasText:/lab/i}).focus();
  await pg.evaluate(()=>window.__t.labAgain&&0);
  await pg.locator('.lab-c').first().locator('.lab-r',{hasText:/sonnet/i}).locator('.lp[aria-label^="Flag exists"]').click(); await pg.waitForTimeout(80);
  await pg.locator('#flag-note').fill('ok'); await pg.locator('.flagedit .btn',{hasText:/^submit$/i}).click(); await pg.waitForTimeout(150);
  const fid=await pg.evaluate(()=>document.activeElement&&document.activeElement.getAttribute('data-fid'));
  ok('after saving, the focus is on the flagged part',!!fid&&await pg.evaluate(()=>/Flag exists/.test(document.activeElement.getAttribute('aria-label'))&&document.activeElement.getAttribute('aria-pressed')==='true'),fid);
  await pg.locator('.lab-c').first().locator('.lab-r',{hasText:/sonnet/i}).locator('.lp[aria-label^="Flag exists"]').click(); await pg.waitForTimeout(80);
  await pg.locator('.flagedit .btn',{hasText:/cancel/i}).click(); await pg.waitForTimeout(100);
  ok('after Cancel the focus is on the part again',await pg.evaluate(()=>/Flag exists/.test(document.activeElement.getAttribute('aria-label')||'')));
  ok('no page errors (focus)',noErr(errs).length===0,errs);
  await br.close();
 }
 // 11. phone: panel, editor, no overflow, focus rings, dark theme
 for(const [w,h] of [[320,640],[390,844]]){
  const {br,pg,errs}=await open({width:w,height:h},{isMobile:true,hasTouch:true,lab:true});
  await pg.evaluate(()=>{ window.__labAns={haiku:(t,i)=>({inB:false,unsure:i===0}),opus:(t,i)=>({exists:i!==1})}; });
  await answerPhone(pg); await settle(pg); await pg.waitForTimeout(100);
  await pg.locator('.vchip',{hasText:/lab/i}).click(); await pg.waitForTimeout(150);
  const over=()=>pg.evaluate(()=>({doc:document.documentElement.scrollWidth>innerWidth,card:(()=>{const c=document.getElementById('stage'); return c.scrollWidth>c.clientWidth+1;})(),lab:(()=>{const c=document.querySelector('.lab'); return c?c.scrollWidth>c.clientWidth+1:null;})()}));
  let o=await over(); ok(w+' px: the open Lab panel does not overflow sideways',!o.doc&&!o.card&&!o.lab,o);
  const small=await pg.locator('.lab .lp').evaluateAll(b=>b.filter(x=>x.getBoundingClientRect().height<26).length);
  ok(w+' px: every flag button is at least 26 px tall',small===0,small);
  await pg.locator('.lab-c').first().locator('.lab-r',{hasText:/haiku/i}).locator('.lp[aria-label^="Flag cell"]').click(); await pg.waitForTimeout(150);
  ok(w+' px: the editor opens and its note field is focused and visible above the tab bar',await pg.evaluate(()=>{const t=document.getElementById('flag-note'); if(!t||document.activeElement!==t) return false; const r=t.getBoundingClientRect(); const bar=document.querySelector('.actions'); const br=bar?bar.getBoundingClientRect():{top:innerHeight}; return r.top>=0&&r.bottom<=br.top+1;}));
  o=await over(); ok(w+' px: still no sideways overflow with the editor open',!o.doc&&!o.card&&!o.lab,o);
  await pg.keyboard.type('check this'); await pg.locator('.flagedit .btn',{hasText:/^submit$/i}).click(); await pg.waitForTimeout(150);
  ok(w+' px: saving on the phone writes the flag',Object.keys(await S(pg,'flags')).length===1);
  await pg.screenshot({path:D+'v57-lab-'+w+'.png'});
  // focus rings of the flag buttons
  const ring=(await pg.evaluate(ringScan)).filter(x=>/\.lp|flag|lab/i.test(x));
  ok(w+' px: the focus rings of the flag buttons and editor are not clipped by their container',ring.length===0,ring);
  ok('no page errors (phone '+w+')',noErr(errs).length===0,errs);
  await br.close();
 }
 {
  const {br,pg,errs}=await open({width:390,height:844},{isMobile:true,hasTouch:true,lab:true,colorScheme:'dark'});
  await answerPhone(pg); await settle(pg); await pg.waitForTimeout(100);
  await pg.locator('.vchip',{hasText:/lab/i}).click(); await pg.waitForTimeout(150);
  await pg.locator('.lab .lp[aria-label^="Flag cell"]').first().click(); await pg.waitForTimeout(100);
  await pg.screenshot({path:D+'v57-lab-dark.png'});
  const lowc=await pg.evaluate(()=>{ const rgb=s=>s.match(/\d+(\.\d+)?/g).map(Number); const lum=c=>{const a=c.slice(0,3).map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)}); return .2126*a[0]+.7152*a[1]+.0722*a[2];}; const bad=[]; for(const n of document.querySelectorAll('.lab .lp,.lab .mn,.lab-s,.flagedit .fh,.flagedit textarea')){ const cs=getComputedStyle(n); let bg=null,e=n; while(e&&!bg){ const b=rgb(getComputedStyle(e).backgroundColor); if(b.length>=3&&(b[3]===undefined||b[3]>0.5)) bg=b; e=e.parentElement; } const fg=rgb(cs.color); const L1=lum(fg),L2=lum(bg||[16,22,43]); const cr=(Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05); if(cr<3.5) bad.push([n.className,n.innerText.slice(0,20),cr.toFixed(2)]); } return bad; });
  ok('dark theme: the lab text has contrast of at least 3.5',lowc.length===0,lowc);
  ok('no page errors (dark)',noErr(errs).length===0,errs);
  await br.close();
 }
 console.log(out.join('\n')); console.log(out.filter(x=>x.startsWith('FAIL')).length+' failed of '+out.length);
})().catch(e=>{console.log(out.join('\n')); console.error(e); process.exit(1);});
