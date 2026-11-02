// What's new, for the learner: what changed in the app, in plain words, newest first (path/news.tsx shows it). A pull request that changes what a learner sees
// or can do adds one entry at the top; a fix nobody would notice, or work on the tools, adds none. Written for someone practicing, not for whoever reads the
// code: what they can do now and where, in a sentence or two, without the names of files, pull requests or versions. `id` is new for every entry and never
// changes (the device remembers the newest one it has shown); `go` is where "Try it" takes the learner, when there is such a place.

/** A place "Try it" opens: Settings, or an exercise by its key (shell/exercises.js). */
export type NewsGo = "settings" | "practice" | "find" | "debate" | "syllogism" | "categories" | "instance";

export interface NewsItem {
  /** unique and stable, newest first: the date and a word or two */
  id: string;
  title: string;
  text: string;
  go?: NewsGo;
}

export const NEWS: NewsItem[] = [
  { id: "2026-11-02-next-and-review", title: "Next, the same everywhere", text: "The station that goes on to the next question now just says Next, in every exercise. When a new term, a repetition or a new stage comes first, it says so after a colon, as in Next: new definition. Review no longer ends with a Continue practice button; Back takes you to the roadmap." },
  { id: "2026-11-01-whats-new", title: "A quieter update", text: "When a new version is ready, one line above the bottom says so, with Update beside it; nothing covers the question any more. Tap its words to see what the new version brings. After you update, this page shows what changed; it is also in Settings, under About." },
  { id: "2026-10-31-sounds", title: "Short sounds", text: "A short sound for a result, a new term or stage, and Claude's answers. You can turn them off in Settings › Sounds.", go: "settings" },
  { id: "2026-10-31-categories", title: "Categories, simpler", text: "Categories now asks only for the categories; the step that asked for the most specific one is gone.", go: "categories" },
  { id: "2026-10-30-claude", title: "Claude, by name", text: "The helper that checks and explains your answers is now called Claude everywhere, and says what it is." },
];

/** The items newer than `seen` (an item's id), newest first; none when `seen` is not set or no longer in the list. */
export function newsSince(seen: string | null, list: NewsItem[] = NEWS): NewsItem[] {
  const at = seen === null ? -1 : list.findIndex((n) => n.id === seen);
  return at < 0 ? [] : list.slice(0, at);
}

/** The pinned line's words for a version that waits: "New version ready", or on a Preview (staging) the version, its build and its pull requests, short. */
export function buildWords(c: { version: string | null; commit: string; pulls?: number[] } | null): string {
  if (!c) return "New version ready";
  const pulls = c.pulls?.length ? c.pulls.map((n) => "#" + n).join(" ") : null;
  return [c.version ? "v" + c.version : null, c.commit.slice(0, 7), pulls].filter(Boolean).join(" · ");
}

/** What a version that waits brings: the items of its list (newest first) above the first one this build has too; none when the two lists share none. */
export function comingNews<T extends { id: string }>(remote: T[] | undefined, local: { id: string }[] = NEWS): T[] {
  if (!remote) return [];
  const at = remote.findIndex((n) => local.some((m) => m.id === n.id));
  return at < 0 ? [] : remote.slice(0, at);
}
