// The shapes the page works with: the documents it stores (the collections `answers`, `debates`, `batches`,
// `favorites`, `skips`, `labruns`, `flags`), the pair on screen, and the shared `state`. Stored shapes are part of
// the data users already have: never rename a collection or change a document without a migration (CLAUDE.md).
// Fields written by older versions of the page may be missing, so most fields besides the keys are optional.
import type { Cat, DrillData, Item } from "../ai-shared/data";
import type { About, Unlock, Updates } from "../platform/types";
import type { AnswerView, DebateAnswer } from "../ai-shared/card";
import type { CellId, RelKey } from "../ai-shared/relations";
import type { Pair, PoolEntry, Verdict } from "../domain/types";
import type { Account, Db, LabSample, Sample, Tutor } from "../platform/types";
import type { AccountSlot } from "../ui/account";
import type { TransferSlot } from "../ui/data-transfer";
import type { KeyHeld } from "../platform/types";

export type { Pair, PoolEntry, Verdict };

export interface CellDoc {
  text: string;
  none?: boolean;
  verdict?: Verdict;
  /** "claude" when Claude's check settled the verdict */
  by?: string;
}

/** One debate question as stored. */
export interface QuestionDoc {
  c: CellId;
  /** older versions stored "time" when time ran out */
  say: "accept" | "why" | "time" | null;
  text?: string;
  dok?: boolean;
  verdict?: Verdict;
  by?: string;
  ms?: number;
  msEx?: number;
  limit?: number;
  timeout?: boolean;
}

/** collection `answers` (practice) and `debates` (mode "debate"): one checked answer. */
export interface AnswerDoc {
  pairId: string;
  batchId?: string | null;
  mode?: "debate";
  a: string;
  b: string;
  catA?: string | null;
  catB?: string | null;
  /** the relation the learner chose, null when time ran out */
  chosen: RelKey | null;
  /** the correct relation */
  key: RelKey;
  /** debate: the relation the first three answers imply, or "bad" */
  implied?: RelKey | "bad" | null;
  correct: boolean;
  grade?: "ok" | "part" | "bad" | string;
  cells: Record<CellId, CellDoc>;
  qs?: QuestionDoc[];
  at: string;
  pair: Pair;
  retryOf?: string;
  timeout?: "both" | "relation" | "examples";
  /** the tutor's explanation, kept with the answer */
  explain?: string;
  verifiedAt?: string;
}
export type DebateDoc = AnswerDoc & { mode: "debate"; qs: QuestionDoc[] };

/** collection `batches`: an older set of prepared pairs. */
export interface BatchDoc {
  id: string;
  order?: number;
  title?: string;
  pairs: Pair[];
}

/** collection `favorites`; the key is `c_<category ids>` or, for pairs without known categories, `l_<labels>`. */
export interface FavDoc {
  key: string;
  a: string;
  b: string;
  catA?: string | null;
  catB?: string | null;
  relation: RelKey;
  pair: Pair;
  at: string;
}

/** collection `skips`: a pair hidden for a while; `n` counts how often it was skipped. */
export interface SkipDoc extends FavDoc {
  from: "debate" | "practice";
  n: number;
}

/** What a flag keeps of the pair it was made on, and the tab it was made in. */
export interface FlagPair {
  a: string;
  b: string;
  relation: RelKey;
  tab: "debate" | "practice";
}

/** collection `flags`: the learner's note on something Claude said. */
export interface FlagDoc {
  id: string;
  caseKey?: string;
  thing?: string;
  part?: string;
  model?: string;
  runId?: string | null;
  /** which turn or part of the case: always stored as a string (a turn index, a relation, a cell) */
  n?: string | null;
  shown?: string;
  note?: string;
  suggest?: string;
  /** the pair the flag was made on, by its labels; not a whole pair */
  pair?: FlagPair | null;
  /** set when the page wrote the flag by itself, not the learner: "quorum" for an example the check lab is divided about (`part` is "quorum" then) */
  auto?: string;
  at: string;
  updatedAt: string;
  state: string;
}

/** collection `labruns`: one model's answer to one case of the check lab, or the judge's. Loosely typed. */
export interface LabRunDoc {
  kind: string;
  caseKey: string;
  model: string;
  at: string;
  ok?: boolean;
  valid?: boolean;
  [extra: string]: unknown;
}

/** What the page is showing for the current pair: the answer state, loosely typed. See practice/screen.js and debate/flow.js. */
export interface Ui extends AnswerView {
  /** present once the answer is checked, which is the only time the tutor and the check lab are reachable */
  res: AnswerView["res"] & { [field: string]: any };
  /** debate: the four answers, with their timings (ms, msEx, limit) */
  ans?: (DebateAnswer & { [field: string]: any })[];
  checked?: boolean;
  /** the document of the checked answer, written to `answers` or `debates` and completed later by the tutor's verdicts */
  doc?: AnswerDoc | DebateDoc;
  [field: string]: any;
}

/** The pair on screen and how it got there. */
export interface Current {
  p: Pair;
  debate?: boolean;
  legacy?: boolean;
  retry?: boolean;
  tag?: string;
  [extra: string]: unknown;
}

/** The Skip hint: what to restore on Undo. */
export interface SkipNote {
  p: Pair;
  key: string;
  had: SkipDoc | undefined;
  debate: boolean;
  ui: Ui | null;
  prev: { cur: Current | null; rq: Pair[]; rt: string };
  tid: number;
}

/** The page's shared state: every variable that used to be module-level (see state.js). */
export interface State {
  // the term data and its lookup tables; the same five fields as DataIndex, so this object can be passed as one
  DATA: DrillData | null;
  CAT: Record<string, Cat>;
  ITEMIDX: Record<string, Item>;
  ALIASIDX: Record<string, Item>;
  LABELIDX: Record<string, string>;
  POOL: PoolEntry[] | null;

  // what the platform offers
  db: Db | null;
  sample: Sample | null;
  /** the check lab's model calls (platform.lab); the artifact's `sample` where the platform has no `lab`. Null hides the lab. */
  labSample: LabSample | null;
  /** which build this is (platform.about), shown in Options; null until the server has been asked, and on a build with nothing to tell apart */
  about: About | null;
  /** updating the installed app in place (platform.updates), shown in Options; null where there is no installed copy */
  updates: Updates | null;
  /** opens the prompt for the Magic Key (platform.unlock) while this device has none; `tutor` is whether the server has a tutor waiting for it */
  unlock: Unlock | null;
  /** while this device has the Magic Key: take another one, or forget it (platform.keyHeld) */
  keyHeld: KeyHeld | null;
  /** the Magic Key row of Options is asking whether to forget the key */
  keyAsk: boolean;
  /** the note on the name "Magic Key" is open in the Options row */
  mkNote: boolean;
  /** a question to the app's own server (platform.tutor), when the place has one; `sample` is used first */
  tutor: Tutor | null;
  /** optional sign-in with a server copy of the documents (platform.account), when the place has one */
  account: Account | null;
  /** the same for the Account row (src/ui/account.ts) */
  acct: AccountSlot;

  // the stored collections as the page holds them
  batches: BatchDoc[];
  answers: Record<string, AnswerDoc>;
  debates: Record<string, DebateDoc>;
  favs: Record<string, FavDoc>;
  skips: Record<string, SkipDoc>;
  labruns: Record<string, LabRunDoc>;
  flags: Record<string, FlagDoc>;
  /** what the "Your data" row of Options keeps between renders (src/ui/data-transfer.ts) */
  xfer: TransferSlot;
  gotB: boolean;
  gotA: boolean;
  gotS: boolean;

  // where the page is
  tab: "practice" | "debate" | "review" | string;
  own: string;
  mode: "loading" | "quiz" | "nodata" | "nodb" | string;
  view: "chat" | string | null;
  optsOpen: boolean;
  reviewSeg: string;
  ui: Ui | null;
  cur: Current | null;
  retryQ: Pair[];
  retryTag: string;
  recent: string[];
  lastSig: string;
  fitQ: number;

  // errors from saving
  favErr: string;
  skipErr: string;
  flagErr: string;
  flagPending: number;

  // skips
  skipNote: SkipNote | null;
  hintOff: any;

  // the check lab
  lab: boolean;
  /** a checked answer asks for its explanation by itself (Options, `rd-autoexplain`) */
  autoExplain: boolean;
  labSpotN: number;
  labPause: number;
  labPauseWhy: string;
  labRefC: { text: string; ver: string } | null;

  // display settings, some kept on the device
  nota: "codes" | "sets" | "logic" | string;
  defLang: "en" | "enru" | string;
  wording: "mine" | "cons" | "plain" | string;
  showAB: boolean;
  fullPh: boolean;
  recentOpen: boolean;

  // the blitz timer
  timerMs: number;
  relMs: number;
  blitz: boolean;
  timeEdit: boolean;
  timeDraft: string;
}
