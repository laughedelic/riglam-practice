const {open}=require('./harness.js');
const D=require('./harness.js').SHOTS;
const out=[]; const ok=(n,c,x)=>{out.push((c?'PASS ':'FAIL ')+n+(c?'':'  '+JSON.stringify(x)));};
const ORDER={mi:0,'3ab':1,'3ba':2,'4':3,con:4};
(async()=>{
 const {br,pg,errs}=await open({width:390,height:844},{isMobile:true,hasTouch:true});
 // wrong answer on purpose, star it, go to review, practice favorite, retry mistakes
 const rel=await pg.evaluate(()=>window.__t.cur.p.relation);
 const wrong=(ORDER[rel]+1)%5;
 await pg.locator('.rels .rel').nth(wrong).click(); await pg.waitForTimeout(100);
 const n=await pg.evaluate(()=>['both','anb','bna','nei'].filter(c=>!({mi:['anb','bna'],con:['both'],'3ab':['anb'],'3ba':['bna'],'4':[]}[window.__t.ui.rel]).includes(c)).length);
 for(let i=0;i<n;i++){ await pg.fill('#cin','zz '+i); await pg.keyboard.press('Enter'); await pg.waitForTimeout(50); }
 /* Done on the last cell already shows the result */
 await pg.waitForTimeout(150);
 const pairName=await pg.evaluate(()=>window.__t.cur.p.a+' / '+window.__t.cur.p.b);
 ok('wrong relation shown on the heading diamond',await pg.locator('.mid.wrong').count()===1);
 await pg.click('#mfav'); await pg.waitForTimeout(100);
 await pg.evaluate(()=>document.activeElement.blur()); await pg.waitForTimeout(120);
 await pg.locator('#tabbar [role=tab]:has-text("Review")').click(); await pg.waitForTimeout(150);
 await pg.locator('.rseg button').nth(1).click(); await pg.waitForTimeout(100);
 ok('mistake listed with a Retry button',await pg.locator('.rpane .sum li').count()===1&&await pg.locator('.rpane button:has-text("Retry")').count()===1);
 await pg.locator('.rpane button:has-text("Retry")').click(); await pg.waitForTimeout(150);
 ok('retry opens the practice tab at the relation step with a tag',await pg.locator('.retry-tag').count()===1&&/relation/i.test(await pg.locator('#steps button.on').innerText())&&await pg.evaluate(()=>window.__t.tab==='practice'));
 await pg.screenshot({path:D+'n-retry.png'});
 await pg.locator('#tabbar [role=tab]:has-text("Review")').click(); await pg.waitForTimeout(120);
 await pg.locator('.rseg button').nth(2).click(); await pg.waitForTimeout(100);
 await pg.locator('.rpane .favs summary').first().click(); await pg.waitForTimeout(80);
 await pg.screenshot({path:D+'n-fav-open.png'});
 await pg.locator('.rpane button:has-text("Practice this pair")').click(); await pg.waitForTimeout(150);
 ok('favorite practice: same pair, tag, star on',await pg.evaluate(p=>window.__t.cur.p.a+' / '+window.__t.cur.p.b===p,pairName)&&/favorite/i.test(await pg.locator('.retry-tag').innerText())&&await pg.locator('#mfav').getAttribute('aria-pressed')==='true');
 // escape closes chat/options; shortcuts do not fire under the overlay
 await pg.click('#mopt'); await pg.waitForTimeout(80);
 await pg.keyboard.press('2'); await pg.waitForTimeout(60);
 ok('digit under the options overlay does nothing',await pg.evaluate(()=>window.__t.ui.rel)===null);
 await pg.keyboard.press('Escape'); await pg.waitForTimeout(60);
 ok('Escape closes options',!(await pg.locator('#over').isVisible()));
 ok('no page errors',errs.filter(e=>!/ERR_CERT|net::/.test(e)).length===0,errs);
 console.log(out.join('\n')); await br.close();
})().catch(e=>{console.log(out.join('\n'));console.log('CRASH',e.message.split('\n').slice(0,8).join(' | '));process.exit(1)});
