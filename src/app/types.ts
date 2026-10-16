// The shapes the page works with: the documents it stores (the collections `answers`, `debates`, `batches`,
// `favorites`, `skips`, `labruns`, `flags`), the pair on screen, and the shared `state`. Stored shapes are part of
// the data users already have: never rename a collection or change a document without a migration (CLAUDE.md).
// Fields written by older versions of the page may be missing, so most fields besides the keys are optional.
import type { Cat, DrillData, Item } from "../ai-shared/data";
import type { Unlock } from "../platform/types";
import type { AnswerView, DebateAnswer } from "../ai-shared/card";
import type { CellId, RelKey } from "../ai-shared/relations";
import type { Pair, PoolEntry, Verdict } from "../domain/types";
import type { Account, Db, Sample, Tutor } from "../platform/types";
import type { AccountSlot } from "../ui/account";
import type { TransferSlot } from "../ui/data-transfer";

export type { Pair, PoolEntry, Verdict };
type Feature = import("../ui/features").Feature;

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
  /** opens the prompt for the Magic Key (platform.unlock) while this device has none; `tutor` is whether the server has a tutor waiting for it */
  unlock: Unlock | null;
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
  labSpotN: number;
  labPause: number;
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

  // reading the questions aloud and answering by voice (shell/voice.js)
  voice: VoiceState;
  /** features on trial that are on for this device (src/ui/features.ts) */
  features: Feature[];
}

/** A spoken answer that waits for its confirmation (shell/voice.js). */
export interface PendingAnswer {
  /** the screen it was said for */
  key: string;
  /** "Heard “x”, taken as", or just "Heard" when it is the same */
  said: string;
  /** what it was taken as */
  label: string;
  /** applies it, as the tap or the typed answer it stands for */
  apply: () => void;
  /** the pause after which it goes on by itself, when Options says so */
  auto: { ms: number; t0: number; tid: ReturnType<typeof setTimeout> } | null;
}

/** Voice settings (kept on the device) and what the voice is doing on the screen now. */
export interface VoiceState {
  /** read each question aloud */
  read: boolean;
  /** answer by voice: not at all, when the microphone button is tapped, or listening after each question */
  answer: "off" | "tap" | "auto";
  /** a heard answer waits for Confirm, or goes on by itself after a pause */
  confirm: "tap" | "auto";
  /** the chosen voice, "" for the best one this device has */
  voiceId: string;
  rate: number;
  /** the screen spoken and listened for; a new screen stops what the last one started */
  key: string;
  phase: "idle" | "speaking" | "listening";
  /** what the recognizer hears so far */
  live: string;
  /** the last thing to tell: what was heard and taken, or why nothing was */
  note: string;
  bad: boolean;
  /** the answer that was heard and waits to be confirmed; null when none does */
  pend: PendingAnswer | null;
  /** "three possibilities" was heard and the page asked which of the two is inside the other */
  ask3: boolean;
  /** the person has tapped or pressed a key since the page opened */
  began: boolean;
  /** a question was already shown (the first one is held, not read) */
  seen: boolean;
  /** the question on the screen is the first one: nothing is read or listened to until the person taps the speaker or the microphone */
  held: boolean;
  /** how often this screen was listened to without an answer coming of it */
  tries: number;
  /** speaking failed for want of a tap on the page: the Read again button says so */
  blocked: boolean;
  /** ends the current listening */
  stop: { stop(): void; abort(): void } | null;
  /** the speaking or listening under way; a callback of one that was stopped finds another here and does nothing */
  tok: object | null;
  /** the Options row listens for the browser's list of voices (once it has been shown) */
  hooked: boolean;
}
