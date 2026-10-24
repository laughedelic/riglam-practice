import { expect, test } from "vitest";
import { fromSixth } from "../../src/app/core/rel.js";

test("a document saved while a preview had a sixth relation reads as four possibilities, the rest as it was", () => {
  const cells = { nei: { text: "", none: true } };
  const saved = { id: "x", chosen: "4n", key: "4n", implied: "4n", correct: true, cells, pair: { a: "a", b: "b", relation: "4n", neg: "b" } };
  const read = fromSixth(saved);
  expect(read).toMatchObject({ chosen: "4", key: "4", implied: "4", correct: true, pair: { relation: "4", neg: "b" } });
  expect(read.cells).toBe(cells);
  expect(saved.chosen).toBe("4n");                         // the stored document itself is not touched
  expect(fromSixth({ relation: "4n", asked: "4n" })).toEqual({ relation: "4", asked: "4" });
  const plain = { chosen: "3ab", key: "3ab", implied: null, pair: { relation: "3ab" } };
  expect(fromSixth(plain)).toEqual(plain);
  expect(fromSixth(null)).toBeNull();
});
