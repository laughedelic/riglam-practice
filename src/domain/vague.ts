// An everyday example has to say the quality its cell is about. "A car" says nothing of its color: it is not shown to be black, nor shown
// not to be, until the name says which ("a black car"). The practice list marks what an item's name leaves open (`may`, docs/DATA.md); such
// an example is neither right nor wrong, and the page asks for the word that settles it, the same answer every time, without the tutor.
import type { Item } from "../ai-shared/data";
import { leavesOpen } from "../ai-shared/lookup";
import type { DataIndex } from "../ai-shared/lookup";
import { NEG_CELL } from "../ai-shared/relations";
import type { CellId, Neg } from "../ai-shared/relations";
import { catPhrase } from "./instance";
import { FEATURE, inUniverse } from "./universe";
import { cap } from "./util";

// the kinds of quality, in the order a name says them from the noun outwards ("a hot white wooden cup"); a name that leaves one quality open
// usually leaves others of its kind open too, which give the example for a side the cell needs to be "no"
const KINDS: readonly (readonly string[])[] = [
  ["wooden", "metal", "glass", "plastic", "fabric", "leather", "ceramic", "paper"], ["round", "square"],
  ["white", "red", "green", "black", "blue", "yellow"], ["hot", "cold"],
];
const kindOf = (cat: string) => KINDS.findIndex((k) => k.includes(cat));

/** What each cell asks of the two plain categories: Both yes and yes, A not B yes and no, and so on. */
const WANT: Record<CellId, readonly [boolean, boolean]> = { both: [true, true], anb: [true, false], bna: [false, true], nei: [false, false] };

/** The name with a quality said: ("a frying pan", "hot") gives "a hot frying pan", ("an oak tree", "green") "a green oak tree", ("ink", "blue") "blue ink". */
export function withQuality(name: string, word: string): string {
  const m = name.match(/^(a|an) (.*)$/i);
  return m ? (/^[aeiou]/i.test(word) ? "an " : "a ") + word + " " + m[2] : word + " " + name;
}

/**
 * Which of the two categories the item's name leaves open, where the item could otherwise stand for them (not a whole thing for a sense
 * category, nor a body where the body is skipped: `inUniverse` without the name's open qualities).
 */
export function openSides(ix: DataIndex, it: Item, a: string, b: string): readonly [boolean, boolean] {
  if (!inUniverse(ix, { ...it, may: undefined }, a, b)) return [false, false];
  return [leavesOpen(it, a), leavesOpen(it, b)];
}

// the word a name needs for the side to be what the cell needs: the category's own for a yes, for a no another of its kind that the name leaves
// open ("a red car" for a car that is not black), or the other temperature ("a cold frying pan" is not hot); none when nothing fits
function wordFor(it: Item, cat: string, yes: boolean): string | null {
  if (!FEATURE.has(cat)) return null;
  if (yes) return cat;
  const kind = KINDS[kindOf(cat)] || [];
  return kind.find((x) => x !== cat && it.may?.includes(x)) ?? (cat === "hot" ? "cold" : cat === "cold" ? "hot" : null);
}

// the name with the words the cell needs said, from the noun outwards (a material before a color, a color before a temperature); "" when a side
// has no word that fits
function suggestion(it: Item, cats: readonly [string, string], open: readonly [boolean, boolean], want: readonly [boolean, boolean]): string {
  const words = ([0, 1] as const).filter((k) => open[k]).map((k) => ({ w: wordFor(it, cats[k], want[k]), kind: kindOf(cats[k]) }));
  return words.every((x) => x.w) ? [...words].sort((x, y) => x.kind - y.kind).reduce((n, x) => withQuality(n, x.w!), it.n) : "";
}

/**
 * The verdict on an example whose name leaves open a quality of the pair (`openSides`), written in cell `c` of a pair with the plain categories
 * `a` and `b` (negated as `neg` says): null when it is not such an example. A side the name does say that already goes against the cell makes
 * the example wrong ("bad"), whatever the open quality; otherwise it is open ("cmp" with `open`), with the words that would settle it. `say` is
 * that request as the tutor's note says it on each open side. `words` says the two categories as the question on screen does (a syllogism's reason and
 * predicate); without it, each category's plain phrase.
 */
export function vagueVerdict(ix: DataIndex, it: Item, typed: string, cats: readonly [string, string], c: CellId, neg?: Neg | null, words?: readonly [string, string]): { v: "bad" | "cmp"; msg: string[]; open: readonly [boolean, boolean]; say: string } | null {
  const open = openSides(ix, it, cats[0], cats[1]);
  if (!open[0] && !open[1]) return null;
  const word = (k: 0 | 1) => words?.[k] ?? catPhrase(ix.CAT[cats[k]]);
  const want = WANT[neg ? NEG_CELL[neg][c] : c], raw = typed.trim().replace(/[.!]+$/, ""), nm = cap(raw), named = suggestion(it, cats, open, want);
  const say = `the name “${raw}” does not say it` + (named ? `; name it, as in “${named}”` : "");
  for (const k of [0, 1] as const) {
    if (open[k]) continue;
    const is = it.c.includes(cats[k]);
    if (is !== want[k]) return { v: "bad", msg: ["Belongs elsewhere. ", `${nm} is ${is ? "" : "not "}${word(k)}, whatever the rest of it is.`], open, say };
  }
  const what = ([0, 1] as const).filter((k) => open[k]).map((k) => "whether it is " + word(k)).join(" and ");
  return { v: "cmp", msg: ["Say which. ", `“${nm}” leaves open ${what}: name it${named ? `, as in “${named}”` : ""}.`], open, say };
}
