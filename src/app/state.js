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
  quorumOffered: false,   // the app's server offers Quorum, the tutor's mode of several models and a judge (platform.quorum): a Preview, with the Magic Key
  quorumOptIn: false,     // the server offers it as an opt-in: off on a device until the device turns it on (a Preview has it on until the device turns it off)
  quorumChoice: null,     // what this device chose in Options (`rd-quorum`): true, false, or null for not yet (then the server's default applies)
  quorum: false,          // Quorum is on for this device: its own choice, else the server's default (setQuorumOffer)
  autoExplain: true,   // a checked answer asks for its explanation by itself (Options); the Explain button is still there for one that was not asked
  flags: {},
  flagErr: "",
  flagPending: 0,
  reportBusy: false,
  repliesAt: 0,       // when the server was last asked how the review of the sent flags stands (ai/flag-reports.js)
  repliesBusy: false,
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
// the setting was stored as "rd-lab" while Quorum was a lab of the page: a device that turned it off keeps it off
try{ let q=localStorage.getItem("rd-quorum"); if(q===null){ q=localStorage.getItem("rd-lab"); if(q!==null){ localStorage.setItem("rd-quorum",q); localStorage.removeItem("rd-lab"); } } state.quorumChoice=q===null?null:q!=="0"; }catch(e){}
try{ state.autoExplain=localStorage.getItem("rd-autoexplain")!=="0"; }catch(e){}
try{ state.recentOpen=localStorage.getItem("rd-recent")!=="0"; }catch(e){}
try{ if(localStorage.getItem("rd-ab")==="0") state.showAB=false; if(localStorage.getItem("rd-full")==="0") state.fullPh=false; }catch(e){}
try{
  const v=+localStorage.getItem("rd-timer"); if(v>=2000&&v<=120000) state.timerMs=v;
  const b=localStorage.getItem("rd-blitz"); state.blitz=b!==null?b==="1":v>0;     // an earlier version stored only the length: a length meant the timer was on
}catch(e){}
state.relMs = state.timerMs;
try{ const v=+localStorage.getItem("rd-timer-rel"); if(v>=2000&&v<=120000) state.relMs=v; }catch(e){}
