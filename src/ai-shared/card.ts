// The per-pair card the tutor gets as its first message, and the line that asks it to explain an answer. They are
// built from the pair, the learner's answer and the term data, so the page and the Worker produce the same text.
import { qPlain, QCELL } from "./debate";
import { catFacts, termFacts } from "./facts";
import type { Facts } from "./facts";
import { categoryOf, classNames, leavesOpen, matchItem, noteCats, pairCats } from "./lookup";
import type { DataIndex } from "./lookup";
import { termNamed } from "./mentions";
import { CELLS, REL, cellLabel, negSides, plainLabel, refOf } from "./relations";
import type { CellId, PairLike, RelKey } from "./relations";
import { CELL_NAME, DEBATE_ASK, DEBATE_NOTE, FIND_ASK, FIND_ASK_OWN, FIND_NOTE, FIND_OWN_NOTE, FIRST_ASK, GUIDE } from "./prompts";

/** One answer of the debate mode: Accept, Why? (with an example), or nothing. */
export interface DebateAnswer {
  say?: "accept" | "why" | null;
  text?: string;
  timeout?: boolean;
}

/** The part of the page's answer state that the card and the explain request read. */
export interface AnswerView {
  debate?: boolean;
  /** the pair-finding mode: `rel` is the relation the learner was given, and the pair is the learner's own */
  find?: boolean;
  /** the relation the learner chose (in the pair-finding mode, the one they were given); set when the card is built, since after a timeout the page has shown the right one */
  rel?: RelKey | null;
  /** time ran out before the learner chose */
  late?: boolean;
  /** the highest stage of the learning ladder the learner has on (1 to 9), which sets the words the tutor uses; none: as for the course */
  stage?: number;
  /** time ran out on the examples */
  exLate?: boolean;
  /** the examples written (or "none") per cell */
  cells: Record<CellId, { t: string; none?: boolean }>;
  /** debate: the four answers */
  ans?: DebateAnswer[];
  res: {
    /** debate: the relation the first three answers imply, "bad" when they contradict each other */
    implied?: RelKey | "bad" | null;
    /** the page's verdict per cell: "ok", "bad", or "cmp" when it could not classify the example; `vague`, the categories the example's name leaves open */
    cells: Record<CellId, { v: string; vague?: readonly string[] }>;
  };
}

/**
 * The fine points the sources add for these categories, without repeats, in order. They are in the full data only.
 * Only ids that are the data's own keys count, so an id that arrives in a request ("__proto__", "constructor") finds nothing.
 */
export function finePoints(ix: DataIndex, catIds: readonly (string | null | undefined)[]): string[] {
  const notes=ix.DATA.notes;
  const of=(c: string): string[] => notes&&Object.hasOwn(notes,c)&&Array.isArray(notes[c])?notes[c]:[];
  return [...new Set(catIds.flatMap(c=>c?of(c):[]))];
}

// the page's verdict on a cell as the card says it: "open" for an example whose name leaves the cell's quality open, which the page has asked the learner to name
const verdictOf=(ix: DataIndex, r: { v: string; vague?: readonly string[] }): string =>
  r.vague?.length?"open (the example's name does not say whether it is "+r.vague.map(c=>ix.CAT[c]?.phrases?.[0]??"one of the "+(ix.CAT[c]?.labels[0]??c)).join(" or whether it is ")+"; the page has asked the learner to name it)":r.v;

/** The practice-list tag of an example the learner wrote: its name and type, and the qualities of the pair its name leaves open, whatever the page's verdict on the cell (a cell already marked wrong has none). */
const listedAs=(ix: DataIndex, it: NonNullable<ReturnType<typeof matchItem>>, p: PairLike, text: string): string => {
  // Words that name the item only through an alias ("an apple" for "a red apple") are shorter than the item: its type holds, its color,
  // shape, material or other detail is not what the learner wrote. The page leaves such a quality to the learner's own words (placeFacts).
  // The item's name is left out: it is what carried the color ("a red apple") and is no use to a tutor that may take only the type.
  if(!matchItem(ix,text,true)) return " [the learner's words are an alias for an item in the practice list, type "+it.t+". Take only that type from it, never its color, shape, material, temperature or other details: judge the learner's own words, and a quality they do not name is open]";
  const open=noteCats(ix,p).filter(c=>leavesOpen(it,c));
  return " [in the practice list as: "+it.n+", type "+it.t+(open.length?"; its name leaves open whether it is "+open.map(c=>ix.CAT[c]?.phrases?.[0]??"one of the "+(ix.CAT[c]?.labels[0]??c)).join(" or whether it is "):"")+"]";
};

/** The fine points of the pair's two categories as the tail of the card; empty when there are none. */
export function cardNotes(ix: DataIndex, p: PairLike): string {
  const notes=finePoints(ix,noteCats(ix,p));
  return notes.length?"\nFine points (from the sources; apply them):\n"+notes.map(n=>"- "+n).join("\n"):"";
}

/** What the data says about one side of a pair the learner made up: its category, else the course term it names, else only its words. */
function sideFacts(ix: DataIndex, label: string): Facts {
  const cid = categoryOf(ix, label), term = termNamed(ix, label);
  const f = cid ? catFacts(ix, cid, label) : term ? termFacts(ix, term) : null;
  return f ? Object.assign({ label }, f, { label }) : { label, not_in_the_course_data: true }; // the learner's words, first as in the other cards
}

/**
 * The card without the standing instructions and without the fine points: what the data says about the two
 * categories, the correct relation, and the learner's answer with the page's verdicts. A server that holds the
 * instructions and the fine points itself asks the page for this part only; `tutorCard` is the three put together.
 */
export function cardBody(ix: DataIndex, p: PairLike, u: AnswerView): string {
  const [ca,cb]=pairCats(ix,p), cls=classNames(ix), [na,nb]=negSides(p);
  // a negated side is its label with the facts of the category it negates
  const side=(cid: string|null, label: string, type: string|undefined, neg: boolean)=>neg?{label, negation_of:cid?catFacts(ix,cid,plainLabel(label)):{label:plainLabel(label),type}}:cid?catFacts(ix,cid,label):{label,type};
  const ownSide=(label: string, neg: boolean)=>neg?{label, negation_of:sideFacts(ix,plainLabel(label))}:sideFacts(ix,label);
  const card=p.own?{A:ownSide(p.a,na), B:ownSide(p.b,nb)}:{A:side(ca,p.a,p.typeA,na), B:side(cb,p.b,p.typeB,nb)};
  const refTxt=(c: CellId)=>refOf(p,c)?JSON.stringify(refOf(p,c)):"EMPTY ("+((p.why&&p.why[c])||"no example")+")";
  let mid: string;
  if(u.debate){
    const imp=u.res.implied, ans=u.ans as DebateAnswer[];
    const lines=QCELL.map((c,i)=>{
      const a=ans[i], r=u.res.cells[c];
      const said=a.say==="accept"?"ACCEPT"+(a.timeout?" (time ran out, which counts as accepting)":""):a.say==="why"?"WHY"+(a.text?" with the example "+JSON.stringify(a.text):" without an example"):"nothing (time ran out)";
      const it=a.text?matchItem(ix,a.text):null;
      return "- Q"+(i+1)+" ("+qPlain(i)+") counter-example cell: "+cellLabel(c,p)+"; learner said "+said+
        (it?listedAs(ix,it,p,a.text??""):"")+"; reference "+refTxt(c)+"; page verdict "+verdictOf(ix,r);
    }).join("\n");
    mid=`${DEBATE_NOTE}
A = ${JSON.stringify(p.a)}, B = ${JSON.stringify(p.b)}.
${negLine(p)}Correct relation: ${REL[p.relation].name}. The learner's Q1 to Q3 answers give: ${imp==="bad"?"a self-contradiction":imp?REL[imp].name:"nothing (time ran out)"}. Learner chose: ${u.late?"nothing (time ran out; the page then showed the right relation)":REL[u.rel as RelKey].name}.
Reference note: ${p.note||"none"}
Questions (verdict cmp = learner wrote an example the page could not classify):
${lines}`;
  } else if(u.find){
    const rel=REL[u.rel as RelKey], own=!!p.own;
    const lines=CELLS.map(c=>{
      const none=rel.empty.includes(c)||u.cells[c].none, t=u.cells[c].t.trim(), r=u.res.cells[c];
      const it=t?matchItem(ix,t):null;
      return "- "+cellLabel(c,p)+": learner wrote "+(none?"NONE":(t?JSON.stringify(t):"(blank)"))+
        (it?listedAs(ix,it,p,t):"")+
        "; reference "+(own?"none, for you to decide":refTxt(c))+"; page verdict "+verdictOf(ix,r);
    }).join("\n");
    mid=`${FIND_NOTE}
A = ${JSON.stringify(p.a)}, B = ${JSON.stringify(p.b)}.
${negLine(p,own)}Relation asked for: ${rel.name} (${rel.gloss("A","B")}). ${own?FIND_OWN_NOTE:`Correct relation of this pair: ${REL[p.relation].name}.`}${u.exLate?" Time ran out on the examples: cells the learner had not reached are blank.":""}
${own?"":`Reference note: ${p.note||"none"}
`}Cells (verdict cmp = learner wrote something the page could not classify${own?"; for a pair the page cannot judge every example is cmp, and a cell the relation leaves empty is open":""}):
${lines}`;
  } else {
    const lines=CELLS.map(c=>{
      const none=REL[u.rel as RelKey].empty.includes(c)||u.cells[c].none, t=u.cells[c].t.trim(), r=u.res.cells[c];
      const it=t?matchItem(ix,t):null;
      return "- "+cellLabel(c,p)+": learner wrote "+(none?"NONE":(t?JSON.stringify(t):"(blank)"))+
        (it?listedAs(ix,it,p,t):"")+
        "; reference "+refTxt(c)+"; page verdict "+verdictOf(ix,r);
    }).join("\n");
    mid=`${negLine(p)}Correct relation: ${REL[p.relation].name}. Learner chose: ${u.late?"nothing (time ran out; the page then showed the right relation)":REL[u.rel as RelKey].name}.${u.exLate?" Time ran out on the examples: cells the learner had not reached are blank.":""}
Reference note: ${p.note||"none"}
Cells (verdict cmp = learner wrote something the page could not classify):
${lines}`;
  }
  return `CARD (from the course booklet's term data; the relation and reference examples were computed from a list of classified examples):
${JSON.stringify(card)}
${mid}${stageLine(u.stage)}${cls.length?`
Classes (the booklet's "is a" tree, for "class:"): ${cls.join(", ")}.`:""}`;
}

/**
 * What the tutor is told of a pair with a negated side (the negation track, src/domain/universe.ts): what the negation takes in, and that Neither may be empty.
 * `own`: a pair of the learner's own in Find a pair, for which the page worked out nothing, so the tutor is asked to judge with it.
 */
export function negLine(p: Pick<PairLike, "a" | "b" | "neg">, own = false): string {
  if (!p.neg) return "";
  const names = p.neg === "ab" ? `A (${JSON.stringify(p.a)}) and B (${JSON.stringify(p.b)}) are negations` : p.neg === "a" ? `A (${JSON.stringify(p.a)}) is a negation` : `B (${JSON.stringify(p.b)}) is a negation`;
  return `Negation: ${names} of the category in "negation_of". "non-X" takes in everything that is not an X: other existents, permanent phenomena and what does not exist (the horn of a rabbit). ${own ? "Judge the cells and the relation with that: on this pair it replaces" : "The cells and the relation were worked out with that, and on this pair it replaces"} the rule above that only Neither takes what does not exist: a thing that does not exist is not A or B where they are plain and is the "non-" term, it goes in the cell those answers give, and it can be the only thing that is both (a possibility need not be an existent, Perdue 2014). So Neither can be empty on this pair, and an empty Neither ("nothing exists") is then right; the relation is read from the other three cells, so something that is both, something that is each alone and nothing that is neither is still four possibilities (Perdue 2014 calls it four possibilities without neither; Perdue 1992, after Lati Rinpoche, three possibilities without there being something which is neither).
`;
}

/**
 * How the tutor speaks to a learner at a stage of the learning ladder (src/domain/stages.ts): in everyday words alone at stage 0, in everyday words
 * while the categories of form are new (stages 1 to 4), quoting the definitions once the course's established bases open (5 to 7), and as for the
 * course from stage 8 on (no line).
 */
export function stageLine(stage: number | undefined): string {
  if (stage === undefined || stage < 0 || stage >= 8) return "";
  const how = stage === 0
    ? "a beginner who knows everyday words and has met no course term yet: explain in everyday words, and leave out the course's terms"
    : stage <= 4
    ? "a beginner who knows everyday words and has just met the categories of form: explain in everyday words, name a course term once, and leave out the course's further terms"
    : "a learner who has just met the course's established bases: explain with the definitions, quoted from the card, and keep further terms for when they are asked about";
  return `
Learner: at stage ${stage} of 9, ${how}.`;
}

/** The first message of a tutor chat: the standing instructions, the card, and the fine points. */
export function tutorCard(ix: DataIndex, p: PairLike, u: AnswerView): string {
  return GUIDE+"\n\n"+cardBody(ix,p,u)+cardNotes(ix,p);
}

// Explain also verifies the examples the page could not check: those cell lines end in a machine-readable verdict.
export function explainAsk(U: Pick<AnswerView, "debate" | "find" | "res"> & { own?: boolean }, neg = false): string {
  const dbt=!!U.debate, open=CELLS.filter(c=>U.res.cells[c].v==="cmp"&&!U.res.cells[c].vague?.length), vague=CELLS.filter(c=>U.res.cells[c].vague?.length);
  const base=dbt?DEBATE_ASK:U.find?(U.own?FIND_ASK_OWN:FIND_ASK):FIRST_ASK;
  const nm=(c: CellId)=>dbt?"Q"+(CELLS.indexOf(c)+1):CELL_NAME[c];
  // an example whose name leaves the cell's quality open ("a car" for black things) is settled by no one: the page asks the learner for the word
  const left=vague.length?`
The examples in ${vague.map(nm).join(", ")} do not say the quality their cell is about (the card's page verdict "open"); the page has asked the learner to name it. On those lines answer open on that side and say which words would settle it.`:"";
  if(!open.length) return base+left;
  return base+left+`
The page could not check the examples in: ${open.map(nm).join(", ")}. The page reads your "A" and "B" answers on those lines as the check, so make them exact: the example belongs in a cell when its answers are the cell's (Both: A yes, B yes; A not B: A yes, B no; B not A: A no, B yes; Neither: A no, B no; ${neg?`a non-existent such as the horn of a rabbit counts too, as no for a plain term and yes for a "non-" term`:"an existent thing, but in Neither a non-existent such as the horn of a rabbit counts too"}).`+(dbt?`
Q1 is the Both cell, Q2 A not B, Q3 B not A, Q4 Neither.`:"")+`
How to decide: read the example in its ordinary sense (a song is the sound of someone singing or playing; a stone is an ordinary stone at room temperature), but do not fill in a quality its name does not say (the color of "a car", what "a table" is made of). Place it under A or B first, then ${U.own?"check it against the relation you decided on, since the page has no reference for this pair":"use the correct relation above: it is computed and right, so if whatever is B is A, a B belongs in Both"}. Use classify_example or lookup_term when a classification is not obvious.
Answer "open" on a side whose quality the example's name does not say (the color of "an apple", the shape of "a box", whether "a frying pan" is hot), and say which words would settle it. Answer "unsure" only on a side where the sources disagree on how to classify the thing (see the fine points) or where you cannot tell what the example names; then that side's sentence names each reading, in a few words. A word that could also mean something else is not a reason for "unsure": decide on the ordinary reading and mention the other one briefly.`;
}
