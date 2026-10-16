// The Magic Key (src/ai/magic-key.ts): the shapes people type, dictate or paste all give the same dashed lower-case words.
import { expect, test } from "vitest";
import { parseMagicKey } from "../../src/ai/magic-key";
import { testMagicKey } from "../support/magic-key";

const KEY = "lotus-river-candle-stone";

test("dashed words, spaced words, dictated words with punctuation and any case all give the same key", () => {
  for (const input of [KEY, "Lotus River Candle Stone", "  lotus   river candle\nstone ", "Lotus, river. Candle, stone.", "LOTUS-RIVER-CANDLE-STONE", "lotus river-candle stone"]) {
    expect(parseMagicKey(input), input).toBe(KEY);
  }
});

test("a link or a fragment carrying k= gives the key, and a link without one gives none", () => {
  expect(parseMagicKey(`#k=${KEY}`)).toBe(KEY);
  expect(parseMagicKey(`https://riglam.example/#k=${KEY}`)).toBe(KEY);
  expect(parseMagicKey(`https://riglam.example/?a=1#x=2&k=${KEY}`)).toBe(KEY);
  expect(parseMagicKey(`#k=lotus%20river%20candle%20stone`)).toBe(KEY);
  expect(parseMagicKey("https://riglam.example/")).toBeNull();
  expect(parseMagicKey("#k=%E0%A4%A")).toBeNull();
});

test("too few or too many words, digits, underscores and empty input are not keys", () => {
  for (const bad of [null, undefined, "", "   ", "one two", "one-two", Array(13).fill("word").join("-"), "lotus river candle 2", "lotus_river_candle_stone", "k=short"]) {
    expect(parseMagicKey(bad), String(bad)).toBeNull();
  }
});

test("the keys the tests make are keys, and differ each time", () => {
  const a = testMagicKey();
  expect(parseMagicKey(a)).toBe(a);
  expect(a).not.toBe(testMagicKey());
});
