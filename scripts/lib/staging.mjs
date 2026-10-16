// The `staging` branch: main with the open pull requests merged in, rebuilt from a list (docs/STAGING.md).
// Everything here is git plumbing with no network except fetch and push, so tests/unit/staging.test.ts runs it on throwaway repositories.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** The file on the staging branch that records which branches it was built from. */
export const MANIFEST = "staging.json";

export class StagingError extends Error {}

/** Thrown when a branch does not merge cleanly onto what is already merged. */
export class ConflictError extends StagingError {
  constructor(branch, files, merged) {
    super(`${branch} does not merge cleanly (conflicts in ${files.join(", ") || "unknown files"}). Bring the branch up to date with main or with the branch it conflicts with, push it, and run the rebuild again.`);
    this.branch = branch;
    this.files = files;
    this.merged = merged;
  }
}

/**
 * Runs git in `cwd` and returns its output without the final newline. `allowFail` returns null instead of throwing.
 * @param {string} cwd
 * @param {string[]} args
 * @param {{ env?: Record<string, string>, allowFail?: boolean }} [options]
 * @returns {string}
 */
export function git(cwd, args, { env, allowFail = false } = {}) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...env } }).replace(/\n$/, "");
  } catch (e) {
    if (allowFail) return null;
    throw new StagingError(`git ${args.join(" ")} failed: ${String(e.stderr || e.message).trim()}`);
  }
}

/**
 * The branch list after `add` and `remove`: order kept, new names at the end, no duplicates.
 * @param {string[]} current
 * @param {string[]} [add]
 * @param {string[]} [remove]
 */
export function planBranches(current, add = [], remove = []) {
  const gone = new Set(remove);
  const out = [];
  for (const name of [...current, ...add]) if (!gone.has(name) && !out.includes(name)) out.push(name);
  return out;
}

/** The manifest committed at `ref`, or null when the ref or the file is missing. */
export function readManifest(cwd, ref) {
  const text = git(cwd, ["show", `${ref}:${MANIFEST}`], { allowFail: true });
  if (text === null) return null;
  const data = JSON.parse(text);
  if (!Array.isArray(data.branches) || data.branches.some((b) => typeof b !== "string")) throw new StagingError(`${ref}:${MANIFEST} has no list of branch names`);
  return data;
}

const short = (sha) => sha.slice(0, 7);

function identity(cwd) {
  const name = git(cwd, ["config", "user.name"], { allowFail: true }) || "staging script";
  const email = git(cwd, ["config", "user.email"], { allowFail: true }) || "staging@localhost";
  return { GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_COMMITTER_NAME: name, GIT_COMMITTER_EMAIL: email };
}

/**
 * Builds the staging commit: the tip of `remote/base`, then each branch merged in the listed order (a merge commit each), then one commit
 * with the manifest. The list comes from the manifest on `remote/target` (or the local `target`), changed by `add` and `remove`.
 * Moves the local `target` branch to the new commit and returns it; nothing is pushed.
 * @param {{ cwd: string, remote?: string, base?: string, target?: string, add?: string[], remove?: string[] }} options
 * @returns {{ sha: string, baseSha: string, merged: { branch: string, sha: string, addsNothing: boolean }[] }}
 */
export function rebuild({ cwd, remote = "origin", base = "main", target = "staging", add = [], remove = [] }) {
  git(cwd, ["fetch", "--prune", remote]);
  const previous = readManifest(cwd, `${remote}/${target}`) ?? readManifest(cwd, target);
  const branches = planBranches(previous?.branches ?? [], add, remove);
  if (!previous && !branches.length) throw new StagingError(`there is no ${MANIFEST} on ${remote}/${target} yet: name the first branches with --add`);

  const baseRef = `${remote}/${base}`;
  const baseSha = git(cwd, ["rev-parse", baseRef]);
  const heads = new Map();
  for (const branch of branches) {
    const sha = git(cwd, ["rev-parse", "--verify", "--quiet", `${remote}/${branch}^{commit}`], { allowFail: true });
    if (!sha) throw new StagingError(`${branch} is not a branch on ${remote} (merged and deleted? then remove it: --remove ${branch})`);
    heads.set(branch, sha);
  }

  const env = identity(cwd);
  const dir = mkdtempSync(join(tmpdir(), "riglam-staging-"));
  const merged = [];
  try {
    git(cwd, ["worktree", "add", "--quiet", "--detach", dir, baseSha]);
    for (const branch of branches) {
      const sha = heads.get(branch);
      const treeBefore = git(dir, ["rev-parse", "HEAD^{tree}"]);
      if (git(dir, ["merge-base", "--is-ancestor", sha, "HEAD"], { allowFail: true, env }) !== null) {
        merged.push({ branch, sha, addsNothing: true });
        continue;
      }
      try {
        git(dir, ["merge", "--no-ff", "--no-edit", "-m", `Merge ${branch} into ${target}`, sha], { env });
      } catch {
        const files = (git(dir, ["diff", "--name-only", "--diff-filter=U"], { allowFail: true }) ?? "").split("\n").filter(Boolean);
        git(dir, ["merge", "--abort"], { allowFail: true });
        throw new ConflictError(branch, files, merged.map((m) => m.branch));
      }
      merged.push({ branch, sha, addsNothing: git(dir, ["rev-parse", "HEAD^{tree}"]) === treeBefore });
    }
    writeFileSync(join(dir, MANIFEST), `${JSON.stringify({ base, branches }, null, 2)}\n`);
    git(dir, ["add", "--", MANIFEST]);
    const lines = [`chore(staging): ${base} ${short(baseSha)} and ${branches.length} ${branches.length === 1 ? "branch" : "branches"}`, "", `${base} ${short(baseSha)}`, ...merged.map((m) => `${m.branch} ${short(m.sha)}${m.addsNothing ? " (adds nothing)" : ""}`)];
    git(dir, ["commit", "--quiet", "-m", lines.join("\n")], { env });
    const sha = git(dir, ["rev-parse", "HEAD"]);
    moveBranch(cwd, target, sha);
    return { sha, baseSha, merged };
  } finally {
    git(cwd, ["worktree", "remove", "--force", dir], { allowFail: true });
    rmSync(dir, { recursive: true, force: true });
    git(cwd, ["worktree", "prune"], { allowFail: true });
  }
}

/** Points the local branch `name` at `sha`, also when it is the checked-out branch (then the working tree follows; it must be clean). */
export function moveBranch(cwd, name, sha) {
  if (git(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"], { allowFail: true }) === name) {
    if (git(cwd, ["status", "--porcelain", "--untracked-files=no"])) throw new StagingError(`${name} is checked out with uncommitted changes: commit or stash them first`);
    git(cwd, ["reset", "--hard", "--quiet", sha]);
  } else {
    git(cwd, ["branch", "--force", name, sha]);
  }
}

/**
 * Pushes `target` over whatever the remote has, but only if the remote still has what this clone saw at its last fetch (a lease).
 * It does not fetch first: the rebuild did, so a push by someone else since then is refused instead of overwritten.
 */
export function push({ cwd, remote = "origin", target = "staging" }) {
  const seen = git(cwd, ["rev-parse", "--verify", "--quiet", `refs/remotes/${remote}/${target}`], { allowFail: true }) ?? "";
  git(cwd, ["push", `--force-with-lease=refs/heads/${target}:${seen}`, remote, `refs/heads/${target}:refs/heads/${target}`]);
  git(cwd, ["fetch", "--quiet", remote]);
  return git(cwd, ["rev-parse", target]);
}
