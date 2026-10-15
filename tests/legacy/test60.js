const {open}=require('./harness.js');
const D=require('./harness.js').SHOTS;
const out=[]; const ok=(n,c,x)=>{out.push((c?'PASS ':'FAIL ')+n+(c?'':'  '+JSON.stringify(x)));};
const ORDER={mi:0,'3ab':1,'3ba':2,'4':3,con:4};
const noErr=e=>e.filter(x=>!/fonts|ERR_|proxy/i.test(x));
const rgb=(pg,css)=>pg.evaluate(c=>{const t=document.createElement('i'); t.style.color=c; document.body.append(t); const v=getComputedStyle(t).color; t.remove(); return v;},css);
async function phoneQs(pg,sayWhyAt){
  await pg.locator('#tabbar [role=tab]:has-text("Pervasions")').click(); await pg.waitForTimeout(150);
  for(let i=0;i<4;i++){
    if(sayWhyAt.includes(i)){ await pg.locator('.qcard .btn.ghost').click(); await pg.waitForTimeout(80); await pg.fill('#dex','a clay pot'); await pg.keyboard.press('Enter'); }
    else await pg.locator('.qcard .btn').first().click();
    await pg.waitForTimeout(150);
  }
}
(async()=>{
 for(const w of [390,320]){
  const {br,pg,errs}=await open({width:w,height:w===390?844:640},{isMobile:true,hasTouch:true});
  await pg.locator('#tabbar [role=tab]:has-text("Pervasions")').click(); await pg.waitForTimeout(150);
  await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(120);
  await pg.locator('.qcard .btn.ghost').click(); await pg.waitForTimeout(80); await pg.fill('#dex','a clay pot'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(200);
  await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(200);
  const st=await pg.evaluate(()=>{const r=document.querySelector('.rcpt'); return {marks:[...r.querySelectorAll('.ri')].map(b=>({m:b.querySelector('.rw').innerText.trim(),t:b.title,a:b.getAttribute('aria-label'),col:getComputedStyle(b.querySelector('.rw')).color,bg:getComputedStyle(b.querySelector('.rw')).backgroundColor})),text:r.innerText,h:Math.round(r.getBoundingClientRect().height),sw:r.scrollWidth,cw:r.clientWidth};});
  ok(w+' px: the strip shows a check for Accept and ?! for Why?',st.marks.map(x=>x.m).join('|')==='✓|?!|✓',st.marks);
  ok(w+' px: no words in the strip (no Accept, no Why)',!/accept|why/i.test(st.text),st.text);
  ok(w+' px: both marks have one neutral colour, not the green or red of a grade',st.marks.every(x=>x.col===st.marks[0].col)&&st.marks[0].col===await rgb(pg,'var(--ink-muted)')&&st.marks.every(x=>x.bg==='rgba(0, 0, 0, 0)'),st.marks);
  ok(w+' px: each tag still says in words what it is (title and label)',st.marks[0].t==='Accepted'&&st.marks[1].t==='Why?!'&&/Accepted/.test(st.marks[0].a)&&/Why\?!/.test(st.marks[1].a),st.marks);
  ok(w+' px: three answers fit on one row without overflow',st.h<=40&&st.sw<=st.cw+1,st);
  await pg.locator('.rcpt .ri').nth(0).click(); await pg.waitForTimeout(120);
  const pa=await pg.evaluate(()=>{const p=document.querySelector('.rcpt .rdet .pill.acc'); const s=getComputedStyle(p); return {t:p.innerText,bg:s.backgroundColor,col:s.color,tt:s.textTransform};});
  ok(w+' px: the open tag says "✓ Accepted" in a quiet tag, not marigold',pa.t==='✓ Accepted'&&pa.bg!==await rgb(pg,'var(--marigold)')&&pa.col===await rgb(pg,'var(--ink-muted)'),pa);
  await pg.locator('.rcpt .ri').nth(1).click(); await pg.waitForTimeout(120);
  const pw=await pg.evaluate(()=>{const p=document.querySelector('.rcpt .rdet .pill.why'); return p&&{t:p.innerText};});
  ok(w+' px: the second tag says "Why?!" and shows the example',!!pw&&pw.t==='Why?!'&&/clay pot/.test(await pg.locator('.rcpt .rdet').innerText()),pw);
  ok(w+' px: no page errors',noErr(errs).length===0,errs);
  if(w===390){
    // the relation step uses the same marks
    await pg.locator('.rcpt .ri').nth(1).click(); await pg.waitForTimeout(80);
    await pg.locator(".qcard .btn").first().click(); await pg.waitForTimeout(250);
    const rs=await pg.evaluate(()=>[...document.querySelectorAll('.rcpt .ri .rw')].map(x=>x.innerText.trim()).join('|'));
    ok('the relation step strip uses the same marks',rs==='✓|?!|✓|✓',rs);
    // the result: the same marks, each with a grade in front; an opened answer says ✓ Accepted / Why?!
    const rel=await pg.evaluate(()=>window.__t.cur.p.relation);
    await pg.locator('.rels .rel').nth(ORDER[rel]).click(); await pg.waitForTimeout(300);
    const rm=await pg.evaluate(()=>[...document.querySelectorAll('.rcpt.graded .ri .rw')].map(x=>x.innerText.trim()).join('|'));
    ok('in the result the row keeps the same marks, each with a grade',rm==='✓|?!|✓|✓'&&await pg.locator('.rcpt.graded .ri .gm').count()===4,rm);
    await pg.locator('.rcpt.graded .ri').nth(1).click(); await pg.waitForTimeout(120);
    const pills=await pg.evaluate(()=>[...document.querySelectorAll('.rcpt .rdet .pill')].map(p=>p.innerText.trim()));
    ok('an opened answer in the result carries the state word',pills.length===1&&pills[0]==='Why?!',pills);
    const mar=await rgb(pg,'var(--marigold)');
    ok('no state tag in the result has the marigold fill',await pg.evaluate(m=>[...document.querySelectorAll('.pill.acc,.pill.why')].every(p=>getComputedStyle(p).backgroundColor!==m),mar));
  }
  await br.close();
 }
 // wide: the relation step lists the statements with the answers
 {
  const {br,pg,errs}=await open({width:1280,height:800});
  await pg.locator('.rail .nv:has-text("Pervasions")').click(); await pg.waitForTimeout(150);
  await pg.keyboard.press('a'); await pg.waitForTimeout(100); await pg.keyboard.press('a'); await pg.waitForTimeout(100); await pg.keyboard.press('a'); await pg.waitForTimeout(100); await pg.keyboard.press('a'); await pg.waitForTimeout(150);
  const pills=await pg.evaluate(()=>[...document.querySelectorAll('#stage .pill')].map(p=>({t:p.innerText.trim(),bg:getComputedStyle(p).backgroundColor,cur:getComputedStyle(p).cursor})));
  const mar=await rgb(pg,'var(--marigold)');
  ok('wide: the answers beside the statements read "✓ Accepted"',pills.length===4&&pills.every(p=>p.t==='✓ Accepted'),pills);
  ok('wide: they are quiet tags: no marigold fill, no pointer cursor',pills.every(p=>p.bg!==mar&&p.cur!=='pointer'),pills);
  ok('wide: no page errors',noErr(errs).length===0,errs);
  await pg.screenshot({path:D+'s60-wide.png'});
  await br.close();
 }
 console.log(out.join('\n')); process.exit(out.some(l=>l.startsWith('FAIL'))?1:0);
})().catch(e=>{console.log(out.join('\n')); console.log('CRASH',e.message.split('\n').slice(0,8).join('\n')); process.exit(2);});
