// The interface and its code use American spelling (the knowledge base and the term data do too, see docs/DATA.md). This reads the
// page and PWA sources and fails on the British forms that have come up, so new text does not bring them back. It does not
// read stylesheets, the term data or the tutor's prompts (`src/ai-shared`, which also holds the table that turns British
// spellings in a learner's words into American ones).
import { expect, test } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { root } from "../../scripts/lib/course-files.mjs";

const BRITISH =
  /\b(favour\w*|colour\w*|odour\w*|neighbour\w*|behaviour\w*|grey\w*|centre\w*|practis\w*|emphasis(?:e|es|ed|ing)|organis\w*|recognis\w*|realis\w*|analys(?:e|es|ed|ing)|labell\w*|catalogue\w*|programme\w*|ageing|licence|defence|offence|judgement|whilst|fulfil|enrol)\b/gi;

function sources(dir: string): string[] {
  return readdirSync(`${root}/${dir}`, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.(js|ts|html)$/.test(e.name))
    .map((e) => `${e.parentPath.slice(root.length + 1)}/${e.name}`);
}

test("the page and the PWA sources use American spelling", () => {
  const files = [...sources("src/app"), ...sources("src/pwa")];
  expect(files.length, "no source found").toBeGreaterThan(20);
  const found: string[] = [];
  files.forEach((f) => {
    // `aria-labelledby` is the attribute's name, whatever the language of the page
    const text = readFileSync(`${root}/${f}`, "utf8").replace(/labelledby/g, "");
    text.split("\n").forEach((line, i) => {
      for (const m of line.matchAll(BRITISH)) found.push(`${f}:${i + 1} ${m[0]}`);
    });
  });
  expect(found, "write the American form (favorite, practice, color, center, labeled)").toEqual([]);
});
