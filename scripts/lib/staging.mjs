// The `staging` branch: main with the pull requests labeled `staging` merged in, rebuilt from scratch each time (docs/STAGING.md).
// Choosing and ordering the pull requests is a pure function of what GitHub lists. Building is git plumbing with no network except fetch
// and push, so tests/unit/staging.test.ts runs it on throwaway repositories.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { whatsNewLine } from "./whats-new-check.mjs";

/** The file on the staging branch that records what it was built from (the only file on it that main does not have). */
export const MANIFEST = "staging.json";

/** The label that puts a pull request on staging. */
export const LABEL = "staging";

export class StagingError extends Error {}

/**
 * @typedef {{ number: number, title: string, branch: string, base: string, sha: string | null, parent: number | null, labeled: boolean, via: number | null }} Entry
 * A pull request staging holds: `parent` is the open pull request whose branch this one is stacked on, `via` the labeled pull request that
 * brought it in when it is not labeled itself.
 */

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

const hasLabel = (pull, label) => (pull.labels ?? []).some((l) => (typeof l === "string" ? l : l?.name) === label);

/**
 * The pull requests staging holds, in merge order. Those labeled `label` go in, and so does every open pull request they are stacked on
 * (the one whose branch is the base of another), because the child cannot be tried without its parent. The order keeps a stack together:
 * a parent before its children, and otherwise by pull request number, which does not change from one run to the next.
 * A labeled pull request from a fork is left out, because its branch is not in this repository.
 * @param {object[]} pulls  open pull requests as the REST API lists them (number, title, draft, labels, head.ref, head.sha, head.repo.full_name, base.ref)
 * @param {{ repo: string, label?: string }} options  `repo` is "owner/name"
 * @returns {{ entries: Entry[], ignored: { number: number, why: string }[] }}
 */
export function selectPulls(pulls, { repo, label = LABEL }) {
  const sorted = [...pulls].filter((p) => !p.state || p.state === "open").sort((a, b) => a.number - b.number);
  const ignored = [];
  const here = new Map(); // head branch -> pull request, for those whose branch is in this repository
  for (const p of sorted) {
    if (p.head?.repo?.full_name?.toLowerCase() === repo.toLowerCase()) {
      if (!here.has(p.head.ref)) here.set(p.head.ref, p);
    } else if (hasLabel(p, label)) {
      ignored.push({ number: p.number, why: "its branch is in another repository" });
    }
  }
  const parentOf = (p) => {
    const parent = here.get(p.base?.ref);
    return parent && parent !== p ? parent : null;
  };

  /** @type {Map<number, Entry>} */
  const chosen = new Map();
  const entryOf = (p, labeled, via) => ({ number: p.number, title: p.title ?? "", news: whatsNewLine(p.body), branch: p.head.ref, base: p.base.ref, sha: p.head.sha ?? null, parent: null, labeled, via });
  for (const p of here.values()) if (hasLabel(p, label)) chosen.set(p.number, entryOf(p, true, null));
  for (const entry of [...chosen.values()]) {
    const seen = new Set([entry.number]);
    for (let parent = parentOf(here.get(entry.branch)); parent && !seen.has(parent.number); parent = parentOf(parent)) {
      seen.add(parent.number);
      if (!chosen.has(parent.number)) chosen.set(parent.number, entryOf(parent, false, entry.number));
    }
  }
  for (const entry of chosen.values()) {
    const parent = parentOf(here.get(entry.branch));
    entry.parent = parent && chosen.has(parent.number) ? parent.number : null;
  }

  const children = new Map(); // parent number (or null for a root) -> entries, by number
  for (const entry of [...chosen.values()].sort((a, b) => a.number - b.number)) children.set(entry.parent, [...(children.get(entry.parent) ?? []), entry]);
  const entries = [];
  const visit = (entry) => {
    entries.push(entry);
    for (const child of children.get(entry.number) ?? []) visit(child);
  };
  for (const root of children.get(null) ?? []) visit(root);
  // Pull requests whose bases lead round in a circle have no root; they still go in, in number order.
  for (const entry of chosen.values()) if (!entries.includes(entry)) entries.push(entry);
  return { entries, ignored };
}

/** The manifest committed at `ref`, or null when the ref or the file is missing. */
export function readManifest(cwd, ref) {
  const text = git(cwd, ["show", `${ref}:${MANIFEST}`], { allowFail: true });
  if (text === null) return null;
  const data = JSON.parse(text);
  if (data.branches !== undefined && (!Array.isArray(data.branches) || data.branches.some((b) => typeof b !== "string"))) throw new StagingError(`${ref}:${MANIFEST} has no list of branch names`);
  return data;
}

/**
 * What a build depends on, to tell whether the branch on origin is already the result: the base commit and each pull request's head, in
 * order, and the pull request it is stacked on (`3@abc<2`), since a child follows its parent's fate: retargeting it changes the build
 * though its head did not move.
 */
export const inputsOf = (baseSha, entries) => ({ baseSha, pulls: entries.map((e) => `${e.number}@${e.sha ?? "gone"}${e.parent !== null && e.parent !== undefined ? `<${e.parent}` : ""}`) });

const sameInputs = (manifest, wanted) => Boolean(manifest?.baseSha) && manifest.baseSha === wanted.baseSha && JSON.stringify(manifest.inputs) === JSON.stringify(wanted.pulls);

/** Migration numbers used by more than one file: two pull requests that each added "the next one" both reach the shared database. */
export function migrationWarnings(files) {
  const byNumber = new Map();
  for (const file of files) {
    const number = /^(\d+)_/.exec(file.split("/").pop() ?? "")?.[1];
    if (number) byNumber.set(number, [...(byNumber.get(number) ?? []), file.split("/").pop()]);
  }
  return [...byNumber.values()].filter((names) => names.length > 1).map((names) => `migrations with the same number, applied in the order of their names: ${names.join(", ")}`);
}

const short = (sha) => sha.slice(0, 7);

/**
 * How a commit message names a pull request: never as `#12`. GitHub adds a "referenced this pull request" event to that pull request's page for
 * every commit that says so, and every rebuild pushes new commits that name each pull request on staging, so the pages filled up with them.
 */
const prName = (number) => `PR ${number}`;

function identity(cwd) {
  const name = git(cwd, ["config", "user.name"], { allowFail: true }) || "staging script";
  const email = git(cwd, ["config", "user.email"], { allowFail: true }) || "staging@localhost";
  return { GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_COMMITTER_NAME: name, GIT_COMMITTER_EMAIL: email };
}

/**
 * @typedef {Entry & { addsNothing: boolean }} Merged
 * @typedef {Entry & { reason: "conflict" | "parent" | "gone", files: string[], withMain: boolean, with: number[] }} Skipped
 */

/**
 * Builds the staging commit from nothing but main and the entries: the tip of `remote/base`, then each entry's branch merged in the given
 * order (a merge commit each), then one commit that writes the manifest. An entry that does not merge cleanly is left out with the files in
 * conflict, and so is every entry stacked on it; the others still go in. Nothing is kept from an earlier build, so there is nothing to go stale.
 * Moves the local `target` branch to the new commit and returns it; nothing is pushed.
 *
 * When `remote/target` was built from the very same inputs, nothing is built (`upToDate`), unless `force`; `merged` and `skipped` are then
 * read from its manifest.
 * @param {{ cwd: string, entries: Entry[], remote?: string, base?: string, target?: string, force?: boolean }} options
 * @returns {{ upToDate: boolean, sha: string | null, baseSha: string, merged: Merged[], skipped: Skipped[], warnings: string[], previous: any, entries: Entry[] }}
 */
export function rebuild({ cwd, entries, remote = "origin", base = "main", target = "staging", force = false }) {
  git(cwd, ["fetch", "--prune", "--quiet", remote]);
  const previous = readManifest(cwd, `${remote}/${target}`);
  const baseSha = git(cwd, ["rev-parse", `${remote}/${base}`]);
  // The head the remote has now is what goes in, whatever the pull request list said a moment ago.
  const resolved = entries.map((e) => ({ ...e, sha: git(cwd, ["rev-parse", "--verify", "--quiet", `${remote}/${e.branch}^{commit}`], { allowFail: true }) }));
  const inputs = inputsOf(baseSha, resolved);
  if (!force && sameInputs(previous, inputs)) {
    // Nothing is built, but what went in and what was left out is still known, from the manifest: a check that a refused call lost after the
    // last push is made good from it (publish).
    const byNumber = new Map(resolved.map((e) => [e.number, e]));
    const merged = (previous.pulls ?? []).map((p) => ({ ...byNumber.get(p.number), addsNothing: p.addsNothing === true }));
    const skipped = (previous.skipped ?? []).map((s) => ({ ...byNumber.get(s.number), withMain: false, with: [], ...s }));
    return { upToDate: true, sha: git(cwd, ["rev-parse", `${remote}/${target}`]), baseSha, merged, skipped, warnings: [], previous, entries: resolved };
  }

  const env = identity(cwd);
  const dir = mkdtempSync(join(tmpdir(), "riglam-staging-"));
  /** @type {Merged[]} */
  const merged = [];
  /** @type {Skipped[]} */
  const skipped = [];
  const filesOf = (e) => (git(cwd, ["diff", "--name-only", `${baseSha}...${e.sha}`], { allowFail: true }) ?? "").split("\n").filter(Boolean);
  try {
    git(cwd, ["worktree", "add", "--quiet", "--detach", dir, baseSha]);
    for (const entry of resolved) {
      const left = (reason, files = [], extra = {}) => skipped.push({ ...entry, reason, files, withMain: false, with: [], ...extra });
      if (!entry.sha) {
        left("gone");
        continue;
      }
      if (entry.parent !== null && skipped.some((s) => s.number === entry.parent)) {
        left("parent");
        continue;
      }
      const treeBefore = git(dir, ["rev-parse", "HEAD^{tree}"]);
      if (git(dir, ["merge-base", "--is-ancestor", entry.sha, "HEAD"], { allowFail: true, env }) !== null) {
        merged.push({ ...entry, addsNothing: true });
        continue;
      }
      try {
        git(dir, ["merge", "--no-ff", "--no-edit", "-m", `Merge ${prName(entry.number)} (${entry.branch}) into ${target}`, entry.sha], { env });
      } catch {
        const files = (git(dir, ["diff", "--name-only", "--diff-filter=U"], { allowFail: true }) ?? "").split("\n").filter(Boolean);
        git(dir, ["merge", "--abort"], { allowFail: true });
        git(dir, ["reset", "--hard", "--quiet", "HEAD"], { allowFail: true });
        // Who else changed those files: main since this branch left it, and the pull requests merged before it.
        const forkPoint = git(cwd, ["merge-base", baseSha, entry.sha], { allowFail: true });
        const mainChanged = forkPoint ? (git(cwd, ["diff", "--name-only", forkPoint, baseSha], { allowFail: true }) ?? "").split("\n") : [];
        left("conflict", files, { withMain: files.some((f) => mainChanged.includes(f)), with: merged.filter((m) => filesOf(m).some((f) => files.includes(f))).map((m) => m.number) });
        continue;
      }
      merged.push({ ...entry, addsNothing: git(dir, ["rev-parse", "HEAD^{tree}"]) === treeBefore });
    }

    const warnings = migrationWarnings((git(dir, ["ls-tree", "--name-only", "HEAD", "worker/migrations/"], { allowFail: true }) ?? "").split("\n").filter(Boolean));
    const manifest = {
      base,
      baseSha,
      inputs: inputs.pulls,
      branches: merged.map((m) => m.branch),
      pulls: merged.map((m) => ({ number: m.number, branch: m.branch, sha: m.sha, ...(m.title ? { title: m.title } : {}), ...(m.news ? { news: m.news } : {}), ...(m.addsNothing ? { addsNothing: true } : {}) })),
      skipped: skipped.map((s) => ({ number: s.number, branch: s.branch, sha: s.sha, reason: s.reason, files: s.files, parent: s.parent, withMain: s.withMain, with: s.with })),
    };
    writeFileSync(join(dir, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
    git(dir, ["add", "--", MANIFEST]);
    const count = `${merged.length} pull ${merged.length === 1 ? "request" : "requests"}`;
    const lines = [
      `chore(staging): ${base} ${short(baseSha)} and ${count}${skipped.length ? `, ${skipped.length} left out` : ""}`,
      "",
      `${base} ${short(baseSha)}`,
      ...merged.map((m) => `${prName(m.number)} ${m.branch} ${short(m.sha)}${m.addsNothing ? " (adds nothing)" : ""}`),
      ...skipped.map((s) => `left out: ${prName(s.number)} ${s.branch} ${s.sha ? short(s.sha) : "(no branch)"} (${s.reason}${s.files.length ? `: ${s.files.join(", ")}` : ""})`),
    ];
    git(dir, ["commit", "--quiet", "-m", lines.join("\n")], { env });
    const sha = git(dir, ["rev-parse", "HEAD"]);
    moveBranch(cwd, target, sha);
    return { upToDate: false, sha, baseSha, merged, skipped, warnings, previous, entries: resolved };
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
