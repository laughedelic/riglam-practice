// The browser tests run as a matrix of CI jobs, each with its own `--project` and `--shard` arguments. A project that no job
// names would silently stop running, and one named twice would run twice, so this reads the workflow and the Playwright
// config and checks that every project is covered exactly once. It also checks the one status that branch protection needs.
import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { root } from "../../scripts/lib/course-files.mjs";

const read = (f: string) => readFileSync(`${root}/${f}`, "utf8");
const workflow = read(".github/workflows/ci.yml");
const config = read("playwright.config.js");

const projects = [...config.matchAll(/\{\s*name:\s*"([^"]+)"/g)].map((m) => m[1]);
const jobArgs = [...workflow.matchAll(/args:\s*"([^"]*)"/g)].map((m) => m[1]);

test("the Playwright config lists projects to cover", () => {
  expect(projects.length, "no project found in playwright.config.js").toBeGreaterThan(0);
  expect(jobArgs.length, "no matrix entry with args found in ci.yml").toBeGreaterThan(0);
});

test("every Playwright project runs in exactly one way in CI, and the shards of a project are all there", () => {
  const plain = new Map<string, number>(); // project -> jobs that run all of it
  const shards = new Map<string, string[]>(); // project -> "i/n" of the jobs that run a part
  for (const args of jobArgs) {
    const names = [...args.matchAll(/--project=(\S+)/g)].map((m) => m[1]);
    const shard = /--shard=(\d+\/\d+)/.exec(args)?.[1];
    expect(names.length, `a matrix entry names no project: ${args}`).toBeGreaterThan(0);
    if (shard) expect(names.length, `a sharded entry names one project (shards are cut across projects): ${args}`).toBe(1);
    for (const name of names) {
      expect(projects, `ci.yml names the project ${name}, which playwright.config.js does not have`).toContain(name);
      if (shard) shards.set(name, [...(shards.get(name) ?? []), shard]);
      else plain.set(name, (plain.get(name) ?? 0) + 1);
    }
  }
  for (const name of projects) {
    const parts = shards.get(name) ?? [];
    const whole = plain.get(name) ?? 0;
    expect(whole + (parts.length ? 1 : 0), `project ${name} must run in exactly one way (whole or sharded), as ci.yml has it`).toBe(1);
    if (!parts.length) continue;
    const total = Number(parts[0].split("/")[1]);
    const expected = Array.from({ length: total }, (_, i) => `${i + 1}/${total}`);
    expect([...parts].sort(), `the shards of ${name} must be ${expected.join(", ")}`).toEqual(expected);
  }
});

test("one job called `Lint, build, test` needs the others, because branch protection requires that name", () => {
  const job = workflow.split(/\n(?= {2}[\w-]+:\n)/).find((j) => /^ {4}name: Lint, build, test$/m.test(j));
  expect(job, "no job with the name `Lint, build, test`").toBeDefined();
  expect(job).toMatch(/needs: \[static, browser\]/);
  expect(job, "without this the check would be skipped, and a skipped required check counts as passed, when a part fails").toMatch(/if: \$\{\{ !cancelled\(\) \}\}/);
});

test("the pull request title check is its own workflow and runs again when the title is edited", () => {
  const title = read(".github/workflows/pr-title.yml");
  expect(title, "branch protection requires the name `Conventional PR title`").toMatch(/^ {4}name: Conventional PR title$/m);
  expect(title, "a title fixed after the first run must be checked again").toMatch(/types: \[[^\]]*\bedited\b[^\]]*\]/);
  expect(workflow, "an edit of a pull request must not start the browser tests, so ci.yml has no `edited` type").not.toMatch(/\bedited\b/);
  expect(workflow, "the title check lives in pr-title.yml, not twice").not.toMatch(/Conventional PR title/);
});

test("a push to a pull request replaces its running CI, but every commit on main keeps its own run", () => {
  expect(workflow).toMatch(/group: ci-\$\{\{ github\.event_name == 'pull_request' && github\.ref \|\| github\.sha \}\}/);
  expect(workflow).toMatch(/cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
});
