// The rules of the practice as pure functions of the term data: which pairs there are and how the next one is drawn,
// how an answer is checked, and how Claude's verdicts on open examples are read. Used by the page (src/app) and by
// whatever else grades or draws pairs, such as a server. Nothing here reads the page, the DOM, storage or the network;
// tests/unit/domain.test.ts keeps it so. It builds on src/ai-shared (the index of the data, the relations).
export { AUTO_FLAGS, autoFlagOf, decideFlag, flagAnswerRef, flagAsked, flagStateText, flaggedPart } from "./flags";
export type { AnswerCol, AutoFlag, FlagOutcome, FlagRef } from "./flags";
export { deriveRel, grade, gradeDebate, judgeText, summarize, termLine } from "./grading";
export type { Judgement } from "./grading";
export type {
  CellResult, DebateInput, GradeDraft, GradeResult, HistoryEntry, Pair, PoolEntry, PoolRel, PracticeAnswer, Verdict,
} from "./types";
export { FEATURE, NEG_SHARE, RECENT_MAX, buildPool, cellsFor, chooseEntry, inUniverse, judgeable, makePair, negateCells, nextPair, pairKey, pairOf, relOfCells } from "./universe";
export type { Clock, DrawState, Rng, Witnesses } from "./universe";
export { cap, gradeOf, isMiss, pick } from "./util";
export { NAME_CELL, VERDICT_RE, applyRelationVerdict, applyVerdicts, factNote, fitOf, noteParts, parseFactLine, parseRelationVerdict, parseVerdicts, partsText, placeFacts } from "./verdict";
export type { Answer, CellVerdict, FactLine, NoteData, NotePart, RelationVerdict, Side, Terms, VerdictSource } from "./verdict";
export { FIND_RELS, drawRelation, findId, findPair, gradeFind, nameThing, sameThing } from "./find";
export type { Named } from "./find";
export { cellFor, cellOfFacts, disputeText, divided, quorumDisputes, quorumRows, readings } from "./quorum";
export type { Dispute, QuorumAnswer, QuorumRow, QuorumThing, Reading } from "./quorum";
export { catChain, classSays, knownClass, listedItem, rung, termPhrase } from "./ladder";
export type { Rung } from "./ladder";
export { FACTS_EPOCH, FACT_LIMITS, factKey, knownLine, learn, opinionOf, ruleSide, servable } from "./learned";
export { failsCell, openExamples, referenceLines, wholeFirst } from "./known";
export type { KnownLine, OpenExample } from "./known";
export type { FactRow, FactSource, FactState, Opinion, Ruling, Strength } from "./learned";
export { DRAWN, cellExample, drawable, exampleStage, examplesFor, placeByClass, stageCounts, witnessesOf } from "./reference";
export { cardExamples } from "./card-examples";
export type { CardExample } from "./card-examples";
export { DEFAULT_STAGES, DEFINITION_STAGE, GUIDE_RIGHT, HOLD_STAGE, LOWER_CREDIT, MAX_STAGE, NEG_STREAK, STAGES, STAGE_LONGER, STAGE_STREAK, STAGE_STREAK_MAX, STAGE_STUMBLE, START_SHARE, cameDown, catOpen, exerciseAfter, freshRun, guideTurnsOff, guidedOn, newShare, normExRuns, movedUp, normGuided, normRun, restartRun, runAfter, runNeed, runWanted, setManual, stageOffer, stageProgress, stayLonger, termsOf, NO_TERMS, catStage, heldBack, itemKnown, itemOn, itemStage, itemStageFor, negationOffer, newCategories, normStages, pairStage, physical, poolAt, stagesOfLevels, toggleStage, topStage } from "./stages";
export type { ExerciseRun, MissKind, Negation, NegOutcome, Stage, StageProgress, StageRun, StageTerms, StagedEntry, Stages, Unmet } from "./stages";
export { AGAIN_AFTER, FIRST_AFTER, GAP_DAYS, MISS_AFTER, OPEN_CAP, SETTLED, SPACING, afterQuestion, againAsked, askedKey, freshIntro, introduced, metTerms, namedKey, needsIntro, newTermDue, nextStageDue, nextStop, normIntro, openTerms, pairGraded, showAgain, stageMarks, stageMet, stageTerms, stageUp, stopCat, stopShown, termCats, termMark, termTree, unmet, wordsFor } from "./intro";
export type { Intro, IntroTerm, StageMark, Stop, StopWhy, TermMark, TreeTerm } from "./intro";
export { LANGS, NAME_LANGS, normLangs, termNames } from "./languages";
export type { LangId, TermName } from "./languages";
export type { Placement } from "./reference";
export { lettersDirection, plainWords, spokenConfirm, spokenDirection, spokenDontKnow, spokenExample, spokenRelation, spokenReply } from "./spoken";
export type { PairTerms, SpokenExample, SpokenReply } from "./spoken";
export { EVERYDAY_STAGES, RELIEF, REPLIES, SITUATIONS, WORDINGS, levelAt, syllogismOf, syllogismPieces, syllogismText, drawSyllogism, gradeSyllogism, gradeTimeout, gradeExample, pervasionConflicts, widest, withoutPhrases } from "./syllogism";
export type { Check, Syllogism, SyllogismDraw, SyllogismHistory, SyllogismResult, ExampleVerdict, Pervasion, Piece, Reply, Situation, Wording } from "./syllogism";
