// The page's shared state. These were module-level variables of the old single script; an ES module cannot assign to a binding it
// imports, so they are properties of one object. The preference reads below fill in what this device saved.

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
  account: null, // optional sign-in with a server copy of the documents (platform.account), when the place has one
  acct: {},      // the same for the Account row (src/ui/account.ts)
  xfer: {},      // what the "Your data" row of Options keeps between renders (src/ui/data-transfer.ts)
  tutor: null,   // a question to the app's own server (platform.tutor), when the place has one; `sample` is used first
  unlock: null,  // {open, tutor}: opens the prompt for the Magic Key (platform.unlock) while this device has none; `tutor` is whether the server has a tutor waiting for it
  batches: [],
  answers: {},
  gotB: false,
  gotA: false,
  gotS: false,
  tab: "practice",
  mode: "loading",
  ui: null,
  cur: null,
  retryQ: [],
  recent: [],
  debates: {},
  own: "practice",
  favs: {},
  favErr: "",
  retryTag: "Retry",
  nota: "codes",
  optsOpen: false,
  view: null,
  reviewSeg: "overview",
  defLang: "en",  // definitions in the Terms panel: "en", or "enru" (English with the Russian definition and the Russian name of each term)
  POOL: null,
  skips: {},
  skipNote: null,
  skipErr: "",
  // After a skip on a narrow screen a small hint opens under the icon: "Skipped a / b · Undo". It blocks nothing (no scrim), is outside the cards so nothing shifts,
  // and closes on the next tap, key press (Tab moves into it), scroll, or after UNDO_MS. Closing it changes nothing else; Review still lists the pair.
  hintOff: null,
  labSpotN: 10,  // one unanimous answer in labSpotN also goes to the judge (chosen by the case key, so a rerun repeats the choice); 0 never, 1 always
  lab: true,
  labruns: {},
  flags: {},
  flagErr: "",
  labPause: 0,
  flagPending: 0,
  reportBusy: false,
  // the reference the models get, built from the page's own data: every category with its definition, then the classification notes
  labRefC: null,
  // A draw replaces the whole screen, which would send the scroll back to the top. While the screen is the same one (the same pair, step and
  // result, with a row opened or a chip changed), the scroll stays where it was; a new screen starts at the top, as the callers ask with top0().
  lastSig: "",
  fitQ: 0,
  // the last answers, newest first, in the coach panel
  // The heading folds the list away (a per-device choice, kept in the browser); folded, the panel shows just the heading.
  recentOpen: true,
  wording: "mine",
  // display switches (Options): the A/B chips in statements and answers, and the Why? answer spelled out as a sentence
  showAB: true,
  fullPh: true,
  /* the blitz timer: a switch above the questions turns it on; its length is set in the options. A slim bar under the
  question drains over the limit and flashes gently at the end. When time runs out, the statement counts as accepted. */
  timerMs: 10000,
  blitz: false,
  timeEdit: false,
  timeDraft: "",
  relMs: undefined,  // the relation has its own time; it starts from the one time of earlier versions
};

try{ const v=localStorage.getItem("rd-notation"); if(v==="sets"||v==="logic") state.nota=v; }catch(e){}
try{ if(localStorage.getItem("rd-deflang")==="enru") state.defLang="enru"; }catch(e){}   // an earlier "off" (words only) is now the codes
try{ state.lab=localStorage.getItem("rd-lab")!=="0"; }catch(e){}
try{ state.recentOpen=localStorage.getItem("rd-recent")!=="0"; }catch(e){}
try{ if(localStorage.getItem("rd-ab")==="0") state.showAB=false; if(localStorage.getItem("rd-full")==="0") state.fullPh=false; }catch(e){}
try{
  const v=+localStorage.getItem("rd-timer"); if(v>=2000&&v<=120000) state.timerMs=v;
  const b=localStorage.getItem("rd-blitz"); state.blitz=b!==null?b==="1":v>0;     // an earlier version stored only the length: a length meant the timer was on
}catch(e){}
state.relMs = state.timerMs;
try{ const v=+localStorage.getItem("rd-timer-rel"); if(v>=2000&&v<=120000) state.relMs=v; }catch(e){}
