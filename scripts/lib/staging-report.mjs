// What a staging rebuild tells people (docs/STAGING.md): a status named `staging` on each pull request's head commit, one comment on a
// pull request that has just stopped merging, and a summary of the run. The texts are pure; `publish` takes the GitHub calls as an object
// (scripts/lib/staging-github.mjs), so tests/unit/staging.test.ts runs it with a stand-in.

/** The context of the commit status on a pull request. */
export const STATUS_CONTEXT = "staging";

const ticks = (names) => names.map((n) => `\`${n}\``).join(", ");
const cut = (text, max = 140) => (text.length <= max ? text : `${text.slice(0, max - 1)}…`);

/** Why a skipped pull request was left out, in a few words. */
export function whySkipped(skip) {
  if (skip.reason === "parent") return `the pull request below it (#${skip.parent}) is left out`;
  if (skip.reason === "gone") return "its branch is not on origin";
  const against = [...(skip.withMain ? ["main"] : []), ...skip.with.map((n) => `#${n}`)];
  return `conflicts in ${ticks(skip.files)}${against.length ? ` (also changed by ${against.join(" and ")})` : ""}`;
}

/** The commit status for a pull request that went in (`state: success`) or was left out (`failure`). */
export function statusOf(entry, result) {
  const skip = result.skipped.find((s) => s.number === entry.number);
  if (skip) return { state: "failure", description: cut(`Left out of staging: ${whySkipped(skip)}`) };
  const position = result.merged.findIndex((m) => m.number === entry.number) + 1;
  const how = entry.via !== null ? `as the parent of #${entry.via}` : `${position} of ${result.merged.length}`;
  const merged = result.merged[position - 1];
  return { state: "success", description: cut(`In staging (${how})${merged?.addsNothing ? ", but it adds nothing to main" : ""}`) };
}

/** The status that takes the place of an old one on a pull request that is no longer on staging: the label came off, or it was closed. */
export const leftStatus = (open = true) => ({ state: "success", description: open ? "Not in staging (no label)" : "Not in staging (closed)" });

/** The status for the commit a pull request was reported on, when its branch is no longer on origin. */
export const goneStatus = () => ({ state: "success", description: "Not in staging (its branch is gone)" });

/** The marker of a comment, so that the same head commit is never told twice. */
export const commentMarker = (skip) => `<!-- staging-conflict ${skip.sha} -->`;

/** The comment for a pull request that staging has just stopped merging. */
export function conflictComment(skip) {
  const others = [...(skip.withMain ? ["`main`, since this branch left it"] : []), ...skip.with.map((n) => `#${n}, which is on staging before it`)];
  return [
    commentMarker(skip),
    "Staging left this pull request out because it does not merge cleanly.",
    "",
    "Conflicts in:",
    ...skip.files.map((f) => `- \`${f}\``),
    ...(others.length ? ["", `${skip.files.length === 1 ? "That file was" : "Those files were"} also changed by ${others.join(" and by ")}.`] : []),
    "",
    "Merge `main` (or the pull request above) into this branch and push, as for any pull request. Staging rebuilds by itself and the status `staging` turns green. This comment is posted once for a conflict.",
  ].join("\n");
}

/** The pull requests that were left out for a conflict (or a missing branch) that the branch on origin did not already have: news. */
export const newSkips = (result) => result.skipped.filter((s) => s.reason !== "parent" && !(result.previous?.skipped ?? []).some((p) => p.number === s.number));

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
 * Posts the statuses and the comments for a rebuild. Nothing here may fail the run: a refused call is logged and the next one goes on.
 *
 * With `repair`, nothing was rebuilt (the result is read from the manifest): a status is only set where the commit does not have it yet, and
 * the comment is looked for on every pull request left out for a conflict, not only on those that just were. That is how a call that was
 * refused after the last push is made good by a later run.
 * @param {{ setStatus(sha: string, status: { state: string, description: string, targetUrl?: string, context: string }): Promise<void>, currentStatus(sha: string, context: string): Promise<{ state: string, description: string } | null>, comments(number: number): Promise<string[]>, comment(number: number, body: string): Promise<void> }} client
 * @param {{ result: any, openPulls: any[], runUrl?: string, log?: (line: string) => void, repair?: boolean }} options
 */
export async function publish(client, { result, openPulls, runUrl, log = console.error, repair = false }) {
  const attempt = async (what, call) => {
    try {
      await call();
    } catch (e) {
      log(`could not ${what}: ${e.message}`);
    }
  };
  const status = (sha, s, what) =>
    attempt(`set the status of ${what}`, async () => {
      if (repair) {
        const current = await client.currentStatus(sha, STATUS_CONTEXT);
        if (current?.state === s.state && current.description === s.description) return;
      }
      await client.setStatus(sha, { ...s, targetUrl: runUrl, context: STATUS_CONTEXT });
    });

  for (const e of result.entries) if (e.sha) await status(e.sha, statusOf(e, result), `#${e.number}`);

  // A pull request that was on staging and is not any more (the label came off, or it was closed): the status it was given then, on the
  // commit it was given it, must not go on saying it is in. That commit is the one in the manifest, not necessarily the head now.
  const now = new Set(result.entries.map((e) => e.number));
  const stillOpen = new Set(openPulls.map((p) => p.number));
  // The same goes for one that is still listed but whose branch is gone from origin: it has no head to report on now.
  for (const old of [...(result.previous?.pulls ?? []), ...(result.previous?.skipped ?? [])]) {
    if (!old.sha) continue;
    if (!now.has(old.number)) await status(old.sha, leftStatus(stillOpen.has(old.number)), `#${old.number}`);
    else if (!result.entries.find((e) => e.number === old.number)?.sha) await status(old.sha, goneStatus(), `#${old.number}`);
  }

  for (const skip of repair ? result.skipped : newSkips(result)) {
    if (skip.reason !== "conflict") continue;
    await attempt(`comment on #${skip.number}`, async () => {
      if ((await client.comments(skip.number)).some((body) => body.includes(commentMarker(skip)))) return;
      await client.comment(skip.number, conflictComment(skip));
    });
  }
}
