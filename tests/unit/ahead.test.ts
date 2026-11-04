// The pair drawn ahead of the Next that shows it (src/app/practice/ahead.ts): held while what the draw depends on is as it was, and given back, with what it spent, when it is not used.
import { beforeEach, expect, test, vi } from "vitest";

const world = vi.hoisted(() => ({ state: { stages: [0, 1], negation: "off", negBrackets: false, stagesKept: false, recent: [] as string[], stageLean: 5, ahead: null as unknown }, unmet: 3, hidden: 0, stored: [] as number[] }));
vi.mock("../../src/app/state.js", () => ({ state: world.state }));
vi.mock("../../src/app/shell/stages.js", () => ({ restoreLean: (n: number) => { world.state.stageLean = n; world.stored.push(n); } }));
vi.mock("../../src/app/practice/stops.ts", () => ({ unmetNow: () => ({ size: world.unmet }) }));
vi.mock("../../src/app/practice/skips.js", () => ({ hiddenKeys: () => ({ size: world.hidden }) }));

const { holdAhead, takeAhead } = await import("../../src/app/practice/ahead.ts");

/** A draw as the real one spends: a pair counted as lately asked and one pair of the lean. */
let drawn = 0;
const draw = () => { drawn++; world.state.recent.push("pair" + drawn); world.state.stageLean--; return { id: "pair" + drawn } as never; };

beforeEach(() => {
  Object.assign(world.state, { stages: [0, 1], negation: "off", negBrackets: false, stagesKept: false, recent: ["old"], stageLean: 5, ahead: null });
  Object.assign(world, { unmet: 3, hidden: 0, stored: [] });
  drawn = 0;
});

test("the pair is drawn once however often it is asked for, and the Next takes it", () => {
  const a = holdAhead("practice", draw), b = holdAhead("practice", draw);
  expect(b).toBe(a);
  expect(drawn).toBe(1);
  expect(takeAhead("practice")).toBe(a);
  expect(world.state.ahead).toBeNull();
  expect(world.state.recent).toEqual(["old", "pair1"]);   // what the draw spent stays spent: it is the pair that is shown
});

test("what the draw depends on changing gives the pair back with what it spent, and the Next draws as before", () => {
  holdAhead("practice", draw);
  world.state.stages = [0, 1, 2];   // a stage offer taken at the result
  expect(takeAhead("practice")).toBeNull();
  expect(world.state.recent).toEqual(["old"]);
  expect(world.state.stageLean).toBe(5);
  expect(world.state.ahead).toBeNull();
});

test("a stage taken after the draw sets the lean anew, and giving the draw back leaves that lean alone", () => {
  world.state.stageLean = 3;
  holdAhead("practice", draw);
  expect(world.state.stageLean).toBe(2);
  Object.assign(world.state, { stages: [0, 1, 2], stageLean: 5 });   // setStages: the highest stage went up, its first five pairs lean
  expect(takeAhead("practice")).toBeNull();
  expect(world.state.stageLean).toBe(5);
  expect(world.stored).toEqual([]);   // nothing was written over the new lean
  expect(world.state.recent).toEqual(["old"]);
});

test("a lean the draw left alone is given back with the pair", () => {
  world.state.stageLean = 3;
  holdAhead("practice", draw);
  world.unmet = 2;
  expect(takeAhead("practice")).toBeNull();
  expect(world.state.stageLean).toBe(3);
});

test("a term met at a stop, a skip and the negation track are what the draw depends on too", () => {
  for (const change of [() => { world.unmet = 2; }, () => { world.hidden = 1; }, () => { world.state.negation = "both"; }, () => { world.state.negBrackets = true; }]) {
    holdAhead("practice", draw);
    change();
    expect(takeAhead("practice")).toBeNull();
    expect(world.state.recent).toEqual(["old"]);
    Object.assign(world.state, { stages: [0, 1], negation: "off", negBrackets: false }); Object.assign(world, { unmet: 3, hidden: 0 });
  }
});

test("asked for again after the draw's conditions changed, a new pair is drawn and the first one given back", () => {
  const a = holdAhead("practice", draw);
  world.unmet = 2;
  const b = holdAhead("practice", draw);
  expect(b).not.toBe(a);
  expect(world.state.recent).toEqual(["old", "pair2"]);   // the first draw's pair is not counted as asked
  expect(world.state.stageLean).toBe(4);
  expect(takeAhead("practice")).toBe(b);
});

test("a pair drawn for one exercise is not the next of another", () => {
  holdAhead("practice", draw);
  expect(takeAhead("debate")).toBeNull();
  expect(world.state.recent).toEqual(["old"]);
});
