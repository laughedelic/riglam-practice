// The release setup: versions stay below 1.0.0 until someone decides otherwise and there is no changelog file. This
// guards the settings and the files.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { root } from "../../scripts/lib/course-files.mjs";

const read = (f) => JSON.parse(readFileSync(`${root}/${f}`, "utf8"));
const config = read("release-please-config.json");
const manifest = read(".release-please-manifest.json");
const pkg = read("package.json");
const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);

test("the first release is 0.1.0 and breaking changes stay in 0.x", () => {
  assert.equal(config["initial-version"], "0.1.0");
  assert.equal(config["bump-minor-pre-major"], true);
  assert.match(manifest["."], /^0\.\d+\.\d+$/, "release 1.0.0 deliberately, with a Release-As footer");
});

test("package.json and the manifest hold the same version", () => {
  assert.equal(pkg.version, manifest["."], "release-please updates both in the release pull request; do not edit either by hand");
});

test("tags are plain vX.Y.Z", () => {
  assert.equal(config["include-v-in-tag"], true);
  assert.equal(config["include-component-in-tag"], false);
});

test("no changelog file", () => {
  assert.equal(config["skip-changelog"], true);
  assert.equal(config["release-type"], "node");
  for (const f of ["CHANGELOG.md", "changelog.json"]) assert.ok(!tracked.includes(f), `${f} is tracked; the notes belong in the GitHub release`);
});
