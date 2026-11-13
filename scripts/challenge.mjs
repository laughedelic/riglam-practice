// Runs scripts/challenge.ts (`npm run challenge`): the tool reads a challenge with the app's own rules, which are TypeScript, so it is bundled first
// (into .cache/, like the eval tools) and then run with the same arguments. The bundling prints nothing, so that `sql` can write to the standard output.
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "rolldown";

const root = resolve(fileURLToPath(import.meta.url), "../..");
await build({ input: resolve(root, "scripts/challenge.ts"), platform: "node", logLevel: "silent", output: { dir: resolve(root, ".cache/challenge"), format: "esm" } });
await import(pathToFileURL(resolve(root, ".cache/challenge/challenge.js")).href);
