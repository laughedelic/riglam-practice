// The Path's root follows the part of the screen that can be seen (src/app/core/visible.ts, applied by core/viewport.js).
import { expect, test } from "vitest";
import { KEYBOARD, visibleArea } from "../../src/app/core/visible";

test("the page takes the visible area's height and top whenever it is not zoomed in", () => {
  expect(visibleArea({ height: 780, offsetTop: 0, scale: 1 }, 780)).toEqual({ height: 780, top: 0 });
  // laid out for a taller screen than the one shown (after an update's reload): the visible area, not the window, is what fits
  expect(visibleArea({ height: 712, offsetTop: 0, scale: 1 }, 780)).toEqual({ height: 712, top: 0 });
  expect(visibleArea({ height: 712.4567, offsetTop: 33.333, scale: 1 }, 780)).toEqual({ height: 712.46, top: 33.33 });
});

test("a keyboard under the visible area moves the page up with it, zoomed in or not", () => {
  expect(visibleArea({ height: 420, offsetTop: 210, scale: 1 }, 780)).toEqual({ height: 420, top: 210 });
  expect(visibleArea({ height: 780 - KEYBOARD - 1, offsetTop: 0, scale: 1.5 }, 780)).toEqual({ height: 780 - KEYBOARD - 1, top: 0 });
});

test("a pinch zoom alone leaves the page laid out as it was", () => {
  expect(visibleArea({ height: 700, offsetTop: 40, scale: 1.12 }, 780)).toBeNull();
  expect(visibleArea({ height: 779.9, offsetTop: 0, scale: 1.005 }, 780)).toEqual({ height: 779.9, top: 0 }); // (a scale a hair off 1 is not a zoom)
});

test("no visual viewport, or one that says nothing, leaves CSS's own height", () => {
  expect(visibleArea(null, 780)).toBeNull();
  expect(visibleArea(undefined, 780)).toBeNull();
  expect(visibleArea({ height: 0, offsetTop: 0, scale: 1 }, 780)).toBeNull();
  expect(visibleArea({ height: 780, offsetTop: -12, scale: 1 }, 780)).toEqual({ height: 780, top: 0 }); // (a rubber band past the top does not drag the page)
});
