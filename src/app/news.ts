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
  { id: "2026-11-11-daily-practice", title: "Daily practice", text: "The roadmap has a new stop above the exercises, Daily practice: a short session that moves between the exercises by itself. It has three rounds of three questions that hang together: one term met from several sides, then two pairs of terms, each from an example to a reason. A line at the top of a question says what it carries over from the one before, and small diamonds show where you are and how it went. One question you missed in each round comes back at the end, from another side. A session has no clock, also where an exercise has Sprint on. The last station says how the session went and offers one more round, at your own pace or as a Sprint round against the clock. In the practice options of a session you choose which exercises it mixes, Find a pair among them if you add it, and whether its questions are drawn from everything, from the newest stage or from your mistakes." },
  { id: "2026-11-11-flag-replies", title: "Replies to your flags arrive", text: "When you flag an explanation or an example, the reply to it now shows under the flag in Review: Claude’s answer, or a note that the maintainer will decide. Before, a flag stayed as sent and its reply never came." },
  { id: "2026-11-06-thesis-first", title: "Syllogisms: thesis first, and a counter-example when you want one", text: "Syllogisms has two new switches in its Practice options. Thesis first asks the thesis alone: I accept if it is true, Why? if it is not. After Why? the reason comes, and you say whether the reason is not established or there is no pervasion. With Ask for a counter-example off, There is no pervasion goes straight to the result, and you can still name a counter-example there.", go: "syllogism" },
  { id: "2026-11-05-pull-back", title: "Pull back to the last result", text: "Pull the heading at the top of the path down, and the result of the question before comes back. In Examples, open the folded pair at the top first, then pull it down again. You can have Claude check or explain the result there, or ask a follow-up. Next then brings you back to the question you left, just as it was. Scrolling up only gives a peek. It goes back one question, and not in Sprint." },
  { id: "2026-11-05-change-answer", title: "Change an answer in Pervasions", text: "In Pervasions you can now change an answer you already gave, until you pick the relation. Tap the question on the path, then Change answer: it is asked again, your earlier answer is marked and the example you wrote is still there. The answers after it stay as they were. In Sprint the answers stay final.", go: "debate" },
  { id: "2026-11-04-other-names", title: "Existents by their other names", text: "Questions about existents now also call them by their other names: established bases, objects of knowledge, phenomena, objects of comprehension and objects. Permanent phenomena can now also appear as non-functioning phenomena.", go: "practice" },
  { id: "2026-11-04-categories-words", title: "Categories starts clearer", text: "In Categories, the words is and not now wait until you select the first category, instead of standing there before you have done anything.", go: "categories" },
  { id: "2026-11-03-read-aloud", title: "Read aloud", text: "Every exercise can now read its questions aloud, each one as it appears, in your device's own voice. Switch it on under Voice in the Practice options, where you also pick the voice and the speed. The speaker above the bottom says the question again; hold it to pause the reading.", go: "practice" },
  { id: "2026-11-03-syllogism-wait", title: "Claude's progress in Syllogisms", text: "When Claude explains your answer in Syllogisms, you now see it working, with the seconds and a Stop button, as in the other exercises. Before, the result showed nothing until the explanation arrived." },
  { id: "2026-11-03-take", title: "Claude names the example", text: "When Claude explains an example, the note now begins with the example it is about, as in Take a rabbit horn:, and then says what follows. Before, a note on an example you had not given (one Claude brought up for a case you left empty, or against a question you accepted) never said what it was about." },
  { id: "2026-11-03-slide-explain", title: "Slide Claude onto the thread", text: "On a phone, Check & explain and Ask a follow-up can now be slid onto the thread with a finger, as well as tapped: slide the diamond left onto the line and let go, and it is taken. Let go short of the line and it goes back." },
  { id: "2026-11-03-news-links", title: "Links in What's new work", text: "The buttons in What's new, such as Open Settings, now take you where they say. Open Settings used to leave you on the roadmap with the app not answering." },
  { id: "2026-11-02-about", title: "About, licenses and privacy", text: "Settings › About now says what Riglam Practice is, where the source code is, how to send ideas, questions and bug reports, how to flag an explanation from Claude, and which licenses cover the code, the fonts and the definitions. What's new now sits on Version and updates, and Your data says what the app keeps and who can read it.", go: "settings" },
  { id: "2026-11-02-storage", title: "A calmer storage notice", text: "If your device's storage stops answering, one line above the bottom now says so, with Reload beside it, instead of a bar over the top of the page. Tap its words to see what is known. If the storage answers again, the line goes by itself and what you did meanwhile is saved. Export and import in Settings is now called Your data.", go: "settings" },
  { id: "2026-11-02-next-and-review", title: "Next, named alike", text: "The station that goes on is now named the same way everywhere: Next pair, Next relation, Next syllogism, Next set, and Next question in Categories and after a term's page. When a new term, a repetition or a new stage comes first, it says so after a colon, as in Next: new definition. Review no longer ends with a Continue practice button; Back takes you to the roadmap." },
  { id: "2026-11-01-icon", title: "A calmer app icon", text: "The app's icon now sits on the Path's own ivory ground, with the same figure." },
  { id: "2026-11-01-guidance", title: "Guidance in three levels", text: "Every exercise can guide you as much as you want: Detailed spells things out, Hints gives a nudge, None leaves you alone. Results and Sprint's time-up follow the level you chose." },
  { id: "2026-11-01-sprint", title: "Sprint", text: "Blitz is now Sprint: a clock for every step of every exercise, which you can pause and resume." },
  { id: "2026-11-01-whats-new", title: "A quieter update", text: "When a new version is ready, one line above the bottom says so, with Update beside it; nothing covers the question any more. Tap its words to see what the new version brings. After you update, this page shows what changed; it is also in Settings, under About." },
  { id: "2026-11-01-stations", title: "Stations you can tell apart", text: "Stations now differ by what they do: teal and slate shapes with a symbol, a dark symbol where white would be weak, orange for Claude and purple for what is not settled." },
  { id: "2026-11-01-magic-key", title: "The Magic Key on its own page", text: "The Magic Key is now entered on its own page in Settings instead of a dialog, with shorter text, and the keyboard no longer hides it on a phone.", go: "settings" },
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
export function buildWords(c: { version: string | null; commit: string; pulls?: { number: number }[] } | null): string {
  if (!c) return "New version ready";
  const pulls = c.pulls?.length ? c.pulls.map((p) => "#" + p.number).join(" ") : null;
  return [c.version ? "v" + c.version : null, c.commit.slice(0, 7), pulls].filter(Boolean).join(" · ");
}

/** What a version that waits brings: the items of its list (newest first) above the first one this build has too; none when the two lists share none. */
export function comingNews<T extends { id: string }>(remote: T[] | undefined, local: { id: string }[] = NEWS): T[] {
  if (!remote) return [];
  const at = remote.findIndex((n) => local.some((m) => m.id === n.id));
  return at < 0 ? [] : remote.slice(0, at);
}

/** The status of the look for a newer version, as the platform names it. */
type Look = "unknown" | "checking" | "current" | "downloading" | "ready" | null;

/**
 * The pinned line of a Preview (staging, a pull request build) when no version waits: what this build is made of (version, commit, pull requests), and the way to look
 * again, which says "Checking…" while the look runs. A version that waits has its own line (`buildWords` of what is coming, with Update).
 */
export function buildLine(look: Look, own: { version: string; commit: string; pulls?: { number: number }[] | null }): { text: string; label: string; act: "check" | null } {
  const text = buildWords({ version: own.version, commit: own.commit, pulls: own.pulls ?? undefined });
  if (look === "checking" || look === "downloading") return { text, label: "Checking…", act: null };
  return { text, label: look === "unknown" ? "Try again" : "Check", act: "check" };
}
