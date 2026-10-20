// How the page takes the reference examples from the platform (src/app/core/examples.js) into state.EX.
import { afterEach, expect, test } from "vitest";
import { loadExamples } from "../../src/app/core/examples.js";
import { state } from "../../src/app/state.js";

const part = (...names: string[]) => ({ format: "riglam-examples-device", version: 2, sources: {}, items: names.map((n) => ({ n, lv: 1 })) });
afterEach(() => { state.EX = null; });

test("builds the index from what the platform holds", async () => {
  await loadExamples({ examples: async () => part("a vemo lake") });
  expect(state.EX!.items.map((i: { n: string }) => i.n)).toEqual(["a vemo lake"]);
  expect(state.EX!.BYNAME["vemo lake"]).toHaveLength(1);
  await loadExamples({ examples: async () => part("a vemo lake", "a new pot") });
  expect(state.EX!.items).toHaveLength(2);
});

test.each([
  ["a platform without the capability", {}],
  ["a device with none", { examples: async () => null }],
  ["an empty copy", { examples: async () => part() }],
  ["something that is not the format", { examples: async () => ({ items: "no" }) }],
  ["a platform that throws", { examples: async () => { throw new Error("x"); } }],
])("leaves the page without examples for %s, also when it had some before", async (_name, platform) => {
  await loadExamples({ examples: async () => part("a vemo lake") });
  await loadExamples(platform);
  expect(state.EX).toBeNull();
});
