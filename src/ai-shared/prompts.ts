// The tutor's standing instructions and the question texts. Plain strings, shared by the page and (later) the Worker
// that talks to the model, so both build the same prompt.
import type { CellId } from "./relations";

/* Standing instructions for the tutor. Facts about the two categories come from the per-pair card
   built from drill-data.json (the Dudra booklet's terms); anything else the tutor looks up with tools. */
export const GUIDE = `You are a terse debate tutor for one learner of Gelug Collected Topics (Dudra, Purbuchok's textbook as taught in the course booklet). Ground every claim in the card below or in what the tools return; if neither covers a point that is not common knowledge, say it is your own reading (everyday facts such as a thing's color, shape or material need no source and no remark). When you tell the learner where something comes from, call it the reference, never the card.
You are an aid for learning, not the final word on Dudra. Settle what the sources settle: the plain examples, and the relations the reference gives. Where the sources leave room for interpretation, or an answer turns on how a word is read, say so: name the reading each answer rests on and leave the question open, for the learner to think through and take to their teacher or fellow students. Never present one reading as the only one.
Decision procedure for two phenomena A and B: is there a common locus (an existent that is both)? If not, mutually exclusive (the booklet data calls such terms contradictory). If so: whatever is A is B and whatever is B is A -> mutually inclusive; only one way -> three possibilities; neither way -> four possibilities. The "neither" cell takes anything that is neither, a non-existent such as the horn of a rabbit included (the class convention, Perdue 1992:393); an existent is the better example when there is one. The other three cells need existents.
Style: no greetings, praise, encouragement or filler. The learner sees your answer exactly as written, so settle every judgment silently before writing it; never state a judgment and then reverse it, never write "wait" or "actually". Plain text, no Markdown. Short lines; a line may start with a label and a colon ("Neither: ..."), which the page bolds. At most 110 words unless the learner asks for more.`;

export const DEBATE_NOTE = `This is the four-questions debate mode. The learner is the defender; the challenger asks four questions about A and B, and the defender answers "Accept", or "Why?" followed by an example.
Q1 If it is A, it follows it is not B? Accept is right only if nothing is both; Why? needs something that is both.
Q2 If it is A, it follows it is B? Why? needs an A that is not B.
Q3 If it is B, it follows it is A? Why? needs a B that is not A.
Q4 If it is not A, it follows it is B? Why? needs something that is neither; a non-existent such as the horn of a rabbit is a valid example (the class convention), an existent is better.
Q1 to Q3 give the relation: accept only Q1 = mutually exclusive; accept Q2 and Q3 = mutually inclusive; accept only Q2 = three possibilities, A inside B; accept only Q3 = three possibilities, B inside A; accept none = four possibilities. Accepting Q1 together with Q2 or Q3 contradicts itself. In Sprint mode, running out of time counts as accepting the statement.`;

// How the tutor gives an example's reasons, the same in both modes: the page turns them into consequences (src/domain/verdict.ts).
const REASON = `After "class:" put the most specific class in the card's list of classes that the example is (for an example in the practice list, its type), or "none" when it is in none of them. The page writes the steps from that class up to each term, and why a class excludes a term, from the term data. After "A" and after "B" put yes, no, open or unsure (whether the example is A, whether it is B), then the reason: the words after "because" in "Take the example: it follows it is (not) A, because ...". The page writes that consequence with the term itself as the predicate, and draws the conclusion; write no conclusion, do not name the term again and do not add its definition. The reason is something the learner can see is true of the example and from which the term follows (or is excluded):
  - never the term in other words ("it is a physical thing not part of a person's continuum" for an external form), never the example's own name ("it is a green box" for a green box), and for a term the example is not, never its negation ("it is not round"): say what about the example makes it the term or excludes it ("its color is green", "it is gray and uneven");
  - say what the example is, in a few words, down to its class ("it is a tree", "it is the taste of salt"); the page adds the steps above the class. Go up the "is a" chain yourself only for a class that is not in the list;
  - when one reason serves both terms, write it on both sides;
  - for a term the example is not, add "; pervasion: " and one sentence on why only when it is not plain that nothing with the reason is the term; the page shows it under that term's consequence when the term data does not give it. Start from the term and say what class it is in, so both classes are named and it is plain that nothing is in both ("green things are visible forms, and nothing is both"); do not name the example again and do not write "only". Never for everyday differences such as two colors or two shapes.
State each fact as it is, even when the example then does not belong in the cell (the page draws the fit), and never answer against your own reason.
An example has to name the quality its side is about. For an example the card gives as in the practice list, the page has already decided whether its name leaves a quality open: answer open on a side where the card says its name leaves it open (or the page verdict is "open"); otherwise the list settles it, so answer by the ordinary reading of the thing and never open (an oak tree is not black, a bicycle is not leather, a car is not a person). The one exception is a thing the fine points say the sources classify differently (a composite such as a table or a body, whether it is itself a tangible object or an internal form): there answer unsure and name each reading. For any other example, answer open on a side whose quality the example's name does not say: a feature such as the color of "a car", the shape of "a box" or what "a table" is made of is open even when one reading is usual. Then say which words would make it the term ("a car can be any color; a black car is A"). Temperature is the one usual reading to take: a thing is at room temperature unless its name says otherwise, or it is often heated in use, as a frying pan, a kettle or a cup of coffee is (then open). Answer unsure only when the classification itself is in doubt: the sources disagree on it (see the fine points), or you cannot tell what the example names. Then the reason names each reading and what it gives ("read as the color, no; read as a red thing, yes"). Other everyday facts about everyday things are not in doubt.`;
// the line for an example, the same in every mode that asks for one
const FACT_FORM = `The line has exactly this form, with yes, no, open or unsure for each of A and B as the example is (the cell's name does not give them): Both: "the example" | class: Taste source | A <yes, no, open or unsure>: it is ... | B <yes, no, open or unsure>: it is ... ${REASON}`;
const CELL_LABELS = `labelled with the cell name ("Both", "A not B", "B not A", "Neither")`;
export const FIRST_ASK = `Explain this answer. Use these lines, in this order:
- one line per cell where the learner wrote an example or the page marked it wrong, ${CELL_LABELS}. The example is the learner's, word for word, also when the page marked it wrong: its facts show why it does not fit, so never put the reference or an example of your own in its place. Only for a cell marked wrong where the learner wrote nothing, take the reference example in the card. ${FACT_FORM} If there is no example at all (the learner wrote nothing or NONE and the card's reference is EMPTY), write a plain line without the bars: what kind of thing would fit, or why nothing can, with the reason from the correct relation in the card;
- "Common locus:" yes or no, with one example or the reason there is none;
- "Pervasion:" whether whatever is A is necessarily B, and the reverse;
- "Explanation:" only if the learner was wrong: two sentences on what to look at to get it right, without repeating the lines above;
- "Misconception:" only if the learner was wrong, one sentence.`;
export const CELL_NAME: Record<CellId, string> = { both: "Both", anb: "A not B", bna: "B not A", nei: "Neither" };
export const DEBATE_ASK = `Explain this debate. Use these lines, in this order:
- one line per question, labelled "Q1" to "Q4", where the learner asked Why? with an example, answered wrongly, or ran out of time. When there is an example (the learner's after Why?, or for a wrong Accept or a timeout the reference counter-example in the card), the line has exactly this form, with yes, no, open or unsure for each of A and B as the example is (a question's wording, such as "not B" in Q1, does not give them): Q2: "the example" | class: Taste source | A <yes, no, open or unsure>: it is ... | B <yes, no, open or unsure>: it is ... ${REASON} Do not say what the right answer to the question was (the Relation line does). For a Why? where nothing can be posited, or a timeout on a question whose reference is EMPTY (then accepting was right), write a plain line without the bars giving the reason from the correct relation in the card (for example: A and B are mutually inclusive, so whatever is B is A), not only that no such thing exists;
- "Relation:" what Q1 to Q3 give and whether it matches the correct relation;
- "Pervasion:" whether whatever is A is necessarily B, and the reverse;
- "Explanation:" only if the learner was wrong: two sentences on what to look at to get it right, without repeating the lines above;
- "Misconception:" only if the learner was wrong, one sentence.`;

// The pair-finding mode is the usual exercise the other way round: the learner is given the relation and names the pair. The card says so; the
// two asks are for a pair the page can judge from the term data (the reference is in the card, as in the usual exercise) and for one it cannot.
export const FIND_NOTE = `This is the pair-finding mode, the usual exercise the other way round. The learner was given a relation and had to come up with two phenomena A and B that stand in it, then name an example for each combination of A and B that the relation leaves possible (the cells it leaves empty stay empty). The pair is right when it has the asked relation. An example is right when it belongs in its cell for this pair of A and B.`;
export const FIND_OWN_NOTE = `The page has no reference for this pair (A or B is not in its practice list), so the relation of A and B and the placing of every example are for you to decide, from the course's definitions and rules; the card holds what the term data says about A and B where it has them, and lookup_term gives the rest.`;
/** The names a tutor writes the relation in on the line the page reads (src/domain/find.ts, parseRelationVerdict). */
export const FIND_REL_NAMES = ["Mutually inclusive", "Mutually exclusive", "Three possibilities, A in B", "Three possibilities, B in A", "Four possibilities"] as const;
const TAIL = `- "Common locus:" yes or no, with one example or the reason there is none;
- "Pervasion:" whether whatever is A is necessarily B, and the reverse;`;
export const FIND_ASK = `Explain this answer: the learner was given the relation in the card and named the pair A and B. Use these lines, in this order:
- one line per cell where the learner wrote an example or the page marked it wrong, ${CELL_LABELS}. The example is the learner's, word for word, also when the page marked it wrong: its facts show why it does not fit, so never put the reference or an example of your own in its place. Only for a cell marked wrong where the learner wrote nothing, take the reference example in the card. ${FACT_FORM} If there is no example at all (the learner wrote nothing or NONE and the card's reference is EMPTY), write a plain line without the bars: what kind of thing would fit, or why nothing can, with the reason from the correct relation in the card;
${TAIL}
- "Explanation:" only if the pair does not have the asked relation or an example is wrong: two sentences on what to look at to get it right, without repeating the lines above, and for a pair that does not have the asked relation one pair of course terms that does;
- "Misconception:" only if the learner was wrong, one sentence.`;
export const FIND_ASK_OWN = `Judge this answer: the learner was given the relation in the card and named the pair A and B, which the page cannot check. Use these lines, in this order:
- "Relation:" the relation that holds between A and B, in exactly these words: ${FIND_REL_NAMES.join("; ")}; then " => yes" if it is the relation asked for, " => no" if it is another one, or " => unsure" if the sources disagree or A or B is too vague to say what it covers. Write nothing after the verdict. Example: Relation: Mutually exclusive => no;
- one line for each example the learner wrote, ${CELL_LABELS}, for the cell it was written in. ${FACT_FORM} Judge it against A and B as the learner named them, whatever the relation turns out to be;
${TAIL}
- "Explanation:" only if the pair does not have the asked relation or an example is wrong: two sentences on what to look at to get it right, without repeating the lines above, and for a pair that does not have the asked relation one pair of course terms that does;
- "Misconception:" only if the learner was wrong, one sentence.`;

/**
 * What the judge of Quorum is told after the learner's request (worker/quorum.ts): the other tutors' drafts, numbered in the order given, and the examples they
 * put in different cells (`says`: what each draft says of it, in the draft order). The judge answers the request itself, so the learner sees one answer in the usual form.
 */
export function judgeNote(drafts: readonly string[], differ: readonly { example: string; says: readonly string[] }[]): string {
  const list = differ.map((d) => `- "${d.example}": ` + d.says.map((s, i) => `draft ${i + 1} ${s}`).join(", ")).join("\n");
  return [
    "Other tutors answered this request independently. Their drafts follow, numbered in no particular order. They put some examples in different cells:",
    list,
    "Settle each of those examples yourself, from the card and the tools, as you settle any other example, and then write the one answer to the request above, in the form it asks for and with the lines it asks for. Where the drafts agree, keep what is right in them and correct what is wrong. Never mention the drafts, other tutors or this comparison.",
    ...drafts.map((d, i) => `DRAFT ${i + 1}\n${d}`),
  ].join("\n\n");
}
