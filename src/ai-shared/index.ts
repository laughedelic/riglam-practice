// The code that decides what the tutor sees and can look up, as pure functions of the term data. Used by the page
// (src/app) and by whatever else talks to the model on the learner's behalf, such as the Worker. Nothing here reads
// the page, the DOM, storage or the network; tests/unit/ai-shared.test.ts keeps it so.
export type { Cat, DrillData, Item, Term } from "./data";
export { NOT, QCELL, QMINE, qPlain } from "./debate";
export type { QToken } from "./debate";
export { catFacts, termFacts } from "./facts";
export type { Facts } from "./facts";
export { american, catByLabel, classNames, makeIndex, matchItem, norm, pairCats, spelled, stripDet, upChain } from "./lookup";
export type { DataIndex } from "./lookup";
export { CELL_NAME, DEBATE_ASK, DEBATE_NOTE, FIRST_ASK, GUIDE } from "./prompts";
export { CELLS, REL, cellLabel, refOf } from "./relations";
export type { CellId, PairLike, RelKey, Relation } from "./relations";
export { cardBody, cardNotes, explainAsk, finePoints, tutorCard } from "./card";
export type { AnswerView, DebateAnswer } from "./card";
export { tutorTools } from "./tools";
export type { TutorTool } from "./tools";
export { termMentions } from "./mentions";
export type { Mention } from "./mentions";
