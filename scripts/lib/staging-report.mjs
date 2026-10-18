// What a staging rebuild tells people (docs/STAGING.md): a check run named `staging` on each pull request's head commit, and a summary of the
// run. The texts are pure; `publish` takes the GitHub calls as an object (scripts/lib/staging-github.mjs), so tests/unit/staging.test.ts runs
// it with a stand-in.

/** The name of the check run on a pull request. */
export const CHECK_NAME = "staging";

/** The most files a check summary names: GitHub refuses a check run whose summary is over 65,535 characters, and then nothing would be reported. */
const MAX_FILES = 40;

const ticks = (names) => names.map((n) => `\`${n}\``).join(", ");
const cut = (text, max = 140) => (text.length <= max ? text : `${text.slice(0, max - 1)}…`);

/** Why a skipped pull request was left out, in a few words. */
export function whySkipped(skip) {
  if (skip.reason === "parent") return `the pull request below it (#${skip.parent}) is left out`;
  if (skip.reason === "gone") return "its branch is not on origin";
  const against = [...(skip.withMain ? ["main"] : []), ...skip.with.map((n) => `#${n}`)];
  return `conflicts in ${ticks(skip.files)}${against.length ? ` (also changed by ${against.join(" and ")})` : ""}`;
}

/**
 * The check run for a pull request that went in (`success`) or was left out (`failure`). Its text does not change from one rebuild to the
 * next unless the pull request's own situation does, because a new check run is made only when it differs from the last one.
 * @returns {{ conclusion: "success" | "failure" | "neutral", title: string, summary: string }}
 */
export function checkOf(entry, result) {
  const skip = result.skipped.find((s) => s.number === entry.number);
  if (skip) return { conclusion: "failure", title: cut(`Left out of staging: ${whySkipped(skip)}`), summary: leftOutSummary(skip) };
  const merged = result.merged.find((m) => m.number === entry.number);
  const how = entry.via !== null ? `, as the parent of #${entry.via}` : "";
  const nothing = merged?.addsNothing ? ", but it adds nothing to main" : "";
  return {
    conclusion: "success",
    title: cut(`In staging${how}${nothing}`),
    summary: `This pull request is on the \`staging\` branch${how}${nothing}. \`staging.json\` on that branch lists everything that went in with it.`,
  };
}

/** The check that takes the place of an old one on a pull request that is no longer on staging: the label came off, or it was closed. */
export const leftCheck = (open = true) => ({
  conclusion: "neutral",
  title: open ? "Not in staging (no label)" : "Not in staging (closed)",
  summary: open ? "This pull request is not on the `staging` branch: it does not have the label." : "This pull request is closed or merged, so it is not on the `staging` branch.",
});

/** The check for the commit a pull request was reported on, when its branch is no longer on origin. */
export const goneCheck = () => ({ conclusion: "neutral", title: "Not in staging (its branch is gone)", summary: "This pull request is not on the `staging` branch: its branch is not on origin any more." });

/**
 * The summary of the failed check on a pull request that is left out: the files, who else changed them, and what to do. It is all that
 * reaches an agent that follows the pull request, so it stands on its own.
 */
function leftOutSummary(skip) {
  if (skip.reason === "parent") return `Staging left this pull request out because the pull request below it (#${skip.parent}) is left out.\n\nThis check turns green when that one is back in.`;
  if (skip.reason === "gone") return "Staging left this pull request out because its branch is not on origin.\n\nThis check turns green when the branch is back.";
  const others = [...(skip.withMain ? ["`main`, since this branch left it"] : []), ...skip.with.map((n) => `#${n}, which is on staging before it`)];
  return [
    "Staging left this pull request out because it does not merge cleanly.",
    "",
    "Conflicts in:",
    ...skip.files.slice(0, MAX_FILES).map((f) => `- \`${f}\``),
    ...(skip.files.length > MAX_FILES ? [`- and ${skip.files.length - MAX_FILES} more`] : []),
    ...(others.length ? ["", `${skip.files.length === 1 ? "That file was" : "Those files were"} also changed by ${others.join(" and by ")}.`] : []),
    "",
    "Merge `main` (or the pull request above) into this branch and push, as for any pull request. Staging rebuilds by itself after each push.",
    "",
    "This check turns green when the branch merges cleanly, and is made again, red, if the conflict changes. Never resolve a conflict on `staging` itself.",
  ].join("\n");
}

/** The pull requests that were left out for a conflict (or a missing branch) that the branch on origin did not already have: news. */
export const newSkips = (result) => result.skipped.filter((s) => s.reason !== "parent" && !(result.previous?.skipped ?? []).some((p) => p.number === s.number));

/** The workflow command that shows `text` as a warning on the run. The runner reads `%`, CR and LF in it, and the branch and file names in it come from pull requests. */
export const leftOutWarning = (text) => `::warning title=Left out of staging::${text.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A")}`;

/** Plain text for the log. */
export function describe(result) {
  if (result.upToDate) return `staging is ${result.sha.slice(0, 7)} and was built from these inputs already`;
  const lines = [`staging is ${result.sha.slice(0, 7)}: main ${result.baseSha.slice(0, 7)}`];
  for (const m of result.merged) lines.push(`  + #${m.number} ${m.branch} ${m.sha.slice(0, 7)}${m.via !== null ? `  (the parent of #${m.via})` : ""}${m.addsNothing ? "  (adds nothing to main: merged already? then take the label off)" : ""}`);
  for (const s of result.skipped) lines.push(`  - #${s.number} ${s.branch}: left out, ${whySkipped(s)}`);
  for (const w of result.warnings) lines.push(`  ! ${w}`);
  return lines.join("\n");
}

/** Markdown for the run's summary page. */
export function summary(result, { runUrl = "" } = {}) {
  if (result.upToDate) return `### Staging\n\nNothing to do: \`staging\` (${result.sha.slice(0, 7)}) was built from these pull requests and this \`main\` already.\n`;
  const row = (e, mark, note) => `| #${e.number} | ${e.title.replace(/\|/g, "\\|")} | \`${e.branch}\` | ${e.sha ? `\`${e.sha.slice(0, 7)}\`` : ""} | ${mark} ${note} |`;
  return [
    `### Staging: \`main\` ${result.baseSha.slice(0, 7)} and ${result.merged.length} pull ${result.merged.length === 1 ? "request" : "requests"}${result.skipped.length ? `, ${result.skipped.length} left out` : ""}`,
    "",
    "| | Title | Branch | Commit | |",
    "|---|---|---|---|---|",
    ...result.merged.map((m) => row(m, "in", m.via !== null ? `(the parent of #${m.via})` : m.addsNothing ? "(adds nothing: merged already?)" : "")),
    ...result.skipped.map((s) => row(s, "**left out**", whySkipped(s))),
    ...(result.warnings.length ? ["", ...result.warnings.map((w) => `- ⚠ ${w}`)] : []),
    ...(runUrl ? ["", `[This run](${runUrl})`] : []),
    "",
  ].join("\n");
}

/**
 * Posts the checks for a rebuild and takes the label off pull requests that are merged or closed. Nothing here may fail the run: a refused
 * call is logged and the next one goes on.
 *
 * A check run is made only where the commit does not have this one already, so a pull request that stays left out for the same reason is
 * not told again at every rebuild: only a change reaches whoever follows it. The same call after a run that built nothing therefore makes
 * good a check that GitHub refused after the last push, and does nothing else.
 * @param {{ currentCheck(sha: string, name: string): Promise<{ conclusion: string, title: string, summary: string } | null>, setCheck(sha: string, check: { name: string, conclusion: string, title: string, summary: string, detailsUrl?: string }): Promise<void>, closedLabeled(label: string): Promise<number[]>, removeLabel(number: number, label: string): Promise<void> }} client
 * @param {{ result: any, openPulls: any[], runUrl?: string, label?: string, log?: (line: string) => void }} options
 */
export async function publish(client, { result, openPulls, runUrl, label, log = console.error }) {
  const attempt = async (what, call) => {
    try {
      await call();
    } catch (e) {
      log(`could not ${what}: ${e.message}`);
    }
  };
  const check = (sha, c, what) =>
    attempt(`report the check of ${what}`, async () => {
      const current = await client.currentCheck(sha, CHECK_NAME);
      if (current && current.conclusion === c.conclusion && current.title === c.title && current.summary === c.summary) return;
      await client.setCheck(sha, { ...c, name: CHECK_NAME, detailsUrl: runUrl });
    });

  for (const e of result.entries) if (e.sha) await check(e.sha, checkOf(e, result), `#${e.number}`);

  // A pull request that was on staging and is not any more (the label came off, or it was closed): the check it was given then, on the
  // commit it was given it, must not go on saying it is in. That commit is the one in the manifest, not necessarily the head now.
  const now = new Set(result.entries.map((e) => e.number));
  const stillOpen = new Set(openPulls.map((p) => p.number));
  // The same goes for one that is still listed but whose branch is gone from origin: it has no head to report on now.
  for (const old of [...(result.previous?.pulls ?? []), ...(result.previous?.skipped ?? [])]) {
    if (!old.sha) continue;
    if (!now.has(old.number)) await check(old.sha, leftCheck(stillOpen.has(old.number)), `#${old.number}`);
    else if (!result.entries.find((e) => e.number === old.number)?.sha) await check(old.sha, goneCheck(), `#${old.number}`);
  }

  // A merged or closed pull request has no use for the label, and it leaves staging by itself anyway: take it off, wherever it was missed.
  if (label) {
    await attempt(`list the closed pull requests with the label ${label}`, async () => {
      for (const number of await client.closedLabeled(label)) await attempt(`take the label off #${number}`, () => client.removeLabel(number, label));
    });
  }
}
