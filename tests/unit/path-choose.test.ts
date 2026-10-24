// How a choice is taken on the Path (src/app/path/choose.ts): the stages of its animation, as the lab's Motion tab has them.
import { expect, test } from "vitest";
import { backC, stages } from "../../src/app/path/choose.ts";

/** The farthest the "back" ease goes past its end, in px, for a travel: the ease as choose.ts writes it, sampled finely. */
const overshoot = (travel: number) => {
  const c = backC(travel);
  let top = 0;
  for (let i = 0; i <= 2000; i++) { const u = i / 2000; top = Math.max(top, 1 + (c + 1) * (u - 1) ** 3 + c * (u - 1) ** 2 - 1); }
  return top * travel;
};

test("the snap goes about 3 px past the line whatever the travel", () => {
  for (const travel of [22, 60, 128]) {
    expect(overshoot(travel), String(travel)).toBeGreaterThan(3.0);
    expect(overshoot(travel), String(travel)).toBeLessThan(3.4);
  }
});

const by = (t: ReturnType<typeof stages>, n: string) => t.find((s) => s.n === n)!;

test("in a list the snap comes first, the others and the thread go together, the mark fills as the line reaches it, then it rises", () => {
  const t = stages(22, -160, false);
  expect(t.map((s) => s.n)).toEqual(["s", "f", "g", "n", "r"]);
  expect(by(t, "s").a).toBe(0);
  expect(by(t, "f").a).toBe(by(t, "g").a);   // fade and solidify together
  expect(by(t, "f").d).toBe(by(t, "g").d);
  const gEnd = by(t, "g").a + by(t, "g").d;
  expect(Math.abs(by(t, "n").a - gEnd)).toBeLessThan(120);   // the fill starts about when the solid line arrives
  expect(by(t, "r").a).toBeGreaterThanOrEqual(gEnd - 60);
  expect(by(t, "r").d).toBeLessThanOrEqual(540);
});

test("the first row does not rise, and a longer rise takes longer", () => {
  expect(stages(22, 0, false).map((s) => s.n)).toEqual(["s", "f", "g", "n"]);
  expect(by(stages(22, -300, false), "r").d).toBeGreaterThan(by(stages(22, -80, false), "r").d);
});

test("on one row the farther option takes longer, and the thread solidifies as it nears the line", () => {
  const near = stages(22, 0, true), far = stages(128, 0, true);
  expect(near.map((s) => s.n)).toEqual(["s", "f", "g", "n"]);
  expect(by(far, "s").d).toBeGreaterThan(by(near, "s").d);
  expect(by(far, "f").a).toBe(0);   // the other fades at once
  expect(by(far, "g").a).toBeLessThan(by(far, "s").d);   // the thread starts before the snap is over
});
