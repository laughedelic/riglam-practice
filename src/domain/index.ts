// The rules of the practice as pure functions of the term data: which pairs there are and how the next one is drawn,
// how an answer is checked, and how Claude's verdicts on open examples are read. Used by the page (src/app) and by
// whatever else grades or draws pairs, such as a server. Nothing here reads the page, the DOM, storage or the network;
// tests/unit/domain.test.ts keeps it so. It builds on src/ai-shared (the index of the data, the relations).
export { deriveRel, grade, gradeDebate, judgeText, summarize, termLine } from "./grading";
export type { Judgement } from "./grading";
export type {
  CellResult, DebateInput, GradeDraft, GradeResult, HistoryEntry, Pair, PoolEntry, PoolRel, PracticeAnswer, Verdict,
} from "./types";
export { FEATURE, RECENT_MAX, buildPool, cellsFor, chooseEntry, inUniverse, makePair, nextPair, pairKey, relOfCells } from "./universe";
export type { Clock, DrawState, Rng } from "./universe";
export { cap, gradeOf, isMiss, pick } from "./util";
export { NAME_CELL, VERDICT_RE, applyVerdicts, factNote, fitOf, noteParts, parseFactLine, parseVerdicts, partsText, placeFacts } from "./verdict";
export type { Answer, CellVerdict, FactLine, NoteData, NotePart, Side, Terms } from "./verdict";
export { disputeText, quorumDisputes } from "./quorum";
export type { Dispute, QuorumAnswer, QuorumThing } from "./quorum";
export { catChain, knownClass, listedItem, rung, termPhrase } from "./ladder";
export type { Rung } from "./ladder";
