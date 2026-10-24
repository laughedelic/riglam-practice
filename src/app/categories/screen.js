import { state } from "../state.js";
import { el } from "../core/dom.js";
import { isWide } from "../core/viewport.js";
import { next } from "../practice/queue.js";
import { kbHints } from "../practice/screen.js";
import { CONFIRMATION, newTermsNode } from "../practice/terms.js";
import { pairBar } from "../shell/pbar.js";
import { toggleOpts } from "../shell/options.js";
import { ago } from "../shell/render.js";
import { openStageOptions } from "../shell/session.js";
import { stageName } from "../shell/stages.js";
import { STAGES } from "../../domain/stages.ts";
import { acceptOffer, advanceCategories, categoriesList, drawKey, checkCategories, continueCategories, declineOffer, pickCategory, sayCategory, tickCategory, tickNone } from "./flow.js";

/* ---------- Categories: the screen ---------- */
// One card holds the thing and what is asked of it. Step 1 asks which categories the thing is in: all at once (tick, then Check) or one at a time (yes or no, the
// answers collecting under the buttons, newest first, so that the buttons stay where they are). The check splits the categories in two, "What applies" and "What does not
// apply", each with the reason. Step 2 is asked when at least two categories apply and they lie on one line: from the categories that do apply, one tap picks the most
// specific, and the result shows the line. The count towards the next stage is never shown; only the offer is. See flow.js for the steps.
const sentence=t=>t[0].toUpperCase()+t.slice(1);
/** Why a category is, or is not, one of the thing's: the steps of the data, a sentence. */
const because=row=>[row.reason?sentence(row.reason)+".":"",row.why].filter(Boolean).join(" ");

const thingCard=q=>el("div",{class:"catthing"},
  el("p",{class:"catn",lang:"en",text:q.thing.n}),
  el("p",{class:"catm",text:"stage "+q.thing.st+(q.thing.cf?" · "+(CONFIRMATION[q.thing.cf]||q.thing.cf):"")}));
const stepLabel=t=>el("p",{class:"catstep",text:t});
const sumLine=g=>el("p",{class:"catsum",text:"Step 1 · "+(g.ok?"all "+g.right+" right":g.right+" of "+g.rows.length+" right")});

/**
 * One category with the answer: the mark, the category, what the learner did, and the reason. A right one folds to its line (tap for the reason) unless `full`.
 * mode "all": in the split list after ticking; "one": in the list that collects under the yes and no buttons; "onesplit": in the split list after yes and no.
 */
function rowNode(row,said,full,mode){
  const ok=said===row.answer, r=el("div",{class:"catr "+(ok?"ok":"bad")});
  r.append(el("span",{class:"catmk","aria-hidden":"true",text:ok?"✓":"✗"}));
  const h=el("span",{class:"catph"},el("b",{text:row.phrase}));
  if(mode==="one") h.append(el("span",{class:"cattag",text:row.answer?"yes":"no"}));
  if(said&&row.answer&&mode==="all") h.append(el("span",{class:"cattag",text:"you ticked"}));
  if(said&&!row.answer) h.append(el("span",{class:"cattag",text:mode==="all"?"you ticked":"you said yes"}));
  if(!said&&row.answer) h.append(el("span",{class:"cattag",text:mode==="all"?"you missed":"you said no"}));
  r.append(h);
  const why=because(row), body=el("span",{class:"catwhy",text:why});
  if(why){
    r.append(body);
    if(!full&&ok){
      body.hidden=true; r.setAttribute("role","button"); r.tabIndex=0; r.setAttribute("aria-expanded","false");
      const flip=()=>{ body.hidden=!body.hidden; r.setAttribute("aria-expanded",String(!body.hidden)); };
      r.onclick=flip; r.onkeydown=e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); e.stopPropagation(); flip(); } };   // Enter here opens the reason; it is not the page's Continue
    }
  }
  return r;
}
/** The check of step 1: the categories in two groups, what applies and what does not, the wrong ones first. */
function splitResult(g,mode){
  const one=mode!=="all";
  return el("div",{class:"catres"},[true,false].map(yes=>{
    const rows=g.rows.filter(r=>r.answer===yes), wrong=rows.filter(r=>!r.ok).length;
    return el("div",{class:"catgrp"},
      el("p",{class:"catgh"},yes?"What applies":"What does not apply",el("span",{text:"  ·  "+(yes
        ?(rows.length?"you found "+(rows.length-wrong)+" of "+rows.length:"nothing here")
        :(wrong?"you "+(one?"said yes to ":"ticked ")+wrong+" of these by mistake":one?"you said no to all of these":"you left all of these unticked"))})),
      rows.length?null:el("p",{class:"catnote",text:"None of these categories applies to it."}),
      ...rows.slice().sort((a,b)=>Number(a.ok)-Number(b.ok)).map(r=>rowNode(r,r.picked,false,mode)));
  }));
}

// step 1, all at once: the categories as buttons to tick
function ticks(q){
  const u=state.ui;
  const box=el("div",{class:"catticks",role:"group","aria-label":"Categories the thing is in"},
    q.rows.map(r=>el("button",{type:"button",class:"catick","aria-pressed":u.ticked.includes(r.cat)?"true":"false",onclick:()=>tickCategory(r.cat)},r.phrase)),
    el("button",{type:"button",class:"catick dashed","aria-pressed":u.none?"true":"false",onclick:tickNone},"None of these"));
  return [el("p",{class:"catask",text:"Which of these is it? Tick everything it is."}),box];
}
// step 1, one at a time: yes or no for the category asked, and under the buttons the answers so far, newest first (the latest and the wrong ones open, the right ones folded)
function oneByOne(q){
  const u=state.ui;
  const yes=el("button",{type:"button",class:"btn ghost catyes",onclick:()=>sayCategory(true)},"Yes"), no=el("button",{type:"button",class:"btn ghost catno",onclick:()=>sayCategory(false)},"No");
  // every question of this thing sits in one grid cell, only the one asked showing, so the cell is as tall as the longest and the buttons stay where they are as the question changes
  const asks=el("div",{class:"catasks"},q.rows.map((row,i)=>el("p",{class:"catask"+(i===u.i?"":" ghost"),id:i===u.i?"catq":null,"aria-hidden":i===u.i?null:"true",text:"Is "+q.thing.n+" "+row.phrase+"?"})));
  const out=[asks,el("div",{class:"catyn",role:"group","aria-labelledby":"catq"},yes,no)];
  const done=q.rows.slice(0,u.i).reverse();
  if(done.length) out.push(el("div",{class:"catlog"},el("p",{class:"catnote",text:"Your answers, newest first"}),
    ...done.map((row,j)=>rowNode(row,!!u.said[row.cat],j===0||!!u.said[row.cat]!==row.answer,"one"))));
  return out;
}

// what step 2 says when it was not asked
function skipNote(q){
  if(q.thing.ne) return "It does not exist, so it is in none of these and there is nothing to narrow. Step 2 is skipped.";
  return q.rows.filter(r=>r.answer).length<2?"Only one of these applies, so there is nothing to narrow. Step 2 is skipped."
    :"The categories that apply do not lie on one line, so none is the most specific. Step 2 is skipped.";
}
function pickOne(n){
  return [el("p",{class:"catask",text:"Which category is the most specific?"}),
    el("div",{class:"catopts",role:"group","aria-label":"Categories the thing is in"},
      n.options.map((r,i)=>el("button",{type:"button",class:"catopt",onclick:()=>pickCategory(r.cat)},el("span",{class:"catkey","aria-hidden":"true",text:String(i+1)}),r.phrase)))];
}
// step 2 checked: right or "true, but not the most specific", and the whole line from the most specific category up, the options marked
function step2Result(){
  const u=state.ui, g=u.g2, n=u.narrow, best=n.line[0].phrase;
  const out=[el("p",{class:"catsum",text:g.ok?"Step 2 · right: "+g.picked.phrase+" is the most specific.":"Step 2 · true, but not the most specific."})];
  if(!g.ok) out.push(el("p",{class:"catnote",text:"“"+best+"” is more specific than “"+g.picked.phrase+"”: it is "+g.upTo.map(s=>s.phrase).join(", which is ")+"."}));
  out.push(el("p",{class:"catnote",text:"The line from most specific to most general:"}),
    el("div",{class:"catline"},n.line.map(s=>el("span",{class:s.option?"lo":"lx",text:s.phrase+(s.option?" (an option)":"")}))));
  return out;
}

// the offer of another stage, or the line that says what the answer to it did
function offerNode(){
  const o=state.ui.offer; if(!o) return null;
  if(o.kind==="done") return el("p",{class:"catnote",role:"status",text:o.text});
  const up=o.kind==="up";
  const info=STAGES.find(x=>x.n===o.stage);
  return el("div",{class:"catoffer",role:"group","aria-label":up?"Add a stage":"Switch a stage off"},
    el("p",{class:"catoq",text:up?"Stage "+(o.stage-1)+" is going well. Add stage "+o.stage+" to the mix?"
      :"Stage "+o.stage+" is hard going right now. Switch it off for a while?"}),
    el("p",{class:"catnote",text:"Stage "+o.stage+", "+stageName(o.stage).toLowerCase()+": "+(info?info.adds:"")}),
    el("div",{class:"actions left"},
      el("button",{type:"button",class:"btn catyes",onclick:acceptOffer,text:up?"Add stage "+o.stage:"Switch off stage "+o.stage}),
      el("button",{type:"button",class:"btn ghost",onclick:declineOffer,text:"Not now"})),
    up?el("p",{class:"catnote",text:"Never starts by itself. It applies to every exercise, and the stages you are on stay on; turn any stage off in the practice options."})
      :el("p",{class:"catnote"},"Or adjust the stages yourself in the ",el("button",{type:"button",class:"lnk",onclick:openStageOptions},"practice options"),". Nothing is switched off by itself."));
}

// the last things, newest first, in the panel at the right of a wide screen
function recent(box){
  const list=categoriesList().slice(-5).reverse(); if(!list.length) return;
  box.append(el("details",{class:"recent",open:state.recentOpen,ontoggle:e=>{ state.recentOpen=e.target.open; try{ localStorage.setItem("rd-recent",state.recentOpen?"1":"0"); }catch(_){} }},
    el("summary",{class:"label"},el("span",{class:"rmk","aria-hidden":"true"}),"Recent",el("span",{class:"hint",text:String(list.length)})),
    el("ul",{class:"hist"},list.map(a=>el("li",null,el("span",{class:"s "+a.grade,text:{ok:"✓",part:"~",bad:"✗"}[a.grade]||"✗"}),
      el("span",null,a.thing,el("small",{text:a.stage?"stage "+a.stage:"level "+a.level})),el("small",{text:ago(a.at)}))))));
}

export function renderCategories(s,c){
  if(!state.cur.q&&state.cur.tried!==drawKey()) advanceCategories();      // the stages changed, or the examples arrived, since nothing could be drawn
  const u=state.ui, q=state.cur.q, w=isWide();
  if(!q){
    s.append(el("div",{class:"qcard catcard"},
      el("p",{class:"catask",text:"The stages that are on have nothing to ask about on this device."}),
      el("p",{class:"catnote"},"Switch a lower stage on in the ",el("button",{type:"button",class:"lnk",onclick:openStageOptions},"practice options"),
        state.EX?".":". The things of stages 7 to 9 are the course's reference examples, which come with the Magic Key, in ",
        state.EX?null:el("button",{type:"button",class:"lnk",onclick:()=>toggleOpts(true)},"Settings"),state.EX?null:".")));
    return;
  }
  const card=el("div",{class:"qcard catcard"});
  let fwd=null;
  if(u.step===0){
    const nd=newTermsNode((u.ask==="one"?q.rows.slice(u.i,u.i+1):q.rows).map(r=>({cat:r.cat,label:r.phrase})));     // a newly opened category's definition, with the question (stages 1 to 3)
    card.append(stepLabel(u.ask==="one"?"Step 1 of 2 · "+(u.i+1)+" of "+q.rows.length:"Step 1 of 2"),thingCard(q),...(nd?[nd]:[]),...(u.ask==="one"?oneByOne(q):ticks(q)));
    if(u.ask==="all") fwd={label:"Check",hint:"Enter",disabled:!u.ticked.length&&!u.none,onclick:checkCategories};
  } else if(u.step===1){
    const g=u.g1;
    card.append(stepLabel("Step 1 of 2 · checked"),thingCard(q),sumLine(g),splitResult(g,u.ask==="all"?"all":"onesplit"));
    if(u.checked) card.append(el("p",{class:"catnote",text:skipNote(q)}));
    else {
      if(!g.ok) card.append(el("p",{class:"catnote",text:"Step 2 uses the corrected set: "+u.narrow.options.map(r=>r.phrase).join(", ")+"."}));
      fwd={label:"Continue",hint:"Enter",onclick:continueCategories};
    }
  } else if(u.step===2){
    card.append(stepLabel("Step 2 of 2"),thingCard(q),...pickOne(u.narrow));
  } else {
    card.append(stepLabel("Step 2 of 2 · checked"),thingCard(q),...step2Result());
  }
  if(u.checked){
    const o=offerNode(); if(o) card.append(o);
    if(u.saveErr) card.append(el("p",{class:"status",text:u.saveErr}));
    fwd={label:"Next",hint:"N",onclick:()=>next()};
  }
  s.append(card,pairBar(fwd));
  if(!w||!state.coachOpen) return;
  recent(c);
  c.append(kbHints(...(u.checked?[["N","next"]]
    :u.step===0&&u.ask==="one"?[["Y","yes"],["N","no"],["S","skip"]]
    :u.step===0?[["1-"+q.rows.length,"tick a category"],["Enter","check"],["S","skip"]]
    :u.step===1?[["Enter","continue"],["S","skip"]]
    :[["1-"+u.narrow.options.length,"the most specific"],["S","skip"]])));
}
