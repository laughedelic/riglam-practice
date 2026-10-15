const {open}=require('./harness.js');
const D=require('./harness.js').SHOTS;
const out=[]; const ok=(n,c,x)=>{out.push((c?'PASS ':'FAIL ')+n+(c?'':'  '+JSON.stringify(x)));};
async function run(label,vp,opts,wide){
 const {br,pg,errs}=await open(vp,opts);
 const vis=async s=>await pg.locator(s).first().isVisible();
 await pg.locator('[role=tab]:visible:has-text("Pervasions")').click(); await pg.waitForTimeout(150);
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
 ok(label+': chips include relation, examples, terms; no Questions chip (the answers have a row of their own)',chips.includes('relation')&&!chips.some(c=>/^questions/.test(c))&&chips.includes('examples')&&chips.includes('terms'),chips);
 ok(label+': at most one panel',await pg.locator(root+' .vpanel').count()<=1);
 const tags=pg.locator(root+' .rcpt.graded .ri');
 ok(label+': the result shows the four answers, each with a grade',await tags.count()===4&&await pg.locator(root+' .rcpt.graded .ri .gm').count()===4,await tags.count());
 const chipOpen=()=>pg.locator(root+' .vchip[aria-selected=true]').allInnerTexts();
 const chip0=await chipOpen();
 const was=await tags.nth(1).getAttribute('aria-expanded');
 await tags.nth(1).click(); await pg.waitForTimeout(60);
 const now=await tags.nth(1).getAttribute('aria-expanded');
 ok(label+': tapping an answer toggles it and leaves the chips as they were; only one answer open',now!==was&&await pg.locator(root+' .rcpt.graded .ri[aria-expanded=true]').count()<=1&&JSON.stringify(await chipOpen())===JSON.stringify(chip0),[was,now]);
 if(now==='false'){ await tags.nth(1).click(); await pg.waitForTimeout(60); }
 ok(label+': opened answer shows statement, answer and feedback',await pg.locator(root+' .rdet .qq').count()===1&&await pg.locator(root+' .rdet .fbq').count()===1);
 await pg.screenshot({path:D+'d45-'+label+'-q.png'});
 await tags.nth(1).click(); await pg.waitForTimeout(60);
 ok(label+': tapping again closes it',await tags.nth(1).getAttribute('aria-expanded')==='false'&&await pg.locator(root+' .rdet').count()===0);
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
