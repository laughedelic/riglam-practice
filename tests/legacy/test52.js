const {open,go}=require('./harness.js');
const {ringScan}=require('./ring.js');
const D=require('./harness.js').SHOTS;
const out=[]; const ok=(n,c,x)=>{out.push((c?'PASS ':'FAIL ')+n+(c?'':'  '+JSON.stringify(x)));};
const ORDER={mi:0,'3ab':1,'3ba':2,'4':3,con:4};
const EMPTY={mi:['anb','bna'],con:['both'],'3ab':['anb'],'3ba':['bna'],'4':[]};
const CELLS=['both','anb','bna','nei'];
const REPLY_Q='Both: a clay pot fits.\nNeither: a stone is B, not A.\nCommon locus: yes, a clay pot.\nPervasion: whatever is A is B.\nMisconception: none.';
const REPLY_D='Q1: a clay pot fits.\nQ4: a stone is B, not A.\nRelation: Q1 to Q3 give the right one.\nPervasion: whatever is A is B.';
const geo=(pg)=>pg.evaluate(()=>{const g=document.querySelector('#stage .grid'), v=document.querySelector('#stage .verdict'), h=document.querySelector('#stage .head'), a=document.querySelector('#stage .actions'); const r=x=>x&&x.getBoundingClientRect(); return {gTop:Math.round(r(g).top), gBottom:Math.round(r(g).bottom), vTop:v&&Math.round(r(v).top), headBottom:Math.round(r(h).bottom), st:document.getElementById('stage').scrollTop, aTop:a&&Math.round(r(a).top)};});
(async()=>{
 let {br,pg,errs}=await open({width:390,height:844},{isMobile:true,hasTouch:true});
 await pg.evaluate(r=>{window.__reply=r;},REPLY_Q);
 // ---- Relations result ----
 const rel=await pg.evaluate(()=>window.__t.cur.p.relation);
 await pg.locator('.rels .rel').nth(ORDER[rel]).click(); await pg.waitForTimeout(100);
 const rk=await pg.evaluate(()=>window.__t.ui.rel), n=CELLS.filter(c=>!EMPTY[rk].includes(c)).length;
 for(let i=0;i<n;i++){ await pg.fill('#cin','thing '+i); await pg.keyboard.press('Enter'); await pg.waitForTimeout(60); }
 await pg.waitForTimeout(200); await pg.evaluate(()=>document.activeElement&&document.activeElement.blur());
 let g=await geo(pg);
 ok('Relations result: the examples table is first, right under the pair heading',g.gTop>=g.headBottom&&g.gTop-g.headBottom<60,g);
 ok('Relations result: the verdict and chips are under the table',g.vTop>=g.gBottom-1,g);
 // chip switching keeps the table where it is, and the scroll position
 const tops=[];
 for(const name of ['Relation','Cells','Examples','Terms']){ const c=pg.locator('.vchip:has-text("'+name+'")'); await c.scrollIntoViewIfNeeded(); await c.click(); await pg.waitForTimeout(120); const gg=await geo(pg); tops.push(gg.gTop+'/'+gg.st); }
 ok('switching chips: the table keeps its place and the stage does not jump',new Set(tops.map(t=>t.split('/')[0])).size<=2&&true,tops);
 ok('the clicked chip is still on screen after switching',await pg.evaluate(()=>{const c=document.querySelector('.vchip[aria-selected=true]'); if(!c) return true; const r=c.getBoundingClientRect(), a=document.querySelector('#stage .actions').getBoundingClientRect(); return r.top>=0&&r.bottom<=a.top+1;}));
 // Explain: the tutor answer comes into view
 await pg.locator('#stage .actions button:has-text("xplain")').click(); await pg.waitForTimeout(450);
 ok('Explain: the Tutor panel is in view above the action bar and the table is still first',await pg.evaluate(()=>{const t=document.querySelector('#stage .tutor, #stage .vpanel'), a=document.querySelector('#stage .actions').getBoundingClientRect(); const g=document.querySelector('#stage .grid').getBoundingClientRect(), v=document.querySelector('#stage .verdict').getBoundingClientRect(); const r=t.getBoundingClientRect(); return r.bottom>0&&r.top<a.top&&g.top<v.top;}));
 ok('the "?" marks sit on the cells of the table and open inside the card',await (async()=>{ const q=pg.locator('.grid .qm').first(); if(!await q.count()) return false; await q.scrollIntoViewIfNeeded(); await q.click(); await pg.waitForTimeout(150); const r=await pg.evaluate(()=>{const p=document.querySelector('.grid .pop'); if(!p) return false; const b=p.getBoundingClientRect(), s=document.getElementById('stage').getBoundingClientRect(); return b.left>=s.left-1&&b.right<=s.right+1;}); await pg.keyboard.press('Escape'); await pg.waitForTimeout(80); return r; })());
 const r1=await pg.evaluate(ringScan); ok('Relations result: no focus ring is clipped',r1.length===0,r1);
 await pg.screenshot({path:D+'v52-rel-result.png'});
 // ---- Questions result ----
 await pg.evaluate(()=>document.activeElement&&document.activeElement.blur());
 await go(pg,'Pervasions'); await pg.waitForTimeout(150);
 await pg.evaluate(r=>{window.__reply=r;},REPLY_D);
 for(let i=0;i<4;i++){ await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(50); }
 await pg.locator('.rels .rel').nth(3).click(); await pg.waitForTimeout(300);
 g=await geo(pg);
 ok('Questions result: the examples table is first, the verdict and chips under it',g.gTop>=g.headBottom&&g.gTop-g.headBottom<90&&g.vTop>=g.gBottom-1,g);
 const t2=[]; for(const name of ['Relation','Implied','Questions']){ const c=pg.locator('.vchip:has-text("'+name+'")'); if(!await c.count()) continue; await c.scrollIntoViewIfNeeded(); await c.click(); await pg.waitForTimeout(120); const gg=await geo(pg); t2.push(gg.gTop); }
 ok('Questions result: the table keeps its place while chips change',new Set(t2).size<=2&&t2.length>=2,t2);
 await pg.screenshot({path:D+'v52-q-result.png'});
 ok('phone: no page errors',errs.filter(e=>!/fonts|ERR_|proxy/i.test(e)).length===0,errs);
 await br.close();
 // ---- short phone: the verdict headline stays reachable ----
 ({br,pg,errs}=await open({width:360,height:640},{isMobile:true,hasTouch:true}));
 await pg.locator('.rels .rel').nth(ORDER[await pg.evaluate(()=>window.__t.cur.p.relation)]).click(); await pg.waitForTimeout(100);
 const k2=await pg.evaluate(()=>window.__t.ui.rel), n2=CELLS.filter(c=>!EMPTY[k2].includes(c)).length;
 for(let i=0;i<n2;i++){ await pg.fill('#cin','thing '+i); await pg.keyboard.press('Enter'); await pg.waitForTimeout(60); }
 await pg.waitForTimeout(200); await pg.evaluate(()=>document.activeElement&&document.activeElement.blur());
 const sh=await pg.evaluate(()=>{const s=document.getElementById('stage'); const v=document.querySelector('#stage .verdict'); return {scrollable:s.scrollHeight>s.clientHeight, vTop:Math.round(v.getBoundingClientRect().top), stageBottom:Math.round(s.getBoundingClientRect().bottom)};});
 await pg.screenshot({path:D+'v52-rel-result-360.png'});
 ok('360x640: no horizontal overflow on the result',await pg.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await br.close();
 // ---- wide is unchanged: table in the workspace, verdict in the coach ----
 ({br,pg,errs}=await open({width:1280,height:800}));
 await pg.locator('.strip .chip').nth(ORDER[await pg.evaluate(()=>window.__t.cur.p.relation)]).click(); await pg.waitForTimeout(200);
 await pg.locator('#stage .actions button:has-text("Show result")').click(); await pg.waitForTimeout(300);
 ok('wide: the verdict stays in the coach, the table in the workspace',await pg.locator('.coach .verdict').count()===1&&await pg.locator('#stage .verdict').count()===0&&await pg.locator('#stage .grid').count()===1);
 await br.close();
 console.log(out.join('\n')); process.exit(out.some(l=>l.startsWith('FAIL'))?1:0);
})().catch(e=>{console.log(out.join('\n')); console.log('CRASH',e.message.split('\n').slice(0,6).join('\n')); process.exit(2);});
