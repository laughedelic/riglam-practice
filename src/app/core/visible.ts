// How tall the Path's root is and where it starts on the screen: the part of the screen that can be seen (core/viewport.js applies it).

/** What the page reads of the browser's visual viewport. */
export interface VisualArea { height: number; offsetTop: number; scale: number }

/** A visible area this much shorter than the window has a keyboard under it (px). */
export const KEYBOARD = 120;

/**
 * The height and top the Path's root takes, or null for CSS's own (100dvh from the top). The page follows the visible area whenever it is not
 * zoomed in: a phone browser can lay the page out for a taller screen than the one it shows (after a reload, until something makes it measure
 * again), and then only the visible area is right. A pinch zoom makes the visible area smaller too, and the page is not laid out again for that,
 * unless a keyboard is up as well.
 */
export function visibleArea(vv: VisualArea | null | undefined, innerHeight: number): { height: number; top: number } | null {
  if (!vv || !(vv.height > 0)) return null;
  const zoomed = Math.abs(vv.scale - 1) > 0.01, keyboard = vv.height < innerHeight - KEYBOARD;
  if (zoomed && !keyboard) return null;
  return { height: Math.round(vv.height * 100) / 100, top: Math.max(0, Math.round(vv.offsetTop * 100) / 100) };
}
