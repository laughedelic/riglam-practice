// The shapes the domain functions take and return. The page (src/app/types.ts) builds its own types on these.
import type { DebateAnswer } from "../ai-shared/card";
import type { CellId, PairLike, RelKey } from "../ai-shared/relations";

/** A pair of phenomena to compare. Generated pairs have an id starting with "g-"; older batches carry labels only. */
export interface Pair extends PairLike {
  id: string;
  generated?: boolean;
  [extra: string]: unknown;
}

/** The verdict of the page for one cell: ok, bad, or cmp (an example it could not classify). */
export type Verdict = "ok" | "bad" | "cmp" | "part" | string;

/** The check of one cell. `kind` is "occ" for whether the cell can hold anything, "ex" for the example written in it. */
export interface CellResult {
  v: Verdict;
  msg: string[];
  kind: "occ" | "ex";
  /** Claude could not settle the example */
  uns?: boolean;
  /** "claude" when Claude's check settled the verdict */
  by?: string;
}

/** What grading produces before the counts are added. */
export interface GradeDraft {
  relOk: boolean;
  cells: Record<CellId, CellResult>;
  /** debate: whether the answer to each question was right, apart from the example */
  dec?: Record<CellId, boolean>;
  /** debate: the relation the first three answers imply, "bad" when they contradict each other, null when time ran out */
  implied?: RelKey | "bad" | null;
}

/** The result of checking an answer. `overall`: ok, part (something wrong besides the relation), pend (examples unchecked), bad (wrong relation). */
export interface GradeResult extends GradeDraft {
  occBad: number;
  exBad: number;
  exOpen: number;
  exN: number;
  overall: "ok" | "part" | "pend" | "bad";
}

/** A practice answer to grade: the relation chosen and what was written in each cell (`none`: the learner marked it empty). */
export interface PracticeAnswer {
  /** the relation chosen; grading needs it */
  rel?: RelKey | null;
  /** time ran out before the learner chose the relation */
  late?: boolean;
  cells: Record<CellId, { t?: string; none?: boolean }>;
}

/** A debate answer to grade: the relation chosen after the four questions, and the four answers. */
export interface DebateInput {
  /** the relation chosen after the four questions; without one the relation counts as wrong */
  rel?: RelKey | null;
  late?: boolean;
  ans: DebateAnswer[];
}

/** One entry of the pair pool: two categories and the relation they have ("3" stands for both three-possibility directions). */
export interface PoolEntry {
  a: string;
  b: string;
  r: string;
}

/** What the draw reads from an earlier answer. */
export interface HistoryEntry {
  key?: string;
  catA?: string | null;
  catB?: string | null;
  grade?: string;
  correct?: boolean;
}
