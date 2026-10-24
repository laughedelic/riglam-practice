// The staging branch (scripts/lib/staging.mjs, staging-report.mjs, staging-github.mjs, docs/STAGING.md): which pull requests it holds and in what
// order (a pure function), the build on throwaway repositories (a bare "origin" and clones of it), and what a rebuild tells people.
import { afterEach, beforeEach, expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MANIFEST, StagingError, migrationWarnings, push, rebuild, selectPulls } from "../../scripts/lib/staging.mjs";
import { checkOf, describe as describeResult, goneCheck, leftCheck, leftOutWarning, newSkips, publish, summary, whySkipped } from "../../scripts/lib/staging-report.mjs";
import { githubClient } from "../../scripts/lib/staging-github.mjs";

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" } }).trim();

let root: string;
let origin: string;
let work: string;

/** A clone with an identity, so that commits and merges work without the machine's git config. */
function clone(name: string) {
  const dir = join(root, name);
  git(root, "clone", "--quiet", origin, dir);
  git(dir, "config", "user.name", "Test");
  git(dir, "config", "user.email", "test@example.com");
  return dir;
}

/** Commits `files` on a new branch off `from` and pushes it. */
function branch(cwd: string, name: string, files: Record<string, string>, from = "main") {
  git(cwd, "switch", "--quiet", "-c", name, `origin/${from}`);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(join(cwd, file, ".."), { recursive: true });
    writeFileSync(join(cwd, file), text);
  }
  git(cwd, "add", "--", ...Object.keys(files));
  git(cwd, "commit", "--quiet", "-m", `change ${Object.keys(files).join(", ")}`);
  git(cwd, "push", "--quiet", "origin", name);
  git(cwd, "switch", "--quiet", "main");
}

/** A commit on main, pushed. */
function onMain(cwd: string, files: Record<string, string>) {
  git(cwd, "switch", "--quiet", "main");
  git(cwd, "pull", "--quiet", "origin", "main");
  for (const [file, text] of Object.entries(files)) writeFileSync(join(cwd, file), text);
  git(cwd, "add", "--", ...Object.keys(files));
  git(cwd, "commit", "--quiet", "-m", `main changes ${Object.keys(files).join(", ")}`);
  git(cwd, "push", "--quiet", "origin", "main");
}

/** What staging takes of a pull request: the number and the branch decide; rebuild looks the head up on origin. */
const entry = (number: number, branchName: string, extra: Record<string, unknown> = {}) => ({ number, title: `pull request ${number}`, branch: branchName, base: "main", sha: null, parent: null, labeled: true, via: null, ...extra });

/** A pull request as the REST API lists it. */
const pull = (number: number, head: string, extra: Record<string, unknown> = {}) => ({
  number,
  title: `pull request ${number}`,
  state: "open",
  draft: true,
  labels: [] as { name: string }[],
  head: { ref: head, sha: `${number}`.repeat(40).slice(0, 40), repo: { full_name: "me/app" } as { full_name: string } | null },
  base: { ref: "main" },
  ...extra,
});
const labeled = (p: ReturnType<typeof pull>, name = "staging") => ({ ...p, labels: [{ name }] });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "riglam-staging-test-"));
  origin = join(root, "origin.git");
  mkdirSync(origin);
  git(origin, "init", "--quiet", "--bare", "-b", "main");
  const seed = join(root, "seed");
  mkdirSync(seed);
  git(seed, "init", "--quiet", "-b", "main");
  git(seed, "config", "user.name", "Test");
  git(seed, "config", "user.email", "test@example.com");
  writeFileSync(join(seed, "a.txt"), "one\ntwo\nthree\n");
  git(seed, "add", "--", "a.txt");
  git(seed, "commit", "--quiet", "-m", "start");
  git(seed, "push", "--quiet", origin, "main");
  work = clone("work");
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

// ---- which pull requests, in what order ----

test("only open pull requests with the label go in, in number order", () => {
  const { entries, ignored } = selectPulls([labeled(pull(9, "n9")), pull(5, "n5"), labeled(pull(3, "n3")), labeled(pull(7, "n7"), "other"), labeled({ ...pull(8, "n8"), state: "closed" })], { repo: "me/app" });
  expect(entries.map((e) => e.number)).toEqual([3, 9]);
  expect(entries.every((e) => e.labeled && e.via === null && e.parent === null)).toBe(true);
  expect(ignored).toEqual([]);
});

test("a labeled pull request brings the open pull requests it is stacked on, parents first", () => {
  const pulls = [pull(10, "a"), pull(11, "b", { base: { ref: "a" } }), labeled(pull(12, "c", { base: { ref: "b" } })), pull(13, "d", { base: { ref: "c" } })];
  const { entries } = selectPulls(pulls, { repo: "me/app" });
  expect(entries.map((e) => [e.number, e.labeled, e.via, e.parent])).toEqual([
    [10, false, 12, null],
    [11, false, 12, 10],
    [12, true, null, 11],
  ]);
});

test("stacks stay together and the rest goes by number; a pull request already in as a parent is not repeated", () => {
  const pulls = [labeled(pull(20, "s1")), labeled(pull(21, "s1-top", { base: { ref: "s1" } })), labeled(pull(15, "solo")), labeled(pull(30, "later")), labeled(pull(16, "x")), pull(17, "x-top", { base: { ref: "x" } }), labeled(pull(18, "x-top2", { base: { ref: "x-top" } }))];
  const { entries } = selectPulls(pulls, { repo: "me/app" });
  expect(entries.map((e) => e.number)).toEqual([15, 16, 17, 18, 20, 21, 30]);
  expect(entries.find((e) => e.number === 17)).toMatchObject({ labeled: false, via: 18, parent: 16 });
});

test("a base branch with no open pull request is nothing to wait for", () => {
  const { entries } = selectPulls([labeled(pull(4, "child", { base: { ref: "old-parent" } }))], { repo: "me/app" });
  expect(entries).toEqual([expect.objectContaining({ number: 4, parent: null, base: "old-parent" })]);
});

test("a labeled pull request from a fork is left out and said so", () => {
  const fork = labeled({ ...pull(6, "fork-branch"), head: { ref: "fork-branch", sha: "a".repeat(40), repo: { full_name: "someone/app" } } });
  const gone = labeled({ ...pull(7, "gone-fork"), head: { ref: "gone-fork", sha: "b".repeat(40), repo: null } });
  const { entries, ignored } = selectPulls([fork, gone, labeled(pull(8, "mine"))], { repo: "Me/App" });
  expect(entries.map((e) => e.number)).toEqual([8]);
  expect(ignored.map((i) => i.number)).toEqual([6, 7]);
});

test("labels may be plain names, and a different label can be asked for", () => {
  const { entries } = selectPulls([{ ...pull(2, "x"), labels: ["try"] }, pull(3, "y")], { repo: "me/app", label: "try" });
  expect(entries.map((e) => e.number)).toEqual([2]);
});

test("pull requests whose bases lead round in a circle still go in", () => {
  const { entries } = selectPulls([labeled(pull(1, "a", { base: { ref: "b" } })), labeled(pull(2, "b", { base: { ref: "a" } }))], { repo: "me/app" });
  expect(entries.map((e) => e.number)).toEqual([1, 2]);
});

// ---- the build ----

test("the staging commit is main with each pull request merged in the given order, and one commit that records what went in", () => {
  branch(work, "feat-a", { "b.txt": "b\n" });
  branch(work, "feat-b", { "c.txt": "c\n" });
  const result = rebuild({ cwd: work, entries: [entry(2, "feat-a"), entry(5, "feat-b")] });

  expect(result.upToDate).toBe(false);
  expect(git(work, "rev-parse", "staging")).toBe(result.sha);
  expect(git(work, "show", "staging:b.txt")).toBe("b");
  expect(git(work, "show", "staging:c.txt")).toBe("c");
  expect(git(work, "show", "staging:a.txt")).toBe("one\ntwo\nthree");
  const manifest = JSON.parse(git(work, "show", `staging:${MANIFEST}`));
  expect(manifest).toMatchObject({ base: "main", baseSha: result.baseSha, branches: ["feat-a", "feat-b"] });
  expect(manifest.pulls).toEqual([
    { number: 2, branch: "feat-a", sha: git(work, "rev-parse", "origin/feat-a") },
    { number: 5, branch: "feat-b", sha: git(work, "rev-parse", "origin/feat-b") },
  ]);
  expect(manifest.inputs).toEqual([`2@${git(work, "rev-parse", "origin/feat-a")}`, `5@${git(work, "rev-parse", "origin/feat-b")}`]);
  expect(result.merged.map((m) => m.number)).toEqual([2, 5]);
  expect(git(work, "log", "-1", "--format=%B", "staging")).toMatch(/PR 2 feat-a [0-9a-f]{7}\nPR 5 feat-b [0-9a-f]{7}/);
  expect(git(work, "log", "--format=%s", "staging")).toContain("Merge PR 2 (feat-a) into staging");
  // no `#2`: GitHub would add a "referenced this pull request" event to the pull request for every rebuild
  expect(git(work, "log", "--format=%B", "origin/main..staging")).not.toMatch(/#\d/);
  // main itself did not move, and the worktree used for the build is gone
  expect(git(work, "rev-parse", "origin/main")).toBe(result.baseSha);
  expect(git(work, "worktree", "list").split("\n")).toHaveLength(1);
});

test("nothing is kept from an earlier build: a pull request that left the list leaves the branch", () => {
  branch(work, "feat-a", { "b.txt": "b\n" });
  branch(work, "feat-b", { "c.txt": "c\n" });
  rebuild({ cwd: work, entries: [entry(2, "feat-a"), entry(5, "feat-b")] });
  push({ cwd: work });

  const other = clone("other");
  const again = rebuild({ cwd: other, entries: [entry(5, "feat-b")] });
  expect(again.merged.map((m) => m.number)).toEqual([5]);
  expect(() => git(other, "show", "staging:b.txt")).toThrow();
  expect(git(other, "show", "staging:c.txt")).toBe("c");
});

test("no pull request at all makes staging main", () => {
  const result = rebuild({ cwd: work, entries: [] });
  expect(git(work, "rev-parse", "staging^")).toBe(result.baseSha);
  expect(git(work, "diff", "--name-only", "origin/main", "staging")).toBe(MANIFEST);
});

test("a branch stacked on another merges after it and brings no conflict with its own parent", () => {
  branch(work, "feat-a", { "a.txt": "one\nTWO-a\nthree\n" });
  branch(work, "feat-s", { "a.txt": "one\nTWO-a\nTHREE-s\n" }, "feat-a");
  const result = rebuild({ cwd: work, entries: [entry(2, "feat-a"), entry(3, "feat-s", { base: "feat-a", parent: 2 })] });
  expect(git(work, "show", "staging:a.txt")).toBe("one\nTWO-a\nTHREE-s");
  expect(result.skipped).toEqual([]);
});

test("a conflict leaves that pull request out, names the files and who else changed them, and the others still go in", () => {
  branch(work, "x1", { "a.txt": "one\nTWO-x1\nthree\n" });
  branch(work, "x2", { "a.txt": "one\nTWO-x2\nthree\n" });
  branch(work, "x3", { "d.txt": "d\n" });
  const result = rebuild({ cwd: work, entries: [entry(1, "x1"), entry(2, "x2"), entry(3, "x3")] });

  expect(result.merged.map((m) => m.number)).toEqual([1, 3]);
  expect(result.skipped).toEqual([expect.objectContaining({ number: 2, reason: "conflict", files: ["a.txt"], with: [1], withMain: false })]);
  expect(git(work, "show", "staging:a.txt")).toBe("one\nTWO-x1\nthree");
  expect(git(work, "show", "staging:d.txt")).toBe("d");
  expect(JSON.parse(git(work, "show", `staging:${MANIFEST}`)).skipped).toEqual([expect.objectContaining({ number: 2, reason: "conflict", files: ["a.txt"] })]);
  expect(git(work, "log", "-1", "--format=%B", "staging")).toMatch(/left out: PR 2 x2 [0-9a-f]{7} \(conflict: a\.txt\)/);
  expect(git(work, "worktree", "list").split("\n")).toHaveLength(1);
  expect(git(work, "status", "--porcelain", "--untracked-files=no")).toBe("");
});

test("a conflict with main says so", () => {
  branch(work, "old", { "a.txt": "one\nTWO-old\nthree\n" });
  onMain(work, { "a.txt": "one\nTWO-main\nthree\n" });
  const result = rebuild({ cwd: work, entries: [entry(1, "old")] });
  expect(result.skipped).toEqual([expect.objectContaining({ number: 1, files: ["a.txt"], withMain: true, with: [] })]);
  expect(result.merged).toEqual([]);
});

test("a pull request stacked on one that is left out is left out with it, whatever its own changes", () => {
  branch(work, "p", { "a.txt": "one\nTWO-p\nthree\n" });
  branch(work, "q", { "q.txt": "q\n" }, "p");
  branch(work, "r", { "r.txt": "r\n" });
  onMain(work, { "a.txt": "one\nTWO-main\nthree\n" });
  const result = rebuild({ cwd: work, entries: [entry(1, "p"), entry(2, "q", { base: "p", parent: 1 }), entry(3, "r")] });
  expect(result.skipped.map((s) => [s.number, s.reason])).toEqual([[1, "conflict"], [2, "parent"]]);
  expect(result.merged.map((m) => m.number)).toEqual([3]);
  expect(() => git(work, "show", "staging:q.txt")).toThrow();
});

test("a branch that is not on origin is left out, not an error", () => {
  branch(work, "feat-a", { "b.txt": "b\n" });
  const result = rebuild({ cwd: work, entries: [entry(1, "gone"), entry(2, "feat-a")] });
  expect(result.skipped).toEqual([expect.objectContaining({ number: 1, reason: "gone", sha: null })]);
  expect(result.merged.map((m) => m.number)).toEqual([2]);
});

test("a branch whose change is already in main is reported as adding nothing", () => {
  branch(work, "feat-a", { "b.txt": "b\n" });
  // the same change lands on main as another commit, as a squash merge does
  onMain(work, { "b.txt": "b\n" });
  const result = rebuild({ cwd: work, entries: [entry(1, "feat-a")] });
  expect(result.merged).toEqual([expect.objectContaining({ number: 1, addsNothing: true })]);
});

test("the build uses the head that origin has now, not the one the list had", () => {
  branch(work, "feat-a", { "b.txt": "first\n" });
  const stale = git(work, "rev-parse", "origin/feat-a");
  git(work, "switch", "--quiet", "feat-a");
  writeFileSync(join(work, "b.txt"), "second\n");
  git(work, "commit", "--quiet", "-am", "more");
  git(work, "push", "--quiet", "origin", "feat-a");
  git(work, "switch", "--quiet", "main");
  rebuild({ cwd: work, entries: [entry(1, "feat-a", { sha: stale })] });
  expect(git(work, "show", "staging:b.txt")).toBe("second");
});

test("the same inputs as origin/staging build nothing; a new head, a moved main or a different set builds again", () => {
  branch(work, "feat-a", { "b.txt": "b\n" });
  branch(work, "feat-b", { "c.txt": "c\n" });
  const first = rebuild({ cwd: work, entries: [entry(1, "feat-a")] });
  push({ cwd: work });

  const again = rebuild({ cwd: work, entries: [entry(1, "feat-a")] });
  expect(again.upToDate).toBe(true);
  expect(again.sha).toBe(first.sha);
  expect(git(work, "rev-parse", "staging")).toBe(first.sha);
  expect(rebuild({ cwd: work, entries: [entry(1, "feat-a")], force: true }).upToDate).toBe(false);

  expect(rebuild({ cwd: work, entries: [entry(1, "feat-a"), entry(2, "feat-b")] }).upToDate).toBe(false);
  push({ cwd: work });
  expect(rebuild({ cwd: work, entries: [entry(1, "feat-a"), entry(2, "feat-b")] }).upToDate).toBe(true);

  onMain(work, { "m.txt": "m\n" });
  expect(rebuild({ cwd: work, entries: [entry(1, "feat-a"), entry(2, "feat-b")] }).upToDate).toBe(false);
});

test("a pull request retargeted to another base is built again though its head did not move", () => {
  branch(work, "p", { "a.txt": "one\nTWO-p\nthree\n" });
  branch(work, "q", { "q.txt": "q\n" }, "p");
  const stacked = [entry(1, "p"), entry(2, "q", { base: "p", parent: 1 })];
  rebuild({ cwd: work, entries: stacked });
  expect(JSON.parse(git(work, "show", `staging:${MANIFEST}`)).inputs[1]).toMatch(/^2@[0-9a-f]{40}<1$/);
  push({ cwd: work });
  expect(rebuild({ cwd: work, entries: stacked }).upToDate).toBe(true);
  expect(rebuild({ cwd: work, entries: [entry(1, "p"), entry(2, "q")] }).upToDate).toBe(false);
});

test("a manifest from before the rebuild had inputs is rebuilt", () => {
  branch(work, "feat-a", { "b.txt": "b\n" });
  git(work, "switch", "--quiet", "-c", "staging", "origin/main");
  writeFileSync(join(work, MANIFEST), `${JSON.stringify({ base: "main", branches: ["feat-a"] })}\n`);
  git(work, "add", "--", MANIFEST);
  git(work, "commit", "--quiet", "-m", "old staging");
  git(work, "push", "--quiet", "origin", "staging");
  git(work, "switch", "--quiet", "main");
  git(work, "branch", "--quiet", "-D", "staging");
  expect(rebuild({ cwd: work, entries: [entry(1, "feat-a")] }).upToDate).toBe(false);
});

test("two migrations with the same number are warned about", () => {
  expect(migrationWarnings(["worker/migrations/0006_a.sql", "worker/migrations/0007_b.sql", "worker/migrations/0006_c.sql"])).toEqual(["migrations with the same number, applied in the order of their names: 0006_a.sql, 0006_c.sql"]);
  expect(migrationWarnings(["worker/migrations/0001_init.sql", "worker/migrations/0002_accounts.sql"])).toEqual([]);

  branch(work, "m1", { "worker/migrations/0001_one.sql": "select 1;\n" });
  branch(work, "m2", { "worker/migrations/0001_two.sql": "select 2;\n" });
  expect(rebuild({ cwd: work, entries: [entry(1, "m1"), entry(2, "m2")] }).warnings).toEqual(["migrations with the same number, applied in the order of their names: 0001_one.sql, 0001_two.sql"]);
});

test("a push is refused when origin/staging moved since the last fetch", () => {
  branch(work, "feat-a", { "b.txt": "b\n" });
  branch(work, "feat-b", { "c.txt": "c\n" });
  rebuild({ cwd: work, entries: [entry(1, "feat-a")] });
  push({ cwd: work });

  rebuild({ cwd: work, entries: [entry(1, "feat-a"), entry(2, "feat-b")] }); // fetches, so this clone has seen the first push
  const other = clone("other");
  rebuild({ cwd: other, entries: [] });
  push({ cwd: other }); // someone else moves origin/staging meanwhile

  expect(() => push({ cwd: work })).toThrow(StagingError);
  expect(git(origin, "rev-parse", "staging")).toBe(git(other, "rev-parse", "staging"));
});

// ---- what a rebuild tells people ----

/** The result of a rebuild with one pull request in, one stacked on it, one that conflicts with it, and one that stopped merging before. */
function sampleResult() {
  const sha = (c: string) => c.repeat(40);
  const e = (number: number, extra: Record<string, unknown> = {}) => ({ ...entry(number, `branch-${number}`), sha: sha(String(number)), ...extra });
  const entries = [e(1), e(2, { labeled: false, via: 3, parent: 1 }), e(3, { parent: 2 }), e(4), e(5), e(6)];
  return {
    upToDate: false,
    sha: sha("f"),
    baseSha: sha("e"),
    entries,
    merged: [entries[0], entries[1], entries[2], { ...entries[5], addsNothing: true }].map((x) => ({ ...x, addsNothing: Boolean((x as any).addsNothing) })),
    skipped: [
      { ...entries[3], reason: "conflict", files: ["a.js", "b.js"], withMain: true, with: [1], },
      { ...entries[4], reason: "parent", parent: 4, files: [], withMain: false, with: [] },
    ],
    warnings: ["something to know"],
    previous: { pulls: [{ number: 1, sha: "1".repeat(40) }, { number: 7, sha: "7".repeat(40) }, { number: 9, sha: "9".repeat(40) }], skipped: [{ number: 5, sha: "5".repeat(40) }] },
  };
}

test("each pull request's check says whether it is in, where, or why not", () => {
  const result = sampleResult();
  expect(checkOf(result.entries[0], result)).toEqual({ conclusion: "success", title: "In staging", summary: expect.stringContaining("on the `staging` branch") });
  expect(checkOf(result.entries[1], result).title).toBe("In staging, as the parent of #3");
  expect(checkOf(result.entries[5], result).title).toBe("In staging, but it adds nothing to main");
  const left = checkOf(result.entries[3], result);
  expect(left).toEqual({ conclusion: "failure", title: "Left out of staging: conflicts in `a.js`, `b.js` (also changed by main and #1)", summary: expect.stringContaining("Conflicts in:\n- `a.js`\n- `b.js`") });
  // the summary is all an agent that follows the pull request is shown, so it names the files, who else changed them, and what to do
  expect(left.summary).toContain("Those files were also changed by `main`, since this branch left it and by #1, which is on staging before it.");
  expect(left.summary).toContain("Merge `main` (or the pull request above) into this branch and push");
  expect(left.summary).toContain("turns green when the branch merges cleanly");
  const one = { ...result.skipped[0], files: ["a.js"] };
  expect(checkOf(result.entries[3], { ...result, skipped: [{ ...one, withMain: false, with: [] }] }).summary).not.toContain("also changed by");
  expect(checkOf(result.entries[3], { ...result, skipped: [{ ...one, with: [] }] }).summary).toContain("That file was also changed by `main`, since this branch left it.");
  // a conflict in thousands of files still fits in what GitHub accepts, so the red check is made
  const many = Array.from({ length: 5000 }, (_, i) => `src/generated/file-${i}.json`);
  const big = checkOf(result.entries[3], { ...result, skipped: [{ ...one, files: many }] });
  expect(big.summary.length).toBeLessThan(10000);
  expect(big.summary).toContain("- `src/generated/file-39.json`\n- and 4960 more");
  expect(big.summary).not.toContain("file-40.json");
  expect(big.title.length).toBeLessThanOrEqual(140);
  expect(checkOf(result.entries[4], result)).toEqual({ conclusion: "failure", title: "Left out of staging: the pull request below it (#4) is left out", summary: expect.stringContaining("the pull request below it (#4) is left out") });
  expect(leftCheck()).toEqual({ conclusion: "neutral", title: "Not in staging (no label)", summary: expect.stringContaining("does not have the label") });
  expect(leftCheck(false)).toEqual({ conclusion: "neutral", title: "Not in staging (closed)", summary: expect.stringContaining("closed or merged") });
  expect(goneCheck().title).toBe("Not in staging (its branch is gone)");
  expect(checkOf({ ...result.entries[3], number: 4 }, { ...result, skipped: [{ ...result.skipped[0], files: ["f".repeat(200)] }] }).title.length).toBeLessThanOrEqual(140);
  expect(whySkipped({ reason: "gone" })).toBe("its branch is not on origin");
  // the text of a pull request that is in does not depend on who else is, so another pull request joining does not make a new check
  expect(checkOf(result.entries[0], { ...result, merged: [...result.merged, { ...result.entries[3], addsNothing: false }] })).toEqual(checkOf(result.entries[0], result));
});

test("only a pull request that was not left out before is news, and a pull request left out because of its parent never is", () => {
  const result = sampleResult();
  expect(newSkips(result).map((s: any) => s.number)).toEqual([4]);
  expect(newSkips({ ...result, previous: null }).map((s: any) => s.number)).toEqual([4]);
  expect(newSkips({ ...result, previous: { skipped: [{ number: 4 }] } })).toEqual([]);
});

test("the warning on the run keeps a name from a pull request from starting another workflow command", () => {
  expect(leftOutWarning("#4 feat: conflicts in `a.js`")).toBe("::warning title=Left out of staging::#4 feat: conflicts in `a.js`");
  const text = leftOutWarning("#4 x: conflicts in `a\n::add-mask::secret\r::warning::y` 100%");
  expect(text.split("\n")).toHaveLength(1);
  expect(text).toBe("::warning title=Left out of staging::#4 x: conflicts in `a%0A::add-mask::secret%0D::warning::y` 100%25");
});

test("the log and the run summary list what went in and what was left out", () => {
  const result = sampleResult();
  expect(describeResult(result)).toContain("  - #4 branch-4: left out, conflicts in `a.js`, `b.js`");
  expect(describeResult(result)).toContain("  ! something to know");
  const md = summary(result, { runUrl: "https://example.com/run/1" });
  expect(md).toContain("`main` eeeeeee and 4 pull requests, 2 left out");
  expect(md).toContain("| #4 | pull request 4 | `branch-4` | `4444444` | **left out** conflicts in");
  expect(md).toContain("[This run](https://example.com/run/1)");
  expect(describeResult({ ...result, upToDate: true })).toContain("built from these inputs already");
  expect(summary({ ...result, upToDate: true })).toContain("Nothing to do");
});

function fakeClient(failOn?: string, current: Record<string, { conclusion: string; title: string; summary: string }> = {}, closed: number[] = []) {
  const calls: any[] = [];
  return {
    calls,
    async currentCheck(sha: string, name: string) {
      calls.push(["current", sha.slice(0, 1), name]);
      return current[sha] ?? null;
    },
    async setCheck(sha: string, check: any) {
      if (failOn === "check") throw new Error("403");
      calls.push(["check", sha, check.conclusion, check.title, check.name, check.detailsUrl]);
    },
    async closedLabeled(label: string) {
      calls.push(["closed", label]);
      return closed;
    },
    async removeLabel(n: number, label: string) {
      calls.push(["unlabel", n, label]);
    },
  };
}

test("publish sets a check on each pull request, clears the old ones, and tidies the labels", async () => {
  const result = sampleResult();
  // #7 lost its label and has a new head since; #9 was closed; #11 and #12 were merged or closed a while ago and still have the label
  const open = [...result.entries, { number: 7, head: { sha: "8".repeat(40) } }, { number: 1, head: { sha: "1".repeat(40) } }];
  const client = fakeClient(undefined, {}, [11, 12]);
  await publish(client, { result, openPulls: open, runUrl: "https://example.com/run/1", label: "staging" });
  const checks = client.calls.filter((c) => c[0] === "check");
  expect(checks.map((c) => [c[1].slice(0, 1), c[2]])).toEqual([["1", "success"], ["2", "success"], ["3", "success"], ["4", "failure"], ["5", "failure"], ["6", "success"], ["7", "neutral"], ["9", "neutral"]]);
  // the old check goes on the commit it was set on (the manifest's), not on the head the pull request has now
  expect(checks.at(-2)).toEqual(["check", "7".repeat(40), "neutral", "Not in staging (no label)", "staging", "https://example.com/run/1"]);
  expect(checks.at(-1)).toEqual(["check", "9".repeat(40), "neutral", "Not in staging (closed)", "staging", "https://example.com/run/1"]);
  expect(client.calls.filter((c) => c[0] === "unlabel")).toEqual([["unlabel", 11, "staging"], ["unlabel", 12, "staging"]]);

  // no label to look for, nothing to tidy
  const bare = fakeClient();
  await publish(bare, { result, openPulls: open });
  expect(bare.calls.some((c) => c[0] === "closed" || c[0] === "unlabel")).toBe(false);
});

test("a pull request that stays as it was is not told again, so a rebuild or a run that built nothing makes no new check for it", async () => {
  const result = sampleResult();
  const have = Object.fromEntries(result.entries.map((e) => [e.sha, checkOf(e, result)]));
  const client = fakeClient(undefined, have);
  await publish(client, { result, openPulls: [] });
  // only the two that left staging are new
  expect(client.calls.filter((c) => c[0] === "check").map((c) => c[1].slice(0, 1))).toEqual(["7", "9"]);
  // a change of what is said is told: #4 was left out for another file
  const moved = fakeClient(undefined, { ...have, ["4".repeat(40)]: { ...have["4".repeat(40)], summary: "something older" } });
  await publish(moved, { result, openPulls: [] });
  expect(moved.calls.filter((c) => c[0] === "check").map((c) => [c[1].slice(0, 1), c[2]])).toEqual([["4", "failure"], ["7", "neutral"], ["9", "neutral"]]);
  // and what a refused call lost after the last push is made good: #1 and #4 have none
  const lost = fakeClient(undefined, { ...have, ["1".repeat(40)]: undefined as any, ["4".repeat(40)]: undefined as any });
  await publish(lost, { result: { ...result, upToDate: true }, openPulls: [], runUrl: "https://example.com/run/2" });
  expect(lost.calls.filter((c) => c[0] === "check").map((c) => c[1].slice(0, 1))).toEqual(["1", "4", "7", "9"]);
});

test("a run that built nothing reads what went in and what was left out from the manifest", () => {
  branch(work, "p", { "a.txt": "one\nTWO-p\nthree\n" });
  branch(work, "q", { "q.txt": "q\n" }, "p");
  branch(work, "r", { "r.txt": "r\n" });
  branch(work, "same", { "s.txt": "s\n" });
  onMain(work, { "a.txt": "one\nTWO-main\nthree\n", "s.txt": "s\n" });
  const entries = [entry(1, "p"), entry(2, "q", { base: "p", parent: 1 }), entry(3, "r"), entry(4, "same", { labeled: false, via: 3 })];
  const built = rebuild({ cwd: work, entries });
  push({ cwd: work });

  const again = rebuild({ cwd: work, entries });
  expect(again.upToDate).toBe(true);
  expect(again.merged.map((m) => [m.number, m.addsNothing, m.via])).toEqual(built.merged.map((m) => [m.number, m.addsNothing, m.via]));
  expect(again.merged.find((m) => m.number === 4)?.addsNothing).toBe(true);
  expect(again.skipped).toEqual([
    expect.objectContaining({ number: 1, reason: "conflict", files: ["a.txt"], withMain: true, with: [], title: "pull request 1" }),
    expect.objectContaining({ number: 2, reason: "parent", parent: 1, withMain: false, with: [] }),
  ]);
  // so that the texts are the same as after the build
  expect(checkOf(again.entries[0], again)).toEqual(checkOf(built.entries[0], built));
  expect(checkOf(again.entries[2], again)).toEqual(checkOf(built.entries[2], built));
  expect(checkOf(again.entries[3], again)).toEqual(checkOf(built.entries[3], built));
});

test("a pull request whose branch is gone loses the check of the commit it was reported on", async () => {
  const gone = { ...entry(1, "branch-1"), sha: null };
  const result = { ...sampleResult(), entries: [gone], merged: [], skipped: [{ ...gone, reason: "gone", files: [], withMain: false, with: [] }], previous: { pulls: [{ number: 1, sha: "1".repeat(40) }], skipped: [] } };
  const client = fakeClient();
  await publish(client, { result, openPulls: [{ number: 1, head: { sha: "1".repeat(40) } }] });
  expect(client.calls.filter((c) => c[0] === "check")).toEqual([["check", "1".repeat(40), "neutral", goneCheck().title, "staging", undefined]]);
});

test("a refused call is logged and does not stop the rest", async () => {
  const log: string[] = [];
  const client = fakeClient("check", {}, [11]);
  await publish(client, { result: sampleResult(), openPulls: [], label: "staging", log: (l) => log.push(l) });
  expect(log.length).toBeGreaterThan(3);
  expect(log[0]).toBe("could not report the check of #1: 403");
  expect(client.calls.filter((c) => c[0] === "unlabel")).toEqual([["unlabel", 11, "staging"]]);
});

test("the GitHub client lists every page of pull requests and says what GitHub answered when it refuses", async () => {
  const seen: string[] = [];
  const page = (n: number) => Array.from({ length: n }, (_, i) => ({ number: i }));
  const fetchImpl = (async (url: string, init: any) => {
    seen.push(`${init.method} ${url}`);
    if (url.includes("/check-runs") && init.method === "POST") return new Response("no", { status: 403 });
    return new Response(JSON.stringify(url.endsWith("page=1") ? page(100) : page(3)), { status: 200 });
  }) as unknown as typeof fetch;
  const client = githubClient({ repo: "me/app", token: "t", apiUrl: "https://api.test", fetchImpl });
  expect(await client.openPulls()).toHaveLength(103);
  expect(seen).toEqual(["GET https://api.test/repos/me/app/pulls?state=open&per_page=100&page=1", "GET https://api.test/repos/me/app/pulls?state=open&per_page=100&page=2"]);
  await expect(client.setCheck("abc", { name: "staging", conclusion: "success", title: "t", summary: "s" })).rejects.toThrow(/POST \/check-runs answered 403: no/);
});

test("the GitHub client reads the check run its own app made, makes a finished one, and tidies labels", async () => {
  const sent: { method: string; url: string; body?: any }[] = [];
  const answers: Record<string, () => Response> = {
    "GET /commits/abc/check-runs": () =>
      new Response(JSON.stringify({ check_runs: [
        { id: 1, app: { slug: "github-actions" }, conclusion: "failure", output: { title: "older", summary: "x" } },
        { id: 3, app: { slug: "some-bot" }, conclusion: "success", output: { title: "another app", summary: "y" } },
        { id: 2, app: { slug: "github-actions" }, conclusion: "success", output: { title: "newer", summary: null } },
      ] }), { status: 200 }),
    "GET /issues": () => new Response(JSON.stringify([{ number: 5, pull_request: {} }, { number: 6 }, { number: 7, pull_request: {} }]), { status: 200 }),
    "DELETE /issues/7/labels/staging": () => new Response("gone", { status: 404 }),
    "DELETE /issues/8/labels/staging": () => new Response("no", { status: 403 }),
  };
  const fetchImpl = (async (url: string, init: any) => {
    const path = url.replace("https://api.test/repos/me/app", "");
    sent.push({ method: init.method, url: path, body: init.body ? JSON.parse(init.body) : undefined });
    return (answers[`${init.method} ${path.split("?")[0]}`] ?? (() => new Response("{}", { status: 201 })))();
  }) as unknown as typeof fetch;
  const client = githubClient({ repo: "me/app", token: "t", apiUrl: "https://api.test", fetchImpl });

  expect(await client.currentCheck("abc", "staging")).toEqual({ conclusion: "success", title: "newer", summary: "" });
  expect(sent[0].url).toBe("/commits/abc/check-runs?check_name=staging&per_page=100");
  await client.setCheck("abc", { name: "staging", conclusion: "failure", title: "t", summary: "s", detailsUrl: "https://example.com/run/1" });
  expect(sent.at(-1)).toEqual({ method: "POST", url: "/check-runs", body: { name: "staging", head_sha: "abc", status: "completed", conclusion: "failure", output: { title: "t", summary: "s" }, details_url: "https://example.com/run/1" } });

  expect(await client.closedLabeled("staging")).toEqual([5, 7]);
  expect(sent.at(-1)?.url).toBe("/issues?state=closed&labels=staging&per_page=100&page=1");
  await client.removeLabel(5, "staging");
  expect(sent.at(-1)).toEqual({ method: "DELETE", url: "/issues/5/labels/staging", body: undefined });
  await client.removeLabel(7, "staging"); // it did not have the label any more: fine
  await expect(client.removeLabel(8, "staging")).rejects.toThrow(/answered 403/);
});
