// The release setup: versions stay below 1.0.0 until someone decides otherwise, there is no changelog file, and a
// release changes one file only (the release-please manifest). This guards the settings and the files.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { root } from "../../scripts/lib/course-files.mjs";
import { appVersion } from "../../scripts/lib/app-version.mjs";

const config = JSON.parse(readFileSync(`${root}/release-please-config.json`, "utf8"));
const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);

test("the first release is 0.1.0 and breaking changes stay in 0.x", () => {
  assert.equal(config["initial-version"], "0.1.0");
  assert.equal(config["bump-minor-pre-major"], true);
  assert.match(appVersion, /^0\.\d+\.\d+$/, "the manifest holds a 0.x version; release 1.0.0 deliberately with a Release-As footer");
});

test("tags are plain vX.Y.Z", () => {
  assert.equal(config["include-v-in-tag"], true);
  assert.equal(config["include-component-in-tag"], false);
});

test("no changelog file, and no version file besides the manifest", () => {
  assert.equal(config["skip-changelog"], true);
  assert.equal(config["release-type"], "simple", "the node type also rewrites package.json and package-lock.json on each release");
  for (const f of ["CHANGELOG.md", "version.txt", "changelog.json"]) assert.ok(!tracked.includes(f), `${f} is tracked; release-please would write it on each release`);
});

test("package.json keeps its placeholder version", () => {
  assert.equal(JSON.parse(readFileSync(`${root}/package.json`, "utf8")).version, "0.0.0");
});
