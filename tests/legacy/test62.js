const {open,go}=require('./harness.js');
const {ringScan}=require('./ring.js');
const D=require('./harness.js').SHOTS;
const out=[]; const ok=(n,c,x)=>{out.push((c?'PASS ':'FAIL ')+n+(c?'':'  '+JSON.stringify(x)));};
const noErr=e=>e.filter(x=>!/fonts|ERR_|proxy/i.test(x));
const rgb=(pg,css)=>pg.evaluate(c=>{const t=document.createElement('i'); t.style.color=c; document.body.append(t); const v=getComputedStyle(t).color; t.remove(); return v;},css);
const pervTab=async pg=>{ await go(pg,'Pervasions'); await pg.waitForTimeout(150); };
const hint=pg=>pg.evaluate(()=>{const h=document.getElementById('skiphint'); return h&&!h.hidden?h.innerText.replace(/\s+/g,' ').trim():null;});
const curKey=pg=>pg.evaluate(()=>{const p=window.__t.cur.p; return p.a+' / '+p.b;});
const fillOf=(pg,sel)=>pg.evaluate(s=>getComputedStyle(document.querySelector(s)).fill,sel);
(async()=>{
 // ============ the toolbar at phone widths ============
 for(const [w,h] of [[430,900],[390,844],[375,667],[360,740],[340,700],[320,640]]){
  const {br,pg,errs}=await open({width:w,height:h},{isMobile:true,hasTouch:true});
  await pervTab(pg);
  const g=await pg.evaluate(()=>{const R=s=>{const e=document.querySelector(s); if(!e||e.hidden) return null; const b=e.getBoundingClientRect(); return {l:Math.round(b.left),r:Math.round(b.right),t:Math.round(b.top),b:Math.round(b.bottom),w:Math.round(b.width),h:Math.round(b.height)};}; const m=document.querySelector('.mbar'); return {brand:R('.mbar .brand'),back:R('#mback'),bz:R('#mbz'),fav:R('#mfav'),skip:R('#mskip'),sess:R('#msess'),opt:R('#mopt'),bar:R('.mbar'),barOver:m.scrollWidth>m.clientWidth,page:document.documentElement.scrollWidth-innerWidth,lineH:parseFloat(getComputedStyle(document.querySelector('.mbar .brand')).lineHeight)};});
  ok(w+' px: back, bolt, star, skip and the settings are all in the top bar; Options is in the tab bar',!!(g.back&&g.bz&&g.fav&&g.skip&&g.sess)&&!!g.opt&&g.opt.t>=g.bar.b,g);
  ok(w+' px: order left to right: back, heading, bolt | star, skip, settings; none overlaps another',g.bz&&g.back.r<=g.brand.l+1&&g.brand.r<=g.bz.l+7&&g.bz.r<=g.fav.l+1&&g.fav.r<=g.skip.l+1&&g.skip.r<=g.sess.l+1&&g.sess.r<=g.bar.r+10,g);
  ok(w+' px: every icon has a touch area of at least 44 px tall and 36 px wide',[g.back,g.bz,g.fav,g.skip,g.sess].every(x=>x&&x.h>=44&&x.w>=36),g);
  ok(w+' px: no sideways scroll in the bar or the page',!g.barOver&&g.page<=0,g);
  if(w>=360) ok(w+' px: the heading stays on one line',g.brand.h<=g.lineH+2,[g.brand,g.lineH]);
  else ok(w+' px: the heading may wrap to two lines but does not touch the bolt',g.brand.r<=g.bz.l+7,g);
  // all four share one look: 24 px, stroke 1.75
  const ic=await pg.evaluate(()=>['#mbz','#mfav','#mskip'].map(s=>{const i=document.querySelector(s+' .tbi'), c=getComputedStyle(i); return {s,w:c.width,h:c.height,sw:c.strokeWidth,stroke:c.stroke,color:getComputedStyle(document.querySelector(s)).color,fill:c.fill};}));
  ok(w+' px: bolt, star and skip are the same size (24 px) and stroke (1.75), outline when off',ic.every(x=>x.w==='24px'&&x.h==='24px'&&parseFloat(x.sw)===1.75&&x.fill==='none'),ic);
  ok(w+' px: no page errors',noErr(errs).length===0,errs);
  if(w===390||w===320){
   for(const id of ['mback','mbz','mfav','mskip','msess','mopt']){ await pg.focus('#'+id); const r=await pg.evaluate(ringScan); ok(w+' px: focus ring of #'+id+' is not clipped',r.length===0,r); }
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
  ok('Blitz off: the bolt is an outline in the muted colour',await fillOf(pg,'#mbz .tbi')==='none'&&await col('#mbz')===muted,[await fillOf(pg,'#mbz .tbi'),await col('#mbz')]);
  await pg.click('#mbz'); await pg.waitForTimeout(100);
  ok('Blitz on: the bolt is filled with the highlight colour (lapis)',await fillOf(pg,'#mbz .tbi')===lapis&&await col('#mbz')===lapis,[await fillOf(pg,'#mbz .tbi'),await col('#mbz'),lapis]);
  ok('Blitz on keeps its name with both times, on one switch for Relations and Pervasions',/^Blitz on: \d+ s relation, \d+ s question$/.test(await pg.locator('#mbz').getAttribute('aria-label')));
  await go(pg,'Relations'); await pg.waitForTimeout(150);
  ok('on Relations the same bolt is on and its name says example',await pg.locator('#mbz').getAttribute('aria-checked')==='true'&&/ s example$/.test(await pg.locator('#mbz').getAttribute('aria-label')));
  await pg.click('#mbz'); await pg.waitForTimeout(100);
  ok('the star is an outline off and filled (ink) on',await fillOf(pg,'#mfav .tbi')==='none'&&(await pg.click('#mfav'),await pg.waitForTimeout(100),await fillOf(pg,'#mfav .tbi')!=='none'&&await col('#mfav')===ink));
  ok('the skip icon is an outline and has no on state (no aria-pressed)',await fillOf(pg,'#mskip polygon')==='none'&&await pg.locator('#mskip').getAttribute('aria-pressed')===null);
  await br.close();
 }
 // ============ the hint after a skip ============
 {
  const {br,pg,errs}=await open({width:390,height:844},{isMobile:true,hasTouch:true});
  await pervTab(pg);
  const a=await curKey(pg);
  const closeCases=[
   ['a tap on the page',async()=>{ await pg.locator('.qcard .qt').click(); }],
   ['a key press',async()=>{ await pg.keyboard.press('x'); }],
   ['Escape',async()=>{ await pg.keyboard.press('Escape'); }],
   ['a scroll',async()=>{ await pg.waitForTimeout(350); await pg.evaluate(()=>document.getElementById('stage').dispatchEvent(new Event('scroll'))); }],
   ['a tap on the tab bar',async()=>{ await go(pg,'Review'); }],
  ];
  for(const [name,act] of closeCases){
   if(name==='a tap on the tab bar'){ /* go back first */ }
   await pg.locator('#mskip').click(); await pg.waitForTimeout(120);
   const open1=!!(await hint(pg));
   await act(); await pg.waitForTimeout(150);
   ok('the hint closes on '+name,open1&&await hint(pg)===null,[open1,await hint(pg)]);
   ok('...and the skip stays recorded ('+name+')',Object.keys(await pg.evaluate(()=>window.__S.skips)).length>=1);
   if(name==='a tap on the tab bar'){ await pervTab(pg); }
  }
  const n0=Object.keys(await pg.evaluate(()=>window.__S.skips)).length;
  ok('closing the hint never removes a record: '+n0+' records after the five skips',n0>=3,n0);
  // keyboard: Tab moves into the hint instead of closing it; Enter on Undo takes the skip back
  await pg.locator('#mskip').focus(); const before=await curKey(pg); await pg.keyboard.press('Enter'); await pg.waitForTimeout(150);
  const afterSkip=await curKey(pg);
  ok('Enter on the focused Skip icon skips and opens the hint',afterSkip!==before&&!!(await hint(pg)),[before,afterSkip]);
  await pg.keyboard.press('Tab'); await pg.waitForTimeout(60);
  ok('Tab does not close the hint',!!(await hint(pg)));
  // the settings button follows Skip in the top bar (Options is in the tab bar), so the Tab after it is the hint's Undo
  await pg.keyboard.press('Tab'); await pg.waitForTimeout(60);
  const af=await pg.evaluate(()=>document.activeElement&&document.activeElement.className+'|'+document.activeElement.textContent);
  ok('Tab reaches Undo inside the hint',/skipundo\|Undo/.test(af),af);
  await pg.keyboard.press('Enter'); await pg.waitForTimeout(150);
  ok('Enter on Undo takes the skip back and closes the hint',await curKey(pg)===before&&await hint(pg)===null);
  // the hint is not part of the page: no layout shift
  const geo=async()=>pg.evaluate(()=>{const q=document.querySelector('.qcard').getBoundingClientRect(), s=document.getElementById('stage'); return Math.round(q.top)+'/'+s.scrollTop+'/'+document.documentElement.scrollWidth;});
  await pg.locator('#mskip').click(); await pg.waitForTimeout(150);
  const g1=await geo(); await pg.waitForTimeout(6300); const g2=await geo();
  ok('the page does not move when the hint closes by itself (about 6 s)',g1===g2&&await hint(pg)===null,[g1,g2]);
  // the hint's look
  await pg.locator('#mskip').click(); await pg.waitForTimeout(150);
  const hv=await pg.evaluate(()=>{const h=document.getElementById('skiphint'), r=h.getBoundingClientRect(), s=document.getElementById('mskip').getBoundingClientRect(), bar=document.querySelector('.mbar').getBoundingClientRect(); const nx=parseFloat(getComputedStyle(h).getPropertyValue('--nx')); return {top:Math.round(r.top),barBottom:Math.round(bar.bottom),left:Math.round(r.left),right:Math.round(r.right),h:Math.round(r.height),notchX:Math.round(r.right-nx),iconX:Math.round(s.left+s.width/2),scrim:!!document.querySelector('.scrim, .backdrop')};});
  ok('the hint is below the toolbar, inside the screen, 44 px or more tall, with its notch under the icon, no scrim',hv.top>=hv.barBottom&&hv.left>=0&&hv.right<=390&&hv.h>=44&&Math.abs(hv.notchX-hv.iconX)<=2&&!hv.scrim,hv);
  await pg.screenshot({path:D+'s62-hint-390.png',clip:{x:0,y:0,width:390,height:240}});
  // it does not block the page: a tap on the Accept button still works at once
  const step0=await pg.evaluate(()=>window.__t.ui.step);
  await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(100);
  ok('the hint blocks nothing: the first tap on an answer button both closes it and answers',await pg.evaluate(()=>window.__t.ui.step)===step0+1&&await hint(pg)===null);
  ok('no page errors (hint)',noErr(errs).length===0,errs);
  await br.close();
 }
 // ============ the icon is dimmed once the pair is checked ============
 {
  const {br,pg}=await open({width:390,height:844},{isMobile:true,hasTouch:true});
  await pervTab(pg);
  for(let i=0;i<4;i++){ await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(90); }
  const rel=await pg.evaluate(()=>window.__t.cur.p.relation), ORDER={mi:0,'3ab':1,'3ba':2,'4':3,con:4};
  await pg.locator('.rels .rel').nth(ORDER[rel]).click(); await pg.waitForTimeout(250);
  const d=await pg.evaluate(()=>{const b=document.getElementById('mskip'); return {dis:b.disabled,op:getComputedStyle(b).opacity,hidden:b.hidden};});
  ok('after the result the Skip icon stays in place, dimmed and disabled (the other icons do not move)',d.dis&&parseFloat(d.op)<0.6&&!d.hidden,d);
  await pg.keyboard.press('s'); await pg.waitForTimeout(100);
  ok('the S key does nothing on a checked pair',Object.keys(await pg.evaluate(()=>window.__S.skips)).length===0);
  await br.close();
 }
 // ============ wide: the bolt in the action row, no toolbar ============
 {
  const {br,pg,errs}=await open({width:1280,height:800});
  const g=await pg.evaluate(()=>{const b=document.querySelector('#stage .actions .bz'), r=b.getBoundingClientRect(), c=getComputedStyle(b); return {w:Math.round(r.width),h:Math.round(r.height),bg:c.backgroundColor,shadow:c.boxShadow,txt:b.innerText.trim(),svg:b.querySelectorAll('svg.tbi').length,label:b.getAttribute('aria-label'),barShown:getComputedStyle(document.querySelector('.mbar')).display!=='none'};});
  ok('wide: the Blitz bolt in the action row is a plain icon too (no box, no number), named "Blitz off"',g.w>=44&&g.bg==='rgba(0, 0, 0, 0)'&&g.shadow==='none'&&g.txt===''&&g.svg===1&&g.label==='Blitz off'&&!g.barShown,g);
  await pg.click('#stage .actions .bz'); await pg.waitForTimeout(100);
  ok('wide: on, it is filled and the name has both times',await fillOf(pg,'#stage .actions .bz .tbi')!=='none'&&/^Blitz on: \d+ s relation, \d+ s example$/.test(await pg.locator('#stage .actions .bz').getAttribute('aria-label')));
  await pg.screenshot({path:D+'s62-wide.png'});
  ok('no page errors (wide)',noErr(errs).length===0,errs);
  await br.close();
 }
 console.log(out.join('\n')); process.exit(out.some(l=>l.startsWith('FAIL'))?1:0);
})().catch(e=>{console.log(out.join('\n')); console.log('CRASH',e.message.split('\n').slice(0,8).join('\n')); process.exit(2);});
