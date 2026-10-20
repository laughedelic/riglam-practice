const {open,go}=require('./harness.js');
const out=[]; const ok=(n,c,x)=>{out.push((c?'PASS ':'FAIL ')+n+(c?'':'  '+JSON.stringify(x)));};
(async()=>{
 let {br,pg,errs}=await open({width:360,height:740},{isMobile:true,hasTouch:true});
 await go(pg,'Pervasions'); await pg.waitForTimeout(150);
 ok('no caption row under the pair while asking (the card carries the progress)',await pg.locator('.head .subrow').count()===0);
 const h0=await pg.evaluate(()=>{const s=document.querySelector('.qn .sr').getBoundingClientRect(); return {w:Math.round(s.width),h:Math.round(s.height),aria:document.querySelector('.qn').textContent};});
 ok('card header shows "Question 1" and no visible "of 4"; the text for a reader still has it',h0.w<=1&&h0.h<=1&&/Question 1 of 4/.test(h0.aria),h0);
 const hh=await pg.evaluate(()=>{const q=document.querySelector('.qn'); return Math.round(q.getBoundingClientRect().height)<=22;});
 ok('360 px: the card header is one line',hh);
 await pg.click('#mbz'); await pg.waitForTimeout(150);
 const bar=await pg.evaluate(()=>{const i=document.querySelector('.pbar .tbar i'); const c=getComputedStyle(i).backgroundColor; const t=document.createElement('i'); t.style.color='var(--heading)'; document.body.append(t); const hc=getComputedStyle(t).color; t.remove(); return {c,hc};});
 ok('the countdown bar starts in the heading blue, not grey',bar.c===bar.hc,bar);
 await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(400);
 const r=await pg.evaluate(()=>{const p=document.querySelector('.rcpt .ri.acc'), w=p.querySelector('.rw'), s=getComputedStyle(p); return {bg:s.backgroundColor, glyph:w.innerText, col:getComputedStyle(w).color, ok:getComputedStyle(document.documentElement).getPropertyValue('--cell-ok').trim(), n:document.querySelectorAll('.rcpt .ri').length};});
 ok('receipt tag: no fill, a check mark in a neutral colour (not the green of a verdict), one entry per answer',r.bg==='rgba(0, 0, 0, 0)'&&/✓/.test(r.glyph)&&r.col!==r.ok&&r.n===1,r);
 const live=await pg.evaluate(()=>getComputedStyle(document.querySelector('.qcard .btn')).backgroundColor);
 ok('the live Accept button keeps its marigold fill (receipt no longer looks like it)',live!==r.bg&&live!=='rgba(0, 0, 0, 0)',live);
 await pg.locator('.qcard .btn.ghost').click(); await pg.waitForTimeout(80); await pg.fill('#dex','a clay pot'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(300);
 const r2=await pg.evaluate(()=>({n:[...document.querySelectorAll('.rcpt .ri .n')].map(e=>e.innerText).join(','),why:(document.querySelector('.rcpt .ri.why .rw')||{}).innerText,ex:(document.querySelector('.rcpt .ri.why .exn')||{}).innerText}));
 ok('receipt now lists Q1 and Q2; the Why? answer shows the mark ?! and its example',r2.n==='Q1,Q2'&&(r2.why||'').trim()==='?!'&&r2.ex==='a clay pot',r2);
 ok('no page errors',errs.filter(e=>!/fonts|ERR_|proxy/i.test(e)).length===0,errs);
 await br.close();
 // short term beside a long one
 for(const w of [390,360,320]){
  ({br,pg,errs}=await open({width:w,height:844},{isMobile:true,hasTouch:true}));
  const lines=async()=>pg.evaluate(()=>{const pr=document.querySelector('.pair'), L=el=>Math.round(el.getBoundingClientRect().height/parseFloat(getComputedStyle(el).lineHeight)); const hd=document.querySelector('.head').getBoundingClientRect(); return {la:L(pr.querySelector('.ta')),lb:L(pr.querySelector('.tb')),cols:pr.style.gridTemplateColumns,over:document.documentElement.scrollWidth>innerWidth,inside:pr.getBoundingClientRect().right<=hd.right+0.5&&pr.getBoundingClientRect().left>=hd.left-0.5,aw:Math.round(pr.querySelector('.ta').getBoundingClientRect().width),bw:Math.round(pr.querySelector('.tb').getBoundingClientRect().width),off:(()=>{const m=pr.querySelector('.mid').getBoundingClientRect(); return Math.round(Math.abs(m.left+m.width/2-(hd.left+hd.width/2))*10)/10;})()};});
  await pg.evaluate(()=>{window.__t.cur.p.a="Physical things outside a person's continuum"; window.__t.cur.p.b="Plants"; window.__t.render();}); await pg.waitForTimeout(300);
  const m=await lines();
  ok(w+' px: long term beside "Plants": the diamond stays in the centre, "Plants" stays on one line, nothing overflows',m.lb===1&&m.la<=6&&(m.off<=1||(w<=320&&!!m.cols))&&!m.over&&m.inside,m);
  await pg.evaluate(()=>{window.__t.cur.p.a="Pot"; window.__t.cur.p.b="Plants"; window.__t.render();}); await pg.waitForTimeout(250);
  const s=await lines();
  ok(w+' px: two short terms keep equal columns',s.la===1&&s.lb===1&&Math.abs(s.aw-s.bw)<=Math.max(s.aw,s.bw)*0.9,s);
  await br.close();
 }
 console.log(out.join('\n')); process.exit(out.some(l=>l.startsWith('FAIL'))?1:0);
})().catch(e=>{console.log(out.join('\n')); console.log('CRASH',e.message.split('\n').slice(0,6).join('\n')); process.exit(2);});
