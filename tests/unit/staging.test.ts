// The staging branch (scripts/lib/staging.mjs, staging-report.mjs, staging-github.mjs, docs/STAGING.md): which pull requests it holds and in what
// order (a pure function), the build on throwaway repositories (a bare "origin" and clones of it), and what a rebuild tells people.
import { afterEach, beforeEach, expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MANIFEST, StagingError, migrationWarnings, push, rebuild, selectPulls } from "../../scripts/lib/staging.mjs";
import { commentMarker, conflictComment, describe as describeResult, goneStatus, leftStatus, newSkips, publish, statusOf, summary, whySkipped } from "../../scripts/lib/staging-report.mjs";
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
  expect(git(work, "log", "-1", "--format=%B", "staging")).toMatch(/#2 feat-a [0-9a-f]{7}\n#5 feat-b [0-9a-f]{7}/);
  expect(git(work, "log", "--format=%s", "staging")).toContain("Merge #2 (feat-a) into staging");
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
  expect(git(work, "log", "-1", "--format=%B", "staging")).toMatch(/left out: #2 x2 [0-9a-f]{7} \(conflict: a\.txt\)/);
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

test("each pull request's status says whether it is in, where, or why not", () => {
  const result = sampleResult();
  expect(statusOf(result.entries[0], result)).toEqual({ state: "success", description: "In staging (1 of 4)" });
  expect(statusOf(result.entries[1], result)).toEqual({ state: "success", description: "In staging (as the parent of #3)" });
  expect(statusOf(result.entries[5], result)).toEqual({ state: "success", description: "In staging (4 of 4), but it adds nothing to main" });
  expect(statusOf(result.entries[3], result)).toEqual({ state: "failure", description: "Left out of staging: conflicts in `a.js`, `b.js` (also changed by main and #1)" });
  expect(statusOf(result.entries[4], result)).toEqual({ state: "failure", description: "Left out of staging: the pull request below it (#4) is left out" });
  expect(leftStatus()).toEqual({ state: "success", description: "Not in staging (no label)" });
  expect(leftStatus(false)).toEqual({ state: "success", description: "Not in staging (closed)" });
  expect(statusOf({ ...result.entries[3], number: 4 }, { ...result, skipped: [{ ...result.skipped[0], files: ["f".repeat(200)] }] }).description.length).toBeLessThanOrEqual(140);
  expect(whySkipped({ reason: "gone" })).toBe("its branch is not on origin");
});

test("only a pull request that was not left out before is news, and a pull request left out because of its parent never is", () => {
  const result = sampleResult();
  expect(newSkips(result).map((s: any) => s.number)).toEqual([4]);
  expect(newSkips({ ...result, previous: null }).map((s: any) => s.number)).toEqual([4]);
  expect(newSkips({ ...result, previous: { skipped: [{ number: 4 }] } })).toEqual([]);
});

test("the comment names the files and who else changed them, and carries a marker for its head commit", () => {
  const skip = sampleResult().skipped[0];
  const text = conflictComment(skip);
  expect(text.startsWith(commentMarker(skip))).toBe(true);
  expect(text).toContain("- `a.js`\n- `b.js`");
  expect(text).toContain("Those files were also changed by `main`, since this branch left it and by #1, which is on staging before it.");
  expect(conflictComment({ ...skip, files: ["a.js"], withMain: false, with: [] })).not.toContain("also changed by");
  expect(conflictComment({ ...skip, files: ["a.js"], with: [] })).toContain("That file was also changed by `main`, since this branch left it.");
  expect(text).toContain("Merge `main`");
  // the comment is the one notification, so it says where to look from then on
  expect(text).toContain("This comment is posted once.");
  expect(text).toContain("the status `staging` in this pull request's checks is where to look");
  expect(text).toContain("check it after each push");
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

function fakeClient(existingComments: Record<number, string[]> = {}, failOn?: string, current: Record<string, { state: string; description: string }> = {}) {
  const calls: any[] = [];
  return {
    calls,
    async currentStatus(sha: string, context: string) {
      calls.push(["current", sha.slice(0, 1), context]);
      return current[sha] ?? null;
    },
    async setStatus(sha: string, status: any) {
      if (failOn === "status") throw new Error("403");
      calls.push(["status", sha, status.state, status.description, status.context, status.targetUrl]);
    },
    async comments(n: number) {
      return existingComments[n] ?? [];
    },
    async comment(n: number, body: string) {
      calls.push(["comment", n, body.split("\n")[1]]);
    },
  };
}

test("publish sets a status on each pull request, clears the old ones, and comments once on what just stopped merging", async () => {
  const result = sampleResult();
  // #7 lost its label and has a new head since; #9 was closed
  const open = [...result.entries, { number: 7, head: { sha: "8".repeat(40) } }, { number: 1, head: { sha: "1".repeat(40) } }];
  const client = fakeClient();
  await publish(client, { result, openPulls: open, runUrl: "https://example.com/run/1" });
  const statuses = client.calls.filter((c) => c[0] === "status");
  expect(statuses.map((c) => [c[1].slice(0, 1), c[2]])).toEqual([["1", "success"], ["2", "success"], ["3", "success"], ["4", "failure"], ["5", "failure"], ["6", "success"], ["7", "success"], ["9", "success"]]);
  // the old status goes from the commit it was set on (the manifest's), not from the head the pull request has now
  expect(statuses.at(-2)).toEqual(["status", "7".repeat(40), "success", "Not in staging (no label)", "staging", "https://example.com/run/1"]);
  expect(statuses.at(-1)).toEqual(["status", "9".repeat(40), "success", "Not in staging (closed)", "staging", "https://example.com/run/1"]);
  expect(client.calls.some((c) => c[0] === "current")).toBe(false);
  expect(client.calls.filter((c) => c[0] === "comment")).toEqual([["comment", 4, "Staging left this pull request out because it does not merge cleanly."]]);

  // told already (the marker is on the pull request): not again
  const told = fakeClient({ 4: [`hello\n${commentMarker(result.skipped[0])}`] });
  await publish(told, { result, openPulls: open });
  expect(told.calls.filter((c) => c[0] === "comment")).toEqual([]);
  // still left out as before: not news
  const same = fakeClient();
  await publish(same, { result: { ...result, previous: { ...result.previous, skipped: [{ number: 4 }, { number: 5 }] } }, openPulls: open });
  expect(same.calls.filter((c) => c[0] === "comment")).toEqual([]);
});

test("a run that built nothing makes good what a refused call lost: the missing statuses and the missing comment, nothing twice", async () => {
  const result = { ...sampleResult(), upToDate: true, previous: { pulls: [], skipped: [{ number: 4 }, { number: 5 }] } };
  const have = { ["1".repeat(40)]: { state: "success", description: "In staging (1 of 4)" }, ["4".repeat(40)]: { state: "failure", description: "something older" } };
  const client = fakeClient({}, undefined, have);
  await publish(client, { result, openPulls: [], runUrl: "https://example.com/run/2", repair: true });

  // #1 has its status; the others are set, #4 because it says something else
  const set = client.calls.filter((c) => c[0] === "status").map((c) => c[1].slice(0, 1));
  expect(set).toEqual(["2", "3", "4", "5", "6"]);
  // the conflict comment was never posted (still not news by the manifest's account): it is now, once
  expect(client.calls.filter((c) => c[0] === "comment")).toEqual([["comment", 4, "Staging left this pull request out because it does not merge cleanly."]]);

  const told = fakeClient({ 4: [commentMarker(result.skipped[0])] });
  await publish(told, { result, openPulls: [], repair: true });
  expect(told.calls.filter((c) => c[0] === "comment")).toEqual([]);
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
  expect(statusOf(again.entries[0], again)).toEqual(statusOf(built.entries[0], built));
  expect(statusOf(again.entries[2], again)).toEqual(statusOf(built.entries[2], built));
  expect(statusOf(again.entries[3], again)).toEqual(statusOf(built.entries[3], built));
});

test("a pull request whose branch is gone loses the status of the commit it was reported on", async () => {
  const gone = { ...entry(1, "branch-1"), sha: null };
  const result = { ...sampleResult(), entries: [gone], merged: [], skipped: [{ ...gone, reason: "gone", files: [], withMain: false, with: [] }], previous: { pulls: [{ number: 1, sha: "1".repeat(40) }], skipped: [] } };
  const client = fakeClient();
  await publish(client, { result, openPulls: [{ number: 1, head: { sha: "1".repeat(40) } }] });
  expect(client.calls.filter((c) => c[0] === "status")).toEqual([["status", "1".repeat(40), "success", goneStatus().description, "staging", undefined]]);
});

test("a refused call is logged and does not stop the rest", async () => {
  const log: string[] = [];
  const client = fakeClient({}, "status");
  await publish(client, { result: sampleResult(), openPulls: [], log: (l) => log.push(l) });
  expect(log.length).toBeGreaterThan(3);
  expect(log[0]).toBe("could not set the status of #1: 403");
  expect(client.calls.filter((c) => c[0] === "comment")).toHaveLength(1);
});

test("the GitHub client lists every page of pull requests and says what GitHub answered when it refuses", async () => {
  const seen: string[] = [];
  const page = (n: number) => Array.from({ length: n }, (_, i) => ({ number: i }));
  const fetchImpl = (async (url: string, init: any) => {
    seen.push(`${init.method} ${url}`);
    if (url.includes("/statuses/")) return new Response("no", { status: 403 });
    return new Response(JSON.stringify(url.endsWith("page=1") ? page(100) : page(3)), { status: 200 });
  }) as unknown as typeof fetch;
  const client = githubClient({ repo: "me/app", token: "t", apiUrl: "https://api.test", fetchImpl });
  expect(await client.openPulls()).toHaveLength(103);
  expect(seen).toEqual(["GET https://api.test/repos/me/app/pulls?state=open&per_page=100&page=1", "GET https://api.test/repos/me/app/pulls?state=open&per_page=100&page=2"]);
  await expect(client.setStatus("abc", { state: "success", description: "d", context: "staging" })).rejects.toThrow(/POST \/statuses\/abc answered 403: no/);

  const statuses = (async () => new Response(JSON.stringify({ statuses: [{ context: "ci", state: "failure", description: "x" }, { context: "staging", state: "success", description: null }] }), { status: 200 })) as unknown as typeof fetch;
  const reader = githubClient({ repo: "me/app", token: "t", apiUrl: "https://api.test", fetchImpl: statuses });
  expect(await reader.currentStatus("abc", "staging")).toEqual({ state: "success", description: "" });
  expect(await reader.currentStatus("abc", "other")).toBeNull();
});
