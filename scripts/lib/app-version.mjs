// The app's version is the last released one, which release-please records in .release-please-manifest.json (the only
// file a release changes). package.json keeps a fixed placeholder version.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const manifestPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../.release-please-manifest.json");
export const appVersion = JSON.parse(readFileSync(manifestPath, "utf8"))["."];
