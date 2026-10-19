const {open,go,settled}=require('./harness.js');
const D=require('./harness.js').SHOTS;
const out=[]; const ok=(n,c,x)=>{out.push((c?'PASS ':'FAIL ')+n+(c?'':'  '+JSON.stringify(x)));};
(async()=>{
 const {br,pg,errs}=await open({width:390,height:844},{isMobile:true,hasTouch:true});
 // The field sits below the pair's heading, and a pair whose two terms wrap onto several lines pushes it down (its bottom is 387 to 505 px on this
 // screen, by pair). The checks below are about the layout, not the draw, so they run on a pair with short terms, where it is always 387.
 for(let i=0;i<200&&!await pg.evaluate(()=>{ const p=window.__t.cur.p; return p.a.length+p.b.length<=24; });i++) await pg.evaluate(()=>{ window.__t.advance(); window.__t.render(); });
 const vis=async s=>await pg.locator(s).first().isVisible();
 const inView=async s=>await pg.evaluate(s=>{const n=document.querySelector(s); if(!n) return null; const r=n.getBoundingClientRect(); return r.top>=0&&r.bottom<=innerHeight+0.5&&r.width>0;},s);
 ok('narrow: top bar, steps and tab bar shown; rail and coach hidden',await vis('.mbar')&&await vis('#steps')&&await vis('.tabbar')&&!(await vis('.rail'))&&!(await vis('.coach')));
 ok('coarse pointer is seen',await pg.evaluate(()=>matchMedia('(pointer:coarse)').matches));
 ok('no page scroll',await pg.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1));
 ok('steps: Relation is current',(await pg.locator('#steps button.on').innerText()).toLowerCase().includes('relation')&&await pg.locator('#steps button').count()===3);
 ok('relation list shown',await pg.locator('.rels .rel').count()===5);
 await pg.screenshot({path:D+'n-1rel.png'});
 const rel=await pg.evaluate(()=>window.__t.cur.p.relation);
 const ORDER={mi:0,'3ab':1,'3ba':2,'4':3,con:4};
 await pg.locator('.rels .rel').nth(ORDER[rel]).click(); await pg.waitForTimeout(100);
 ok('Examples step with the field focused near the top',(await pg.locator('#steps button.on').innerText()).toLowerCase().includes('examples')&&await pg.evaluate(()=>document.activeElement.id==='cin'));
 ok('typing hides the tab bar',await pg.evaluate(()=>document.documentElement.classList.contains('typing'))&&!(await vis('.tabbar')));
 const fieldBottom=await settled(pg,()=>document.getElementById('cin').getBoundingClientRect().bottom);
 ok('field is high on the screen',fieldBottom<460,fieldBottom);
 await pg.screenshot({path:D+'n-2cell.png'});
 const n=await pg.evaluate(()=>window.__t.ui.rel?['both','anb','bna','nei'].filter(c=>!({mi:['anb','bna'],con:['both'],'3ab':['anb'],'3ba':['bna'],'4':[]}[window.__t.ui.rel]).includes(c)).length:0);
 for(let i=0;i<n-1;i++){ await pg.fill('#cin','thing '+i); await pg.keyboard.press('Enter'); await pg.waitForTimeout(60); }
 ok('entry view shows no list of answers',await pg.locator('#stage .crows').count()===0&&!/your examples/i.test(await pg.locator('#stage').innerText())&&await pg.evaluate(()=>window.__t.ui.review)===false);
 ok('last cell button reads Done',/done/i.test(await pg.locator('.cin .btn').innerText()),await pg.locator('.cin .btn').innerText());
 await pg.screenshot({path:D+'n-2cell-last.png'});
 await pg.fill('#cin','thing '+(n-1)); await pg.keyboard.press('Enter'); await pg.waitForTimeout(150);
 ok('Enter on the last cell shows the result at once: no review list, no Check step',await pg.evaluate(()=>window.__t.ui.checked===true)&&await pg.locator('#stage .crows').count()===0&&!(await pg.locator('#stage .btn').allInnerTexts()).some(t=>/^check$/i.test(t.trim())),await pg.locator('#stage .btn').allInnerTexts());
 ok('result step current; verdict, table (4 cells) and note',(await pg.locator('#steps button.on').innerText()).toLowerCase().includes('result')&&await vis('.verdict')&&await pg.locator('#stage .grid .cell').count()===4);
 ok('tab bar back after typing',await vis('.tabbar'));
 ok('star in the top bar, no favorite button in the card',await vis('#mfav')&&await pg.locator('#stage .fav').count()===0);
 await pg.screenshot({path:D+'n-3result.png'});
 await pg.click('#mfav'); await pg.waitForTimeout(80);
 ok('star toggles the favorite',(await pg.locator('#mfav').getAttribute('aria-pressed'))==='true'&&await pg.evaluate(()=>getComputedStyle(document.querySelector('#mfav .tbi')).fill!=='none')&&(await pg.evaluate(()=>Object.keys(window.__S.favorites).length))===1);
 // explain inline
 await pg.locator('#stage .actions button:has-text("xplain")').click(); await pg.waitForTimeout(250);
 ok('explanation inline on the result page',await pg.locator('#stage .tutor .ans').count()===1&&!(await vis('#over')));
 ok('follow-up opens a separate chat view',await vis('#stage .stage-chat'));
 await pg.screenshot({path:D+'n-4explained.png'});
 await pg.click('#stage .stage-chat'); await pg.waitForTimeout(100);
 ok('chat view: header, context, answer, field focused',await vis('#over')&&await vis('#over .oh')&&await vis('#over .ctx')&&await pg.locator('#over .ans').count()===1&&await pg.evaluate(()=>document.activeElement.id==='ask-in'),await pg.evaluate(()=>document.activeElement.id));
 await pg.fill('#ask-in','why is that?'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(300);
 ok('follow-up lands in the chat',await pg.locator('#over .q').count()===1&&await pg.locator('#over .ans').count()===2);
 await pg.screenshot({path:D+'n-5chat.png'});
 await pg.click('#over .oc'); await pg.waitForTimeout(100);
 ok('Back returns to the result, button shows the count',!(await vis('#over'))&&/·\s*1/.test(await pg.locator('#stage .stage-chat').innerText()),await pg.locator('#stage .stage-chat').innerText());
 // next pair
 await pg.locator('#stage > .actions .btn:last-child').click(); await pg.waitForTimeout(150);
 ok('next pair: back to step 1, star off',(await pg.locator('#steps button.on').innerText()).toLowerCase().includes('relation')&&(await pg.locator('#mfav').getAttribute('aria-pressed'))==='false');
 // diamond reopens the relation list, steps navigation
 const rel2=await pg.evaluate(()=>window.__t.cur.p.relation);
 await pg.locator('.rels .rel').nth(ORDER[rel2]).click(); await pg.waitForTimeout(100);
 await pg.locator('#steps button').first().click(); await pg.waitForTimeout(80);
 ok('step 1 button reopens the relation list',await pg.locator('.rels .rel').count()===5);
 await pg.locator('.rels .rel').nth(ORDER[rel2]).click(); await pg.waitForTimeout(80);
 await pg.fill('#cin','x'); await pg.click('.cin .btn'); await pg.waitForTimeout(60);
 ok('Next button moves on and keeps what was typed',/cell 2/i.test(await pg.locator('.cwho .n').innerText())&&(await pg.evaluate(()=>window.__t.ui.cells[['both','anb','bna','nei'].find(c=>({mi:['anb','bna'],con:['both'],'3ab':['anb'],'3ba':['bna'],'4':[]}[window.__t.ui.rel]).indexOf(c)<0)].t))==='x');
 await pg.evaluate(()=>document.activeElement.blur()); await pg.waitForTimeout(150);
 // review
 await go(pg,'Review'); await pg.waitForTimeout(150);
 ok('review: segmented control with three parts',await pg.locator('.rseg button').count()===3&&await pg.locator('.rseg button[aria-pressed=true]').innerText().then(t=>/overview/i.test(t)));
 await pg.screenshot({path:D+'n-6review.png'});
 await pg.locator('.rseg button').nth(1).click(); await pg.waitForTimeout(100);
 ok('Mistakes part',/Mistakes/i.test(await pg.locator('.rpane .label').first().innerText()));
 await pg.locator('.rseg button').nth(2).click(); await pg.waitForTimeout(100);
 ok('Favorites part lists the favorite',await pg.locator('.rpane .favs > li').count()===1);
 await pg.screenshot({path:D+'n-7fav.png'});
 // options
 await pg.click('#mopt'); await pg.waitForTimeout(100);
 ok('options overlay covers the screen with Back',await vis('#over')&&await pg.evaluate(()=>{const r=document.getElementById('over').getBoundingClientRect();return r.height>=innerHeight-1}));
 await pg.screenshot({path:D+'n-8options.png'});
 await pg.click('#over .oc'); await pg.waitForTimeout(80);
 ok('Back closes options',!(await vis('#over')));
 // questions tab
 await go(pg,'Pervasions'); await pg.waitForTimeout(150);
 ok('questions: steps Questions/Relation/Result, card visible',(await pg.locator('#steps button.on').innerText()).toLowerCase().includes('questions')&&await vis('.qcard'));
 await pg.screenshot({path:D+'n-9q.png'});
 await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(60);
 await pg.locator('.qcard .btn.ghost').click(); await pg.waitForTimeout(60);
 ok('Why? field focused and high on screen',await pg.evaluate(()=>document.activeElement.id==='dex'&&document.activeElement.getBoundingClientRect().bottom<554));
 await pg.screenshot({path:D+'n-9why.png'});
 await pg.fill('#dex','a stone'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(60);
 await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(40); await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(100);
 ok('relation step: the answers as a table above the list',(await pg.locator('#steps button.on').innerText()).toLowerCase().includes('relation')&&await pg.locator('.rels .rel').count()===5&&await pg.locator('#stage .grid .cell').count()===4&&await vis('#stage .grid')&&await pg.locator('.qlog').count()===0);
 ok('the table holds the typed example and ∅ for the accepted ones',(await pg.locator('#stage .grid').innerText()).includes('a stone')&&(await pg.locator('#stage .grid .cell .empty').count())===3);
 await pg.screenshot({path:D+'n-9rel.png'});
 await pg.locator('.rels .rel').first().click(); await pg.waitForTimeout(200);
 ok('picking the relation goes straight to the result (no Check step)',(await pg.locator('#steps button.on').innerText()).toLowerCase().includes('result')&&await pg.evaluate(()=>window.__t.ui.checked)===true&&!(await pg.locator('#stage .btn').allInnerTexts()).some(t=>/^check$/i.test(t.trim())));
 ok('debate result: verdict with chips, table, and no long list of questions',(await pg.locator('#steps button.on').innerText()).toLowerCase().includes('result')&&await vis('.verdict')&&await pg.locator('#stage .vchips .vchip').count()>=4&&await pg.locator('#stage .sum').count()===0&&await pg.locator('#stage .grid .cell').count()===4);
 await pg.screenshot({path:D+'n-9res.png'});
 ok('no page errors',errs.filter(e=>!/ERR_CERT|ERR_NAME|ERR_INTERNET|net::/.test(e)).length===0,errs);
 console.log(out.join('\n')); await br.close();
})().catch(e=>{console.log(out.join('\n'));console.log('CRASH',e.message);process.exit(1)});
