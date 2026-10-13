const {open,settled}=require('./harness.js');
const {ringScan}=require('./ring.js');
const D=require('./harness.js').SHOTS;
const out=[]; const ok=(n,c,x)=>{out.push((c?'PASS ':'FAIL ')+n+(c?'':'  '+JSON.stringify(x)));};
const ORDER={mi:0,'3ab':1,'3ba':2,'4':3,con:4};
const EMPTY={mi:['anb','bna'],con:['both'],'3ab':['anb'],'3ba':['bna'],'4':[]};
const CELLS=['both','anb','bna','nei'];
const noErr=e=>e.filter(x=>!/fonts|ERR_|proxy/i.test(x));
const key=pg=>pg.evaluate(()=>{const p=window.__t.cur.p; return p.a+' / '+p.b;});
const tabPhone=(pg,name)=>pg.locator('#tabbar [role=tab]:has-text("'+name+'")').click().then(()=>pg.waitForTimeout(150));
const blur=pg=>pg.evaluate(()=>document.activeElement&&document.activeElement.blur());
// phone, Relations: pick the given relation (default the right one), fill every open cell, the last Enter checks
async function relPhone(pg,relKey){
  const rel=relKey||await pg.evaluate(()=>window.__t.cur.p.relation);
  await pg.locator('.rels .rel').nth(ORDER[rel]).click(); await pg.waitForTimeout(80);
  for(let k=0;k<4;k++){ if(await pg.evaluate(()=>window.__t.ui.checked)) break; await pg.fill('#cin','thing '+(k+1)); await pg.keyboard.press('Enter'); await pg.waitForTimeout(80); }
  await blur(pg);
}
// phone, Pervasions: four accepts, then the relation (default the right one)
async function debPhone(pg,relKey){
  for(let i=0;i<4;i++){ await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(70); }
  const rel=relKey||await pg.evaluate(()=>window.__t.cur.p.relation);
  await pg.locator('.rels .rel').nth(ORDER[rel]).click(); await pg.waitForTimeout(250);
}
const other=r=>r==='mi'?'con':'mi';
(async()=>{
 // ================= phone =================
 {
  const {br,pg,errs}=await open({width:390,height:844},{isMobile:true,hasTouch:true});
  const names=await pg.locator('#tabbar [role=tab]').allInnerTexts();
  ok('the tab bar reads Relations, Pervasions, Review',JSON.stringify(names.map(s=>s.trim().toLowerCase()))==='["relations","pervasions","review"]',names);
  ok('"Pervasions" fits its tab at 390 px',await pg.evaluate(()=>[...document.querySelectorAll('#tabbar [role=tab]')].every(b=>b.scrollWidth<=b.clientWidth+1)));

  // ---- one pair across the two modes
  const p1=await key(pg);
  await tabPhone(pg,'Pervasions');
  ok('switching Relations to Pervasions keeps the pair, which starts at question 1',await key(pg)===p1&&await pg.evaluate(()=>window.__t.tab==='debate'&&window.__t.ui.step===0&&window.__t.ui.debate),[p1,await key(pg)]);
  await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(70);
  await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(70);
  ok('two questions answered in Pervasions',await pg.evaluate(()=>window.__t.ui.step)===2);
  await tabPhone(pg,'Relations');
  ok('back in Relations: the same pair, no relation picked yet (independent progress)',await key(pg)===p1&&await pg.evaluate(()=>!window.__t.ui.rel&&!window.__t.ui.debate),await key(pg));
  const r1=await pg.evaluate(()=>window.__t.cur.p.relation);
  await pg.locator('.rels .rel').nth(ORDER[r1]).click(); await pg.waitForTimeout(100);
  await blur(pg);
  await tabPhone(pg,'Pervasions');
  ok('Pervasions still has its own two answers on that pair',await key(pg)===p1&&await pg.evaluate(()=>window.__t.ui.step)===2);
  await tabPhone(pg,'Relations');
  ok('Relations still has its picked relation',await key(pg)===p1&&await pg.evaluate(r=>window.__t.ui.rel===r,r1));
  // finish the pair in Relations
  for(let k=0;k<4;k++){ if(await pg.evaluate(()=>window.__t.ui.checked)) break; await pg.fill('#cin','thing '+(k+1)); await pg.keyboard.press('Enter'); await pg.waitForTimeout(80); }
  await blur(pg);
  ok('the pair is finished in Relations',await pg.evaluate(()=>window.__t.ui.checked));
  await tabPhone(pg,'Pervasions');
  ok('Pervasions still holds that pair with its two answers (it has not been finished there)',await key(pg)===p1&&await pg.evaluate(()=>window.__t.ui.step)===2&&!(await pg.evaluate(()=>window.__t.ui.checked)));
  // Next pair in Pervasions is only possible after finishing; finish it there
  await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(70);
  await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(70);
  const rd=await pg.evaluate(()=>window.__t.cur.p.relation);
  await pg.locator('.rels .rel').nth(ORDER[rd]).click(); await pg.waitForTimeout(250);
  ok('the pair is finished in Pervasions too',await pg.evaluate(()=>window.__t.ui.checked));
  await pg.locator('#stage .actions .btn',{hasText:/next pair/i}).click(); await pg.waitForTimeout(200);
  const p2=await key(pg);
  ok('Next pair in Pervasions draws a new pair',p2!==p1);
  await tabPhone(pg,'Relations');
  ok('Relations takes that new pair (its old one is finished), fresh',await key(pg)===p2&&await pg.evaluate(()=>!window.__t.ui.rel&&!window.__t.ui.checked),[p2,await key(pg)]);
  // a pair finished in one mode gives the other a new pair
  await relPhone(pg);
  ok('p2 finished in Relations',await pg.evaluate(()=>window.__t.ui.checked));
  await tabPhone(pg,'Pervasions');
  const p3=await key(pg);
  ok('the other mode shows the same unfinished pair? No: Pervasions held p2 fresh, so it restores p2',p3===p2,[p2,p3]);
  // skipping in one mode: the other follows
  await pg.locator('#mskip').click(); await pg.waitForTimeout(150);
  const p4=await key(pg);
  ok('skipping in Pervasions draws a new pair',p4!==p2);
  await tabPhone(pg,'Relations');
  ok('Relations opens the pair drawn after the skip',await key(pg)===p4,[p4,await key(pg)]);
  ok('no page errors (pairs)',noErr(errs).length===0,errs);
  await br.close();
 }

 // ================= phone: the Why panel and the follow-up chat =================
 {
  const {br,pg,errs}=await open({width:390,height:844},{isMobile:true,hasTouch:true});
  const REPLY='Both: a clay pot fits.\nNeither: a stone is B, not A.\nCommon locus: yes, a clay pot.\nPervasion: whatever is A is B.\nExplanation: look at what both terms cover first.\nMisconception: you took A for B.';
  await pg.evaluate(r=>{window.__reply=r;},REPLY);
  const rel=await pg.evaluate(()=>window.__t.cur.p.relation);
  await relPhone(pg,other(rel));
  ok('a wrong relation: the result is not fully right',await pg.evaluate(()=>window.__t.ui.checked&&window.__t.ui.res.overall!=='ok'),await pg.evaluate(()=>window.__t.ui.res&&window.__t.ui.res.overall));
  await pg.locator('#stage .actions button:has-text("xplain")').first().click(); await pg.waitForTimeout(400);
  const sel=await pg.locator('.vchip[aria-selected=true]').innerText();
  ok('the chip is called Why and is open after Explain',/^why$/i.test(sel.trim()),sel);
  const txt=await pg.locator('.vpanel').innerText();
  ok('wrong answer: the Why panel holds the explanation and the misconception, nothing the ? marks show',/Explanation/.test(txt)&&/Misconception/.test(txt)&&!/Common locus|Pervasion|\bBoth:|\bNeither:/.test(txt),txt);
  await pg.locator('.rq').click(); await pg.waitForTimeout(120);
  const rt=await pg.locator('.rpop').innerText();
  ok('the ? beside the relation holds common locus and pervasion, not the explanation or misconception',/Common locus/.test(rt)&&/Pervasion/.test(rt)&&!/Explanation|Misconception/.test(rt),rt);
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(80);
  const btns=await pg.locator('#stage > .actions .btn').allInnerTexts();
  ok('the follow-up button reads "Discuss with AI"',btns.some(t=>/^discuss with ai$/i.test(t.trim())),btns);
  await pg.locator('#stage > .actions .stage-chat').click(); await pg.waitForTimeout(200);
  ok('the chat view is headed "Discuss with AI" and labelled so',/^discuss with ai$/i.test((await pg.locator('#over h2').innerText()).trim())&&await pg.locator('#over').getAttribute('aria-label')==='Discuss with AI');
  const chat=await pg.locator('#chatscroll').innerText();
  ok('the chat view still holds the whole answer',/Both:/.test(chat)&&/Pervasion/.test(chat)&&/Misconception/.test(chat),chat);
  await pg.fill('#ask-in','and why?'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(350);
  const ex=await pg.evaluate(()=>[...document.querySelectorAll('#over .tutor > .xch')].map(x=>[...x.children].map(n=>n.className.split(' ')[0])));
  ok('chat (narrow): newest exchange first, answer above its question: [answer, question], then the first answer alone',JSON.stringify(ex)==='[["ans","q"],["ans"]]',ex);
  const gap=await pg.evaluate(()=>{const x=document.querySelectorAll('#over .tutor > .xch'); const s=getComputedStyle(x[1]); return {line:s.borderTopWidth,pad:s.paddingTop};});
  ok('a hairline and space separate the exchanges',gap.line!=='0px'&&parseFloat(gap.pad)>=8,gap);
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(150);

  // a right answer: the Why panel shows only the pointer
  await pg.locator('#stage .actions .btn',{hasText:/next pair/i}).click(); await pg.waitForTimeout(200);
  await pg.evaluate(r=>{window.__reply=r;},REPLY);
  await relPhone(pg);
  // force a fully right result so the rule is tested whatever the examples were
  await pg.evaluate(()=>{ const u=window.__t.ui; u.res.overall='ok'; window.__t.render(); });
  await pg.locator('#stage .actions button:has-text("xplain")').first().click(); await pg.waitForTimeout(400);
  const t2=await pg.locator('.vpanel').innerText();
  ok('a right answer: the Why panel shows only a pointer to the ? marks',/\? marks/.test(t2)&&!/Explanation|Misconception|Common locus|Pervasion/.test(t2),t2);
  ok('no page errors (why)',noErr(errs).length===0,errs);
  await br.close();
 }

 // ================= phone: Blitz, two times =================
 {
  const {br,pg,errs}=await open({width:390,height:844},{isMobile:true,hasTouch:true});
  // Options: two rows, each sets only its own
  await pg.click('#mopt'); await pg.waitForTimeout(100);
  const rows=await pg.locator('#over .orow .tl').allInnerTexts();
  ok('Options has a Relation time row and an Example time row, and no single "Blitz time"',rows.some(t=>/^relation time$/i.test(t.trim()))&&rows.some(t=>/^example time$/i.test(t.trim()))&&!rows.some(t=>/^blitz time$/i.test(t.trim())),rows);
  await pg.locator('.orow:has-text("Relation time") .seg').getByRole('button',{name:'30 s',exact:true}).click(); await pg.waitForTimeout(80);
  await pg.locator('.orow:has-text("Example time") .seg').getByRole('button',{name:'5 s',exact:true}).click(); await pg.waitForTimeout(80);
  const st=await pg.evaluate(()=>[localStorage.getItem('rd-timer-rel'),localStorage.getItem('rd-timer'),[...document.querySelectorAll('.orow')].map(o=>o.querySelector('.tl').innerText+':'+[...o.querySelectorAll('.seg button[aria-pressed=true]')].map(b=>b.innerText).join(','))]);
  ok('Relation time 30 s and Example time 5 s are separate and both kept',st[0]==='30000'&&st[1]==='5000'&&st[2].map(s=>s.toLowerCase()).includes('relation time:30 s')&&st[2].map(s=>s.toLowerCase()).includes('example time:5 s'),st);
  await pg.locator('.orow:has-text("Example time") .seg').getByRole('button',{name:'15 s',exact:true}).click(); await pg.waitForTimeout(80);
  ok('changing the example time leaves the relation time at 30 s',await pg.evaluate(()=>localStorage.getItem('rd-timer-rel'))==='30000'&&await pg.evaluate(()=>localStorage.getItem('rd-timer'))==='15000');
  await pg.fill('.orow:has-text("Relation time") .tcustom','3'); await pg.keyboard.press('Tab'); await pg.waitForTimeout(100);
  ok('a custom relation time is stored for the relation only',await pg.evaluate(()=>localStorage.getItem('rd-timer-rel'))==='3000'&&await pg.evaluate(()=>localStorage.getItem('rd-timer'))==='15000');
  await pg.click('#over .oc'); await pg.waitForTimeout(80);

  // Blitz on in Relations: the pick uses the relation time, the examples the example time
  await pg.click('#mbz'); await pg.waitForTimeout(150);
  ok('Relations, the pick: the row reads the relation time (3 s) and the bolt name has it',(await pg.locator('.lrow .tval').innerText()).trim()==='3 s'&&/^Blitz on: 3 s relation, \d+ s example$/.test(await pg.locator('#mbz').getAttribute('aria-label')));
  const rel=await pg.evaluate(()=>window.__t.cur.p.relation);
  await pg.locator('.rels .rel').nth(ORDER[rel]).click(); await pg.waitForTimeout(150);
  const n=CELLS.filter(c=>!EMPTY[rel].includes(c)).length;
  ok('then the examples: n × 15 s, the bolt name has 15 s',(await pg.locator('.cview .trow .tval').innerText()).replace(/\s+/g,' ').trim()===(n>1?n+' × ':'')+'15 s'&&/^Blitz on: 3 s relation, 15 s example$/.test(await pg.locator('#mbz').getAttribute('aria-label')));
  await pg.click('#mbz'); await pg.waitForTimeout(100);

  // Pervasions: relation timer after the four questions
  await tabPhone(pg,'Pervasions');
  await pg.click('#mbz'); await pg.waitForTimeout(100);
  ok('Pervasions question: the row reads the example time (15 s)',(await pg.locator('.qcard .trow .tval').innerText()).trim()==='15 s');
  for(let i=0;i<4;i++){ await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(70); }
  ok('the relation step has a countdown with the relation time (3 s)',(await pg.locator('.lrow .trow .tval').innerText()).trim()==='3 s'&&await pg.evaluate(()=>!!window.__t.ui.tq&&window.__t.ui.tph==='rel'));
  ok('the bolt name has the 3 s relation time there',/3 s relation/.test(await pg.locator('#mbz').getAttribute('aria-label')));
  await pg.waitForTimeout(3300);
  const late=await pg.evaluate(()=>({checked:window.__t.ui.checked,late:window.__t.ui.late,relOk:window.__t.ui.res&&window.__t.ui.res.relOk,rel:window.__t.ui.rel,right:window.__t.cur.p.relation,doc:Object.values(window.__S.debates)[0]}));
  ok('time up on the relation: checked, marked late, graded wrong, the right relation shown',late.checked&&late.late&&late.relOk===false&&late.rel===late.right,late);
  ok('the saved debate has chosen null and timeout "relation"',late.doc&&late.doc.chosen===null&&late.doc.timeout==='relation'&&late.doc.correct===false,late.doc&&{chosen:late.doc.chosen,timeout:late.doc.timeout,correct:late.doc.correct});
  if(await pg.locator('.vchip:has-text("Relation")').first().getAttribute('aria-selected')!=='true'){ await pg.locator('.vchip:has-text("Relation")').first().click(); await pg.waitForTimeout(80); }
  const chipTxt=await pg.locator('.vpanel').innerText();
  ok('the Relation chip says time ran out',/time ran out/i.test(chipTxt),chipTxt);
  await pg.screenshot({path:D+'v58-late-debate.png'});
  ok('no page errors (blitz)',noErr(errs).length===0,errs);
  await br.close();
 }

 // ================= phone: the Blitz switch never moves the layout =================
 {
  const {br,pg,errs}=await open({width:390,height:844},{isMobile:true,hasTouch:true});
  const geo=sel=>pg.evaluate(s=>{const out={}; for(const k of s){ const n=document.querySelector(k); out[k]=n?Math.round(n.getBoundingClientRect().top)+'/'+Math.round(n.getBoundingClientRect().height):null; } return out;},sel);
  // relation list
  const g0=await geo(['.rels','.head']);
  await pg.click('#mbz'); await pg.waitForTimeout(150);
  const g1=await geo(['.rels','.head']);
  ok('relation list: the list does not move when Blitz goes on',JSON.stringify(g0)===JSON.stringify(g1),[g0,g1]);
  await pg.click('#mbz'); await pg.waitForTimeout(100);
  // cell view
  const rel=await pg.evaluate(()=>window.__t.cur.p.relation);
  await pg.locator('.rels .rel').nth(ORDER[rel]).click(); await pg.waitForTimeout(150);
  await blur(pg);
  const c0=await geo(['.cview .cin','.cview .chint']);
  ok('cell view: the countdown row is under the field (below the input row, above the hint)',await pg.evaluate(()=>{const i=document.querySelector('.cview .cin').getBoundingClientRect(), t=document.querySelector('.cview .trow').getBoundingClientRect(), h=document.querySelector('.cview .chint').getBoundingClientRect(); return t.top>=i.bottom-1&&t.bottom<=h.top+1;}));
  await pg.click('#mbz'); await pg.waitForTimeout(150);
  const c1=await geo(['.cview .cin','.cview .chint']);
  ok('cell view: field and hint do not move when Blitz goes on',JSON.stringify(c0)===JSON.stringify(c1),[c0,c1]);
  await pg.click('#mbz'); await pg.waitForTimeout(100);
  // Pervasions card
  await blur(pg); await tabPhone(pg,'Pervasions');
  const q0=await geo(['.qcard','.qcard .ansrow','.qcard .qt']);
  ok('Pervasions card: the countdown row is under the Accept / Why? buttons',await pg.evaluate(()=>{const a=document.querySelector('.qcard .ansrow').getBoundingClientRect(), t=document.querySelector('.qcard .trow').getBoundingClientRect(); return t.top>=a.bottom-1;}));
  await pg.click('#mbz'); await pg.waitForTimeout(150);
  const q1=await geo(['.qcard','.qcard .ansrow','.qcard .qt']);
  ok('Pervasions card: it keeps its size and the buttons stay put when Blitz goes on',JSON.stringify(q0)===JSON.stringify(q1),[q0,q1]);
  await pg.locator('.qcard .btn.ghost').click(); await pg.waitForTimeout(100);
  const w0=await geo(['.qcard','#dex']);
  await pg.click('#mbz'); await pg.waitForTimeout(150);
  const w1=await geo(['.qcard','#dex']);
  ok('Pervasions example field: nothing moves when Blitz goes off while typing an example',JSON.stringify(w0)===JSON.stringify(w1),[w0,w1]);
  await pg.click('#mbz'); await pg.waitForTimeout(100);
  // relation step of Pervasions
  await pg.fill('#dex','a clay pot'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(80);
  for(let i=0;i<3;i++){ await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(70); }
  await blur(pg);
  const l0=await geo(['.rels']);
  await pg.click('#mbz'); await pg.waitForTimeout(150);
  const l1=await geo(['.rels']);
  ok('Pervasions relation step: the list does not move when Blitz goes on or off',JSON.stringify(l0)===JSON.stringify(l1),[l0,l1]);
  ok('no page errors (layout)',noErr(errs).length===0,errs);
  await br.close();
 }

 // ================= phone: answers on the relation step =================
 for(const vp of [{width:390,height:844},{width:600,height:900}]){
  const {br,pg,errs}=await open(vp,{isMobile:true,hasTouch:true});
  await tabPhone(pg,'Pervasions');
  await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(70);
  await pg.locator('.qcard .btn.ghost').click(); await pg.waitForTimeout(70);
  await pg.fill('#dex','a clay pot'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(70);
  await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(70);
  await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(100);
  const w=vp.width;
  const tags=await pg.locator('.rcpt .ri').count();
  const labels=await pg.locator('#stage .label').allInnerTexts();
  ok(w+' px: the relation step shows the four answers as tags, and no heading that repeats the question',tags===4&&!labels.some(t=>/which relation/i.test(t)),[tags,labels]);
  ok(w+' px: the tags sit in the same place as while asking (right under the pair heading, before the table and the list)',await pg.evaluate(()=>{const h=document.querySelector('.head').getBoundingClientRect(), r=document.querySelector('.rcpt').getBoundingClientRect(), l=document.querySelector('.rels').getBoundingClientRect(); return r.top>=h.bottom-1&&r.top-h.bottom<40&&r.bottom<=l.top;}));
  await pg.locator('.rcpt .ri').nth(1).click(); await pg.waitForTimeout(100);
  const det=await pg.evaluate(()=>{const d=document.querySelector('.rcpt .rdet'); return d?{t:d.innerText.replace(/\s+/g,' '),open:document.querySelectorAll('.rcpt .ri[aria-expanded=true]').length}:null;});
  ok(w+' px: a tag opens the statement and the answer with the example',det&&det.open===1&&/If it is/i.test(det.t)&&/clay pot/.test(det.t),det);
  await pg.screenshot({path:D+'v58-rel-step-'+w+'.png'});
  ok(w+' px: no horizontal overflow and the list stays below the details',await pg.evaluate(()=>{const d=document.querySelector('.rcpt').getBoundingClientRect(), l=document.querySelector('.rels').getBoundingClientRect(); return document.documentElement.scrollWidth<=innerWidth&&l.top>=d.bottom-1;}));
  await pg.locator('.rcpt .ri').nth(1).click(); await pg.waitForTimeout(100);
  ok(w+' px: tapping the open tag closes the details',await pg.locator('.rcpt .rdet').count()===0);
  // a tag also works while asking
  await pg.locator('.rels .rel').nth(0).click(); await pg.waitForTimeout(200);
  const r=await pg.evaluate(ringScan); ok(w+' px: no focus ring is clipped',r.length===0,r);
  ok(w+' px: no page errors',noErr(errs).length===0,errs);
  await br.close();
 }

 // ================= phone: the scroll stays when a row opens =================
 {
  const {br,pg,errs}=await open({width:390,height:620},{isMobile:true,hasTouch:true});
  await tabPhone(pg,'Pervasions');
  await pg.locator('.qcard .btn.ghost').click(); await pg.waitForTimeout(70);
  await pg.fill('#dex','a clay pot'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(70);
  for(let i=0;i<3;i++){ await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(70); }
  await pg.locator('.rels .rel').nth(ORDER[await pg.evaluate(()=>window.__t.cur.p.relation)]).click(); await pg.waitForTimeout(250);
  await blur(pg);
  const qchip=pg.locator('.vchip:has-text("Questions")');
  if(await qchip.getAttribute('aria-selected')!=='true') await qchip.click();
  await pg.waitForTimeout(100);
  // The first wrong question is open to begin with, and which one it is depends on the pair. Tapping an open row closes it, which makes the page
  // shorter, and the browser then moves the scroll up to the new end of the page. So start with every row closed: opening a row only makes the
  // page longer, and the scroll must not move at all.
  const openRow=()=>pg.evaluate(()=>[...document.querySelectorAll('.qs')].findIndex(b=>b.getAttribute('aria-expanded')==='true'));
  const rows=pg.locator('.qs');
  const o0=await openRow(); if(o0>=0){ await rows.nth(o0).click(); await pg.waitForTimeout(100); }
  ok('the rows are all closed to begin with',await openRow()===-1);
  // scroll so that the rows are in view and the page is scrolled down a good way
  const sc=await pg.evaluate(()=>{const s=document.getElementById('stage'), r=document.querySelector('.qs').getBoundingClientRect(), sr=s.getBoundingClientRect(); s.scrollTop=Math.max(0,s.scrollTop+(r.top-sr.top)-120); return {top:Math.round(s.scrollTop),max:s.scrollHeight-s.clientHeight};});
  ok('the result is longer than the screen and scrolled down (rows in view)',sc.max>40&&sc.top>40,sc);
  const scroll=()=>settled(pg,()=>{const s=document.getElementById('stage'); return {top:Math.round(s.scrollTop),max:Math.round(s.scrollHeight-s.clientHeight)};});
  const before=await scroll();
  // dispatchEvent, not click(): click() first scrolls the row into view, which would move the very scroll position this check reads
  await rows.nth(1).dispatchEvent('click');
  const after=await scroll();
  ok('opening a question row keeps the scroll where it was',after.top===before.top,[before,after]);
  // opening another row closes the first, and the page may get shorter; the scroll stays unless it is past the new end of the page
  await rows.nth(2).dispatchEvent('click');
  const after2=await scroll();
  ok('opening another row does not jump either',Math.abs(after2.top-Math.min(before.top,after2.max))<=2,[before,after2]);
  // a new pair starts at the top
  await pg.evaluate(()=>{document.getElementById('stage').scrollTop=0;});
  await pg.locator('#stage .actions .btn',{hasText:/next pair/i}).click(); await pg.waitForTimeout(200);
  ok('a new pair starts at the top',await pg.evaluate(()=>document.getElementById('stage').scrollTop)===0);
  ok('no page errors (scroll)',noErr(errs).length===0,errs);
  await br.close();
 }

 // ================= wide =================
 {
  const {br,pg,errs}=await open({width:1280,height:800});
  const rail=(await pg.locator('.rail .nv').allInnerTexts()).slice(0,3);
  ok('the rail reads Relations, Pervasions, Review',JSON.stringify(rail.map(s=>s.trim().toLowerCase()))==='["relations","pervasions","review"]',rail);
  ok('the coach panel has no "Coach" label; it starts with Recent or the key hints',!/^coach$/i.test(((await pg.locator('#coach').innerText())||'').trim().split('\n')[0]||'')&&!/\bcoach\b/i.test(await pg.locator('#coach').innerText()),await pg.locator('#coach').innerText());
  const p1=await key(pg);
  await pg.locator('.rail .nv:has-text("Pervasions")').click(); await pg.waitForTimeout(150);
  ok('wide: Pervasions opens the same pair',await key(pg)===p1);
  ok('wide Pervasions: the coach has no "Coach" label either',!/\bcoach\b/i.test(await pg.locator('#coach').innerText()),await pg.locator('#coach').innerText());
  // geometry: Blitz does not move the strip, the caption, the cells
  await pg.locator('.rail .nv:has-text("Relations")').click(); await pg.waitForTimeout(150);
  const geo=sel=>pg.evaluate(s=>{const out={}; for(const k of s){ const n=document.querySelector(k); out[k]=n?Math.round(n.getBoundingClientRect().top)+'/'+Math.round(n.getBoundingClientRect().height):null; } return out;},sel);
  const a0=await geo(['.strip','.cap','.grid']);
  await pg.locator('#stage .actions .bz').click(); await pg.waitForTimeout(150);
  const a1=await geo(['.strip','.cap','.grid']);
  ok('wide Relations: the strip, the caption and the table do not move when Blitz goes on',JSON.stringify(a0)===JSON.stringify(a1),[a0,a1]);
  await pg.locator('#stage .actions .bz').click(); await pg.waitForTimeout(100);
  // wide Pervasions relation timer
  await pg.locator('.rail .nv:has-text("Pervasions")').click(); await pg.waitForTimeout(150);
  await pg.evaluate(()=>{localStorage.setItem('rd-timer-rel','2000');});
  await pg.reload({waitUntil:'domcontentloaded'}).catch(()=>{});
  await pg.waitForTimeout(900);
  ok('no page errors (wide)',noErr(errs).length===0,errs);
  await br.close();
 }
 console.log(out.join('\n')); process.exit(out.some(l=>l.startsWith('FAIL'))?1:0);
})().catch(e=>{console.log(out.join('\n')); console.log('CRASH',e.message.split('\n').slice(0,8).join('\n')); process.exit(2);});
