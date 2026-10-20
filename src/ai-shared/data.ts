// The shape of the term data (docs/DATA.md) as the tutor code reads it. `terms[].d`, `d_ru` and `note` and the group
// `notes` exist only in the full data (open file merged with the two course files); the open data lacks them.

export interface Term {
  name: string;
  ch: string;
  wylie?: string;
  skt?: string;
  ru?: string;
  zh?: string;
  parent?: string;
  aliases?: string[];
  /** mutually inclusive terms */
  mi?: string[];
  /** contradictory (mutually exclusive) terms */
  contra?: string[];
  /** terms this one is included in (three possibilities) */
  included_in?: string[];
  /** terms it has four possibilities with */
  overlaps?: string[];
  /** definition, English (course data) */
  d?: string;
  /** definition, Russian (course data) */
  d_ru?: string;
  /** commentary quoting sources (course data) */
  note?: string;
  [extra: string]: unknown;
}

/** A practice category: one Dudra term, or an everyday group. `labels[0]` is its main plural label. */
export interface Cat {
  id: string;
  kind: "dudra" | "everyday";
  /** the Dudra term, for kind "dudra" */
  term?: string;
  labels: string[];
  type: string;
  sense?: boolean;
  /** how a thing of this category is said after "it is" (the syllogism drill); the first is the plain one. None: the drill leaves the category out */
  phrases?: string[];
  /** ids of the categories that everything in this one is also in, stated where the term hierarchy cannot show it (everyday categories) */
  within?: string[];
}

/** An everyday or Dudra example with the categories it belongs to. */
export interface Item {
  n: string;
  /** Dudra type: the name of a term */
  t: string;
  /** ids of the categories it belongs to */
  c: string[];
  comp?: boolean;
  body?: boolean;
  /** a non-existent (the horn of a rabbit) */
  ne?: boolean;
  /** cannot follow "Take" in the syllogism drill (said in the second person) */
  nosubject?: boolean;
}

export interface DrillData {
  built?: string;
  source?: string;
  terms: Record<string, Term>;
  /** term name -> the names from it up to Existent */
  chains: Record<string, string[]>;
  cats: Cat[];
  items: Item[];
  sense?: string[];
  bodySkip: string[];
  nopair?: string[][];
  /** groups of category ids whose things are mistaken for one another (the near misses of the syllogism drill) */
  confusable?: string[][];
  /** short name -> the item it means ("chair" -> "a wooden chair") */
  aliases?: Record<string, string>;
  /** category id -> fine points for the tutor (full data only) */
  notes?: Record<string, string[]>;
  [extra: string]: unknown;
}
