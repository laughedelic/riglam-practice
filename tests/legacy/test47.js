const {open,go}=require('./harness.js');
const D=require('./harness.js').SHOTS;
const out=[]; const ok=(n,c,x)=>{out.push((c?'PASS ':'FAIL ')+n+(c?'':'  '+JSON.stringify(x)));};
const ORDER={mi:0,'3ab':1,'3ba':2,'4':3,con:4};
async function terms(pg,label,root){
 const t=pg.locator(root+' .vchip:has-text("Terms")');
 ok(label+': a Terms chip, no Note chip',await t.count()===1&&await pg.locator(root+' .vchip:has-text("Note")').count()===0);
 const box=await t.boundingBox();
 ok(label+': the chip is compact (under 90 px wide, 34 px high)',box.width<90&&box.height<=34,box);
 if(await t.getAttribute('aria-selected')!=='true'){ await t.click(); await pg.waitForTimeout(80); }
 ok(label+': summary line starts with the relation name',await pg.locator(root+' .tm-sum b').count()===1&&/\.$|\. $/.test(await pg.locator(root+' .tm-sum b').innerText()),await pg.locator(root+' .tm-sum').innerText());
 ok(label+': one row per term with its A/B chip and its lineage',await pg.locator(root+' .tm-row').count()===2&&await pg.locator(root+' .tm-row .L').count()===2&&await pg.locator(root+' .tm-c').count()===2,await pg.locator(root+' .terms').innerText());
 ok(label+': lineage uses "is a" and no chevron',/ is[\s\u00a0]an?[\s\u00a0]/.test(await pg.locator(root+' .tm-rows').innerText())&&!/›/.test(await pg.locator(root+' .terms').innerText()),await pg.locator(root+' .tm-rows').innerText());
 const fs=await pg.evaluate(r=>[getComputedStyle(document.querySelector(r+' .tm-t')).fontSize,getComputedStyle(document.querySelector(r+' .tm-c')).fontSize],root);
 ok(label+': classification text is larger than before (15 px and up)',parseFloat(fs[1])>=15&&parseFloat(fs[0])>=16,fs);
 const marks=pg.locator(root+' .terms .dterm');
 ok(label+': the terms with a definition are underlined, and there is no Definitions button or list',await marks.count()>=1&&await pg.locator(root+' .tm-tog').count()===0&&await pg.locator(root+' .tm-defs').count()===0,await pg.locator(root+' .terms').innerText());
 await marks.first().click(); await pg.waitForTimeout(80);
 const n=await pg.locator(root+' .ddef .tm-d').count();
 const txt=await pg.locator(root+' .ddef').innerText();
 ok(label+': a tap opens one definition under the text, with no raw source tag or booklet remark in it',n===1&&await pg.locator(root+' .ddef dd').count()>=1&&!/\((Purbuchok|tables|Dampilon|no definition|not defined)|not defined in the booklet/i.test(txt)&&(await pg.locator(root+' .ddef dd').allInnerTexts()).every(x=>x.trim().length>3),txt.slice(0,400));
 await pg.waitForTimeout(120);
 const vis=await pg.evaluate(r=>{const d=document.querySelector(r+' .ddef dt'), a=document.querySelector('#stage > .actions'), b=d.getBoundingClientRect(); return {top:Math.round(b.top),bottom:Math.round(b.bottom),actionsTop:a?Math.round(a.getBoundingClientRect().top):innerHeight,h:innerHeight};},root);
 ok(label+': opening a definition brings it into view',vis.top>=0&&vis.bottom<=vis.actionsTop,vis);
 out.push('INFO '+label+' underlined: '+await marks.count()+' terms, Russian lines '+await pg.locator(root+' .ddef .ru').count());
 await pg.screenshot({path:D+'v47-'+label+'-terms.png'});
 await marks.first().click(); await pg.waitForTimeout(60);
 ok(label+': a second tap hides it again (a mouse still on the term floats its card, which is not the open one)',await pg.locator(root+' .ddef:not(.peek)').count()===0);
}
(async()=>{
 let {br,pg,errs}=await open({width:390,height:844},{isMobile:true,hasTouch:true});
 const rel=await pg.evaluate(()=>window.__t.cur.p.relation);
 await pg.locator('.rels .rel').nth(ORDER[rel]).click(); await pg.waitForTimeout(100);
 const n=await pg.evaluate(()=>['both','anb','bna','nei'].filter(c=>!({mi:['anb','bna'],con:['both'],'3ab':['anb'],'3ba':['bna'],'4':[]}[window.__t.ui.rel]).includes(c)).length);
 for(let i=0;i<n;i++){ await pg.fill('#cin','zzz '+i); await pg.keyboard.press('Enter'); await pg.waitForTimeout(60); }
 /* Done on the last cell already shows the result */ await pg.waitForTimeout(150);
 await pg.evaluate(()=>document.activeElement&&document.activeElement.blur());
 await terms(pg,'phone-relations','#stage');
 // Questions tab: picking the relation checks
 await go(pg,'Pervasions'); await pg.waitForTimeout(150);
 await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(40); await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(40);
 await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(40); await pg.locator('.qcard .btn').first().click(); await pg.waitForTimeout(100);
 await pg.locator('.rels .rel').nth(3).click(); await pg.waitForTimeout(250);
 ok('phone-questions: picking a relation ends on the result (steps: Result), no Check',(await pg.locator('#steps button.on').innerText()).toLowerCase().includes('result')&&await pg.locator('#stage .vchips').count()===1);
 await pg.evaluate(()=>document.activeElement&&document.activeElement.blur());
 await terms(pg,'phone-questions','#stage');
 ok('phone: no page errors',errs.filter(e=>!/ERR_CERT|net::/.test(e)).length===0,errs);
 await br.close();
 ({br,pg,errs}=await open({width:1280,height:800}));
 const rel2=await pg.evaluate(()=>window.__t.cur.p.relation);
 await pg.locator('.strip .chip').nth(ORDER[rel2]).click(); await pg.waitForTimeout(100);
 const ids=await pg.locator('.cell input:not([disabled])').evaluateAll(a=>a.map(x=>x.id)); for(const id of ids) await pg.fill('#'+id,'zzz'); await pg.click('#stage .actions .btn:not(.ghost):not(.fav)'); await pg.waitForTimeout(200);
 await pg.evaluate(()=>document.activeElement&&document.activeElement.blur());
 await terms(pg,'wide-relations','.coach');
 await go(pg,'Pervasions'); await pg.waitForTimeout(150);
 await pg.keyboard.press('a'); await pg.waitForTimeout(40); await pg.keyboard.press('a'); await pg.waitForTimeout(40); await pg.keyboard.press('a'); await pg.waitForTimeout(40); await pg.keyboard.press('a'); await pg.waitForTimeout(100);
 ok('wide: the coach key hints say picking checks (the placeholder paragraph is gone)',/relation, checks/i.test(await pg.locator('.coach').innerText())&&!/verdict appears at once/i.test(await pg.locator('.coach').innerText()),await pg.locator('.coach').innerText());
 await pg.keyboard.press('2'); await pg.waitForTimeout(250);
 ok('wide-questions: key 2 picks the relation and checks (result in the coach, no Check)',await pg.evaluate(()=>window.__t.ui.checked)===true&&await pg.locator('.coach .vchips').count()===1&&!(await pg.locator('.btn').allInnerTexts()).some(t=>/^check$/i.test(t.trim())));
 const parsed=await pg.evaluate(()=>Object.values(window.__t.DATA.terms).map(t=>[t.name,window.__t.defParts(t.d),window.__t.defParts(t.d_ru)]));
 const TAG=/^\((Purbuchok|tables|Dampilon|no |not |defined|mutually|booklet)|\((tables|Dampilon|Purbuchok)\)/i; const leak=parsed.filter(([n,e,r])=>TAG.test(e.body)||TAG.test(r.body));
 ok('every term: source tag parsed out of the English and Russian text',leak.length===0,leak.slice(0,5));
 const srcs=[...new Set(parsed.flatMap(([n,e,r])=>[e.src,r.src]).filter(Boolean))];
 out.push('INFO source labels: '+srcs.join(' | '));
 const sample=parsed.filter(([n])=>['Expressive sound','Object-possessor','Awareness','Pot','Phenomenon','Sense power'].includes(n)).map(([n,e,r])=>n+' => '+JSON.stringify([e,r]));
 out.push('INFO '+sample.join('\n     '));
 ok('wide: no page errors',errs.filter(e=>!/ERR_CERT|net::/.test(e)).length===0,errs);
 console.log(out.join('\n')); await br.close();
})().catch(e=>{console.log(out.join('\n'));console.log('CRASH',e.message.split('\n').slice(0,8).join(' | '));process.exit(1)});
