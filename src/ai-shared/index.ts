// The code that decides what the tutor sees and can look up, as pure functions of the term data. Used by the page
// (src/app) and by whatever else talks to the model on the learner's behalf, such as the Worker. Nothing here reads
// the page, the DOM, storage or the network; tests/unit/ai-shared.test.ts keeps it so.
export type { Cat, DrillData, Item, Term } from "./data";
export { NOT, QCELL, QMINE, qPlain, qSides } from "./debate";
export type { QToken } from "./debate";
export { catFacts, termFacts } from "./facts";
export type { Facts } from "./facts";
export { american, catByLabel, categoryOf, classNames, leavesOpen, makeIndex, matchItem, nearestItem, norm, noteCats, pairCats, sameNames, similarity, spelled, stripDet, upChain } from "./lookup";
export type { NearItem } from "./lookup";
export type { DataIndex } from "./lookup";
export { CELL_NAME, DEBATE_ASK, DEBATE_NOTE, FIND_ASK, FIND_ASK_OWN, FIND_NOTE, FIND_OWN_NOTE, FIND_REL_NAMES, FIRST_ASK, GUIDE, judgeNote } from "./prompts";
export { CELLS, NEG_CELL, REL, cellLabel, isNeg, negLabel, negSides, plainLabel, refOf } from "./relations";
export type { CellId, Neg, PairLike, RelKey, Relation } from "./relations";
export { cardBody, cardNotes, explainAsk, finePoints, negLine, stageLine, tutorCard } from "./card";
export type { AnswerView, DebateAnswer } from "./card";
export { CAUSES, REVIEW_GUIDE, REVIEW_LIMITS, VERDICTS, parseReview, readReviewAnswer, reviewRequest, storedView } from "./flag-review";
export type { FlagCause, FlagReview, FlagVerdict, ReviewAnswer, ReviewFlag } from "./flag-review";
export { DEFAULT_LEVELS, LEVELS, exampleFacts, examplesFor, makeExampleIndex, matchExamples, normLevels, readExamples, upTo } from "./examples";
export type { Example, ExampleIndex, Examples, Levels } from "./examples";
export { tutorTools } from "./tools";
export type { TutorTool } from "./tools";
export { namesTerm, termMentions, termNamed } from "./mentions";
export type { Mention } from "./mentions";
