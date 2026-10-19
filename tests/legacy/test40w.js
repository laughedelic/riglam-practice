const {open,go}=require('./harness.js');
const D=require('./harness.js').SHOTS;
const out=[]; const ok=(n,c,x)=>{out.push((c?'PASS ':'FAIL ')+n+(c?'':'  '+JSON.stringify(x)));};
(async()=>{
 const {br,pg,errs}=await open({width:1280,height:760});
 const vis=async s=>await pg.locator(s).first().isVisible();
 ok('rail shown, top bar and tab bar hidden',await vis('.rail')&&!(await vis('.mbar'))&&!(await vis('.tabbar'))&&!(await vis('#steps')));
 ok('no page scroll',await pg.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1&&document.body.scrollHeight<=innerHeight+1));
 ok('the rail lists Practice (Home), the two exercises and Review',await pg.locator('#tabs [data-go]').count()===4);
 const rel=await pg.evaluate(()=>window.__t.cur.p.relation);
 const ORDER={mi:0,'3ab':1,'3ba':2,'4':3,con:4};
 await pg.locator('.strip .chip').nth(ORDER[rel]).click(); await pg.waitForTimeout(100);
 ok('chip chosen, caption explains it',await pg.locator('.strip .chip[aria-pressed=true]').count()===1&&/\./.test(await pg.locator('.cap').innerText()));
 ok('first open field focused',await pg.evaluate(()=>document.activeElement&&document.activeElement.id&&document.activeElement.id.startsWith('in-')));
 const ids=await pg.locator('.cell input:not([disabled])').evaluateAll(a=>a.map(n=>n.id));
 for(const id of ids){ await pg.fill('#'+id,'a thing'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(40); }
 await pg.waitForTimeout(150);
 ok('Enter after the last cell checks',await pg.evaluate(()=>window.__t.ui.checked)===true);
 ok('verdict in the coach panel: headline, chips, and the terms one chip away',await vis('.coach .verdict')&&await pg.locator('.coach .vchips .vchip').count()>=4&&await pg.locator('.coach .vchip:has-text("Terms")').count()===1);
 ok('strip is locked and marks the result',await pg.locator('.strip.done .chip.key, .strip.done .chip.wrong').count()===1);
 ok('Next pair focused',await pg.evaluate(()=>document.activeElement.textContent.trim()==='Next pair'),await pg.evaluate(()=>document.activeElement.outerHTML.slice(0,80)));
 await pg.screenshot({path:D+'w-result.png'});
 // favorite via the button and the key
 const fav=pg.locator('#stage .actions .fav'); await fav.click(); await pg.waitForTimeout(80);
 ok('favorite button works',await pg.locator('#stage .actions .fav').getAttribute('aria-pressed')==='true'&&(await pg.evaluate(()=>Object.keys(window.__S.favorites).length))===1);
 await pg.keyboard.press('f'); await pg.waitForTimeout(80);
 ok('F toggles it off',await pg.locator('#stage .actions .fav').getAttribute('aria-pressed')==='false');
 // explain in the coach, follow-up in the coach
 await pg.locator('.coach button:has-text("Explain"), .coach button:has-text("Check and explain")').first().click(); await pg.waitForTimeout(250);
 ok('tutor answer in the coach, with a follow-up field',await pg.locator('.coach .tutor .ans').count()>=1&&await vis('.coach #ask-in'));
 await pg.fill('.coach #ask-in','why?'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(300);
 ok('follow-up asked in place (no chat view)',await pg.locator('.coach .tutor .q').count()===1&&!(await vis('#over'))&&(await pg.evaluate(()=>window.__asks.length))===2);
 await pg.screenshot({path:D+'w-tutor.png'});
 await pg.keyboard.press('Tab');
 // next pair
 await pg.locator('#stage .actions .btn:last-child').click(); await pg.waitForTimeout(150);
 ok('next pair resets the coach',await pg.locator('.coach .verdict').count()===0&&await pg.locator('.coach .tutor').count()===0);
 // wrong relation case
 const rel2=await pg.evaluate(()=>window.__t.cur.p.relation);
 const wrongIdx=(ORDER[rel2]+1)%5;
 await pg.keyboard.press(String(wrongIdx+1)); await pg.waitForTimeout(80);
 ok('number key chooses a chip',await pg.locator('.strip .chip').nth(wrongIdx).getAttribute('aria-pressed')==='true');
 await pg.click('#stage .actions .btn:not(.ghost)'); await pg.waitForTimeout(150);
 ok('wrong relation: chosen chip vermilion, right one ringed',await pg.locator('.strip .chip.wrong').count()===1&&await pg.locator('.strip .chip.right').count()===1);
 await pg.screenshot({path:D+'w-wrong.png'});
 await pg.keyboard.press('Enter'); await pg.waitForTimeout(120);
 // questions tab
 await go(pg,'Pervasions'); await pg.waitForTimeout(150);
 ok('questions tab: card and coach',await vis('.qcard')&&await vis('.coach'));
 await pg.screenshot({path:D+'w-q0.png'});
 await pg.keyboard.press('a'); await pg.waitForTimeout(60);
 await pg.locator('.qcard .btn.ghost').click(); await pg.waitForTimeout(60);
 ok('Why? shows the example field focused',await pg.evaluate(()=>document.activeElement.id==='dex'));
 await pg.fill('#dex','a stone'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(60);
 await pg.keyboard.press('a'); await pg.waitForTimeout(40); await pg.keyboard.press('a'); await pg.waitForTimeout(80);
 ok('after four answers: relation chips (picking one checks)',await vis('.strip')&&await pg.locator('.qlog li').count()===4,await pg.locator('.qlog li').count());
 await pg.screenshot({path:D+'w-q1.png'});
 await pg.keyboard.press('1'); await pg.waitForTimeout(150);
 ok('debate checked: verdict chips in the coach, Questions chip holds four rows',await vis('.coach .verdict')&&await pg.locator('.coach .vchip:has-text("Questions")').count()===1&&await (async()=>{ const q=pg.locator('.coach .vchip:has-text("Questions")'); if(await q.getAttribute('aria-selected')!=='true') await q.click(); return await pg.locator('.coach .qd li').count()===4; })());
 await pg.screenshot({path:D+'w-q2.png'});
 // review
 await go(pg,'Review'); await pg.waitForTimeout(150);
 ok('review: three columns, no coach',await pg.locator('.rev3 .rcol').count()===3&&!(await vis('.coach')));
 await pg.screenshot({path:D+'w-review.png'});
 // options
 await pg.click('#obtn'); await pg.waitForTimeout(100);
 ok('options open over the workspace, rail stays',await vis('#over')&&await vis('.rail')&&/notation/i.test(await pg.locator('#over').innerText()));
 await pg.screenshot({path:D+'w-options.png'});
 await pg.keyboard.press('Escape'); await pg.waitForTimeout(80);
 ok('Escape closes options and refocuses the button',!(await vis('#over'))&&await pg.evaluate(()=>document.activeElement.id==='obtn'));
 ok('no page errors',errs.filter(e=>!/ERR_CERT|ERR_NAME|ERR_INTERNET|net::/.test(e)).length===0,errs);
 console.log(out.join('\n')); await br.close();
})().catch(e=>{console.log(out.join('\n'));console.log('CRASH',e.message);process.exit(1)});
