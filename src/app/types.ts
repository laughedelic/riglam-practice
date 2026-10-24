// The shapes the page works with: the documents it stores (the collections `answers`, `debates`, `batches`,
// `favorites`, `skips`, `labruns`, `flags`), the pair on screen, and the shared `state`. Stored shapes are part of
// the data users already have: never rename a collection or change a document without a migration (CLAUDE.md).
// Fields written by older versions of the page may be missing, so most fields besides the keys are optional.
import type { Cat, DrillData, Item } from "../ai-shared/data";
import type { ExampleIndex } from "../ai-shared/examples";
import type { About, Unlock, Updates } from "../platform/types";
import type { AnswerView, DebateAnswer } from "../ai-shared/card";
import type { CellId, RelKey } from "../ai-shared/relations";
import type { PlaceGrade, PlaceQuestion } from "../domain/place";
import type { Syllogism, Pervasion, Reply, Situation, Wording } from "../domain/syllogism";
import type { Pair, PoolEntry, Verdict } from "../domain/types";
import type { Account, Db, Known, Reports, Sample, Tutor } from "../platform/types";
import type { QuorumRecord } from "../ai/protocol";
import type { AccountSlot } from "../ui/account";
import type { TransferSlot } from "../ui/data-transfer";
import type { KeyHeld } from "../platform/types";
import type { Look } from "./path/look.ts";

export type { Pair, PoolEntry, Verdict };

export interface CellDoc {
  text: string;
  none?: boolean;
  verdict?: Verdict;
  /** "claude" when Claude's check settled the verdict (now, or earlier through the server's learned facts), "course" when the course's reference examples did */
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
  /** "debate": a Pervasions answer (collection `debates`); "find": a Find a pair answer, kept in `answers` and left out of the Relations lists */
  mode?: "debate" | "find" | "categories" | "syllogism";
  a: string;
  b: string;
  catA?: string | null;
  catB?: string | null;
  /** the relation the learner chose, null when time ran out; in Find a pair, the relation they were asked for */
  chosen: RelKey | null;
  /** the correct relation; in Find a pair, the one the named pair has (the one asked for, until the tutor has judged a pair of the learner's own) */
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
  /** Find a pair: the pair is the learner's own and the tutor has not yet said whether it has the relation asked for (`correct` is not settled) */
  relOpen?: boolean;
  /** the tutor's explanation, kept with the answer */
  explain?: string;
  verifiedAt?: string;
}
export type DebateDoc = AnswerDoc & { mode: "debate"; qs: QuestionDoc[] };

/** collection `answers`, mode "categories": one thing placed (the Categories exercise), left out of the Relations lists like Find a pair's. */
export interface CategoriesDoc {
  /** the id of the document */
  pairId: string;
  mode: "categories";
  /** the thing: a practice item or a reference example, as the data names it */
  thing: string;
  /** a reference example's level, 1 to 4; 1 for a practice item, a plain thing */
  level: number;
  /** the thing's stage on the learning ladder, 1 to 9; absent in answers from before the stages */
  stage?: number;
  /** step 1: every category offered, whether the thing is in it, and what the learner said */
  rows: { cat: string; yes: boolean; said: boolean }[];
  /** step 2, when it was asked: the categories the thing is in, the most specific of them, and the one the learner picked */
  narrow?: { options: string[]; right: string; picked: string };
  /** step 1 was all right */
  s1: boolean;
  /** step 2 was right; absent when it was not asked */
  s2?: boolean;
  /** how the thing went: right when both parts asked are right */
  grade: PlaceGrade;
  /** how step 1 was asked: all at once or one by one */
  ask: "all" | "one";
  at: string;
}

/** collection `answers`, mode "syllogism": one answer to a syllogism (the Syllogisms exercise), left out of the Relations lists like Find a pair's. `catA` is the category of the reason and `catB` that of the predicate, as the draw reads them. */
export interface SyllogismDoc {
  /** the id of the document */
  pairId: string;
  mode: "syllogism";
  /** the syllogism as the domain names it, "reason|predicate|subject" */
  id: string;
  subject: string;
  reason: string;
  predicate: string;
  catA: string;
  catB: string;
  situation: Situation;
  /** the reply that was right */
  answer: Reply;
  /** the reply the learner gave; null when the time ran out first (Blitz) */
  said: Reply | null;
  correct: boolean;
  /** Blitz: the time ran out before a reply (counts as wrong) */
  timeout?: boolean;
  /** Blitz: how long the reply took, in ms */
  ms?: number;
  /** "part": the reply was right, but the counter-example offered with it was not */
  grade: "ok" | "part" | "bad";
  /** the learner named a fault that is there, but not the first one to name */
  missedPoint?: boolean;
  pervasion: Pervasion;
  level: 1 | 2;
  links: number;
  wording: Wording;
  /** the counter-example offered after a right "there is no pervasion", and how the page judged it */
  example?: { text: string; verdict: "ok" | "bad" | "cmp" };
  /** the tutor's explanation, kept with the answer */
  explain?: string;
  at: string;
}

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
  from: "debate" | "practice" | "find";
  /** Find a pair: the relation that was asked for when the pair was skipped (the key is `f_` plus that relation and the words, not the categories) */
  asked?: RelKey;
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
  /** for an answer in the chat: the learner's question it answered (written since flags are listed in Review) */
  asked?: string;
  note?: string;
  suggest?: string;
  /** the pair the flag was made on, by its labels; not a whole pair */
  pair?: FlagPair | null;
  /** set when the page wrote the flag by itself, not the learner: "quorum" for an example Quorum is divided about (`part` is "quorum" then; `runId` is the record of the run) */
  auto?: string;
  at: string;
  updatedAt: string;
  state: string;
  /** when the flag was last sent to the app's server (ai/flag-reports.js); it counts as sent while this is not earlier than `updatedAt` */
  sentAt?: string;
  /** where the server's review of the sent flag stands and the reply to read under it (ai/flag-reports.js); written by the page, not by the learner, and dropped when the flag is edited */
  review?: { state: string; reply?: string; at?: string };
}

/** collection `labruns`: one model's answer to one case of the earlier Quorum, run by the page itself, or the judge's. Older versions of the page wrote it under that name, which a stored collection keeps; this one only keeps what is there (export, sync). Loosely typed. */
export interface QuorumRunDoc {
  kind: string;
  caseKey: string;
  model: string;
  at: string;
  ok?: boolean;
  valid?: boolean;
  [extra: string]: unknown;
}

/** Quorum for the answer on screen (src/app/ai/quorum.js): the calls that have answered while it runs, then its record. */
export interface UiQuorum {
  /** the explanation is being asked of Quorum */
  busy: boolean;
  steps: { name: string; ok: boolean }[];
  /** the whole run, once it is in; null while it runs and when the one model answered instead */
  record: QuorumRecord | null;
  /** Quorum was on, but the one model answered: its budget for the day is used */
  single?: "budget";
}

/** What the page is showing for the current pair: the answer state, loosely typed. See practice/screen.js and debate/flow.js. */
export interface Ui extends AnswerView {
  /** Quorum's run for this answer, once the explanation was asked with Quorum on */
  quorum?: UiQuorum;
  /** present once the answer is checked, which is the only time the tutor is reachable */
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
  /** Find a pair (src/app/find): there is no pair in `p` (it is null, though typed as a pair) until the learner has named one */
  find?: boolean;
  /** Categories (src/app/categories): there is no pair in `p` (it is null), the thing and its categories on screen are `q` */
  cats?: boolean;
  q?: PlaceQuestion;
  /** Categories: what the draw of `q` drew from (categories/flow.js, drawKey); a draw that found nothing is tried again once it changes */
  tried?: string;
  /** Syllogisms (src/app/syllogism): there is no pair in `p` (it is null), the syllogism on screen is `c` */
  syllogism?: boolean;
  c?: Syllogism;
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
  /** Find a pair: Undo gives back the screen that was skipped (`prev.ui`, with the examples written) and the relations asked lately (`prev.fa`) */
  find?: boolean;
  ui: Ui | null;
  prev: { cur: Current | null; rq: Pair[]; rt: string; ui?: Ui | null; fa?: RelKey[] };
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
  /** what the app's server learned of examples from earlier checks (platform.known), asked before the tutor about an example the page could not check */
  known: Known | null;
  /** the course's reference examples this device holds (platform.examples), by name; null when it has none (src/app/core/examples.js) */
  EX: ExampleIndex | null;
  /** the stages of the learning ladder every exercise draws from, any mix, at least one (the practice options, `rd-stages`; src/domain/stages.ts) */
  stages: number[];
  /** the pairs left that lean to three possibilities after the highest stage went up (`rd-stage-lean`) */
  stageLean: number;
  /** the stages came from the settings of a device before the ladder and were not changed since (`rd-stages-kept`): the draw weighs every pair the same, as it did */
  stagesKept: boolean;
  /** that device had Syllogisms on everyday things (`rd-syllogism-level` "1"); it holds until the stages are changed */
  syllogismEveryday: boolean;
  /** sends flags to the app's server (platform.reports), when the place has a server for them and this device has the Magic Key */
  reports: Reports | null;
  /** keeps the removal of a flag for a later start that has `reports` (platform.withdrawReport) */
  withdrawLater: ((id: string) => void) | null;
  /** optional sign-in with a server copy of the documents (platform.account), when the place has one */
  account: Account | null;
  /** the same for the Account row (src/ui/account.ts) */
  acct: AccountSlot;

  // the stored collections as the page holds them
  batches: BatchDoc[];
  /** every document of the collection `answers`, also those of Find a pair and, in another shape, of Categories and Syllogisms (`isCategories`, `isSyllogism`, core/util.js); the lists that mean Relations leave those out */
  answers: Record<string, AnswerDoc>;
  debates: Record<string, DebateDoc>;
  favs: Record<string, FavDoc>;
  skips: Record<string, SkipDoc>;
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
  sessOpen: boolean;
  sessPage: string | null;
  skipAsk: boolean;
  menuOpen: boolean;
  menuPin: boolean;
  menuPeek: boolean;
  coachOpen: boolean;
  navDepth: number;
  navSkip: number;
  navQ: boolean;
  navBack: boolean;
  motion: boolean;
  reviewSeg: string;
  ui: Ui | null;
  cur: Current | null;
  retryQ: Pair[];
  retryTag: string;
  recent: string[];
  /** the relations Find a pair asked for lately, oldest first */
  findAsked: RelKey[];
  /** names of the things Categories asked lately, oldest first: the draw passes them over while others remain (categories/flow.js) */
  catsRecent: string[];
  /** the things of Categories finished on this page, oldest first: the run towards a level offer counts them before the database has handed them back (categories/flow.js) */
  catsSession: CategoriesDoc[];
  /** how Categories asks step 1: all at once, or one category at a time (`rd-cats-ask`) */
  catsAsk: "all" | "one";
  /** when the learner last answered the offer of another stage (a time, `rd-cats-offer`): only answers after it count towards the next offer */
  catsOfferAt: string;
  /** ids of the syllogisms drawn lately, oldest first: the draw leans away from them (syllogism/flow.js) */
  syllogismRecent: string[];
  /** how a syllogism is worded (`rd-syllogism-wording`) */
  syllogismWording: Wording;
  /** the structure named under the sentence, and what each reply says in S, P and R (`rd-syllogism-guide`) */
  syllogismGuide: boolean;
  /** the relation Find a pair keeps asking for, picked by the learner (`rd-findrel`); null: a different one each time */
  findRel: RelKey | null;
  /** Find a pair offers the terms of the course while the pair is typed (Options, `rd-findsuggest`) */
  findSuggest: boolean;
  /** a negated name of more than one word is written in brackets (`rd-neg-brackets`, on) or without ("non-wooden things") */
  negBrackets: boolean;
  /** the negation track of Relations (`rd-negation`): off, B negated in some pairs ("one"), or also A and B ("both") */
  negation: "off" | "one" | "both";
  lastSig: string;
  /** the attempt the last render drew: the tutor's panel closes with a pair that had a conversation */
  lastUi: any;
  fitQ: number;

  // errors from saving
  favErr: string;
  skipErr: string;
  flagErr: string;
  flagPending: number;
  /** when the server was last asked for the replies to the sent flags (ms since the epoch), and whether that is under way */
  repliesAt: number;
  repliesBusy: boolean;

  // skips
  skipNote: SkipNote | null;

  // Quorum and the explanation
  /** the app's server offers Quorum (platform.quorum) */
  quorumOffered: boolean;
  /** the server offers Quorum as an opt-in: off on a device until the device turns it on (a Preview has it on until the device turns it off) */
  quorumOptIn: boolean;
  /** what this device chose in Options (`rd-quorum`): null for not yet, then the server's default applies */
  quorumChoice: boolean | null;
  /** Quorum is on for this device: its own choice, else the server's default */
  quorum: boolean;
  /** a checked answer asks for its explanation by itself (Options, `rd-autoexplain`) */
  autoExplain: boolean;
  /** the app's server keeps the examples the tutor checked (platform.shares): the dialog tells the learner, Settings offers the switch */
  learns: boolean;
  /** this device lets it (Settings, `rd-share`): an explain question names the examples the page could not check; off, it names none */
  shareExamples: boolean;
  /** the learner has answered the dialog, or the switch (`rd-share-told`): until then no question carries the `share` marker */
  shareTold: boolean;
  /** the one-time dialog is open: settles when the learner has answered it (ai/share-notice.js) */
  shareAsk: Promise<void> | null;

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
  sylMs: number;
  blitz: boolean;
  blitzUse: boolean;
  bzHold: number;

  // reading the questions aloud and answering by voice (shell/voice.js)
  voice: VoiceState;

  // the redesign (src/app/path)
  /** which design draws the page: the device's choice (`rd-design`), else the build's default (the Path in a Preview) */
  design: "classic" | "path";
  /** how the Path looks: the defaults with the lab's settings this device keeps (`rd-look`); null until the Path first draws */
  look: Look | null;
  /** a short note at the Path's foot ("Skipped; it waits in Review"), gone after a moment */
  pathNote: { text: string; tid: ReturnType<typeof setTimeout> } | null;
  /** the Path's next draw, waiting for the next frame (refreshPath); 0 when none waits */
  pathQ: number;
  /** the section of Review the Path shows: today, overview, mistakes, favs, skips, flags */
  pathSeg: string;
  /** the rows of Review the Path has unfolded, by key */
  pathOpen: Record<string, boolean>;
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
  /** the Voice switch in Settings: until it is on, none of the voice does anything */
  on: boolean;
  /** Read aloud is paused with the switch in the top bar, for this visit only */
  muted: boolean;
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
  /** the question on the screen is the first one: nothing is read or listened to until the person asks for it (the line under the answer controls, or the microphone) */
  held: boolean;
  /** how often this screen was listened to without an answer coming of it */
  tries: number;
  /** speaking failed for want of a tap on the page: the line under the answer controls says so, with a button to read the question */
  blocked: boolean;
  /** the attempt whose Blitz clock voice holds (a question is being read, or an answer waits), else null */
  clockUi: Ui | null;
  /** the clock is held for the reading of the question */
  rhold: boolean;
  /** ends the current listening */
  stop: { stop(): void; abort(): void } | null;
  /** the speaking or listening under way; a callback of one that was stopped finds another here and does nothing */
  tok: object | null;
  /** the Practice options listen for the browser's list of voices (once they have been shown) */
  hooked: boolean;
}
