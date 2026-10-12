#!/usr/bin/env node
// The term data tool (docs/DATA.md). The data key comes from RIGLAM_DATA_KEY or the git-ignored file .data-key.
//   key               print a new key (does not touch any file)
//   import <full.json> split the knowledge base export into src/data/drill-data.json (open) and the two encrypted course files
//   export [out.json]  write the full data (definitions and notes put back) to a file, or to the standard output
//   check             decrypt the committed files and verify that the open file holds no definitions or notes
//   rekey             re-encrypt the course files under a new key, save it in .data-key and print it
import { readFileSync, writeFileSync } from "node:fs";
import { generateKey } from "../src/data/course.js";
import { files, requireKey, readFull, writeFull, readOpen } from "./lib/course-files.mjs";

const [cmd, arg] = process.argv.slice(2);

async function main() {
  if (cmd === "key") {
    console.log(generateKey());
  } else if (cmd === "import") {
    if (!arg) throw new Error("usage: npm run data:import -- <full.json>");
    const { changed } = await writeFull(requireKey("import"), JSON.parse(readFileSync(arg, "utf8")));
    console.log(changed.length ? `written: ${changed.join(", ")}` : "nothing changed");
  } else if (cmd === "export") {
    const text = JSON.stringify(await readFull(requireKey("export")));
    if (arg) (writeFileSync(arg, text), console.error(`written: ${arg} (${text.length} bytes)`));
    else process.stdout.write(text);
  } else if (cmd === "check") {
    const full = await readFull(requireKey("check"));
    const open = readOpen();
    const leaked = Object.values(open.terms).filter((t) => "d" in t || "d_ru" in t || "note" in t).length + ("notes" in open ? 1 : 0);
    if (leaked) throw new Error(`${files.open} holds definitions or notes in the clear`);
    const n = Object.keys(full.terms).length;
    console.log(`ok: ${n} terms, ${Object.values(full.terms).filter((t) => t.d).length} definitions, open file clean`);
  } else if (cmd === "rekey") {
    const old = requireKey("rekey");
    const full = await readFull(old);
    const key = generateKey();
    writeFileSync(files.keyFile, key + "\n", { mode: 0o600 });
    await writeFull(key, full);
    console.log(key);
    console.error("re-encrypted under the new key (also saved in .data-key). Replace RIGLAM_DATA_KEY in the GitHub and Claude environment secrets, and hand out new links.");
  } else {
    throw new Error("usage: node scripts/data.mjs key | import <full.json> | export [out.json] | check | rekey");
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
