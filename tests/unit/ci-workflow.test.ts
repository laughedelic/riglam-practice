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
  expect(workflow).toMatch(/deploy-preview:[\s\S]*?needs: check\b/);
});

test("each preview is a deployment of its own environment, and the cleanup retires that same environment when the pull request closes", () => {
  const deploy = workflow.slice(workflow.indexOf("\n  deploy-preview:"));
  const cleanup = read(".github/workflows/preview-cleanup.yml");
  expect(deploy).toMatch(/environment:\s+name: \$\{\{[^}]*format\('preview\/pr-\{0\}', github\.event\.number\)[^}]*\}\}\s+url: \$\{\{ steps\.upload\.outputs\.url \}\}/);
  expect(cleanup).toMatch(/pull_request:\s+types: \[closed\]/);
  expect(cleanup).toMatch(/ENVIRONMENT: preview\/pr-\$\{\{ github\.event\.number \}\}/);
  expect(cleanup).toMatch(/permissions:[\s\S]*?deployments: write/);
});
