// The shapes the page works with: the documents it stores (the collections `answers`, `debates`, `batches`,
// `favorites`, `skips`, `labruns`, `flags`, `progress`), the pair on screen, and the shared `state`. Stored shapes are part of
// the data users already have: never rename a collection or change a document without a migration (CLAUDE.md).
// Fields written by older versions of the page may be missing, so most fields besides the keys are optional.
import type { Cat, DrillData, Item } from "../ai-shared/data";
import type { ExampleIndex } from "../ai-shared/examples";
import type { About, StorageHealth, Unlock, Updates } from "../platform/types";
import type { AnswerView, DebateAnswer } from "../ai-shared/card";
import type { CellId, RelKey } from "../ai-shared/relations";
import type { InstanceQuestion } from "../domain/instance";
import type { PlaceGrade, PlaceQuestion } from "../domain/place";
import type { Syllogism, Pervasion, Reply, Situation, Wording } from "../domain/syllogism";
import type { Pair, PoolEntry, Verdict } from "../domain/types";
import type { ExerciseRun, Guidance, NegOutcome, StageRun } from "../domain/stages";
import type { Intro, Stop } from "../domain/intro";
import type { Account, Db, Known, Reports, Sample, Tutor } from "../platform/types";
import type { QuorumRecord } from "../ai/protocol";
import type { AccountSlot } from "../ui/account";
import type { TransferSlot } from "../ui/data-transfer";
import type { KeyHeld } from "../platform/types";
import type { Look } from "./path/look.ts";
import type { Rig } from "./sound/courtyard.ts";

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
  mode?: "debate" | "find" | "categories" | "syllogism" | "instance";
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

/** collection `answers`, mode "instance": a set of categories and the thing named for it (Find an instance), left out of the Relations lists like Find a pair's. */
export interface InstanceDoc {
  /** the id of the document */
  pairId: string;
  mode: "instance";
  /** the categories asked (ids), in the order shown, and the labels they were shown under */
  cats: string[];
  labels: string[];
  /** something is in all of them; false: nothing can be */
  possible: boolean;
  /** what the learner wrote; null for "nothing is" */
  said: string | null;
  /** the thing as the data names it (a practice item or a reference example); absent when the data does not know it */
  thing?: string;
  /** right, wrong, or "pend": a thing the data cannot place in every category */
  grade: "ok" | "bad" | "pend";
  /** Sprint: the time ran out, and what was written stood */
  timeout?: boolean;
  at: string;
}

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
  /** every category offered, whether the thing is in it, and what the learner said */
  rows: { cat: string; yes: boolean; said: boolean }[];
  /** in answers from when Categories had a second step (the most specific category), when it was asked: the categories the thing is in, the most specific of them, and the one the learner picked */
  narrow?: { options: string[]; right: string; picked: string };
  /** every category was right */
  s1: boolean;
  /** the second step was right, in answers from when it was asked */
  s2?: boolean;
  /** how the thing went: right when every category was right (in older answers, when both steps asked were right) */
  grade: PlaceGrade;
  /** how the categories were asked: all at once or one by one */
  ask: "all" | "one";
  /** Sprint: the time ran out on the screen, or on a category (it counted as no) */
  timeout?: boolean;
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

/** collection `progress`, the one document `learner`: how far the learner has come, the same on every device signed in to one account (practice/progress.ts). No `at`, on purpose: see there. */
export interface ProgressDoc {
  /** the stages on (`rd-stages`) */
  stages: number[];
  /** the course terms met at their stops (`rd-terms`) */
  terms: Intro;
  /** the step of the negation track (`rd-negation`) */
  negation: "off" | "one" | "both";
  /** the run towards an offer of the stages (`rd-stage-run`; src/domain/stages.ts) */
  run: StageRun;
  /** each exercise's run and right answers, by its key ("practice", "debate" ...; `rd-ex-runs`) */
  exercises: Record<string, ExerciseRun>;
  /** each exercise's level of guidance, where the learner picked one (`rd-guided`; none: the level its right answers bring, practice/guided.ts) */
  guided: Record<string, Guidance>;
  /** when the offer of a negation step was last answered (`rd-neg-offer`; "": never) */
  negOfferAt: string;
  /** the most course terms open at once before a new one waits (`rd-pace`; none: src/domain/intro.ts, OPEN_CAP) */
  pace?: number;
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
  /** the stop of a course term that came after this answer, before the next question (practice/stops.ts): Next goes on from it */
  stop?: Stop | null;
  /** the next stage on its way in after this answer (practice/stage-offer.ts): due, then a station of its own before the next question, then taken at Next */
  up?: StageUp | null;
  /** the exercise whose guidance went a level down by itself with this answer, and to which (practice/guided.ts): the result says so */
  guideDown?: { ex: string; to: Guidance; right: number } | null;
  [field: string]: any;
}

/** The next stage on the Path (practice/stage-offer.ts): `shown` once its station is on screen, `first` when it is the learner's first (the stages are explained), `stayed` when they chose to stay on the stage they are on (`was` is the run before, which Undo goes back to). */
export interface StageUp { stage: number; shown?: true; first?: boolean; stayed?: true; was?: StageRun }

/** A Relations answer as the run towards a negation step counts it (practice/negations.ts): when it was given, whether the relation was right, and whether a side was negated. */
export interface NegResult extends NegOutcome {
  pairId: string;
  at: string;
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
  /** Find an instance (src/app/instance): there is no pair in `p` (it is null), the categories on screen are `iq` (absent while the data has none to ask) */
  inst?: boolean;
  iq?: InstanceQuestion;
  /** Syllogisms (src/app/syllogism): there is no pair in `p` (it is null), the syllogism on screen is `c` */
  syllogism?: boolean;
  c?: Syllogism;
  legacy?: boolean;
  retry?: boolean;
  tag?: string;
  [extra: string]: unknown;
}

/** Where the Progression page of the Path stands (path/progression.tsx): where it was opened from, so that Back goes there again, and the term card open over it. */
export interface ProgressionAt {
  /** opened from the roadmap's rings (Back shows the roadmap again), or from the top bar's ring sheet or another link in an exercise (Back goes to the exercise) */
  from: "road" | "sheet";
  /** the screen under it when it opened: the exercise, or Review; Back returns to it */
  tab: string;
  /** the stage whose line it brings into view when it next draws; -1 when none, -2 for the Stages section (path/progression.tsx, AT_STAGES) */
  at: number;
  /** the term whose card is open over it (a category id of the data), or "" */
  term: string;
  /** how far the page was scrolled when a term's card opened over it, to be set again when the card closes; -1 when nothing waits */
  y: number;
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
  /** where the device's storage stands (platform.storage), said on a pinned line and Settings' Storage page; null where the place has no storage of its own */
  storage: StorageHealth | null;
  /** takes the Magic Key on Settings' Magic Key page (platform.unlock) while this device has none; `tutor` is whether the server has a tutor waiting for it */
  unlock: Unlock | null;
  /** while this device has the Magic Key: take another one, or forget it (platform.keyHeld) */
  keyHeld: KeyHeld | null;
  /** the Magic Key row of Options is asking whether to forget the key */
  keyAsk: boolean;
  /** the Magic Key page opened where the key is needed (shell/options.js, openKey): its way back goes to `back` (closing Settings), `then` runs once a key
   *  is taken, `why` is what went wrong with a key at the start; null when the page was opened from Settings' list */
  keyFrom: { back: "road" | "review" | "exercise"; then: (() => void) | null; why: string } | null;
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
  /** the course terms this device has met at their stops, and when each comes again (`rd-terms`, src/domain/intro.ts); null until the term data is in (practice/stops.ts, startStops) */
  intro: Intro | null;
  /** the copies of the progression this page wrote lately (practice/progress.ts): a copy in the store that is none of them came from another device or tab */
  progressSent: string[];
  /** the Reset progression row of the Stages page: asking whether to reset ("ask"), or saying it is done */
  resetAsk: "" | "ask" | "done";
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
  /** every document of the collection `answers`, also those of Find a pair and, in another shape, of Categories, Find an instance and Syllogisms (`isCategories`, `isInstance`, `isSyllogism`, core/util.js); the lists that mean Relations leave those out */
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
  /** the Path's Settings: the line whose own page is open (path/settings.tsx), or null for the sections */
  optsPage: string | null;
  /** What's new was opened from the roadmap's line or after an update (path/news.tsx), so its way back goes where it was opened from, not to the Settings list */
  newsDirect: boolean;
  /** the newest item of What's new this device had shown when the page opened: the items above it are marked new (null: none) */
  newsSince: string | null;
  /** What's new opened right after Update: the items it brought snap onto the path */
  newsArrive: boolean;
  /** the question (`cur`) the exercise's update line was first shown on */
  pinAt: unknown;
  /** the learner went on to another question with the update line there: it shows on the roadmap only */
  pinGone: boolean;
  /** this is a Preview (staging, a pull request build), not the real app (platform.preview) */
  preview: boolean;
  /** Blitz, the tutor and voice: each exercise's own values (practice/per-exercise.ts, `rd-per-ex`) */
  perEx: Record<string, { blitz?: boolean; autoExplain?: boolean; read?: boolean; answer?: string }>;
  /** the shared values of those, for an exercise that has none of its own yet (null before the start) */
  perBase: { blitz: boolean; autoExplain: boolean; read: boolean; answer: string } | null;
  /** Experiments shown in the Path's Settings of the real app, after a hold on Version with the Magic Key (`rd-exp`, device only) */
  expShown: boolean;
  sessOpen: boolean;
  sessPage: string | null;
  skipAsk: boolean;
  menuOpen: boolean;
  fromRoad: boolean;
  /** what touched the page last: a finger or a pen, or a mouse; empty before anything has (the Path's knocks are for a finger, path/gesture.ts) */
  hand: "" | "touch" | "mouse";
  navDepth: number;
  navSkip: number;
  navQ: boolean;
  navBare: boolean;
  navGuard: { destroy(): void; requestClose(): void } | null;
  navEsc: number;
  leaveAsk: boolean;
  navBack: boolean;
  motion: boolean;
  ui: Ui | null;
  cur: Current | null;
  retryQ: Pair[];
  retryTag: string;
  recent: string[];
  /** the relations Find a pair asked for lately, oldest first */
  findAsked: RelKey[];
  /** names of the things Categories asked lately, oldest first: the draw passes them over while others remain (categories/flow.js) */
  catsRecent: string[];
  /** how Categories asks step 1: all at once, or one category at a time (`rd-cats-ask`) */
  catsAsk: "all" | "one";
  /** the run towards an offer of the stages, from the answers of every exercise (`rd-stage-run`, practice/stage-offer.ts) */
  stageRun: StageRun;
  /** each exercise's run of right answers (until it has warmed up) and its right answers in all (`rd-ex-runs`, practice/stage-offer.ts) */
  exRuns: Record<string, ExerciseRun>;
  /** each exercise's level of guidance on the Path, where the learner picked one (`rd-guided`, practice/guided.ts); none: the level its right answers bring */
  guided: Record<string, Guidance>;
  /** keys of the sets of categories Find an instance asked lately, oldest first: the draw passes them over while others remain (instance/flow.ts) */
  instRecent: string[];
  /** ids of the syllogisms drawn lately, oldest first: the draw leans away from them (syllogism/flow.js) */
  syllogismRecent: string[];
  /** how a syllogism is worded (`rd-syllogism-wording`) */
  syllogismWording: Wording;
  /** the relation Find a pair keeps asking for, picked by the learner (`rd-findrel`); null: a different one each time */
  findRel: RelKey | null;
  /** a negated name of more than one word is written in brackets (`rd-neg-brackets`, on) or without ("non-wooden things") */
  negBrackets: boolean;
  /** the negation track of Relations and Pervasions (`rd-negation`): off, A or B negated in some pairs ("one"), or also both sides ("both") */
  negation: "off" | "one" | "both";
  /** the Relations answers checked on this page, oldest first: the run towards the offer of a negation step counts them before the database has handed them back (practice/negations.ts) */
  /** what a result that was not shown (a time-up at None) left due: it goes on the next attempt drawn (practice/queue.js, moveOn) */
  carry: { offer: Ui["offer"]; guideDown: Ui["guideDown"] } | null;
  relSession: NegResult[];
  /** when the learner last answered the offer of a negation step (a time, `rd-neg-offer`): only answers after it count towards the next offer */
  negOfferAt: string;
  /** the most course terms open at once before a new one waits (the Progression page, `rd-pace`; src/domain/intro.ts, PACES) */
  pace: number;

  // errors from saving
  favErr: string;
  skipErr: string;
  flagErr: string;
  flagPending: number;
  /** when the server was last asked for the replies to the sent flags (ms since the epoch), and whether that is under way */
  repliesAt: number;
  repliesBusy: boolean;

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
  /** the Sounds switch in Settings (`rd-sounds`): a short sound for each result, new term, stage and answer of Claude (src/app/sound) */
  sounds: boolean;
  /** the audio context and the sound playing now (src/app/sound/play.ts) */
  snd: SoundState;
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
  /** the other languages a term's name is shown in: "bo", "skt", "zh" (domain/languages.ts) */
  langs: string[];
  wording: "mine" | "cons" | "plain" | string;
  showAB: boolean;

  // Sprint (called Blitz in the code): the switch of the exercise on screen, and the times
  blitz: boolean;
  times: Record<import("../domain/sprint.ts").TimeKind, number>;

  // reading the questions aloud and answering by voice (shell/voice.js)
  voice: VoiceState;

  // the Path (src/app/path)
  /** how the Path looks: the defaults with the lab's settings this device keeps (`rd-look`); null until the Path first draws */
  look: Look | null;
  /** a short note at the Path's foot ("Skipped; it waits in Review"), gone after a moment */
  pathNote: { text: string; tid: ReturnType<typeof setTimeout> } | null;
  /** the Path's next draw, waiting for the next frame (refreshPath); 0 when none waits */
  pathQ: number;
  /** the section of Review the Path shows: today, overview, mistakes, favs, skips, flags */
  pathSeg: string;
  /** the Progression page in place of Review (path/progression.tsx), or null; any setTab closes it */
  pathProg: ProgressionAt | null;
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
  /** applies it, as the tap or the typed answer it stands for; returns what takes the step back as it was (Change on the chip), or nothing for a step that cannot be taken back (the one that checks the answer) */
  apply: () => (() => void) | void;
  /** the pause after which it goes on by itself (Hands-free, or when Options says so) */
  auto: { ms: number; t0: number; tid: ReturnType<typeof setTimeout> } | null;
}

/** The step a spoken answer took, kept for a few seconds above the foot with a way back (shell/voice.js). */
export interface TakenChip {
  /** what was taken */
  label: string;
  /** the screen it was said for */
  from: string;
  /** the screen the step led to, once it has been drawn; the chip goes when the screen is another */
  next: string | null;
  /** when the chip was shown, for its running line */
  t0: number;
  /** takes the step back */
  undo: () => void;
  tid: ReturnType<typeof setTimeout> | null;
}

/** Voice settings (kept on the device) and what the voice is doing on the screen now. */
export interface VoiceState {
  /** the Voice switch in Settings: until it is on, none of the voice does anything */
  on: boolean;
  /** Read aloud is paused by holding the speaker at the foot, for this visit only */
  muted: boolean;
  /** read each question aloud */
  read: boolean;
  /** answer by voice: not at all, when the microphone button is tapped, or listening after each question */
  answer: "off" | "tap" | "auto";
  /** a heard answer waits for Yes, goes on by itself after a pause, or by what the mode is: it waits when the mic is tapped and goes on in Hands-free */
  confirm: "split" | "wait" | "auto";
  /** the field is held down for hold to talk (longer than a tap) */
  hold: boolean;
  /** the press on the field now: when it began, whether it was listening already (a press then stops it), whether it has lasted longer than a tap, which pointer it is, and whether an answer waited (a tap is Yes) and was going on by itself (the touch then only holds it) */
  press: { t0: number; was: boolean; long: boolean; tid: ReturnType<typeof setTimeout> | null; pid: number; yes: boolean; auto: boolean } | null;
  /** the press on the strip that says the question again now: holding it pauses the reading, and the click that follows is then not a tap */
  spress: { long: boolean; tid: ReturnType<typeof setTimeout> | null } | null;
  /** the step the last spoken answer took, with the way back; null when there is none */
  chip: TakenChip | null;
  /** the person has pressed the mic once on this device, so that the hint under the answers is no longer needed */
  tried: boolean;
  /** the next screen is drawn without reading its question (a step was taken back; the mic opens at once) */
  noRead: boolean;
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
  /** ends the current listening; `release` is there when it can be held (a tap lets go of it) */
  stop: { stop(): void; abort(): void; release?(): void } | null;
  /** the speaking or listening under way; a callback of one that was stopped finds another here and does nothing */
  tok: object | null;
  /** the Practice options listen for the browser's list of voices (once they have been shown) */
  hooked: boolean;
}

/** The audio context the sounds play into, made on the first touch, and what is sounding now (src/app/sound/play.ts). */
export interface SoundState {
  ctx: AudioContext | null;
  rig: Rig | null;
  /** the sound playing now: a new one cuts it */
  live: GainNode | null;
  /** when the sound playing now is over for a listener (audio clock, s) */
  until: number;
  /** until when it must not be cut: a time-up (audio clock, s) */
  keep: number;
  /** this browser has no Web Audio or would not make a context */
  failed: boolean;
  /** the listeners for the first touch, click or key are in place */
  armed: boolean;
}
