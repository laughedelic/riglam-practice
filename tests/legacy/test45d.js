const {open,go}=require('./harness.js');
const D=require('./harness.js').SHOTS;
const out=[]; const ok=(n,c,x)=>{out.push((c?'PASS ':'FAIL ')+n+(c?'':'  '+JSON.stringify(x)));};
async function run(label,vp,opts,wide){
 const {br,pg,errs}=await open(vp,opts);
 const vis=async s=>await pg.locator(s).first().isVisible();
 await go(pg,'Pervasions'); await pg.waitForTimeout(150);
 // Q1 accept, Q2 why, Q3 accept, Q4 accept
 await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(60);
 await pg.locator('.qcard .btn.ghost').click(); await pg.waitForTimeout(60);
 await pg.fill('#dex','a stone'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(60);
 await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(40); await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(100);
 await pg.evaluate(()=>document.activeElement&&document.activeElement.blur());
 if(!wide) ok(label+': relation step has no "Your answers" list, the table shows the answers',await pg.locator('.qlog').count()===0&&await pg.locator('#stage .grid .cell').count()===4&&!/^your answers$/im.test(await pg.locator('#stage').innerText()));
 if(!wide){ const sh=await pg.evaluate(()=>{const c=document.querySelector('.card'); return [c.scrollHeight,c.clientHeight];}); out.push('INFO '+label+' relation step (list open) scroll '+sh.join(' / ')); }
 const rel=await pg.evaluate(()=>window.__t.ui.rel);
 await pg.locator(wide?'.strip .chip':'.rels .rel').first().click(); await pg.waitForTimeout(250);
 ok(label+': picking the relation shows the result at once, no Check button',await pg.evaluate(()=>window.__t.ui.checked)===true&&!(await pg.locator('.btn').allInnerTexts()).some(t=>/^check$/i.test(t.trim())));
 await pg.evaluate(()=>document.activeElement&&document.activeElement.blur());
 const root=wide?'.coach':'#stage';
 const chips=(await pg.locator(root+' .vchips .vchip').allInnerTexts()).map(s=>s.replace(/[✓✗?]\s*/g,'').trim().toLowerCase());
 ok(label+': chips include relation, questions n/4, examples, terms',chips.includes('relation')&&chips.some(c=>/^questions \d\/4$/.test(c))&&chips.includes('examples')&&chips.includes('terms'),chips);
 ok(label+': at most one panel',await pg.locator(root+' .vpanel').count()<=1);
 const qi=chips.findIndex(c=>/^questions/.test(c));
 const sel=async i=>await pg.locator(root+' .vchip').nth(i).getAttribute('aria-selected')==='true';
 if(!(await sel(qi))){ await pg.locator(root+' .vchip').nth(qi).click(); await pg.waitForTimeout(60); }
 ok(label+': Questions chip shows four rows',await pg.locator(root+' .qd li').count()===4,await pg.locator(root+' .qd li').count());
 const was=await pg.locator(root+' .qs').nth(1).getAttribute('aria-expanded');
 await pg.locator(root+' .qs').nth(1).click(); await pg.waitForTimeout(60);
 const now=await pg.locator(root+' .qs').nth(1).getAttribute('aria-expanded');
 ok(label+': tapping a row toggles it and keeps the Questions chip; only one row open',now!==was&&await pg.locator(root+' .qs[aria-expanded=true]').count()<=1&&await sel(qi),[was,now]);
 if(now==='false'){ await pg.locator(root+' .qs').nth(1).click(); await pg.waitForTimeout(60); }
 ok(label+': opened row shows statement, answer and feedback',await pg.locator(root+' .qb .qq').count()===1&&await pg.locator(root+' .qb .fbq').count()===1);
 await pg.screenshot({path:D+'d45-'+label+'-q.png'});
 await pg.locator(root+' .qs').nth(1).click(); await pg.waitForTimeout(60);
 ok(label+': tapping again closes it',await pg.locator(root+' .qs').nth(1).getAttribute('aria-expanded')==='false');
 await pg.screenshot({path:D+'d45-'+label+'-q0.png'});
 // explain
 const eb=pg.locator((wide?'.coach':'#stage')+' button:has-text("xplain")');
 await eb.first().click(); await pg.waitForTimeout(300);
 ok(label+': Why chip opens',await pg.locator(root+' .vchip[aria-selected=true]').innerText().then(t=>/^why$/i.test(t.trim())),await pg.locator(root+' .vchip[aria-selected=true]').count());
 ok(label+': [?] on explained cells',await pg.locator('.grid .qm').count()===2,await pg.locator('.grid .qm').count());
 await pg.locator('.grid .qm').first().click(); await pg.waitForTimeout(100);
 ok(label+': popover shows',await pg.locator('.grid .pop').count()===1&&/clay pot|stone/.test(await pg.locator('.grid .pop').innerText()));
 await pg.screenshot({path:D+'d45-'+label+'-pop.png'});
 await pg.keyboard.press('Escape'); await pg.waitForTimeout(60);
 ok(label+': Escape closes',await pg.locator('.pop').count()===0);
 ok(label+': no page errors',errs.filter(e=>!/ERR_CERT|net::/.test(e)).length===0,errs);
 await br.close();
}
(async()=>{
 await run('phone',{width:390,height:844},{isMobile:true,hasTouch:true},false);
 await run('wide',{width:1280,height:800},{},true);
 console.log(out.join('\n'));
})().catch(e=>{console.log(out.join('\n'));console.log('CRASH',e.message.split('\n').slice(0,8).join(' | '));process.exit(1)});
