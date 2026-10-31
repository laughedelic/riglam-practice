// The page's shared state. These were module-level variables of the old single script; an ES module cannot assign to a binding it
// imports, so they are properties of one object. The preference reads below fill in what this device saved.

import { normLevels } from "../ai-shared/examples.ts";
import { FIND_RELS } from "../domain/find.ts";
import { OPEN_CAP, normIntro, normPace } from "../domain/intro.ts";
import { normLangs } from "../domain/languages.ts";
import { DEFAULT_STAGES, freshRun, normExRuns, normGuided, normRun, normStages, stagesOfLevels } from "../domain/stages.ts";
import { normPerEx } from "../domain/per-exercise.ts";
import { TIME_KEY, TIME_KINDS, defaultTimes, readTime } from "../domain/sprint.ts";

/** @type {import("./types.ts").State} */
export const state = {
  DATA: null,
  CAT: {},
  ITEMIDX: {},
  ALIASIDX: {},
  LABELIDX: {},
  db: null,
  sample: null,
  reports: null, // sends flags to the app's server (platform.reports), when the place has a server for them and this device has the Magic Key
  withdrawLater: null, // keeps the removal of a flag for a later start that has `reports` (platform.withdrawReport)
  account: null, // optional sign-in with a server copy of the documents (platform.account), when the place has one
  acct: {},      // the same for the Account row (src/ui/account.ts)
  xfer: {},      // what the "Your data" row of Options keeps between renders (src/ui/data-transfer.ts)
  tutor: null,   // a question to the app's own server (platform.tutor), when the place has one; `sample` is used first
  known: null,   // what that server learned of examples from earlier checks (platform.known), asked before the tutor (ai/known.js)
  EX: null,      // the course's reference examples this device holds (platform.examples), indexed by name (ai-shared/examples.ts); null when it has none
  stages: [...DEFAULT_STAGES], // the stages of the learning ladder every exercise draws from, any mix, at least one (the practice options, `rd-stages`, "0,1,2"); a new device starts at stage 0 alone
  stageLean: 0,  // the pairs left that lean to three possibilities, after the highest stage went up (`rd-stage-lean`, shell/stages.js)
  stagesKept: false, // the stages came from a device's settings before the ladder and were not changed since (`rd-stages-kept`): every pair weighs the same, as before
  syllogismEveryday: false, // that device had Syllogisms on everyday things (`rd-syllogism-level` "1"), which holds until the stages are changed
  intro: null,   // the course terms this device has met at their stops (`rd-terms`, practice/stops.ts); null until the term data is in
  progressSent: [], // the copies of the progression this page wrote lately (practice/progress.ts)
  resetAsk: "",     // the Reset progression line of the Progression page: "ask" while it asks to confirm, "done" after
  about: null,   // {version, commit, builtAt, latest, branches?}: which build this is (platform.about), shown in Options
  updates: null, // {status, check, apply, subscribe}: updating the installed app in place (platform.updates), shown in Options
  unlock: null,  // {open, tutor}: opens the prompt for the Magic Key (platform.unlock) while this device has none; `tutor` is whether the server has a tutor waiting for it
  keyHeld: null,   // {change, forget} while this device has the Magic Key (platform.keyHeld); keyAsk: the Options row is asking whether to forget it
  keyAsk: false,
  batches: [],
  answers: {},
  gotB: false,
  gotA: false,
  gotS: false,
  tab: "practice",    // the screen: an exercise ("practice" is Relations, "debate" Pervasions, "find" Find a pair) or "review"; the app opens on the exercise used last
  mode: "loading",
  ui: null,
  cur: null,
  retryQ: [],
  recent: [],
  findAsked: [],   // the relations Find a pair asked for lately, oldest first: the draw of the next one leans away from them (find/flow.js)
  findRel: null,   // the relation Find a pair keeps asking for once the learner has picked one (`rd-findrel`); null: a different one each time
  catsRecent: [],  // the things Categories asked lately, oldest first: the draw passes them over while others remain (categories/flow.js)
  catsAsk: "all",  // Categories asks step 1 all at once ("all") or one category at a time ("one"; the practice options of the exercise, `rd-cats-ask`)
  stageRun: freshRun(), // the run towards an offer of the stages, from the answers of every exercise (`rd-stage-run`, practice/stage-offer.ts)
  exRuns: {},       // each exercise's run of right answers until it warms up, and its right answers in all (`rd-ex-runs`)
  guided: {},       // each exercise's guided form on the Path, where set (`rd-guided`, practice/guided.ts); none: on
  instRecent: [],  // the sets of categories Find an instance asked lately, oldest first: the draw passes them over while others remain (instance/flow.ts)
  syllogismRecent: [],    // the ids of the syllogisms drawn lately, oldest first: the draw of the next one leans away from them (syllogism/flow.js)
  syllogismWording: "take", // how a syllogism is said: "take" (the class's) or "formal" (`rd-syllogism-wording`)
  instSuggest: true, // Find an instance offers the things the course knows while one is typed (its practice options, `rd-inst-suggest`); off: a plain field
  negBrackets: true,   // a negated name of more than one word is written with brackets, "non-(wooden things)" (`rd-neg-brackets`; off: "non-wooden things")
  negation: "off",   // the negation track of Relations and Pervasions: "one" negates A or B in about a third of the pairs, "both" both sides in half of those (`rd-negation`)
  relSession: [],    // the Relations answers checked on this page, oldest first: the run towards the offer of a negation step counts them before the database has handed them back (practice/negations.ts)
  negOfferAt: "",    // when the learner last answered the offer of a negation step (`rd-neg-offer`): only the answers after it count towards the next offer
  pace: OPEN_CAP,    // the most course terms open at once before a new one waits (the Progression page, `rd-pace`; src/domain/intro.ts, PACES)
  debates: {},
  own: "practice",
  favs: {},
  favErr: "",
  retryTag: "Retry",
  nota: "codes",
  optsOpen: false,   // Settings (the device and the account) covers the exercise
  optsPage: null,    // the Path's Settings: the line whose own page is open (path/settings.tsx), or null for the sections
  preview: false,    // this is a Preview (staging, a pull request build), not the real app (platform.preview): the Path's Settings show Experiments
  perEx: {},         // Blitz, the tutor and voice: each exercise's own values (practice/per-exercise.ts, `rd-per-ex`)
  perBase: null,     // and the shared ones, for an exercise that has none of its own yet
  expShown: false,   // the real app on a device with the Magic Key: Experiments shown in the Path's Settings after a hold on Version (`rd-exp`, device only)
  sessOpen: false,   // the Practice options of the exercise on screen: a sheet on a phone, a popover on a wide screen
  sessPage: null,    // the option whose own page is open in the Practice options (shell/session.js), or null for the list
  skipAsk: false,    // the dialog that asks before a pair with answers in it is skipped
  menuOpen: false,   // narrow screens: the menu slides over the exercise
  fromRoad: false,   // the Path: Review or Settings was opened from the roadmap, so Back and its own way back go to the roadmap, not to the exercise under it
  navDepth: 0,    // history entries held above the first screen (shell/history.js): the exercise itself on a narrow screen, Review, the chat view, Settings, the options and their pages, the skip question
  navSkip: 0,     // steps back the page took itself, whose popstate is to be ignored
  navQ: false,    // a check of the entries against the state is due after this render
  navBare: false, // the first entry above the first screen was added before anything had touched the page: Chrome skips the first screen's entry on Back then, so a close watcher takes the Back
  navGuard: null, // that close watcher, while it is armed (shell/history.js)
  navEsc: 0,
  leaveAsk: false, // the installed app on the Path: Back on the roadmap has said "Back again to close", and a second Back while it says so leaves the app      // when Escape was last pressed: a close watcher hears it too, and the keys have already closed a level for it
  navBack: false, // the system's Back is closing levels, and the browser has animated the screen away itself (a swipe from the edge): the panels do not move as well (shell/history.js, shell/motion.js)
  motion: false,  // the first screen has been drawn: panels that open or close after it slide (shell/motion.js)
  view: null,
  defLang: "en",  // definitions: "en", or "enru" (English with the Russian definition and the Russian name of each term)
  langs: [],      // the other languages a term's name is shown in, beside English (and Russian, when defLang says so): "bo", "skt", "zh" (domain/languages.ts)
  POOL: null,
  skips: {},
  skipErr: "",
  quorumOffered: false,   // the app's server offers Quorum, the tutor's mode of several models and a judge (platform.quorum): a Preview, with the Magic Key
  quorumOptIn: false,     // the server offers it as an opt-in: off on a device until the device turns it on (a Preview has it on until the device turns it off)
  quorumChoice: null,     // what this device chose in Options (`rd-quorum`): true, false, or null for not yet (then the server's default applies)
  quorum: false,          // Quorum is on for this device: its own choice, else the server's default (setQuorumOffer)
  autoExplain: true,   // a checked answer asks for its explanation by itself (Options); the Explain button is still there for one that was not asked
  learns: false,       // the app's server keeps the examples the tutor checked (platform.shares): the dialog tells the learner, Settings offers the switch
  shareExamples: true, // this device lets it (Settings, `rd-share`): an explain question names the examples the page could not check; off, it names none
  shareTold: false,    // the learner has answered the dialog, or the switch (`rd-share-told`, ai/share-notice.js): until then no question carries the `share` marker
  shareAsk: null,      // the one-time dialog is open: settles when the learner has answered it (ai/share-notice.js)
  flags: {},
  flagErr: "",
  flagPending: 0,
  repliesAt: 0,       // when the server was last asked how the review of the sent flags stands (ai/flag-reports.js)
  repliesBusy: false,
  wording: "mine",
  // display switch (Options): the A/B chips in statements and answers
  showAB: true,
  /* Sprint (called Blitz in the code and in what is stored): a clock for each step of an exercise, switched by the stopwatch in the top bar. `blitz` is the switch of the
  exercise on screen (each exercise keeps its own: practice/per-exercise.ts); `times` are the lengths, by what they time (domain/sprint.ts). A slim bar under the top bar
  fills over the time (when it is full the step moves on) and turns red in the last seconds. */
  blitz: false,
  times: defaultTimes(),
  // reading the questions aloud and answering by voice, with the browser's own speech (shell/voice.js). `on` is the Voice switch in Settings (app.js sets it
  // at the start: the device's choice, else the build's default); `read` and `answer` are in the Practice options, both off until turned on there
  voice: {on:false, muted:false, read:false, answer:"off", confirm:"tap", voiceId:"", rate:1, key:"", phase:"idle", live:"", note:"", bad:false, pend:null,began:false,seen:false,held:false, ask3:false, tries:0, blocked:false, clockUi:null, rhold:false, stop:null, tok:null, hooked:false},
  // the sounds (src/app/sound): the Sounds switch in Settings (`rd-sounds`, on until the device turns it off), and the audio context, its room and the sound playing now
  sounds: true,
  snd: {ctx:null, rig:null, live:null, until:0, keep:0, failed:false, armed:false},
  // How the Path looks (src/app/path/look.ts, the lab's settings this device keeps over the defaults, `rd-look`); a short note at the Path's foot
  hand: "",         // what touched the page last: "touch" (a finger or a pen) or "mouse"; empty before anything has (path/gesture.ts: a knock is for a finger only)
  look: null,
  pathNote: null,
  pathQ: 0,          // the Path's next draw, when one waits for the next frame (path/index.tsx, refreshPath)
  pathSeg: "today",  // the section of Review the Path shows (path/review.tsx)
  pathProg: null,    // the Progression page in place of Review (path/progression.tsx): where it was opened from, the term card over it; closed by any setTab
  pathOpen: {},      // the rows of Review the Path has unfolded, by key
};

try{ const v=localStorage.getItem("rd-ex"); if(v==="debate"||v==="find"||v==="categories"||v==="instance"||v==="syllogism") state.tab=state.own=v; }catch(e){}
try{ const v=localStorage.getItem("rd-notation"); if(v==="sets"||v==="logic") state.nota=v; }catch(e){}
try{ if(localStorage.getItem("rd-deflang")==="enru") state.defLang="enru"; }catch(e){}   // an earlier "off" (words only) is now the codes
try{ state.langs=normLangs(localStorage.getItem("rd-langs")); }catch(e){}
// the setting was stored as "rd-lab" while Quorum was a lab of the page: a device that turned it off keeps it off
try{ let q=localStorage.getItem("rd-quorum"); if(q===null){ q=localStorage.getItem("rd-lab"); if(q!==null){ localStorage.setItem("rd-quorum",q); localStorage.removeItem("rd-lab"); } } state.quorumChoice=q===null?null:q!=="0"; }catch(e){}
try{ state.autoExplain=localStorage.getItem("rd-autoexplain")!=="0"; }catch(e){}
try{ state.shareExamples=localStorage.getItem("rd-share")!=="0"; state.shareTold=localStorage.getItem("rd-share-told")==="1"; }catch(e){}
try{ state.sounds=localStorage.getItem("rd-sounds")!=="0"; }catch(e){}
try{ state.perEx=normPerEx(localStorage.getItem("rd-per-ex")); }catch(e){}
try{ state.expShown=localStorage.getItem("rd-exp")==="1"; }catch(e){}
try{ const v=localStorage.getItem("rd-findrel"); if(FIND_RELS.includes(/** @type {any} */(v))) state.findRel=/** @type {any} */(v); }catch(e){}
try{ const v=localStorage.getItem("rd-negation"); if(v==="one"||v==="both") state.negation=v; state.negOfferAt=localStorage.getItem("rd-neg-offer")||""; }catch(e){}
try{ state.negBrackets=localStorage.getItem("rd-neg-brackets")!=="0"; }catch(e){}
try{ state.pace=normPace(localStorage.getItem("rd-pace")); }catch(e){}
try{ state.instSuggest=localStorage.getItem("rd-inst-suggest")!=="0"; }catch(e){}
try{ if(localStorage.getItem("rd-cats-ask")==="one") state.catsAsk="one"; }catch(e){}
try{ state.stageRun=normRun(localStorage.getItem("rd-stage-run")); state.exRuns=normExRuns(localStorage.getItem("rd-ex-runs")); state.guided=normGuided(localStorage.getItem("rd-guided")); }catch(e){}
// the course terms met at their stops, part of the progression (practice/progress.ts); without a record the terms are met one at a time from the start
try{ const t=localStorage.getItem("rd-terms"); if(t!==null) state.intro=normIntro(t); }catch(e){}
// A device used before the ladder keeps what it had: its levels of the reference examples (also ones an import brings), or level 1, their default, become
// the stages up to that level's (level 1 is the ladder's last, stage 9), so its pairs and things stay as they were. `rd-ladder` marks a device that has started with the
// ladder, so that its own settings later do not make it look like an old one; a new device writes no stages until it chooses, and an import can bring them.
try{
  const v=localStorage.getItem("rd-stages");
  if(v!==null) state.stages=normStages(v);
  else {
    const old=localStorage.getItem("rd-exlevels");
    const before=old!==null||(localStorage.getItem("rd-ladder")===null&&Object.keys(localStorage).some(k=>k.startsWith("rd-")));
    if(before){ state.stages=stagesOfLevels(old!==null?normLevels(old):[1]); localStorage.setItem("rd-stages",state.stages.join(",")); localStorage.setItem("rd-stages-kept","1"); }
  }
  localStorage.setItem("rd-ladder","1");
  state.stageLean=Math.max(0,+(localStorage.getItem("rd-stage-lean")||0)||0);
  state.stagesKept=localStorage.getItem("rd-stages-kept")==="1";
  state.syllogismEveryday=localStorage.getItem("rd-syllogism-level")==="1";
}catch(e){}
try{ if(localStorage.getItem("rd-syllogism-wording")==="formal") state.syllogismWording="formal"; }catch(e){}
try{ if(localStorage.getItem("rd-ab")==="0") state.showAB=false; }catch(e){}
try{
  state.blitz=localStorage.getItem("rd-blitz")==="1";
  for(const k of TIME_KINDS) state.times[k]=readTime(k,localStorage.getItem(TIME_KEY[k]));
}catch(e){}
try{
  const v=state.voice, a=localStorage.getItem("rd-voice-answer"), r=+localStorage.getItem("rd-voice-rate");
  v.read=localStorage.getItem("rd-voice-read")==="1"; if(a==="tap"||a==="auto") v.answer=a;
  if(localStorage.getItem("rd-voice-confirm")==="auto") v.confirm="auto";
  v.voiceId=localStorage.getItem("rd-voice-name")||""; if(r>=0.5&&r<=2) v.rate=r;
}catch(e){}
