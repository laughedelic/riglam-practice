// The curb a station is pulled over (src/app/path/gesture.ts): it follows the finger, sticks at the curb, goes over once the finger has pressed on, and goes back under
// (more lightly) when pulled back. A finger moves a pixel or so at a time, so the tests do.
import { expect, test } from "vitest";
import { curbMove, curbNew } from "../../src/app/path/gesture.ts";
import type { Curb } from "../../src/app/path/gesture.ts";

/** The finger from `a` to `b` px above where it started, a pixel at a time: what the curb said, and where the station was, after each step. */
function finger(c: Curb, a: number, b: number) {
  const out: { r: number; y: number; ev: string }[] = [], dir = b >= a ? 1 : -1;
  for (let r = a + dir; dir > 0 ? r <= b : r >= b; r += dir) { const ev = curbMove(c, r); out.push({ r, y: c.y, ev }); }
  return out;
}

test("the station follows the finger at first, then slows and sticks at the curb while the finger presses on", () => {
  const c = curbNew(), out = finger(c, 0, 40);
  expect(out[4].y, "at first it keeps up").toBeGreaterThan(4.9);
  expect(out[19].y).toBeGreaterThan(18);
  expect(out[39].y, "slower and slower").toBeLessThan(36);
  for (const o of out) { expect(o.y).toBeLessThanOrEqual(42); expect(o.ev).toBe(""); }
  expect(c.over).toBe(false);
});

test("pressed on far enough it goes over with one event, and then follows the finger freely", () => {
  const c = curbNew(), up = finger(c, 0, 90);
  const over = up.filter((o) => o.ev === "over");
  expect(over).toHaveLength(1);
  expect(over[0].r, "after a press, not before").toBeGreaterThan(50);
  expect(over[0].r).toBeLessThan(80);
  const free = up.filter((o) => o.r >= 90).length ? up[up.length - 1].y - up[up.length - 11].y : 0;
  expect(free, "over the curb it moves at least as far as the finger").toBeGreaterThanOrEqual(10);
});

test("pulled back under it, it is free to the curb, sticks a little, and goes back with the other event", () => {
  const c = curbNew(); finger(c, 0, 120);
  expect(c.over).toBe(true);
  const back = finger(c, 120, 0);
  expect(back.filter((o) => o.ev === "back")).toHaveLength(1);
  expect(c.over).toBe(false);
  expect(c.y).toBeLessThanOrEqual(42);
  expect(back.find((o) => o.ev === "back")!.r, "it goes back under below the curb's height").toBeLessThan(60);
});
