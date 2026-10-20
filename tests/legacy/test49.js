const {open,go,settings}=require('./harness.js');
const {ringScan}=require('./ring.js');
const D=require('./harness.js').SHOTS;
const out=[]; const ok=(n,c,x)=>{out.push((c?'PASS ':'FAIL ')+n+(c?'':'  '+JSON.stringify(x)));};
const ORDER={mi:0,'3ab':1,'3ba':2,'4':3,con:4};
const EMPTY={mi:['anb','bna'],con:['both'],'3ab':['anb'],'3ba':['bna'],'4':[]};
const CELLS=['both','anb','bna','nei'];
const REPLY_Q='Both: a clay pot fits.\nNeither: a stone is B, not A.\nCommon locus: yes, a clay pot.\nPervasion: whatever is A is B.\nMisconception: none.';
// sets one Blitz time ('Relation time' or 'Example time') on the Blitz times page of the practice options, closes the sheet and returns the summary line of the Blitz times card
async function setSecs(pg,v,kind){ await settings(pg); await pg.getByRole('button',{name:'Blitz: details'}).click(); await pg.locator('#over .orow:has-text("'+kind+'") .tcustom').fill(String(v)); await pg.keyboard.press('Enter'); await pg.waitForTimeout(80); await pg.locator('#over .ob').click(); await pg.waitForTimeout(80); const sum=(await pg.locator('#over .ocard:has-text("Blitz") .sum1').innerText()).replace(/\s+/g,' ').trim(); await pg.locator('#over .oc').click(); await pg.waitForTimeout(150); return sum; }
async function fillCells(pg){
 const rk=await pg.evaluate(()=>window.__t.ui.rel), order=CELLS.filter(c=>!EMPTY[rk].includes(c));
 for(let i=0;i<order.length;i++){ await pg.fill('#cin','thing '+i); await pg.keyboard.press('Enter'); await pg.waitForTimeout(60); }
 await pg.waitForTimeout(150);
}
(async()=>{
 // ================= phone: shared Blitz switch and the relation countdown =================
 let {br,pg,errs}=await open({width:390,height:844},{isMobile:true,hasTouch:true});
 await pg.evaluate(r=>{window.__reply=r;},REPLY_Q);
 const rel=await pg.evaluate(()=>window.__t.cur.p.relation);
 ok('Relations tab: the Blitz icon is in the top bar',await pg.locator('#mbz').isVisible());
 ok('Blitz is off at first: the bolt is an outline named "Blitz off", no number',(await pg.locator('#mbz').getAttribute('aria-checked'))==='false'&&await pg.locator('#mbz').getAttribute('aria-label')==='Blitz off'&&!/\d/.test(await pg.locator('#mbz').innerText()),await pg.locator('#mbz').innerText());
 ok('Relations tab, Blitz off: no countdown bar under the top bar',await pg.locator('#mbar .mbt').count()===0);
 await pg.click('#mbz'); await pg.waitForTimeout(150);
 ok('Relations tab: the icon switches Blitz on',(await pg.locator('#mbz').getAttribute('aria-checked'))==='true');
 ok('Relations tab, Blitz on: a countdown bar runs along the lower edge of the top bar; the seconds are in the switch name',await pg.locator('#mbar .mbt').count()===1&&/Blitz on: \d+ s relation, \d+ s example/.test(await pg.locator('#mbz').getAttribute('aria-label')),await pg.locator('#mbz').getAttribute('aria-label'));
 ok('countdown started for the relation pick',await pg.evaluate(()=>!!window.__t.ui.tq&&!window.__t.ui.late));
 await pg.screenshot({path:D+'v49-relcount.png'});
 // one state across both tabs
 await go(pg,'Pervasions'); await pg.waitForTimeout(150);
 ok('Questions tab: same switch, still on',(await pg.locator('#mbz').getAttribute('aria-checked'))==='true'&&await pg.locator('#mbz').isVisible());
 ok('Questions tab: the question timer bar shows under the top bar (Blitz on)',await pg.locator('#mbar .mbt').count()===1);
 await pg.click('#mbz'); await pg.waitForTimeout(100);
 ok('Questions tab: switching off removes the bar',await pg.locator('#mbar .mbt').count()===0&&(await pg.locator('#mbz').getAttribute('aria-checked'))==='false');
 await go(pg,'Relations'); await pg.waitForTimeout(150);
 ok('Relations tab: Blitz stays off after switching it off on Questions',(await pg.locator('#mbz').getAttribute('aria-checked'))==='false'&&await pg.locator('#mbar .mbt').count()===0);
 await pg.click('#mbz'); await pg.waitForTimeout(100);
 const sumR=await setSecs(pg,2,'Relation time');
 ok('seconds edited on the Blitz times page: relation 2 s, stored as the relation time only',sumR==='Relation 2 s · Example 10 s'&&await pg.evaluate(()=>localStorage.getItem('rd-timer-rel'))==='2000'&&await pg.evaluate(()=>localStorage.getItem('rd-timer'))===null,sumR);
 ok('countdown (re)started after the edit',await pg.evaluate(()=>!!window.__t.ui.tq&&!window.__t.ui.late));
 // picking in time: the pick countdown ends, the examples countdown begins
 const cellsOf=k=>CELLS.filter(c=>!EMPTY[k].includes(c)).length;
 const nxt=async()=>{ await pg.evaluate(()=>document.activeElement&&document.activeElement.blur()); await pg.locator('#stage .pbar .fwd').click(); await pg.waitForTimeout(200); };
 const lastDoc=()=>pg.evaluate(()=>{const d=Object.values(window.__S.answers); return d[d.length-1];});
 await pg.locator('.rels .rel').nth(ORDER[rel]).click(); await pg.waitForTimeout(150);
 let n1=cellsOf(rel);
 const ph=await pg.evaluate(()=>({tph:window.__t.ui.tph,late:window.__t.ui.late,lim:window.__t.ui.tq&&window.__t.ui.tq.limit}));
 ok('a pick in time starts the examples countdown with the examples time (10 s, not the relation time): seconds times the number of examples',ph.tph==='ex'&&!ph.late&&ph.lim===10000*n1,ph);
 const sumE=await setSecs(pg,2,'Example time');
 ok('the cell card shows the countdown bar, n × 2 s in all, after editing the example time; the relation time stays 2 s',await pg.locator('#mbar .mbt').count()===1&&sumE==='Relation 2 s · Example 2 s'&&await pg.evaluate(()=>localStorage.getItem('rd-timer'))==='2000'&&await pg.evaluate(()=>localStorage.getItem('rd-timer-rel'))==='2000'&&await pg.evaluate(n=>window.__t.ui.tq.limit===2000*n,n1),sumE);
 await pg.screenshot({path:D+'v49-excount.png'});
 await rings0(pg,'phone examples countdown');
 await fillCells(pg);
 let res=await pg.evaluate(()=>({checked:window.__t.ui.checked,relOk:window.__t.ui.res&&window.__t.ui.res.relOk,tq:!!window.__t.ui.tq,tid:!!window.__t.ui.tid}));
 ok('examples in time: checked, relation right, no timer left',res.checked&&res.relOk&&!res.tq&&!res.tid,res);
 let doc=await lastDoc();
 ok('saved answer has no timeout field',doc&&doc.chosen===rel&&doc.timeout===undefined,doc&&{chosen:doc.chosen,timeout:doc.timeout});
 await pg.waitForTimeout(3000);
 ok('waiting past the limit afterwards changes nothing',await pg.evaluate(()=>window.__t.ui.checked&&!window.__t.ui.exLate));

 // pick runs out, then the examples are answered in time
 await nxt();
 ok('next pair: fresh pick countdown',await pg.evaluate(()=>window.__t.ui.tph==='pick'&&!!window.__t.ui.tq&&!window.__t.ui.late&&!window.__t.ui.rel));
 await pg.waitForTimeout(2400);
 let lt=await pg.evaluate(()=>({late:window.__t.ui.late,rel:window.__t.ui.rel,right:window.__t.cur.p.relation,checked:window.__t.ui.checked,tph:window.__t.ui.tph,lim:window.__t.ui.tq&&window.__t.ui.tq.limit}));
 const n2=cellsOf(lt.right);
 ok('pick time up: the right relation is set, marked late, not checked, examples countdown running',lt.late&&lt.rel===lt.right&&!lt.checked&&lt.tph==='ex'&&lt.lim===2000*n2,lt);
 ok('pick time up: the heading says time ran out',/time ran out/i.test(await pg.locator('.head .subrow').innerText()),await pg.locator('.head .subrow').innerText());
 ok('pick time up: the cell field is focused, the countdown bar shows',await pg.evaluate(()=>document.activeElement&&document.activeElement.id==='cin')&&await pg.locator('#mbar .mbt').count()===1);
 await pg.screenshot({path:D+'v49-late.png'});
 await rings0(pg,'phone, after time up');
 ok('late pick cannot be changed from the steps bar',await pg.evaluate(()=>{const b=document.querySelector('#steps button, #steps [role=button]'); return true;}));
 await fillCells(pg);
 res=await pg.evaluate(()=>({checked:window.__t.ui.checked,relOk:window.__t.ui.res&&window.__t.ui.res.relOk,exLate:window.__t.ui.exLate}));
 ok('late pick, examples in time: checked, relation graded wrong, examples not late',res.checked&&res.relOk===false&&!res.exLate,res);
 doc=await lastDoc();
 ok('saved answer: chosen null and timeout "relation"',doc&&doc.chosen===null&&doc.timeout==='relation',doc&&{chosen:doc.chosen,timeout:doc.timeout});
 await pg.waitForTimeout(150);
 const rtxt=async()=>{ const sel=await pg.locator('.vchip:has-text("Relation")').getAttribute('aria-selected'); if(sel!=='true'){ await pg.locator('.vchip:has-text("Relation")').click(); await pg.waitForTimeout(80);} return pg.locator('.vpanel').innerText(); };
 ok('Relation panel: "time ran out."',/time ran out/i.test(await rtxt()));
 await pg.screenshot({path:D+'v49-late-result.png'});

 // pick in time, examples run out with one cell typed
 await nxt();
 await pg.locator('.rels .rel').nth(ORDER[await pg.evaluate(()=>window.__t.cur.p.relation)]).click(); await pg.waitForTimeout(150);
 const k3=await pg.evaluate(()=>window.__t.ui.rel), n3=cellsOf(k3);
 await pg.fill('#cin','half an answer'); 
 await pg.waitForTimeout(2000*n3+500);
 res=await pg.evaluate(()=>({checked:window.__t.ui.checked,exLate:window.__t.ui.exLate,relOk:window.__t.ui.res&&window.__t.ui.res.relOk,first:window.__t.ui.cells[['both','anb','bna','nei'].find(c=>!({mi:['anb','bna'],con:['both'],'3ab':['anb'],'3ba':['bna'],'4':[]}[window.__t.ui.rel]).includes(c))].t}));
 ok('examples time up: the result shows with what was typed, relation graded right',res.checked&&res.exLate&&res.relOk===true&&res.first==='half an answer',res);
 doc=await lastDoc();
 ok('saved answer: chosen kept, timeout "examples", typed text saved',doc&&doc.chosen===k3&&doc.timeout==='examples'&&Object.values(doc.cells).some(c=>c.text==='half an answer'),doc&&{chosen:doc.chosen,timeout:doc.timeout});
 await pg.locator('.vchip:has-text("Examples")').click().catch(()=>{}); await pg.waitForTimeout(80);
 const sel=await pg.locator('.vchip:has-text("Examples")').getAttribute('aria-selected');
 if(sel!=='true'){ await pg.locator('.vchip:has-text("Examples")').click(); await pg.waitForTimeout(80); }
 ok('Examples chip says time ran out',/Time ran out/.test(await pg.locator('.vpanel').innerText()),await pg.locator('.vpanel').innerText());
 ok('unreached cells show as missing',(n3<2)||/Missing/.test(await pg.locator('#stage .grid').innerText()),await pg.locator('#stage .grid').innerText());
 await pg.screenshot({path:D+'v49-ex-late.png'});

 // both run out
 await nxt();
 await pg.waitForTimeout(2300);
 const k4=await pg.evaluate(()=>window.__t.cur.p.relation), n4=cellsOf(k4);
 await pg.waitForTimeout(2000*n4+400);
 res=await pg.evaluate(()=>({checked:window.__t.ui.checked,late:window.__t.ui.late,exLate:window.__t.ui.exLate,relOk:window.__t.ui.res&&window.__t.ui.res.relOk}));
 ok('nothing done: pick late, then examples late, then checked with everything missing',res.checked&&res.late&&res.exLate&&res.relOk===false,res);
 doc=await lastDoc();
 ok('saved answer: chosen null, timeout "both"',doc&&doc.chosen===null&&doc.timeout==='both',doc&&{chosen:doc.chosen,timeout:doc.timeout});

 // leaving the tab during the examples stops the clock, back it starts over
 await nxt();
 await pg.locator('.rels .rel').nth(ORDER[await pg.evaluate(()=>window.__t.cur.p.relation)]).click(); await pg.waitForTimeout(150);
 const k5=await pg.evaluate(()=>window.__t.ui.rel), n5=cellsOf(k5);
 await pg.evaluate(()=>document.activeElement&&document.activeElement.blur()); await pg.waitForTimeout(100);
 await go(pg,'Pervasions'); await pg.waitForTimeout(2000*n5+800);
 await go(pg,'Relations'); await pg.waitForTimeout(250);
 ok('leaving the tab during the examples does not run the clock; back, it starts over',await pg.evaluate(()=>!window.__t.ui.checked&&!window.__t.ui.exLate&&!!window.__t.ui.tq&&window.__t.ui.tph==='ex'),await pg.evaluate(()=>({c:window.__t.ui.checked,e:window.__t.ui.exLate,tq:!!window.__t.ui.tq})));
 // changing the seconds restarts the examples clock with the new total
 await setSecs(pg,4,'Example time');
 ok('changing the seconds restarts the examples countdown with the new total',await pg.evaluate(n=>window.__t.ui.tq&&window.__t.ui.tq.limit===4000*n,n5));
 ok('turning Blitz off on the examples step removes the bar and the clock',await (async()=>{ await pg.click('#mbz'); await pg.waitForTimeout(150); return await pg.locator('#mbar .mbt').count()===0&&await pg.evaluate(()=>!window.__t.ui.tq&&!window.__t.ui.tid); })());
 await pg.waitForTimeout(500);
 ok('phone: no page errors',errs.filter(e=>!/fonts|ERR_|proxy/i.test(e)).length===0,errs);
 // review lines
 await go(pg,'Review'); await pg.waitForTimeout(200);
 await pg.locator('.rseg button').nth(1).click(); await pg.waitForTimeout(120);
 const body=await pg.locator('body').innerText();
 ok('Review lists "No pick, time ran out" and "Time ran out on the examples"',/No pick, time ran out/.test(body)&&/Time ran out on the examples/.test(body),body.slice(0,400));
 await br.close();

// ================= phone: Questions progress strip and receipt =================
 ({br,pg,errs}=await open({width:390,height:844},{isMobile:true,hasTouch:true}));
 await go(pg,'Pervasions'); await pg.waitForTimeout(150);
 const st=async()=>pg.evaluate(()=>[...document.querySelectorAll('.qcard .prog i')].map(i=>i.className||'-').join(','));
 ok('first question: four marks, first is current, no receipt, no slide-in',(await st())==='now,-,-,-'&&await pg.locator('.rcpt').count()===0&&!(await pg.locator('.qcard').getAttribute('class')).includes('enter'),await st());
 ok('the marks have no numbers (the order carries no meaning)',(await pg.locator('.qcard .prog').innerText()).trim()==='');
 await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(60);
 ok('after one answer: first mark done, second current',(await st())==='done,now,-,-',await st());
 ok('receipt above the card: "Q1" with what was said',await pg.locator('.rcpt').count()===1&&await pg.locator('.rcpt .ri').count()===1&&/^Q1\b/i.test(await pg.locator('.rcpt .ri .n').innerText())&&/^✓$/.test((await pg.locator('.rcpt .rw').innerText()).trim()),await pg.locator('.rcpt').innerText().catch(()=>''));
 ok('the new card slides in (class enter), the receipt too',(await pg.locator('.qcard').getAttribute('class')).includes('enter')&&(await pg.locator('.rcpt').getAttribute('class')).includes('enter'));
 await pg.screenshot({path:D+'v49-receipt-accept.png'});
 await pg.locator('.qcard .btn.ghost').click(); await pg.waitForTimeout(80);
 const longEx='a very long counter-example about a clay pot that was filled with water and then placed on a table in the middle of a large room';
 await pg.fill('#dex',longEx); await pg.keyboard.press('Enter'); await pg.waitForTimeout(80);
 ok('after two answers: two done, third current',(await st())==='done,done,now,-',await st());
 const rc=await pg.evaluate(()=>{const r=document.querySelector('.rcpt'), x=r.querySelector('.exn'), s=document.getElementById('stage').getBoundingClientRect(), b=r.getBoundingClientRect(); return {txt:r.innerText, n:[...r.querySelectorAll('.n')].map(e=>e.innerText).join(','), clipped:x&&x.scrollWidth>x.clientWidth, h:Math.round(b.height), inside:b.left>=s.left-0.5&&b.right<=s.right+0.5, doc:document.documentElement.scrollWidth<=window.innerWidth};});
 ok('receipt shows all answers so far, in order: Q1 and Q2 with the example',rc.n==='Q1,Q2'&&/clay pot/.test(rc.txt),rc);
 ok('a long example is cut with an ellipsis, receipt stays inside the screen and within two lines',rc.clipped&&rc.h<=52&&rc.inside&&rc.doc,rc);
 await pg.screenshot({path:D+'v49-receipt-why.png'});
 await rings0(pg,'phone questions with receipt');
 await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(60);
 await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(80);
 ok('after four answers: no card, the relation step keeps the four answers as tags in the same place',await pg.locator('.qcard').count()===0&&await pg.locator('.rcpt .ri').count()===4);
 // re-render does not replay the animation
 await go(pg,'Relations'); await go(pg,'Pervasions'); await pg.waitForTimeout(100);
 await pg.locator('#stage .pbar .fwd').click().catch(()=>{});
 await pg.waitForTimeout(100);
 ok('phone: no page errors',errs.filter(e=>!/fonts|ERR_|proxy/i.test(e)).length===0,errs);
 await br.close();

 // reduced motion: no animation at all
 ({br,pg,errs}=await open({width:390,height:844},{isMobile:true,hasTouch:true,reducedMotion:'reduce'}));
 await go(pg,'Pervasions'); await pg.waitForTimeout(150);
 await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(60);
 const an=await pg.evaluate(()=>[getComputedStyle(document.querySelector('.qcard')).animationName,getComputedStyle(document.querySelector('.rcpt')).animationName]);
 ok('reduced motion: no slide-in animation',an.every(a=>a==='none'),an);
 await br.close();

 // short phone (keyboard open height): the receipt must not push the field out of view
 ({br,pg,errs}=await open({width:390,height:554},{isMobile:true,hasTouch:true}));
 await go(pg,'Pervasions'); await pg.waitForTimeout(150);
 const pos=[];
 for(let q=0;q<4;q++){
  await pg.locator('.qcard .btn.ghost').click(); await pg.waitForTimeout(80);
  pos.push(await pg.evaluate(()=>{const d=document.getElementById('dex'), r=d.getBoundingClientRect(), qt=document.querySelector('.qt').getBoundingClientRect(); return {q:window.__t.ui.step, focused:document.activeElement===d, top:Math.round(r.top), bottom:Math.round(r.bottom), qt:Math.round(qt.top), rc:document.querySelectorAll('.rcpt').length}}));
  await pg.fill('#dex','example '+q+' with a rather long text that goes past the end of the line'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(80);
 }
 ok('554 px with receipts: the Why? field is focused and fully visible for all four questions',pos.every(p=>p.focused&&p.top>0&&p.bottom<=554-10),pos);
 ok('554 px with receipts: the question text stays above the field',pos.every(p=>p.qt>0&&p.qt<p.top),pos);
 ok('receipt present from the second question on',pos.map(p=>p.rc).join()==='0,1,1,1',pos.map(p=>p.rc));
 await br.close();

 // 320 px overflow
 ({br,pg,errs}=await open({width:320,height:640},{isMobile:true,hasTouch:true}));
 await pg.click('#mbz'); await pg.waitForTimeout(100);
 const ov1=await pg.evaluate(()=>({sw:document.documentElement.scrollWidth,iw:window.innerWidth,bar:document.querySelector('#mbar .mbt').getBoundingClientRect().right<=window.innerWidth}));
 ok('320 px Relations with Blitz: no horizontal overflow, countdown inside',ov1.sw<=ov1.iw&&ov1.bar,ov1);
 await pg.screenshot({path:D+'v49-320-rel.png'});
 await go(pg,'Pervasions'); await pg.waitForTimeout(100);
 await pg.locator('.qcard .btn.ghost').click(); await pg.waitForTimeout(60); await pg.fill('#dex','a counter-example that is long enough to need cutting off at 320 pixels'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(80);
 const ov2=await pg.evaluate(()=>({sw:document.documentElement.scrollWidth,iw:window.innerWidth,ex:(()=>{const x=document.querySelector('.rcpt .exn');return x&&x.scrollWidth>x.clientWidth})()}));
 ok('320 px Questions with receipt: no horizontal overflow, example cut',ov2.sw<=ov2.iw&&ov2.ex,ov2);
 await pg.screenshot({path:D+'v49-320-q.png'});
 await br.close();

 // ================= wide =================
 ({br,pg,errs}=await open({width:1280,height:800}));
 ok('wide Relations: Blitz switch in the top bar (shared with the Questions tab)',await pg.locator('#mbz').count()===1&&await pg.locator('#mbz').isVisible());
 await pg.locator('#mbz').click(); await pg.waitForTimeout(150);
 ok('wide Relations: Blitz on shows the countdown bar under the top bar',await pg.locator('#mbar .mbt').count()===1&&await pg.evaluate(()=>!!window.__t.ui.tq));
 await pg.screenshot({path:D+'v49-wide-rel.png'});
 await setSecs(pg,2,'Relation time');
 ok('wide: the relation time is 2 s, the examples time untouched',await pg.evaluate(()=>localStorage.getItem('rd-timer-rel'))==='2000'&&await pg.evaluate(()=>localStorage.getItem('rd-timer'))===null);
 const wrel=await pg.evaluate(()=>window.__t.cur.p.relation);
 await pg.waitForTimeout(2500);
 const wl=await pg.evaluate(()=>({late:window.__t.ui.late,rel:window.__t.ui.rel,right:window.__t.cur.p.relation,cap:document.querySelector('.cap')&&document.querySelector('.cap').innerText,tph:window.__t.ui.tph,row:!!document.querySelector('#mbar .mbt')}));
 ok('wide: pick time up sets the right relation, the caption says so, the examples countdown shows',wl.late&&wl.rel===wl.right&&/Time ran out/.test(wl.cap||'')&&wl.tph==='ex'&&wl.row,wl);
 await pg.screenshot({path:D+'v49-wide-late.png'});
 await setSecs(pg,2,'Example time');
 await pg.waitForTimeout(2000*(CELLS.filter(c=>!EMPTY[wrel].includes(c)).length)+400);
 ok('wide: examples time up checks the pair',await pg.evaluate(()=>window.__t.ui.checked&&window.__t.ui.exLate));
 await pg.locator('#stage .pbar .fwd').click(); await pg.waitForTimeout(200);
 // re-picking while the examples clock runs does not restart it
 const wr2=await pg.evaluate(()=>window.__t.cur.p.relation);
 await pg.locator('.strip .chip').nth(ORDER[wr2]).click(); await pg.waitForTimeout(300);
 const t0=await pg.evaluate(()=>window.__t.ui.tq&&window.__t.ui.tq.t0);
 await pg.locator('.strip .chip').nth(ORDER[wr2]===0?1:0).click(); await pg.waitForTimeout(150);
 ok('wide: changing the pick during the examples keeps the same clock',await pg.evaluate(t=>window.__t.ui.tq&&window.__t.ui.tq.t0===t&&window.__t.ui.tph==='ex',t0));
 await pg.screenshot({path:D+'v49-wide-ex.png'});
 await go(pg,'Pervasions'); await pg.waitForTimeout(150);
 ok('wide Questions: same switch state (on), in the top bar',await pg.locator('#mbz').isVisible()&&(await pg.locator('#mbz').getAttribute('aria-checked'))==='true');
 ok('wide Questions: strip on the card, the log of answers above it',await pg.locator('.qcard .prog i').count()===4);
 await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(80);
 ok('wide Questions: after one answer the log shows it and there is no phone receipt',await pg.locator('.qlog li').count()===1&&await pg.locator('.rcpt').count()===0);
 ok('wide: marks done,now',(await pg.evaluate(()=>[...document.querySelectorAll('.qcard .prog i')].map(i=>i.className||'-').join(',')))==='done,now,-,-');
 await pg.screenshot({path:D+'v49-wide-q.png'});
 ok('wide: no page errors',errs.filter(e=>!/fonts|ERR_|proxy/i.test(e)).length===0,errs);
 await br.close();
 console.log(out.join('\n')); process.exit(out.some(l=>l.startsWith('FAIL'))?1:0);
})().catch(e=>{console.log(out.join('\n')); console.log('CRASH',e.message.split('\n').slice(0,6).join('\n')); process.exit(2);});
async function rings0(pg,label){ const r=await pg.evaluate(ringScan); ok(label+': no focus ring is clipped',r.length===0,r); }
