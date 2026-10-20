const {open,go}=require('./harness.js');
const D=require('./harness.js').SHOTS;
const out=[]; const ok=(n,c,x)=>{out.push((c?'PASS ':'FAIL ')+n+(c?'':'  '+JSON.stringify(x)));};
const ORDER={mi:0,'3ab':1,'3ba':2,'4':3,con:4};
const noErr=e=>e.filter(x=>!/fonts|ERR_|proxy/i.test(x));
const S=(pg,n)=>pg.evaluate(n=>window.__S[n],n);
const other=r=>r==='mi'?'con':'mi';
const blur=pg=>pg.evaluate(()=>document.activeElement&&document.activeElement.blur());
const REPLY='Both: a clay pot fits.\nNeither: a stone is B, not A.\nCommon locus: yes, a clay pot.\nPervasion: whatever is A is B.\nExplanation: look at what both terms cover first.\nMisconception: you took A for B.';
async function relPhone(pg,relKey){
  const rel=relKey||await pg.evaluate(()=>window.__t.cur.p.relation);
  await pg.locator('.rels .rel').nth(ORDER[rel]).click(); await pg.waitForTimeout(80);
  for(let k=0;k<4;k++){ if(await pg.evaluate(()=>window.__t.ui.checked)) break; await pg.fill('#cin','thing '+(k+1)); await pg.keyboard.press('Enter'); await pg.waitForTimeout(80); }
  await blur(pg);
}
const pervTab=async pg=>{ await go(pg,'Pervasions'); await pg.waitForTimeout(150); };
const subTxt=pg=>pg.evaluate(()=>{const r=document.querySelector('.head .subrow'); return r?r.innerText.replace(/\s+/g,' ').trim():null;});
(async()=>{
 // the question card: at 320 the lead text is shown with an ellipsis, nothing overflows
 {
  const {br,pg}=await open({width:320,height:640},{isMobile:true,hasTouch:true});
  await pervTab(pg);
  const g=await pg.evaluate(()=>{const q=document.querySelector('.qcard .qn'), l=q.querySelector('.lead'); const b=q.getBoundingClientRect(), c=q.closest('.qcard').getBoundingClientRect(); return {h:Math.round(b.height),lead:!!l&&getComputedStyle(l).display!=='none',leadW:l?Math.round(l.getBoundingClientRect().width):0,over:q.scrollWidth>q.clientWidth+1,sw:document.documentElement.scrollWidth};});
  ok('320 px: the "Question n" line stays on one line and shows its lead text, cut with an ellipsis if needed',g.h<=22&&g.lead&&g.leadW>30&&!g.over&&g.sw<=320,g);
  await pg.screenshot({path:D+'s61-q1-320.png'});
  await pg.click('#mbz'); await pg.waitForTimeout(150);
  const bo=await pg.evaluate(()=>{const s=document.getElementById('stage'); return {sw:s.scrollWidth,cw:s.clientWidth,page:document.documentElement.scrollWidth-innerWidth};});
  ok('320 px, Blitz on: the question card does not make the stage scroll sideways',bo.sw<=bo.cw&&bo.page<=0,bo);
  await br.close();
 }
 // the field of "Why?" stays above the keyboard on a short screen (card 24 px lower than before)
 {
  const {br,pg}=await open({width:390,height:520},{isMobile:true,hasTouch:true});
  await pervTab(pg);
  await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(100);
  await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(100);
  await pg.locator('.qcard .btn.ghost').click(); await pg.waitForTimeout(120);
  const g=await pg.evaluate(()=>{const i=document.getElementById('dex').getBoundingClientRect(), n=document.querySelector('.qcard .btn:not(.ghost)')&&document.querySelector('.qcard .ansrow .btn'); const b=n&&n.getBoundingClientRect(), pb=document.querySelector('#stage .pbar'); return {inBottom:Math.round(i.bottom),btnBottom:b&&Math.round(b.bottom),pbTop:pb&&Math.round(pb.getBoundingClientRect().top),h:innerHeight};});
  ok('390x520 (keyboard open): the Why field and its Next button are in view on question 3, above the pair bar',g.inBottom<=g.h-6&&(!g.btnBottom||g.btnBottom<=g.h-6)&&(!g.pbTop||g.btnBottom<=g.pbTop),g);
  await br.close();
 }
 // ============ the flag form ============
 {
  const {br,pg,errs}=await open({width:390,height:844},{isMobile:true,hasTouch:true});
  await pg.evaluate(r=>{window.__reply=r;},REPLY);
  const rel=await pg.evaluate(()=>window.__t.cur.p.relation);
  await relPhone(pg,other(rel));
  await pg.locator('#stage .xpl').click(); await pg.waitForTimeout(400);
  await pg.locator('.vpanel .ans .aiflag').click(); await pg.waitForTimeout(120);
  let g=await pg.evaluate(()=>{const h=document.querySelector('.flagedit .fh'); return {t:h.innerText.replace(/\s+/g,' ').trim(),h:Math.round(h.getBoundingClientRect().height),btns:[...document.querySelectorAll('.flagedit .fa button')].map(b=>b.innerText.trim())};});
  ok('the editor header only names what is flagged: "Flag: Claude’s explanation", no copy of the text',g.t==='Flag: Claude’s explanation'&&g.h<=22&&!/look at|clay pot|=/.test(g.t),g);
  ok('the buttons are Submit and Cancel',g.btns.join('|').toLowerCase()==='submit|cancel',g.btns);
  await pg.screenshot({path:D+'s61-flag.png'});
  await pg.locator('#flag-note').fill('good, but too long'); await pg.locator('.flagedit .btn',{hasText:/^submit$/i}).click(); await pg.waitForTimeout(120);
  const fd=Object.values(await S(pg,'flags')), e=fd.find(f=>f.part==='explain'&&!f.n);
  ok('Submit stores the flag, with the shown text still kept in the document',!!e&&/look at/.test(e.shown)&&e.note==='good, but too long',fd);
  await pg.locator('.vpanel .ans .aiflag').click(); await pg.waitForTimeout(100);
  g=await pg.evaluate(()=>({t:document.querySelector('.flagedit .fh').innerText.replace(/\s+/g,' ').trim(),btns:[...document.querySelectorAll('.flagedit .fa button')].map(b=>b.innerText.trim())}));
  ok('reopening a flagged part: "Flagged: Claude’s explanation", Submit, Cancel, Remove flag',g.t==='Flagged: Claude’s explanation'&&g.btns.join('|').toLowerCase()==='submit|cancel|remove flag',g);
  ok('no page errors (flag form)',noErr(errs).length===0,errs);
  await br.close();
 }
 // ============ the chat view: the answer above its question ============
 {
  const {br,pg,errs}=await open({width:390,height:844},{isMobile:true,hasTouch:true});
  await pg.evaluate(r=>{window.__reply=r;},REPLY);
  const rel=await pg.evaluate(()=>window.__t.cur.p.relation);
  await relPhone(pg,other(rel));
  await pg.locator('#stage .xpl').click(); await pg.waitForTimeout(400);
  await pg.locator('#mchat').click(); await pg.waitForTimeout(200);
  await pg.evaluate(()=>{window.__delay=900;});
  await pg.fill('#ask-in','I thought a cat is made of matter'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(250);
  const th=await pg.evaluate(()=>{const o=document.getElementById('over'), live=document.getElementById('ans-live'); const x=live&&live.closest('.xch'); const q=x&&x.querySelector('.q'); const sc=document.getElementById('chatscroll'); const kids=x?[...x.children].map(c=>c.classList.contains('q')?'q':c.classList.contains('ans')?'ans':'?'):[]; return {has:!!live,txt:live&&live.innerText.trim(),kids,liveTop:live&&Math.round(live.getBoundingClientRect().top),qTop:q&&Math.round(q.getBoundingClientRect().top),scTop:sc&&Math.round(sc.getBoundingClientRect().top),st:sc&&sc.scrollTop,first:x&&x===document.querySelector('#over .xch')};});
  ok('right after sending, "Thinking…" is the first thing under the field, above the question just sent',th.has&&/^Thinking/.test(th.txt)&&th.kids.join('|')==='ans|q'&&th.liveTop<th.qTop&&th.first&&th.st===0,th);
  await pg.screenshot({path:D+'s61-chat-thinking.png'});
  await pg.waitForTimeout(1000);
  const ex=await pg.evaluate(()=>[...document.querySelectorAll('#over .xch')].map(x=>[...x.children].map(c=>c.classList.contains('q')?'q':c.classList.contains('ans')?'ans':'?').join('+')));
  ok('after the answer arrives: the newest exchange is still [answer, question], older ones follow',ex[0]==='ans+q'&&ex.length===2&&ex[1]==='ans',ex);
  await pg.fill('#ask-in','and a stone?'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(1200);
  const ex2=await pg.evaluate(()=>[...document.querySelectorAll('#over .xch')].map(x=>[...x.children].map(c=>c.classList.contains('q')?'q:'+c.innerText.slice(0,14):'ans').join(' / ')));
  ok('a second question: it is on top as [answer, question]; the first exchange is below it, in the same form',ex2.length===3&&/^ans \/ q:and a stone/.test(ex2[0])&&/^ans \/ q:I thought a/.test(ex2[1]),ex2);
  await pg.screenshot({path:D+'s61-chat.png'});
  ok('no page errors (narrow chat)',noErr(errs).length===0,errs);
  await br.close();
 }
 // wide: the chat in the coach keeps the question above its answer
 {
  const {br,pg,errs}=await open({width:1280,height:800});
  await pg.evaluate(r=>{window.__reply=r;},REPLY);
  const rel=await pg.evaluate(()=>window.__t.cur.p.relation);
  await pg.locator('.strip .chip').nth(ORDER[other(rel)]).click(); await pg.waitForTimeout(60);
  const n=await pg.locator('.grid input:not([disabled])').count();
  for(let i=0;i<n;i++) await pg.locator('.grid input:not([disabled])').nth(i).fill('thing '+(i+1));
  await pg.locator('#stage .pbar .fwd').click(); await pg.waitForTimeout(200);
  await pg.locator('#stage .xpl').click(); await pg.waitForTimeout(300);
  await pg.fill('.coach #ask-in','why is that?'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(500);
  const order=await pg.evaluate(()=>{const t=document.querySelector('#coach .tutor, .vpanel .tutor'); if(!t) return null; const kids=[...t.querySelectorAll('.q,.ans')]; return kids.map(c=>c.classList.contains('q')?'q:'+c.innerText.slice(0,12):'ans');});
  ok('wide: in the sidebar the question stays above its answer',!!order&&order.length>=2&&order.findIndex(x=>x.startsWith('q:why'))<order.length-1&&order[order.findIndex(x=>x.startsWith('q:why'))+1]==='ans',order);
  ok('no page errors (wide chat)',noErr(errs).length===0,errs);
  await br.close();
 }
 console.log(out.join('\n')); process.exit(out.some(l=>l.startsWith('FAIL'))?1:0);
})().catch(e=>{console.log(out.join('\n')); console.log('CRASH',e.message.split('\n').slice(0,8).join('\n')); process.exit(2);});
