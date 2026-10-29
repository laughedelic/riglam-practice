// The self-hosted fonts of the term names (Settings > Languages, scripts/fetch-fonts.mjs): the Chinese ones are one file of just the characters the term
// data uses, so a term added to the data needs `npm run fonts` again; this test says so before a character falls back to the system's font.
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import openData from "../../src/data/drill-data.json";

const css = readFileSync(new URL("../../src/pwa/fonts.css", import.meta.url), "utf8");
const face = (family: string) => css.split("\n").filter((l) => l.includes(`font-family: '${family}'`));

test("the Chinese font file holds every Han character of the term names", () => {
  const faces = face("Noto Serif SC");
  expect(faces.length).toBe(1);
  const ranges = [...faces[0]!.matchAll(/U\+([0-9a-f]+)(?:-([0-9a-f]+))?/gi)].map((m) => [parseInt(m[1]!, 16), parseInt(m[2] ?? m[1]!, 16)] as const);
  const missing = new Set<string>();
  for (const t of Object.values(openData.terms) as { zh?: string; zhs?: string }[])
    for (const c of [...(t.zh ?? ""), ...(t.zhs ?? "")]) {
      const cp = c.codePointAt(0)!;
      if (cp > 0x2e80 && !ranges.some(([a, b]) => cp >= a && cp <= b)) missing.add(c);
    }
  expect([...missing].join(""), "characters that are not in the font file: run npm run fonts").toBe("");
});

test("Tibetan and Devanagari have their own faces, and no other family keeps those scripts", () => {
  expect(face("Noto Serif Tibetan").map((l) => l.match(/unicode-range: ([^;]+)/)![1]!.split(",")[0])).toEqual(["U+0F00-0FFF"]);
  expect(face("Noto Serif Devanagari").map((l) => l.match(/unicode-range: ([^;]+)/)![1]!.split(",")[0])).toEqual(["U+0900-097F"]);
  expect(css.split("\n").filter((l) => /U\+0900-097F/.test(l) && !l.includes("Noto Serif Devanagari"))).toEqual([]);
});
