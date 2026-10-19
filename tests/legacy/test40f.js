const {chromium}=require('@playwright/test');
const {go}=require('./harness.js');
const fs=require('fs');
const path=require('path');
let page_=fs.readFileSync(path.resolve(__dirname,'../../dist/artifact/index.html'),'utf8');
const mock=`<script>
const S={answers:{},debates:{},batches:{},favorites:{},skips:{},labruns:{},flags:{}};window.__S=S;window.__ops=[];window.__fail={set:0,del:0};
const subs={answers:[],debates:[],batches:[],favorites:[],skips:[],labruns:[],flags:[]};window.__subs=subs;
function snap(n){const docs=Object.entries(S[n]).map(([id,d])=>({id,exists:true,data:()=>d}));return {docs,size:docs.length,empty:!docs.length};}
const db={collection(n){const q={orderBy(){return q},limit(){return q},onSnapshot(f){subs[n].push(f);setTimeout(()=>f(snap(n)),10);return()=>{}},
 doc(id){return{
  set:async d=>{ window.__ops.push(['set',n,id]); if(n==='favorites'&&window.__fail.set>0){window.__fail.set--;const e=new Error('x');e.code='unavailable';throw e;} S[n][id]=d; },
  delete:async()=>{ window.__ops.push(['delete',n,id]); if(n==='favorites'&&window.__fail.del>0){window.__fail.del--;const e=new Error('x');e.code='unavailable';throw e;} delete S[n][id]; } }}};return q;}};
window.claude={use:async n=>n==='db'?db:null};
</script>`;
const html='<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1"></head><body>'+mock+page_+'</body></html>';
const out=[]; const ok=(n,c,x)=>{out.push((c?'PASS ':'FAIL ')+n+(c?'':'  '+JSON.stringify(x)));};
const errs=[];
(async()=>{
 const br=await chromium.launch();
 const pg=await br.newPage({viewport:{width:1280,height:800},colorScheme:'light'}); pg.setDefaultTimeout(4000);
 await pg.addInitScript(()=>{ window.__riglamTest=t=>{ window.__t=t; }; });
 pg.on('console',m=>{if(m.type()==='error')errs.push(m.text())}); pg.on('pageerror',e=>errs.push('ERR '+e.message));
 await pg.route('http://t/**',r=>r.fulfill({body:html,contentType:'text/html'}));
 await pg.goto('http://t/index.html',{waitUntil:'domcontentloaded'}); await pg.waitForTimeout(700);
 await go(pg,'Relations'); await pg.waitForTimeout(100);
 const fav=pg.locator('#stage .actions .fav'); const openFirst=async sec=>{ const d=sec.locator('.favs > li').nth(0).locator('details'); if(!(await d.evaluate(n=>n.open))) await d.locator('summary').click(); };
 ok('star button on the relations card',await fav.count()===1&&await fav.getAttribute('aria-pressed')==='false');
 ok('label shown on a wide screen, star shown',(await pg.locator('.fav .fl').isVisible())&&/☆/.test(await fav.innerText()));
 ok('button is left of Check',await pg.evaluate(()=>{const f=document.querySelector('#stage .actions .fav').getBoundingClientRect(),c=[...document.querySelectorAll('#stage .actions .btn')].pop().getBoundingClientRect();return f.left<c.left&&f.right<=document.documentElement.clientWidth}));
 const key=await pg.evaluate(()=>window.__t.favKey(window.__t.cur.p));
 await fav.click(); await pg.waitForTimeout(100);
 ok('click marks it',await pg.locator('#stage .actions .fav').getAttribute('aria-pressed')==='true'&&/★/.test(await pg.locator('#stage .actions .fav').innerText()));
 let S=await pg.evaluate(()=>JSON.parse(JSON.stringify(window.__S.favorites)));
 ok('saved under a stable key with the pair',Object.keys(S).length===1&&S[key]&&S[key].a&&S[key].relation&&S[key].pair&&S[key].pair.ex,Object.keys(S));
 ok('key is db-safe',/^[A-Za-z0-9_]+$/.test(key),key);
 await pg.keyboard.press('f'); await pg.waitForTimeout(100);
 ok('F removes it',await pg.locator('#stage .actions .fav').getAttribute('aria-pressed')==='false'&&(await pg.evaluate(()=>Object.keys(window.__S.favorites).length))===0);
 await pg.keyboard.press('F'); await pg.waitForTimeout(100);
 ok('F again adds it',await pg.locator('#stage .actions .fav').getAttribute('aria-pressed')==='true');
 // answer: choose relation, check, star remains
 const rel=await pg.evaluate(()=>window.__t.cur.p.relation);
 const ORDER={mi:1,'3ab':2,'3ba':3,'4':4,con:5}; await pg.locator('.strip .chip').nth(ORDER[rel]-1).click();
 await pg.click('#stage .actions .btn:not(.ghost)'); await pg.waitForTimeout(150);
 ok('star stays after Check and still on',await pg.locator('#stage .actions .fav').count()===1&&await pg.locator('#stage .actions .fav').getAttribute('aria-pressed')==='true');
 ok('answer saved too',(await pg.evaluate(()=>Object.keys(window.__S.answers).length))===1);
 // typing into an input must not trigger the shortcut
 await pg.click('#stage .actions .btn:not(.ghost):last-child'); await pg.waitForTimeout(150);
 const rel2=await pg.evaluate(()=>window.__t.cur.p.relation); await pg.locator('.strip .chip').nth(ORDER[rel2]-1).click();
 const inp=pg.locator('.cell input:not([disabled])').first(); if(await inp.count()){ await inp.fill('f'); ok('typing f in a field does not toggle',(await pg.evaluate(()=>Object.keys(window.__S.favorites).length))===1&&await inp.inputValue()==='f'); }
 ok('next pair is not a favorite',await pg.locator('#stage .actions .fav').getAttribute('aria-pressed')==='false');
 // review
 await go(pg,'Review'); await pg.waitForTimeout(150);
 let sec=pg.locator('.section:has(> .label:has-text("Favorites"))');
 ok('review lists the favorite',await sec.locator('.favs > li').count()===1&&/saved/.test(await sec.locator('.label').innerText()),await sec.innerText());
 await sec.locator('summary').click(); await pg.waitForTimeout(50);
 ok('details show relation, four cells, practice and remove',await sec.locator('.grid .cell').count()===4&&await sec.locator('button:has-text("Practice this pair")').isVisible()&&await sec.locator('button:has-text("Remove")').isVisible()&&/:/.test(await sec.locator('.fbody .note').first().innerText()),await sec.innerText());
 await pg.screenshot({path:'f-review.png',fullPage:false});
 const fa=await pg.evaluate(()=>{const f=Object.values(window.__S.favorites)[0];return [f.a,f.b]});
 // remote snapshot keeps the open state
 await pg.evaluate(()=>{window.__subs.favorites.forEach(f=>f({docs:Object.entries(window.__S.favorites).map(([id,d])=>({id,exists:true,data:()=>d})).concat([{id:'c_zz__yy',exists:true,data:()=>({key:'c_zz__yy',a:'x',b:'y',relation:'mi',pair:{a:'x',b:'y',relation:'mi',ex:{both:'z'},why:{}},at:'2026-10-10T00:00:00Z'})}]),size:2,empty:false}))});
 await pg.waitForTimeout(100);
 ok('a favorite from another device appears; the open one stays open',await sec.locator('.favs > li').count()===2&&await sec.locator('details[open]').count()===1);
 await pg.evaluate(()=>{window.__subs.favorites.forEach(f=>f({docs:Object.entries(window.__S.favorites).map(([id,d])=>({id,exists:true,data:()=>d})),size:1,empty:false}))}); await pg.waitForTimeout(100);
 // practice it
 await sec.locator('button:has-text("Practice this pair")').click(); await pg.waitForTimeout(150);
 ok('practice shows the same pair with a Favorite tag',await pg.evaluate(([a,b])=>window.__t.tab==='practice'&&window.__t.cur.p.a===a&&window.__t.cur.p.b===b,fa)&&/favorite/i.test(await pg.locator('.retry-tag').innerText()),[fa,await pg.evaluate(()=>[window.__t.tab,window.__t.cur.p.a,window.__t.cur.p.b]),await pg.locator('.retry-tag').allInnerTexts()]);
 ok('the practiced pair is marked',await pg.locator('#stage .actions .fav').getAttribute('aria-pressed')==='true');
 // debate tab (a switch keeps the pair, so draw a new one first)
 await pg.evaluate(()=>window.__t.next()); await pg.waitForTimeout(100);
 await go(pg,'Pervasions'); await pg.waitForTimeout(150);
 ok('star also on the questions tab',await pg.locator('#stage .actions .fav').count()===1&&await pg.locator('#stage .actions .fav').getAttribute('aria-pressed')==='false');
 await pg.locator('#stage .actions .fav').click(); await pg.waitForTimeout(100);
 ok('debate pair can be favorited',(await pg.evaluate(()=>Object.keys(window.__S.favorites).length))===2);
 // remove from review
 await go(pg,'Review'); await pg.waitForTimeout(150);
 sec=pg.locator('.section:has(> .label:has-text("Favorites"))');
 await openFirst(sec); await sec.locator('button:has-text("Remove")').first().click(); await pg.waitForTimeout(150);
 ok('remove deletes the document',(await pg.evaluate(()=>Object.keys(window.__S.favorites).length))===1&&await sec.locator('.favs > li').count()===1);
 // failed write is undone with a message
 await pg.evaluate(()=>{window.__fail.del=2}); // delete retried? favWrite does not retry; one fail is enough
 await openFirst(sec); await sec.locator('button:has-text("Remove")').first().click(); await pg.waitForTimeout(250);
 ok('failed delete is restored and explained',await sec.locator('.favs > li').count()===1&&/could not be saved/.test(await sec.innerText()),await sec.innerText());
 // empty state
 await pg.evaluate(()=>{window.__fail.del=0}); await openFirst(sec); await sec.locator('button:has-text("Remove")').first().click(); await pg.waitForTimeout(250);
 ok('empty list explains how to add',/star a pair/.test(await sec.locator('.label').innerText())&&/Press the star/.test(await sec.innerText()),await sec.innerText());
 // a failed save is undone
 await go(pg,'Relations'); await pg.waitForTimeout(100);
 await pg.evaluate(()=>{window.__fail.set=2}); await pg.locator('#stage .actions .fav').click(); await pg.waitForTimeout(2600);
 ok('failed save: star undone with a message',await pg.locator('#stage .actions .fav').getAttribute('aria-pressed')==='false'&&/could not be saved/.test(await pg.locator('#stage').innerText()),await pg.locator('#stage').innerText());
 await pg.screenshot({path:'f-card.png',fullPage:false});
 console.log(out.join('\n')); console.log('ERRS',JSON.stringify(errs));
 await br.close();
})().catch(e=>{console.log(out.join('\n'));console.log('THROWN',e.message.split('\n').slice(0,6).join(' | '));process.exit(1);});
