const {open,go,settings}=require('./harness.js');
const D=require('./harness.js').SHOTS;
const out=[]; const ok=(n,c,x)=>{out.push((c?'PASS ':'FAIL ')+n+(c?'':'  '+JSON.stringify(x)));};
const items=pg=>pg.evaluate(()=>[...document.querySelectorAll('.rcpt .ri')].map(r=>({n:r.querySelector('.n').innerText,w:r.querySelector('.rw').innerText,ex:(r.querySelector('.exn')||{}).innerText||'',cls:r.className})));
(async()=>{
 for(const [w,h] of [[390,844],[320,640]]){
  const {br,pg,errs}=await open({width:w,height:h},{isMobile:true,hasTouch:true});
  await go(pg,'Pervasions'); await pg.waitForTimeout(150);
  await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(60);
  await pg.locator('.qcard .btn.ghost').click(); await pg.waitForTimeout(60); await pg.fill('#dex','a clay pot filled with water'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(80);
  let it=await items(pg);
  ok(w+' px: after two answers the receipt lists Q1 and Q2 in order',it.length===2&&it[0].n==='Q1'&&it[1].n==='Q2'&&it[0].w.trim()==='✓'&&it[1].w.trim()==='?!'&&/clay/.test(it[1].ex),it);
  await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(400);
  it=await items(pg);
  ok(w+' px: after three answers: Q1, Q2, Q3',it.map(x=>x.n).join()==='Q1,Q2,Q3'&&it[2].w.trim()==='✓',it);
  const g=await pg.evaluate(()=>{const r=document.querySelector('.rcpt'), b=r.getBoundingClientRect(), s=document.getElementById('stage').getBoundingClientRect(); return {h:Math.round(b.height), inside:b.left>=s.left-0.5&&b.right<=s.right+0.5, doc:document.documentElement.scrollWidth<=innerWidth, ex:(()=>{const x=r.querySelector('.exn'); return x&&x.scrollWidth>x.clientWidth;})()};});
  ok(w+' px: the receipt stays inside the screen and within two lines',g.inside&&g.doc&&g.h<=(w>=390?52:70),g);
  await pg.screenshot({path:D+'v53-receipt-'+w+'.png',clip:{x:0,y:60,width:w,height:Math.min(h-60,360)}});
  ok(w+' px: the live card is still the current question (marks done,done,done,now)',await pg.evaluate(()=>[...document.querySelectorAll('.qcard .prog i')].map(i=>i.className||'-').join(','))==='done,done,done,now');
  ok(w+' px: no page errors',errs.filter(e=>!/fonts|ERR_|proxy/i.test(e)).length===0,errs);
  await br.close();
 }
 // a timed-out question shows in the receipt
 {
  const {br,pg,errs}=await open({width:390,height:844},{isMobile:true,hasTouch:true});
  await go(pg,'Pervasions'); await pg.waitForTimeout(150);
  await pg.click('#mbz'); await pg.waitForTimeout(100);
  await settings(pg); await pg.getByRole('button',{name:'Blitz: details'}).click(); await pg.locator('#over .orow:has-text("Example time") .tcustom').fill('2'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(80); await pg.locator('#over .oc').click(); await pg.waitForTimeout(150);
  await pg.waitForTimeout(2400);
  const it=await items(pg);
  ok('a question that timed out shows in the receipt with "time ran out"',it.length>=1&&/time ran out/.test(it[0].ex),it);
  await br.close();
 }
 console.log(out.join('\n')); process.exit(out.some(l=>l.startsWith('FAIL'))?1:0);
})().catch(e=>{console.log(out.join('\n')); console.log('CRASH',e.message.split('\n').slice(0,6).join('\n')); process.exit(2);});
