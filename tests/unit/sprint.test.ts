// src/domain/sprint.ts: the times of Sprint (the clock of a step), where they are kept, and what time up on a case of examples does next.
import { expect, test } from "vitest";
import { NAME_TIMES, TIME_DEFAULT, TIME_KEY, TIME_KINDS, TIME_MAX, TIME_MIN, defaultTimes, nextAfterTimeUp, readTime, timesOf } from "../../src/domain/sprint";
import { PREFERENCE_KEYS } from "../../src/store/transfer";
import { EXERCISES, normPerEx } from "../../src/domain/per-exercise";

test("the times start where the course asked for them: 15 s to choose the relation, 10 s for Accept or Why?, 20 s to write, 15 s for a reply, 20 s and 5 s for categories", () => {
  expect(TIME_DEFAULT).toEqual({ rel: 15000, q: 10000, ex: 20000, syl: 15000, cats: 20000, cat: 5000 });
  expect(defaultTimes()).toEqual(TIME_DEFAULT);
  expect(defaultTimes(), "a copy, so that changing one never changes the start").not.toBe(defaultTimes());
  expect(NAME_TIMES, "naming the two terms of a pair takes two writings").toBe(2);
});

test("a stored time is read when it is a number of ms in range; anything else is the start", () => {
  expect(readTime("ex", "30000")).toBe(30000);
  expect(readTime("ex", 12000)).toBe(12000);
  expect(readTime("ex", String(TIME_MIN))).toBe(TIME_MIN);
  expect(readTime("ex", String(TIME_MAX))).toBe(TIME_MAX);
  for (const bad of [null, undefined, "", " ", "abc", "1999", String(TIME_MAX + 1), "-5", "NaN", {}, []]) expect(readTime("rel", bad), String(bad)).toBe(TIME_DEFAULT.rel);
  expect(readTime("cat", "7000.4"), "whole ms").toBe(7000);
});

test("every time has a key of its own on the device, and the keys travel with the other preferences", () => {
  expect(new Set(TIME_KINDS.map((k) => TIME_KEY[k])).size).toBe(TIME_KINDS.length);
  for (const k of TIME_KINDS) expect(PREFERENCE_KEYS, TIME_KEY[k]).toContain(TIME_KEY[k]);
  expect(PREFERENCE_KEYS).toContain("rd-blitz");
  expect(PREFERENCE_KEYS, "the switch that hid the stopwatch is gone").not.toContain("rd-blitzuse");
});

test("each exercise lists the times it uses, and every exercise has some", () => {
  expect(timesOf("practice")).toEqual(["rel", "ex"]);
  expect(timesOf("debate")).toEqual(["rel", "q", "ex"]);
  expect(timesOf("syllogism")).toEqual(["syl"]);
  expect(timesOf("find")).toEqual(["ex"]);
  expect(timesOf("categories")).toEqual(["cats", "cat"]);
  expect(timesOf("instance")).toEqual(["ex"]);
  expect(timesOf("review")).toEqual([]);
  for (const ex of EXERCISES) expect(timesOf(ex).length, ex).toBeGreaterThan(0);
  const used = new Set(EXERCISES.flatMap(timesOf));
  expect([...used].sort()).toEqual([...TIME_KINDS].sort());
});

test("time up on a case goes on to the next case without an example, round the list, and never back to one that is done", () => {
  const order = ["both", "anb", "bna", "nei"];
  const none = new Set<string>();
  expect(nextAfterTimeUp(order, 0, (c) => none.has(c))).toBe("anb");
  expect(nextAfterTimeUp(order, 3, (c) => none.has(c)), "after the last, round to the first").toBe("both");
  expect(nextAfterTimeUp(order, 1, (c) => ["bna"].includes(c)), "one with an example is passed over").toBe("nei");
  expect(nextAfterTimeUp(order, 2, (c) => ["both", "nei"].includes(c))).toBe("anb");
  expect(nextAfterTimeUp(order, 3, (c) => c !== "nei"), "nothing left: the pair is checked").toBeNull();
  expect(nextAfterTimeUp(["anb"], 0, () => false), "a single case that ran out is not asked again").toBeNull();
  expect(nextAfterTimeUp([], 0, () => false)).toBeNull();
});

test("Sprint is each exercise's own switch: the stored record keeps `blitz` per exercise and drops what cannot be read", () => {
  expect(normPerEx({ practice: { blitz: true }, syllogism: { blitz: false, blitzUse: true }, nowhere: { blitz: true }, find: { blitz: "yes" } }))
    .toEqual({ practice: { blitz: true }, syllogism: { blitz: false } });
  expect(normPerEx(JSON.stringify({ categories: { blitz: true } }))).toEqual({ categories: { blitz: true } });
  expect(normPerEx("{")).toEqual({});
});
