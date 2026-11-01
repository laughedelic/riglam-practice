// A pull request that changes what a learner sees or can do adds an entry to src/app/news.ts (What's new, shown after an update). This is the rule, as a function
// of the pull request's title, its body and the files it changes; `.github/workflows/whats-new.yml` runs it. Only `feat:` and `fix:` titles are asked: `chore:`, `docs:`,
// `test:`, `ci:` and the like change nothing a learner sees. A change nobody would notice says so in the body, with the reason ("What's new: none, ...").

export const NEWS_FILE = "src/app/news.ts";

/** Does this title ask for an entry? */
export const asksForEntry = (title) => /^(feat|fix)(\([^)]*\))?!?:/i.test(title.trim());

/** The body says there is nothing for a learner to read, and why: a line "What's new: none, <reason>" (any dash or colon after "none"). */
export function saysNone(body) {
  const m = /^\s*what['’]s new:\s*none\b[\s,.:;—–-]*(.*)$/im.exec(body ?? "");
  return !!m && m[1].trim().length >= 3;
}

/** `null` when the pull request is in order, else what to do. */
export function checkWhatsNew({ title, body, files }) {
  if (!asksForEntry(title)) return null;
  if (files.includes(NEWS_FILE)) return null;
  if (saysNone(body)) return null;
  return `This pull request is "${title.split(":")[0]}:" and does not touch ${NEWS_FILE}. If a learner sees or can do something new, add an entry at the top of ${NEWS_FILE} (plain words, no file or pull request names). If not, put a line in the pull request body: "What's new: none, <why>".`;
}
