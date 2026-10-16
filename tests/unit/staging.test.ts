// The staging branch script (scripts/lib/staging.mjs, docs/STAGING.md) on throwaway repositories: a bare "origin" and clones of it.
import { afterEach, beforeEach, expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConflictError, MANIFEST, StagingError, planBranches, push, rebuild } from "../../scripts/lib/staging.mjs";

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
  for (const [file, text] of Object.entries(files)) writeFileSync(join(cwd, file), text);
  git(cwd, "add", "--", ...Object.keys(files));
  git(cwd, "commit", "--quiet", "-m", `change ${Object.keys(files).join(", ")}`);
  git(cwd, "push", "--quiet", "origin", name);
  git(cwd, "switch", "--quiet", "main");
}

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

test("planBranches keeps the order, appends new names, drops removed ones and repeats", () => {
  expect(planBranches(["a", "b"], ["c", "a"], [])).toEqual(["a", "b", "c"]);
  expect(planBranches(["a", "b", "c"], ["d"], ["b"])).toEqual(["a", "c", "d"]);
  expect(planBranches([], [], [])).toEqual([]);
});

test("the staging commit is main with each listed branch merged in order, and one commit that records the list", () => {
  branch(work, "feat-a", { "b.txt": "b\n" });
  branch(work, "feat-b", { "c.txt": "c\n" });
  const result = rebuild({ cwd: work, add: ["feat-a", "feat-b"] });

  expect(git(work, "rev-parse", "staging")).toBe(result.sha);
  expect(git(work, "show", "staging:b.txt")).toBe("b");
  expect(git(work, "show", "staging:c.txt")).toBe("c");
  expect(git(work, "show", "staging:a.txt")).toBe("one\ntwo\nthree");
  expect(JSON.parse(git(work, "show", `staging:${MANIFEST}`))).toEqual({ base: "main", branches: ["feat-a", "feat-b"] });
  expect(result.merged.map((m) => m.branch)).toEqual(["feat-a", "feat-b"]);
  expect(git(work, "log", "-1", "--format=%B", "staging")).toMatch(/feat-a [0-9a-f]{7}\nfeat-b [0-9a-f]{7}/);
  // main itself did not move, and the worktree used for the build is gone
  expect(git(work, "rev-parse", "origin/main")).toBe(result.baseSha);
  expect(git(work, "worktree", "list").split("\n")).toHaveLength(1);
});

test("the next rebuild, also from another clone, takes the list from origin/staging; --add and --remove change it", () => {
  branch(work, "feat-a", { "b.txt": "b\n" });
  branch(work, "feat-b", { "c.txt": "c\n" });
  branch(work, "feat-c", { "d.txt": "d\n" });
  rebuild({ cwd: work, add: ["feat-a", "feat-b"] });
  push({ cwd: work });

  const other = clone("other");
  const again = rebuild({ cwd: other });
  expect(again.merged.map((m) => m.branch)).toEqual(["feat-a", "feat-b"]);

  const changed = rebuild({ cwd: other, remove: ["feat-a"], add: ["feat-c"] });
  expect(changed.merged.map((m) => m.branch)).toEqual(["feat-b", "feat-c"]);
  expect(() => git(other, "show", "staging:b.txt")).toThrow();
  expect(git(other, "show", "staging:d.txt")).toBe("d");
});

test("a branch stacked on another merges after it", () => {
  branch(work, "feat-a", { "b.txt": "b\n" });
  branch(work, "feat-s", { "c.txt": "c\n" }, "feat-a");
  const result = rebuild({ cwd: work, add: ["feat-a", "feat-s"] });
  expect(git(work, "show", "staging:c.txt")).toBe("c");
  expect(result.merged.every((m) => !m.addsNothing)).toBe(true);
});

test("a conflict names the branch and the files, leaves staging where it was and removes its scratch checkout", () => {
  branch(work, "x1", { "a.txt": "one\nTWO-x1\nthree\n" });
  branch(work, "x2", { "a.txt": "one\nTWO-x2\nthree\n" });
  try {
    rebuild({ cwd: work, add: ["x1", "x2"] });
    expect.unreachable("the second branch changes the same line");
  } catch (e) {
    expect(e).toBeInstanceOf(ConflictError);
    const conflict = e as InstanceType<typeof ConflictError>;
    expect(conflict.branch).toBe("x2");
    expect(conflict.files).toEqual(["a.txt"]);
    expect(conflict.merged).toEqual(["x1"]);
  }
  expect(() => git(work, "rev-parse", "--verify", "staging")).toThrow();
  expect(git(work, "worktree", "list").split("\n")).toHaveLength(1);
});

test("a branch that is not on origin is an error that says how to drop it", () => {
  expect(() => rebuild({ cwd: work, add: ["gone"] })).toThrow(/gone is not a branch on origin.*--remove gone/);
});

test("the first build needs branches to start from", () => {
  expect(() => rebuild({ cwd: work })).toThrow(StagingError);
});

test("a branch whose change is already in main is reported as adding nothing", () => {
  branch(work, "feat-a", { "b.txt": "b\n" });
  // the same change lands on main as another commit, as a squash merge does
  git(work, "switch", "--quiet", "main");
  writeFileSync(join(work, "b.txt"), "b\n");
  git(work, "add", "--", "b.txt");
  git(work, "commit", "--quiet", "-m", "feat: a (squashed)");
  git(work, "push", "--quiet", "origin", "main");
  const result = rebuild({ cwd: work, add: ["feat-a"] });
  expect(result.merged).toEqual([expect.objectContaining({ branch: "feat-a", addsNothing: true })]);
});

test("a push is refused when origin/staging moved since the last fetch", () => {
  branch(work, "feat-a", { "b.txt": "b\n" });
  branch(work, "feat-b", { "c.txt": "c\n" });
  rebuild({ cwd: work, add: ["feat-a"] });
  push({ cwd: work });

  rebuild({ cwd: work, add: ["feat-b"] }); // fetches, so this clone has seen the first push
  const other = clone("other");
  rebuild({ cwd: other, remove: ["feat-a"] });
  push({ cwd: other }); // someone else moves origin/staging meanwhile

  expect(() => push({ cwd: work })).toThrow(StagingError);
  expect(git(origin, "rev-parse", "staging")).toBe(git(other, "rev-parse", "staging"));
});
