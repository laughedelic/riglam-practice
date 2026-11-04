// Where a definition comes from, as the page reads it from the tag in front of it (src/app/practice/terms.js, defParts).
import { expect, test, vi } from "vitest";
import { defParts } from "../../src/app/practice/terms.js";

// the page's render, which needs a browser, is not part of this
vi.mock("../../src/app/shell/render.js", () => ({ render: () => {} }));

test("the reference's own wording has no label, and its chapter is where it is from", () => {
  expect(defParts("a vemo that is tarn")).toEqual({ src: "", body: "a vemo that is tarn", ref: true });
  expect(defParts("(Purbuchok) a vemo that is tarn")).toEqual({ src: "", body: "a vemo that is tarn", ref: true });
});

test("another source is named", () => {
  expect(defParts("(defined in Lorig) a tarn")).toEqual({ src: "Defined in Lorig", body: "a tarn", ref: true });
  expect(defParts("(tables) a vemo heap")).toEqual({ src: "From the Dampilon tables", body: "a vemo heap", ref: true });
  expect(defParts("a vemo heap (Dampilon)")).toEqual({ src: "From Dampilon", body: "a vemo heap", ref: true });
});

test.each([
  "(not defined in the reference) a vemo that is both",
  "(the reference gives only an example) e.g. a vemo",
  // the tags of older data
  "(not defined in the booklet) a vemo that is both",
  "(booklet gives only an example) e.g. a vemo",
  "(not defined here) a vemo that is both",
])("a definition the reference does not give has no label and no chapter: %s", (s) => {
  const got = defParts(s);
  expect(got.src).toBe("");
  expect(got.ref).toBe(false);
  expect(got.body).not.toMatch(/^\(/);
});
