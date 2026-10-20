// The page's shared state. These were module-level variables of the old single script; an ES module cannot assign to a binding it
// imports, so they are properties of one object. The preference reads below fill in what this device saved.

import { FIND_RELS } from "../domain/find.ts";

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
  about: null,   // {version, commit, builtAt, latest, branches?}: which build this is (platform.about), shown in Options
  updates: null, // {status, check, apply, subscribe}: updating the installed app in place (platform.updates), shown in Options
  unlock: null,  // {open, tutor}: opens the prompt for the Magic Key (platform.unlock) while this device has none; `tutor` is whether the server has a tutor waiting for it
  keyHeld: null,   // {change, forget} while this device has the Magic Key (platform.keyHeld); keyAsk: the Options row is asking whether to forget it
  keyAsk: false,
  mkNote: false,   // the note on the name "Magic Key" is open in the Options row
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
  findSuggest: true, // Find a pair offers the terms of the course while the pair is typed (the settings of Find a pair, `rd-findsuggest`); off: plain fields
  debates: {},
  own: "practice",
  favs: {},
  favErr: "",
  retryTag: "Retry",
  nota: "codes",
  optsOpen: false,   // Settings (the device and the account) covers the exercise
  sessOpen: false,   // the Practice options of the exercise on screen: a sheet on a phone, a popover on a wide screen
  sessPage: null,    // the option whose own page is open in the Practice options (shell/session.js), or null for the list
  skipAsk: false,    // the dialog that asks before a pair with answers in it is skipped
  menuOpen: false,   // narrow screens: the menu slides over the exercise
  menuPin: true,     // wide screens: the menu is pinned open beside the exercise (`rd-menu`, pinned until it is unpinned); otherwise it only peeks from the left edge
  menuPeek: false,   // wide screens: the pointer is on the left edge, the menu shows while it stays there
  coachOpen: false,  // wide screens: the panel at the right (recent answers and keys before the result, the tutor after it) is open
  navDepth: 0,    // history entries held above the first screen (shell/history.js): the exercise itself on a narrow screen, Review, the chat view, Settings, the options and their pages, the skip question
  navSkip: 0,     // steps back the page took itself, whose popstate is to be ignored
  navQ: false,    // a check of the entries against the state is due after this render
  navBack: false, // the system's Back is closing levels, and the browser has animated the screen away itself (a swipe from the edge): the panels do not move as well (shell/history.js, shell/motion.js)
  motion: false,  // the first screen has been drawn: panels that open or close after it slide (shell/motion.js)
  view: null,
  reviewSeg: "overview",
  defLang: "en",  // definitions in the Terms panel: "en", or "enru" (English with the Russian definition and the Russian name of each term)
  POOL: null,
  skips: {},
  skipNote: null,
  skipErr: "",
  quorumOffered: false,   // the app's server offers Quorum, the tutor's mode of several models and a judge (platform.quorum): a Preview, with the Magic Key
  quorumOptIn: false,     // the server offers it as an opt-in: off on a device until the device turns it on (a Preview has it on until the device turns it off)
  quorumChoice: null,     // what this device chose in Options (`rd-quorum`): true, false, or null for not yet (then the server's default applies)
  quorum: false,          // Quorum is on for this device: its own choice, else the server's default (setQuorumOffer)
  autoExplain: true,   // a checked answer asks for its explanation by itself (Options); the Explain button is still there for one that was not asked
  flags: {},
  flagErr: "",
  flagPending: 0,
  repliesAt: 0,       // when the server was last asked how the review of the sent flags stands (ai/flag-reports.js)
  repliesBusy: false,
  // A draw replaces the whole screen, which would send the scroll back to the top. While the screen is the same one (the same pair, step and
  // result, with a row opened or a chip changed), the scroll stays where it was; a new screen starts at the top, as the callers ask with top0().
  lastSig: "",
  lastUi: null,
  fitQ: 0,
  // the last answers, newest first, in the coach panel
  // The heading folds the list away (a per-device choice, kept in the browser); folded, the panel shows just the heading.
  recentOpen: true,
  wording: "mine",
  // display switches (Options): the A/B chips in statements and answers, and the Why? answer spelled out as a sentence
  showAB: true,
  fullPh: true,
  /* the blitz timer: a switch above the questions turns it on; its length is set in the settings of the exercise. A slim bar under the
  question drains over the limit and flashes gently at the end. When time runs out, the statement counts as accepted. */
  timerMs: 10000,
  blitz: false,
  bzHold: 0,         // the timer of a hold on the stopwatch in the top bar (shell/topbar.js)
  blitzUse: true,    // the Blitz page of the practice options can take the stopwatch away from the top bar altogether (on by default)
  relMs: undefined,  // the relation has its own time; it starts from the one time of earlier versions
};

try{ const v=localStorage.getItem("rd-ex"); if(v==="debate"||v==="find") state.tab=state.own=v; }catch(e){}
try{ state.menuPin=localStorage.getItem("rd-menu")!=="0"; }catch(e){ state.menuPin=true; }   // a wide screen starts with the menu pinned (the exercise would be stretched too wide without it); the button unpins it
try{ const v=localStorage.getItem("rd-notation"); if(v==="sets"||v==="logic") state.nota=v; }catch(e){}
try{ if(localStorage.getItem("rd-deflang")==="enru") state.defLang="enru"; }catch(e){}   // an earlier "off" (words only) is now the codes
// the setting was stored as "rd-lab" while Quorum was a lab of the page: a device that turned it off keeps it off
try{ let q=localStorage.getItem("rd-quorum"); if(q===null){ q=localStorage.getItem("rd-lab"); if(q!==null){ localStorage.setItem("rd-quorum",q); localStorage.removeItem("rd-lab"); } } state.quorumChoice=q===null?null:q!=="0"; }catch(e){}
try{ state.autoExplain=localStorage.getItem("rd-autoexplain")!=="0"; }catch(e){}
try{ state.recentOpen=localStorage.getItem("rd-recent")!=="0"; }catch(e){}
try{ const v=localStorage.getItem("rd-findrel"); if(FIND_RELS.includes(/** @type {any} */(v))) state.findRel=/** @type {any} */(v); }catch(e){}
try{ state.findSuggest=localStorage.getItem("rd-findsuggest")!=="0"; }catch(e){}
try{ if(localStorage.getItem("rd-ab")==="0") state.showAB=false; if(localStorage.getItem("rd-full")==="0") state.fullPh=false; }catch(e){}
try{
  const v=+localStorage.getItem("rd-timer"); if(v>=2000&&v<=120000) state.timerMs=v;
  const b=localStorage.getItem("rd-blitz"); state.blitz=b!==null?b==="1":v>0;     // an earlier version stored only the length: a length meant the timer was on
  state.blitzUse=localStorage.getItem("rd-blitzuse")!=="0";
  if(!state.blitzUse) state.blitz=false;
}catch(e){}
state.relMs = state.timerMs;
try{ const v=+localStorage.getItem("rd-timer-rel"); if(v>=2000&&v<=120000) state.relMs=v; }catch(e){}
