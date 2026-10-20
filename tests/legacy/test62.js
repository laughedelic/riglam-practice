const {open,go}=require('./harness.js');
const {ringScan}=require('./ring.js');
const D=require('./harness.js').SHOTS;
const out=[]; const ok=(n,c,x)=>{out.push((c?'PASS ':'FAIL ')+n+(c?'':'  '+JSON.stringify(x)));};
const noErr=e=>e.filter(x=>!/fonts|ERR_|proxy/i.test(x));
const rgb=(pg,css)=>pg.evaluate(c=>{const t=document.createElement('i'); t.style.color=c; document.body.append(t); const v=getComputedStyle(t).color; t.remove(); return v;},css);
const pervTab=async pg=>{ await go(pg,'Pervasions'); await pg.waitForTimeout(150); };
const hint=pg=>pg.evaluate(()=>{const h=document.querySelector('#stage .pbar .pnote'); return h?h.innerText.replace(/\s+/g,' ').trim():null;});
const curKey=pg=>pg.evaluate(()=>{const p=window.__t.cur.p; return p.a+' / '+p.b;});
const fillOf=(pg,sel)=>pg.evaluate(s=>getComputedStyle(document.querySelector(s)).fill,sel);
(async()=>{
 // ============ the toolbar at phone widths ============
 for(const [w,h] of [[430,900],[390,844],[375,667],[360,740],[340,700],[320,640]]){
  const {br,pg,errs}=await open({width:w,height:h},{isMobile:true,hasTouch:true});
  await pervTab(pg);
  const g=await pg.evaluate(()=>{const R=s=>{const e=document.querySelector(s); if(!e||e.hidden) return null; const b=e.getBoundingClientRect(); return {l:Math.round(b.left),r:Math.round(b.right),t:Math.round(b.top),b:Math.round(b.bottom),w:Math.round(b.width),h:Math.round(b.height)};}; const m=document.querySelector('.mbar'); return {brand:R('#mttl'),menu:R('#menubtn'),bz:R('#mbz'),sess:R('#msess'),chat:R('#mchat'),fav:R('.starb'),skip:R('.skipw'),bar:R('.mbar'),pbar:R('#stage .pbar'),barOver:m.scrollWidth>m.clientWidth,page:document.documentElement.scrollWidth-innerWidth,lineH:parseFloat(getComputedStyle(document.querySelector('#mttl')).lineHeight),tabBar:!!document.querySelector('#tabs,#mopt')};});
  ok(w+' px: the menu, the bolt, the practice options and the chat are in the top bar; star and skip are in the pair bar at the foot; there is no tab bar',!!(g.menu&&g.bz&&g.sess&&g.chat&&g.fav&&g.skip&&g.pbar)&&g.fav.t>=g.bar.b&&g.skip.t>=g.pbar.t&&g.fav.b<=g.pbar.b+1&&!g.tabBar,g);
  ok(w+' px: order left to right: menu, heading, bolt, practice options, chat; in the pair bar skip, star; none overlaps another',g.bz&&g.menu.r<=g.brand.l+1&&g.brand.r<=g.bz.l+7&&g.bz.r<=g.sess.l+1&&g.sess.r<=g.chat.l+1&&g.chat.r<=g.bar.r+10&&g.skip.r<=g.fav.l+1&&g.fav.r<=g.pbar.r,g);
  ok(w+' px: every icon has a touch area of at least 44 px tall and 36 px wide (Skip is a labelled button: 40 px tall like every button)',[g.menu,g.bz,g.sess,g.chat,g.fav].every(x=>x&&x.h>=44&&x.w>=36)&&g.skip.h>=40&&g.skip.w>=36,g);
  ok(w+' px: no sideways scroll in the bar or the page',!g.barOver&&g.page<=0,g);
  if(w>=360) ok(w+' px: the heading stays on one line',g.brand.h<=g.lineH+2,[g.brand,g.lineH]);
  else ok(w+' px: the heading may wrap to two lines but does not touch the bolt',g.brand.r<=g.bz.l+7,g);
  // all share one look: 24 px (the small icon beside the word Skip, 18 px), stroke 1.75
  const ic=await pg.evaluate(()=>['#menubtn','#mbz','#msess','#mchat','.starb','.skipw'].map(s=>{const i=document.querySelector(s+' .tbi'), c=getComputedStyle(i); return {s,w:c.width,h:c.height,sw:c.strokeWidth,stroke:c.stroke,color:getComputedStyle(document.querySelector(s)).color,fill:c.fill};}));
  ok(w+' px: menu, bolt, options, chat and star are the same size (24 px), skip 18 px beside its word, all the same stroke (1.75), outline when off',ic.every(x=>{ const z=x.s==='.skipw'?'18px':'24px'; return x.w===z&&x.h===z&&parseFloat(x.sw)===1.75&&x.fill==='none'; }),ic);
  ok(w+' px: no page errors',noErr(errs).length===0,errs);
  if(w===390||w===320){
   for(const sel of ['#menubtn','#mbz','#msess','#mchat','.starb','.skipw']){ await pg.focus(sel); const r=await pg.evaluate(ringScan); ok(w+' px: focus ring of '+sel+' is not clipped',r.length===0,r); }
   await pg.screenshot({path:D+'s62-bar-'+w+'.png',clip:{x:0,y:0,width:w,height:70}});
  }
  await br.close();
 }
 // ============ states: filled when on ============
 {
  const {br,pg}=await open({width:390,height:844},{isMobile:true,hasTouch:true});
  await pervTab(pg);
  const lapis=await rgb(pg,'var(--lapis)'), muted=await rgb(pg,'var(--ink-muted)'), ink=await rgb(pg,'var(--ink)');
  const col=s=>pg.evaluate(s=>getComputedStyle(document.querySelector(s)).color,s);
  ok('Blitz off: the bolt is an outline in the muted colour',await fillOf(pg,'#mbz .tbi .fa')==='none'&&await col('#mbz')===muted,[await fillOf(pg,'#mbz .tbi .fa'),await col('#mbz')]);
  await pg.click('#mbz'); await pg.waitForTimeout(100);
  // the stopwatch is filled in its dial (.fa); the hands stay in the paper colour
  ok('Blitz on: the bolt is filled with the highlight colour (lapis)',await fillOf(pg,'#mbz .tbi .fa')===lapis&&await col('#mbz')===lapis,[await fillOf(pg,'#mbz .tbi .fa'),await col('#mbz'),lapis]);
  ok('Blitz on keeps its name with both times, on one switch for Relations and Pervasions',/^Blitz on: \d+ s relation, \d+ s question$/.test(await pg.locator('#mbz').getAttribute('aria-label')));
  await go(pg,'Relations'); await pg.waitForTimeout(150);
  ok('on Relations the same bolt is on and its name says example',await pg.locator('#mbz').getAttribute('aria-checked')==='true'&&/ s example$/.test(await pg.locator('#mbz').getAttribute('aria-label')));
  await pg.click('#mbz'); await pg.waitForTimeout(100);
  ok('the star is an outline off and filled (ink) on',await fillOf(pg,'.starb .tbi')==='none'&&(await pg.click('.starb'),await pg.waitForTimeout(100),await fillOf(pg,'.starb .tbi')!=='none'&&await col('.starb')===ink));
  ok('the skip icon is an outline and has no on state (no aria-pressed)',await fillOf(pg,'.skipw polygon')==='none'&&await pg.locator('.skipw').getAttribute('aria-pressed')===null);
  await br.close();
 }
 // ============ the note after a skip ============
 {
  const {br,pg,errs}=await open({width:390,height:844},{isMobile:true,hasTouch:true});
  await pervTab(pg);
  const a=await curKey(pg);
  // a pair with something answered asks first; "Skip anyway" then sets it aside like a pair only drawn
  const skipIt=async()=>{ await pg.locator('.skipw').click(); await pg.waitForTimeout(120); if(await pg.locator('#over[data-kind=skip]').isVisible()){ await pg.getByRole('button',{name:'Skip anyway'}).click(); await pg.waitForTimeout(120); } };
  const closeCases=[
   ['an answer on the new pair',async()=>{ await pg.locator('.qcard .btn').first().click(); }],
   ['time (about 6 s)',async()=>{ await pg.waitForTimeout(6300); }],
  ];
  for(const [name,act] of closeCases){
   await skipIt();
   const open1=!!(await hint(pg));
   await act(); await pg.waitForTimeout(150);
   ok('the note closes on '+name,open1&&await hint(pg)===null,[open1,await hint(pg)]);
   ok('...and the skip stays recorded ('+name+')',Object.keys(await pg.evaluate(()=>window.__S.skips)).length>=1);
  }
  const n0=Object.keys(await pg.evaluate(()=>window.__S.skips)).length;
  ok('closing the note never removes a record: '+n0+' records after the two skips',n0>=2,n0);
  // keyboard: Tab moves through the note instead of closing it; Enter on Undo takes the skip back
  await pg.locator('.skipw').focus(); const before=await curKey(pg); await pg.keyboard.press('Enter'); await pg.waitForTimeout(150);
  const afterSkip=await curKey(pg);
  ok('Enter on the focused Skip button skips and shows the note',afterSkip!==before&&!!(await hint(pg)),[before,afterSkip]);
  // the skip redraws the bar, so the focus starts again from the top of the page: Undo is a few Tab presses on, in the pair bar
  let af='', tabs=0; for(;tabs<12;tabs++){ await pg.keyboard.press('Tab'); await pg.waitForTimeout(40); af=await pg.evaluate(()=>document.activeElement&&document.activeElement.className+'|'+document.activeElement.textContent); if(/skipundo\|Undo/.test(af)) break; }
  ok('Tab does not close the note',!!(await hint(pg)));
  ok('Tab reaches Undo inside the note',/skipundo\|Undo/.test(af),[tabs,af]);
  await pg.keyboard.press('Enter'); await pg.waitForTimeout(150);
  ok('Enter on Undo takes the skip back and closes the note',await curKey(pg)===before&&await hint(pg)===null);
  // the note is a line of the pair bar, not part of the page: no layout shift above it
  const geo=async()=>pg.evaluate(()=>{const q=document.querySelector('.qcard').getBoundingClientRect(), s=document.getElementById('stage'); return Math.round(q.top)+'/'+s.scrollTop+'/'+document.documentElement.scrollWidth;});
  await pg.locator('.skipw').click(); await pg.waitForTimeout(150);
  const g1=await geo(); await pg.waitForTimeout(6300); const g2=await geo();
  ok('the page does not move when the note closes by itself (about 6 s)',g1===g2&&await hint(pg)===null,[g1,g2]);
  // the note's look
  await pg.locator('.skipw').click(); await pg.waitForTimeout(150);
  const hv=await pg.evaluate(()=>{const h=document.querySelector('#stage .pbar .pnote'), r=h.getBoundingClientRect(), pb=document.querySelector('#stage .pbar').getBoundingClientRect(), row=document.querySelector('#stage .pbar .prow').getBoundingClientRect(), u=h.querySelector('.skipundo').getBoundingClientRect(); return {top:Math.round(r.top),bottom:Math.round(r.bottom),left:Math.round(r.left),right:Math.round(r.right),barTop:Math.round(pb.top),rowTop:Math.round(row.top),undoH:Math.round(u.height),undoR:Math.round(u.right),scrim:!!document.querySelector('.scrim, .backdrop')};});
  ok('the note is a line at the foot, above the buttons of the pair bar, inside the screen, with an Undo 32 px or more tall, no scrim',hv.top>=hv.barTop&&hv.bottom<=hv.rowTop+1&&hv.left>=0&&hv.right<=390&&hv.undoH>=32&&hv.undoR<=hv.right&&!hv.scrim,hv);
  await pg.screenshot({path:D+'s62-hint-390.png',clip:{x:0,y:704,width:390,height:140}});
  // it does not block the page: a tap on the Accept button still works at once
  const step0=await pg.evaluate(()=>window.__t.ui.step);
  await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(100);
  ok('the note blocks nothing: the first tap on an answer button both closes it and answers',await pg.evaluate(()=>window.__t.ui.step)===step0+1&&await hint(pg)===null);
  ok('no page errors (note)',noErr(errs).length===0,errs);
  await br.close();
 }
 // ============ the Skip button is dimmed once the pair is checked ============
 {
  const {br,pg}=await open({width:390,height:844},{isMobile:true,hasTouch:true});
  await pervTab(pg);
  for(let i=0;i<4;i++){ await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(90); }
  const rel=await pg.evaluate(()=>window.__t.cur.p.relation), ORDER={mi:0,'3ab':1,'3ba':2,'4':3,con:4};
  await pg.locator('.rels .rel').nth(ORDER[rel]).click(); await pg.waitForTimeout(250);
  const d=await pg.evaluate(()=>{const b=document.querySelector('.skipw'); return {dis:b.disabled,op:getComputedStyle(b).opacity,hidden:b.hidden};});
  ok('after the result the Skip button stays in place, dimmed and disabled (the star does not move)',d.dis&&parseFloat(d.op)<0.6&&!d.hidden,d);
  await pg.keyboard.press('s'); await pg.waitForTimeout(100);
  ok('the S key does nothing on a checked pair',Object.keys(await pg.evaluate(()=>window.__S.skips)).length===0);
  await br.close();
 }
 // ============ wide: the bolt in the top bar, a plain icon ============
 {
  const {br,pg,errs}=await open({width:1280,height:800});
  const g=await pg.evaluate(()=>{const b=document.getElementById('mbz'), r=b.getBoundingClientRect(), c=getComputedStyle(b); return {w:Math.round(r.width),h:Math.round(r.height),bg:c.backgroundColor,shadow:c.boxShadow,txt:b.innerText.trim(),svg:b.querySelectorAll('svg.tbi').length,label:b.getAttribute('aria-label'),inBar:!!b.closest('.mbar')&&getComputedStyle(document.querySelector('.mbar')).display!=='none'};});
  ok('wide: the Blitz bolt in the top bar is a plain icon too (no box, no number), named "Blitz off"',g.w>=44&&g.bg==='rgba(0, 0, 0, 0)'&&g.shadow==='none'&&g.txt===''&&g.svg===1&&g.label==='Blitz off'&&g.inBar,g);
  await pg.click('#mbz'); await pg.waitForTimeout(100);
  ok('wide: on, it is filled and the name has both times',await fillOf(pg,'#mbz .tbi .fa')!=='none'&&/^Blitz on: \d+ s relation, \d+ s example$/.test(await pg.locator('#mbz').getAttribute('aria-label')));
  await pg.screenshot({path:D+'s62-wide.png'});
  ok('no page errors (wide)',noErr(errs).length===0,errs);
  await br.close();
 }
 console.log(out.join('\n')); process.exit(out.some(l=>l.startsWith('FAIL'))?1:0);
})().catch(e=>{console.log(out.join('\n')); console.log('CRASH',e.message.split('\n').slice(0,8).join('\n')); process.exit(2);});
