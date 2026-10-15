// The rules of the practice as pure functions of the term data: which pairs there are and how the next one is drawn,
// how an answer is checked, and how Claude's verdicts on open examples are read. Used by the page (src/app) and by
// whatever else grades or draws pairs, such as a server. Nothing here reads the page, the DOM, storage or the network;
// tests/unit/domain.test.ts keeps it so. It builds on src/ai-shared (the index of the data, the relations).
export { decideFlag, flagAnswerRef, flagStateText, flaggedPart } from "./flags";
export type { AnswerCol, FlagOutcome, FlagRef } from "./flags";
export { deriveRel, grade, gradeDebate, judgeText, summarize, termLine } from "./grading";
export type { Judgement } from "./grading";
export type {
  CellResult, DebateInput, GradeDraft, GradeResult, HistoryEntry, Pair, PoolEntry, PoolRel, PracticeAnswer, Verdict,
} from "./types";
export { FEATURE, RECENT_MAX, buildPool, cellsFor, chooseEntry, inUniverse, makePair, nextPair, pairKey, relOfCells } from "./universe";
export type { Clock, DrawState, Rng } from "./universe";
export { cap, gradeOf, isMiss, pick } from "./util";
export { NAME_CELL, VERDICT_RE, applyVerdicts, parseVerdicts } from "./verdict";
export type { Answer, CellVerdict } from "./verdict";
export { lettersDirection, plainWords, spokenConfirm, spokenDirection, spokenDontKnow, spokenExample, spokenRelation, spokenReply } from "./spoken";
export type { Reply, SpokenExample, SpokenReply, Terms } from "./spoken";
