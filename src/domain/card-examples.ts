// The examples on a term's definition (the stop's Examples section, the classic page's card). The everyday things of the practice list that are
// instances of the term come first: a learner knows "a dog" and "the roundness of a ball" before the course's words, which the reference examples
// (docs/DATA.md) are written in; those fill what the list cannot. A function of the data, like the rest of the domain.
import type { Item } from "../ai-shared/data";
import { examplesFor } from "../ai-shared/examples";
import type { Example } from "../ai-shared/examples";
import { spelled, stripDet, upChain } from "../ai-shared/lookup";
import type { DataIndex } from "../ai-shared/lookup";
import { exampleStage } from "./reference";
import { itemStage } from "./stages";

/** What the card says of an example: its name and stage, and for a reference example why it is a good one. */
export interface CardExample {
  n: string;
  st: number;
  /** a reference example's one sentence on why it is a good example, and how sure it is when not high */
  gloss?: string;
  cn?: string;
}

/** The words before " of ": "the roundness of a ball" and "the roundness of a coin" show one kind of thing, and the card needs only one of them. */
const kindOf = (n: string): string => { const i = n.indexOf(" of "); return i > 0 ? n.slice(0, i) : n; };

/**
 * Up to `max` examples of the term, for a learner who has not met it yet. From the practice list, the things that are instances of the term (their
 * type is the term or below it), the plainest stage first and in the list's own order, which puts the plainest case of a kind first; those only the
 * course's words name (`dudraOnly`) last. A spread: one of each branch below the term, then of each kind of thing (a dog, and a neighbor; a memory, a
 * thought and a dream), before a second of any, and never two of one quality ("the roundness of a ball", "the roundness of a coin"). The term's own
 * (type) come first in what is shown, as `examplesFor` has it. What the list lacks is filled from the reference examples (`examplesFor`), if the
 * device has them.
 */
export function cardExamples(ix: DataIndex, reference: readonly Example[] | null | undefined, term: string, max = 3): CardExample[] {
  if (!Object.hasOwn(ix.DATA.terms, term)) return [];
  // the branch of the term an item belongs to: the type just below the term on its way up, or the term itself
  const branch = (it: Item) => { const up = upChain(ix, it.t), i = up.indexOf(term); return i > 0 ? up[i - 1]! : term; };
  const group = (it: Item) => it.t + "|" + (it.c.find((c) => ix.CAT[c]?.kind === "everyday") ?? "");
  const ranked = ix.DATA.items.map((it, i) => ({ it, i })).filter(({ it }) => !it.nosubject && upChain(ix, it.t).includes(term))
    .sort((a, b) => Number(!!a.it.dudraOnly) - Number(!!b.it.dudraOnly) || itemStage(a.it) - itemStage(b.it) || a.i - b.i).map(({ it }) => it);
  const out: Item[] = [], branches = new Set<string>(), groups = new Set<string>(), kinds = new Set<string>();
  const take = (it: Item) => { out.push(it); branches.add(branch(it)); groups.add(group(it)); kinds.add(kindOf(it.n)); };
  const pass = (fresh: (it: Item) => boolean) => { for (const it of ranked) if (out.length < max && !out.includes(it) && !kinds.has(kindOf(it.n)) && fresh(it)) take(it); };
  pass((it) => !branches.has(branch(it)));
  pass((it) => !groups.has(group(it)));
  pass(() => true);
  for (const it of ranked) if (out.length < max && !out.includes(it)) take(it);
  out.sort((a, b) => Number(b.t === term) - Number(a.t === term));
  const list: CardExample[] = out.map((it) => ({ n: it.n, st: itemStage(it) }));
  if (list.length < max && reference?.length) {
    const named = new Set(list.map((x) => stripDet(spelled(x.n))));
    for (const ex of examplesFor(ix, reference, term, max))
      if (list.length < max && !named.has(stripDet(spelled(ex.n)))) list.push({ n: ex.n, st: exampleStage(ex), ...(ex.gloss ? { gloss: ex.gloss } : {}), ...(ex.cn ? { cn: ex.cn } : {}) });
  }
  return list;
}
