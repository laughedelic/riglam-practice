// The release setup: versions stay below 1.0.0 until someone decides otherwise and there is no changelog file. This
// guards the settings and the files.
import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { root } from "../../scripts/lib/course-files.mjs";

const read = (f: string) => JSON.parse(readFileSync(`${root}/${f}`, "utf8"));
const config = read("release-please-config.json");
const manifest = read(".release-please-manifest.json");
const pkg = read("package.json");
const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);

test("the first release is 0.1.0 and breaking changes stay in 0.x", () => {
  expect(config["initial-version"]).toBe("0.1.0");
  expect(config["bump-minor-pre-major"]).toBe(true);
  expect(manifest["."], "release 1.0.0 deliberately, with a Release-As footer").toMatch(/^0\.\d+\.\d+$/);
});

test("package.json and the manifest hold the same version", () => {
  expect(pkg.version, "release-please updates both in the release pull request; do not edit either by hand").toBe(manifest["."]);
});

test("tags are plain vX.Y.Z", () => {
  expect(config["include-v-in-tag"]).toBe(true);
  expect(config["include-component-in-tag"]).toBe(false);
});

test("no changelog file", () => {
  expect(config["skip-changelog"]).toBe(true);
  expect(config["release-type"]).toBe("node");
  for (const f of ["CHANGELOG.md", "changelog.json"]) expect(tracked.includes(f), `${f} is tracked; the notes belong in the GitHub release`).toBe(false);
});
