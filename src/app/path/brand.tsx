// The name of the app as a lockup under the figure (the three diamonds): on the roadmap here, and on the cover of the installed app (src/pwa/cover.html draws the same, by hand, before any script has run).
// "riglam" with "practice" under it, both lines set to one width.

/** The figure: the three diamonds (gold, blue, green), in the viewBox "100 50 312 412". */
export const BRAND = '<polygon points="256,61 371,177 256,292 141,177" fill="#faaf3f"/><polygon points="256,162 400,306 256,451 112,306" fill="#3155a4"/><polygon points="321,227 256,292 191,227 256,162" fill="#4c8a63"/>';

/** The first baseline of the name on the roadmap, and how far below it the lockup reaches (its descenders included): what hangs from it starts under that. */
export const NAME_Y = 82;
export const NAME_BOTTOM = 25;

/**
 * The name, centered on `x`, its first baseline at `y`: SVG text for the roadmap's drawing (classes `bn` and `bp`, styled in 37-path-panels.css). `textLength` sets both lines to one width, which also keeps
 * the lockup from moving when the font arrives.
 */
export function Lockup({ x, y }: { x: number; y: number }) {
  return <g>
    <text class="bn" x={x} y={y} text-anchor="middle" textLength="90" lengthAdjust="spacing">riglam</text>
    <text class="bp" x={x} y={y + 19} text-anchor="middle" textLength="90" lengthAdjust="spacing">practice</text>
  </g>;
}
