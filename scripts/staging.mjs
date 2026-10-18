#!/usr/bin/env node
// npm run staging [-- <command> [options]]    (docs/STAGING.md)
//   sync (the default)  rebuild the staging branch: main, then every open pull request labeled `staging` merged in (and the pull requests those
//                       are stacked on), in stack order and then by number. Only the local branch is moved unless told otherwise.
//                         --push      push it to origin (force, but only over the state this clone last fetched)
//                         --report    set the `staging` check on each pull request, comment on one that just stopped merging, and take the label off
//                                     the ones that are merged or closed (needs the workflow's GITHUB_TOKEN: only an app can write a check run)
//                         --force     build even when origin/staging was built from the same inputs
//                         --pulls <file>  read the open pull requests from a JSON file (the REST API's list) instead of asking GitHub
//                         --label <name>  the label to look for, `staging` unless told otherwise
//                       Pull requests come from the GitHub API with GITHUB_TOKEN (GH_TOKEN), or from `gh api` when there is none.
//   push                push staging to origin (force, but only over the state this clone last fetched)
//   list                show what origin/staging was built from
//   deploy              build the app from the checked-out staging branch and put it on the Worker Preview named staging
//                       deploy --here  the same for whatever commit is checked out, without the branch checks (for a build service such as Workers Builds,
//                                      which builds other branches too: a branch other than staging gets its own Preview, by WORKERS_CI_BRANCH)
// Exit 0 on success, 1 when the work could not be done or a pull request has just stopped merging, 2 on a usage problem.
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LABEL, StagingError, git, push, readManifest, rebuild, selectPulls } from "./lib/staging.mjs";
import { githubClient } from "./lib/staging-github.mjs";
import { describe, newSkips, publish, summary } from "./lib/staging-report.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "staging";
const PREVIEW = "staging";
const MIGRATIONS_CONFIG = "wrangler.staging-migrations.jsonc";
const D1_NAME = "riglam-practice-staging";

const [first, ...rest] = process.argv.slice(2);
const command = first && !first.startsWith("-") ? first : "sync";
const args = command === first ? rest : process.argv.slice(2);

function options() {
  const out = { push: false, report: false, force: false, pulls: null, label: LABEL };
  for (let i = 0; i < args.length; i++) {
    const [flag, inline] = args[i].split("=", 2);
    if (["--push", "--report", "--force"].includes(flag)) out[flag.slice(2)] = true;
    else if (flag === "--pulls" || flag === "--label") {
      const value = inline ?? args[++i];
      if (!value || value.startsWith("-")) usage(`${flag} needs a value`);
      out[flag.slice(2)] = value;
    } else usage(`unknown option ${args[i]}`);
  }
  return out;
}

function usage(problem) {
  console.error(`${problem}\nusage: staging.mjs [sync [--push] [--report] [--force] [--pulls <file>] [--label <name>] | push | list | deploy [--here]]`);
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

/** "owner/name" of the repository: the environment of a workflow run, or the origin remote. */
function repository() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  const url = git(root, ["remote", "get-url", "origin"]);
  const match = /github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/.exec(url);
  if (!match) throw new StagingError(`cannot tell the GitHub repository from the origin remote ${url}`);
  return match[1];
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
 * the shared staging database, the preview budgets and the secrets of the Preview base config. It applies no migrations: a Preview does not
 * apply them itself, and a branch's migration would stay in the database shared with staging and the other Previews (docs/STAGING.md).
 */
function deployBranch(branch) {
  const sha = git(root, ["rev-parse", "--short", "HEAD"]);
  run("npm", ["ci"]);
  run("npm", ["run", "build:pwa"]);
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
  // A second name, short name and icon, so that the staging app can be installed next to the real one and told apart.
  run("npm", ["run", "build:pwa"], { RIGLAM_APP_NAME: "Riglam practice (staging)", RIGLAM_APP_SHORT_NAME: "Staging", RIGLAM_ICON_SET: "preview" });
  // What is deployed, readable at /staging-build.json (not precached: it is written after the build).
  writeFileSync(resolve(root, "dist/pwa/staging-build.json"), `${JSON.stringify({ commit: sha, base: manifest.base, baseSha: manifest.baseSha, branches: manifest.branches, pulls: manifest.pulls, builtAt: new Date().toISOString() }, null, 2)}\n`);
  const wrangler = ["--yes", `wrangler@${wranglerVersion()}`];
  run("npx", [...wrangler, "d1", "migrations", "apply", D1_NAME, "--remote", "-c", MIGRATIONS_CONFIG]);
  // A Preview, not a deploy: it has the database and variables of the `previews` block and none of production's secrets or data.
  const out = execFileSync("npx", [...wrangler, "preview", "--name", PREVIEW, "--message", sha, "--json"], { cwd: root, encoding: "utf8", stdio: ["inherit", "pipe", "inherit"] });
  console.log(`staging ${sha} is at ${previewUrl(out)}`);
}

/** Every open pull request: from a file, from the API with a token, or from the gh command line. */
async function openPulls(client, file, repo) {
  if (file) return JSON.parse(readFileSync(file, "utf8"));
  if (client) return client.openPulls();
  try {
    return JSON.parse(execFileSync("gh", ["api", "--paginate", "--slurp", `repos/${repo}/pulls?state=open&per_page=100`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })).flat();
  } catch (e) {
    throw new StagingError(`cannot list the open pull requests: set GITHUB_TOKEN, sign in with gh, or pass --pulls <file> (${String(e.stderr || e.message).trim()})`);
  }
}

/** Appends `lines` to a file that GitHub Actions names in the environment (the step summary, the step outputs), when there is one. */
function toActions(variable, text) {
  if (process.env[variable]) appendFileSync(process.env[variable], text);
}

async function sync(opts) {
  const repo = repository();
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const client = token ? githubClient({ repo, token }) : null;
  if (opts.report && !client) throw new StagingError("--report needs GITHUB_TOKEN");

  const pulls = await openPulls(client, opts.pulls, repo);
  const { entries, ignored } = selectPulls(pulls, { repo, label: opts.label });
  for (const i of ignored) console.log(`#${i.number} is left out: ${i.why}`);

  const result = rebuild({ cwd: root, entries, target: TARGET, force: opts.force });
  console.log(describe(result));
  const runUrl = process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}` : undefined;
  toActions("GITHUB_STEP_SUMMARY", `${summary(result, { runUrl })}\n`);
  if (result.upToDate) {
    toActions("GITHUB_OUTPUT", "changed=false\n");
    // Nothing was built, but a check or a comment that a refused call lost after the last push is made good here.
    if (opts.report) await publish(client, { result, openPulls: pulls, runUrl, label: opts.label, repair: true });
    return 0;
  }

  if (!opts.push) {
    console.log(`\nLocal ${TARGET} is updated. Next: npm run check:fast, then npm run staging -- push`);
    return 0;
  }
  const pushed = push({ cwd: root, target: TARGET });
  console.log(`pushed ${TARGET} ${pushed.slice(0, 7)}`);
  toActions("GITHUB_OUTPUT", `changed=true\nsha=${pushed}\n`);
  if (opts.report) await publish(client, { result, openPulls: pulls, runUrl, label: opts.label });
  // A pull request that has just stopped merging is the news: the run fails, so that it is seen. One that still conflicts, as before, is not.
  const news = newSkips(result);
  if (news.length) console.error(`\nleft out now: ${news.map((s) => `#${s.number}`).join(", ")}`);
  return news.length ? 1 : 0;
}

try {
  if (command === "sync") {
    process.exitCode = await sync(options());
  } else if (command === "push") {
    console.log(`pushed ${TARGET} ${push({ cwd: root, target: TARGET }).slice(0, 7)}`);
  } else if (command === "list") {
    git(root, ["fetch", "--quiet", "--prune", "origin"]);
    const manifest = readManifest(root, `origin/${TARGET}`);
    if (!manifest) throw new StagingError(`origin/${TARGET} does not exist yet`);
    const pulls = manifest.pulls ?? (manifest.branches ?? []).map((branch) => ({ branch }));
    console.log(`origin/${TARGET} ${git(root, ["rev-parse", "--short", `origin/${TARGET}`])} = ${manifest.base} ${manifest.baseSha?.slice(0, 7) ?? ""} + ${pulls.length} pull requests`);
    for (const p of pulls) {
      const now = git(root, ["rev-parse", "--short", `origin/${p.branch}`], { allowFail: true });
      console.log(`  ${p.number ? `#${p.number} ` : ""}${p.branch} ${now ?? "(gone from origin)"}${p.sha && now && !p.sha.startsWith(now) ? "  (has moved since)" : ""}`);
    }
    for (const s of manifest.skipped ?? []) console.log(`  left out: #${s.number} ${s.branch} (${s.reason}${s.files?.length ? `: ${s.files.join(", ")}` : ""})`);
  } else if (command === "deploy") {
    if (args.some((a) => a !== "--here")) usage(`unknown option ${args.find((a) => a !== "--here")}`);
    deploy({ here: args.includes("--here") });
  } else {
    usage(`unknown command ${command}`);
  }
} catch (e) {
  if (!(e instanceof StagingError)) throw e;
  console.error(e.message);
  process.exit(1);
}
