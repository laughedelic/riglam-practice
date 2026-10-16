#!/usr/bin/env node
// npm run staging [-- <command> [options]]    (docs/STAGING.md)
//   (no command)  rebuild the staging branch: main, then each branch listed in staging.json merged in order. The list is read from
//                 origin/staging and changed with --add <branch> and --remove <branch> (both can be repeated). Stops at a conflict.
//   push          push staging to origin (force, but only over the state this clone last fetched)
//   list          show what origin/staging was built from
//   deploy        build the app from the checked-out staging branch and put it on the Worker Preview named staging
//                 deploy --here  the same for whatever commit is checked out, without the branch checks (for a build service such as Workers Builds,
//                                which builds other branches too: a branch other than staging gets its own Preview, by WORKERS_CI_BRANCH)
// Exit 0 on success, 1 when the work could not be done (a conflict, a missing branch), 2 on a usage problem.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ConflictError, StagingError, git, push, readManifest, rebuild } from "./lib/staging.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "staging";
const PREVIEW = "staging";
const MIGRATIONS_CONFIG = "wrangler.staging-migrations.jsonc";
const D1_NAME = "riglam-practice-staging";

const [first, ...rest] = process.argv.slice(2);
const command = first && !first.startsWith("-") ? first : "rebuild";
const args = command === first ? rest : process.argv.slice(2);

function options() {
  const out = { add: [], remove: [] };
  for (let i = 0; i < args.length; i++) {
    const [flag, inline] = args[i].split("=", 2);
    if (flag !== "--add" && flag !== "--remove") usage(`unknown option ${args[i]}`);
    const value = inline ?? args[++i];
    if (!value || value.startsWith("-")) usage(`${flag} needs a branch name`);
    out[flag.slice(2)].push(value);
  }
  return out;
}

function usage(problem) {
  console.error(`${problem}\nusage: staging.mjs [rebuild [--add <branch>] [--remove <branch>] | push | list | deploy [--here]]`);
  process.exit(2);
}

const run = (cmd, cmdArgs, env = {}) => execFileSync(cmd, cmdArgs, { cwd: root, stdio: "inherit", env: { ...process.env, ...env } });

/** The wrangler version CI pins, so that a deploy from this machine behaves like the pipeline. */
function wranglerVersion() {
  try {
    return /WRANGLER_VERSION:\s*(\S+)/.exec(readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf8"))?.[1] ?? "4.149.0";
  } catch {
    return "4.149.0";
  }
}

function describe(result) {
  console.log(`staging is ${result.sha.slice(0, 7)}: main ${result.baseSha.slice(0, 7)}${result.merged.map((m) => `\n  + ${m.branch} ${m.sha.slice(0, 7)}${m.addsNothing ? "  (adds nothing to main: already merged? then --remove it)" : ""}`).join("")}`);
}

/** The Preview's first address from the JSON `wrangler preview` prints, or the whole output when it has another shape. */
function previewUrl(out) {
  try {
    return JSON.parse(out.slice(out.indexOf("{"))).preview.urls[0];
  } catch {
    return out;
  }
}

/**
 * A branch other than staging (a pull request): the app as the branch has it, on the Preview that wrangler names after the branch
 * (the name `npx wrangler preview`, Workers Builds' default, would give it). Like staging, it reads the `previews` block of wrangler.jsonc:
 * the shared staging database, the preview budgets and the secrets of the Preview base config. The branch's migrations are applied to
 * that database first, because a Preview does not apply them itself.
 */
function deployBranch(branch) {
  const sha = git(root, ["rev-parse", "--short", "HEAD"]);
  run("npm", ["ci"]);
  run("npm", ["run", "build:pwa"]);
  run("npx", ["--yes", `wrangler@${wranglerVersion()}`, "d1", "migrations", "apply", D1_NAME, "--remote", "-c", MIGRATIONS_CONFIG]);
  const out = execFileSync("npx", ["--yes", `wrangler@${wranglerVersion()}`, "preview", "--message", sha, "--json"], { cwd: root, encoding: "utf8", stdio: ["inherit", "pipe", "inherit"] });
  console.log(`${branch} ${sha} is at ${previewUrl(out)}`);
}

function deploy({ here = false } = {}) {
  // Workers Builds has one deploy command for all non-production branches and names the branch in WORKERS_CI_BRANCH.
  const branch = process.env.WORKERS_CI_BRANCH;
  if (here && branch && branch !== TARGET) return deployBranch(branch);
  if (!here) {
    if (git(root, ["symbolic-ref", "--quiet", "--short", "HEAD"], { allowFail: true }) !== TARGET) throw new StagingError(`deploy builds the working tree: check out the staging branch first (git switch ${TARGET})`);
    if (git(root, ["status", "--porcelain", "--untracked-files=no"])) throw new StagingError("the working tree has uncommitted changes");
    // The branch is rebuilt and force-pushed, so a checkout that was not reset to it is an older build.
    git(root, ["fetch", "--quiet", "origin"]);
    if (git(root, ["rev-parse", "HEAD"]) !== git(root, ["rev-parse", "--verify", "--quiet", `origin/${TARGET}`], { allowFail: true })) {
      throw new StagingError(`this ${TARGET} is not origin/${TARGET}: push it (npm run staging -- push) or take the pushed one (git fetch && git reset --hard origin/${TARGET})`);
    }
  }
  const sha = git(root, ["rev-parse", "--short", "HEAD"]);
  const manifest = readManifest(root, "HEAD");
  if (!manifest) throw new StagingError(`this checkout of ${TARGET} has no staging.json: rebuild it with npm run staging`);
  run("npm", ["ci"]);
  // A second name and short name, so that the staging app can be installed next to the real one and told apart.
  run("npm", ["run", "build:pwa"], { RIGLAM_APP_NAME: "Riglam practice (staging)", RIGLAM_APP_SHORT_NAME: "Staging" });
  // What is deployed, readable at /staging-build.json (not precached: it is written after the build).
  writeFileSync(resolve(root, "dist/pwa/staging-build.json"), `${JSON.stringify({ commit: sha, base: manifest.base, branches: manifest.branches, builtAt: new Date().toISOString() }, null, 2)}\n`);
  const wrangler = ["--yes", `wrangler@${wranglerVersion()}`];
  run("npx", [...wrangler, "d1", "migrations", "apply", D1_NAME, "--remote", "-c", MIGRATIONS_CONFIG]);
  // A Preview, not a deploy: it has the database and variables of the `previews` block and none of production's secrets or data.
  const out = execFileSync("npx", [...wrangler, "preview", "--name", PREVIEW, "--message", sha, "--json"], { cwd: root, encoding: "utf8", stdio: ["inherit", "pipe", "inherit"] });
  console.log(`staging ${sha} is at ${previewUrl(out)}`);
}

try {
  if (command === "rebuild") {
    const { add, remove } = options();
    const result = rebuild({ cwd: root, target: TARGET, add, remove });
    describe(result);
    console.log(`\nLocal ${TARGET} is updated. Next: npm run check:fast, then npm run staging -- push`);
  } else if (command === "push") {
    console.log(`pushed ${TARGET} ${push({ cwd: root, target: TARGET }).slice(0, 7)}`);
  } else if (command === "list") {
    git(root, ["fetch", "--quiet", "--prune", "origin"]);
    const manifest = readManifest(root, `origin/${TARGET}`);
    if (!manifest) throw new StagingError(`origin/${TARGET} does not exist yet`);
    console.log(`origin/${TARGET} ${git(root, ["rev-parse", "--short", `origin/${TARGET}`])} = ${manifest.base} + ${manifest.branches.length} branches`);
    for (const b of manifest.branches) console.log(`  ${b} ${git(root, ["rev-parse", "--short", `origin/${b}`], { allowFail: true }) ?? "(gone from origin)"}`);
  } else if (command === "deploy") {
    if (args.some((a) => a !== "--here")) usage(`unknown option ${args.find((a) => a !== "--here")}`);
    deploy({ here: args.includes("--here") });
  } else {
    usage(`unknown command ${command}`);
  }
} catch (e) {
  if (!(e instanceof StagingError)) throw e;
  console.error(e.message);
  if (e instanceof ConflictError && e.merged.length) console.error(`(merged cleanly before it: ${e.merged.join(", ")})`);
  process.exit(1);
}
