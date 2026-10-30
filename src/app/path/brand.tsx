// The name of the app as a lockup under the figure (the three diamonds): on the roadmap here, and on the cover of the installed app (src/pwa/cover.html draws the same, by hand, before any script has run).
// "RIGLAM" with "practice" under it, both lines set to one width.

/** The figure: the three diamonds (gold, blue, green), in the viewBox "100 50 312 412". */
export const BRAND = '<polygon points="256,61 371,177 256,292 141,177" fill="#faaf3f"/><polygon points="256,162 400,306 256,451 112,306" fill="#3155a4"/><polygon points="321,227 256,292 191,227 256,162" fill="#4c8a63"/>';

/**
 * The name under the figure, as picked in the Design Lab: "RIGLAM" in capitals and "practice" in italic, both in Sorts Mill Goudy (the face of the Hero image), stacked and set to one
 * width. The first line is 20.5 high and spaced by 0.08 em; the second is sized (23.83) so that, spaced by 0.1 em, it fills the same width. Measured in that face, the lockup reaches 14.35
 * above its first baseline and 24.57 below it (the second baseline is 17.9 under the first). The cover (src/pwa/cover.html) draws the same, with the same numbers.
 */
export const NAME_Y = 76;       // the first baseline on the roadmap (the figure ends at 54)
export const NAME_ASCENT = 14.35;
export const NAME_DEPTH = 24.57;
export const NAME_BOTTOM = 25;  // how far below the first baseline the lockup reaches, rounded up: what hangs from it starts under that
export const NAME_WIDTH = 90;
export const NAME_LEAD = 17.9;

/**
 * The name, centered on `x`, its first baseline at `y`: SVG text for the roadmap's drawing (classes `bn` and `bp`, styled in 09-path-panels.css). `textLength` sets both lines to one width, which also keeps
 * the lockup from moving when the font arrives. The last letter of a line carries no tracking, so that the ink is centered and the width counts the ink. The invisible box is what the cover
 * (src/pwa/cover.ts) measures to land its own name here.
 */
export function Lockup({ x, y }: { x: number; y: number }) {
  const left = x - NAME_WIDTH / 2;
  return <g class="rhead rname">
    <rect class="rbox" x={left} y={y - NAME_ASCENT} width={NAME_WIDTH} height={NAME_ASCENT + NAME_DEPTH} fill="none" pointer-events="none" />
    <text class="bn" x={left} y={y} textLength={NAME_WIDTH} lengthAdjust="spacing">RIGLA<tspan class="bl">M</tspan></text>
    <text class="bp" x={left} y={y + NAME_LEAD} textLength={NAME_WIDTH} lengthAdjust="spacing">practic<tspan class="bl">e</tspan></text>
  </g>;
}
