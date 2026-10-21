// v63: the follow-up field and the tutor block must fit the coach panel whatever the font makes of the field's default width.
const {open}=require('./harness.js');
const ORDER={mi:0,'3ab':1,'3ba':2,'4':3,con:4};
let fails=0; const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++;};
const LONG='a very long example phrase that goes on and on a very long example phrase that goes on and on ';
(async()=>{
  for(const [W,H] of [[1100,800],[1180,800],[1280,800],[1440,900]]){
    const {br,pg,errs}=await open({width:W,height:H});
    // a wider font makes the input's default width (size=20) larger: simulate it with a big size attribute
    const rel=await pg.evaluate(()=>window.__t.cur.p.relation);
    await pg.locator('.strip .chip').nth(ORDER[rel]).click(); await pg.waitForTimeout(80);
    const n=await pg.locator('.grid input:not([disabled])').count();
    for(let i=0;i<n;i++) await pg.locator('.grid input:not([disabled])').nth(i).fill(LONG);
    await pg.locator('#stage .pbar .fwd').click(); await pg.waitForTimeout(250);
    await pg.locator('#stage .xpl').click().catch(()=>{}); await pg.waitForTimeout(500);
    await pg.evaluate(()=>{ document.querySelectorAll('.coach .ask input').forEach(i=>i.size=45); });
    await pg.waitForTimeout(100);
    const m=await pg.evaluate(()=>{
      const c=document.getElementById('coach'), r=c.getBoundingClientRect(), t=document.querySelector('#coach .tutor'), a=document.querySelector('.coach .ask'), b=a&&a.querySelector('button');
      const R=e=>e&&e.getBoundingClientRect().right;
      const padR=parseFloat(getComputedStyle(c).paddingRight)||0;
      return {sw:c.scrollWidth,cw:c.clientWidth,coachR:R(c),tutorR:R(t),askR:R(a),btnR:R(b),padR,has:!!a};
    });
    console.log(W,JSON.stringify(m));
    ok(m.has,W+': the follow-up field is shown');
    ok(m.sw<=m.cw,W+': coach panel does not scroll sideways ('+m.sw+'/'+m.cw+')');
    ok(!!m.tutorR&&m.tutorR<=m.coachR-m.padR+0.5,W+': tutor block inside the coach panel (right '+Math.round(m.tutorR)+' vs '+Math.round(m.coachR-m.padR)+')');
    ok(m.btnR<=m.coachR-m.padR+0.5,W+': Ask button inside the coach (right '+Math.round(m.btnR)+' vs '+Math.round(m.coachR-m.padR)+')');
    ok(!errs.filter(e=>!/Failed to load resource/.test(e)).length,W+': no page errors '+errs.join('|'));
    await pg.screenshot({path:'t/test63_'+W+'.png'});
    await br.close();
  }
  console.log(fails?('FAILED '+fails):'ALL PASS');
  process.exit(fails?1:0);
})();
