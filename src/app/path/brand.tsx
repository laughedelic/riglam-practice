// The name of the app as a lockup under the figure (the three diamonds): on the roadmap here, and on the cover of the installed app (index.html draws the same, by hand, before any script has run).
// The forms are the ones to choose from: the word "practice" after the name on one line, or under it with both lines the same width; the name in lower case or in capitals.
export type LockupForm = "line-lower" | "line-caps" | "stack-lower" | "stack-caps";
/** The form in use. */
export const LOCKUP_FORM: LockupForm = "stack-lower";

/** The figure: the three diamonds (gold, blue, green), in the viewBox "100 50 312 412". */
export const BRAND = '<polygon points="256,61 371,177 256,292 141,177" fill="#faaf3f"/><polygon points="256,162 400,306 256,451 112,306" fill="#3155a4"/><polygon points="321,227 256,292 191,227 256,162" fill="#4c8a63"/>';

/** The width both lines of a stacked lockup are set to. */
export const STACK_W = 90;

/**
 * The name, centered on `x`, its first baseline at `y`: SVG text for the roadmap's drawing (classes `bn` for the name, `bp` for "practice", styled in 37-path-panels.css). A stacked lockup
 * sets both lines to one width with `textLength`, which also keeps it from moving when the font arrives. `bottom` is where it ends below `y`, for what hangs from it.
 */
export function Lockup({ form = LOCKUP_FORM, x, y }: { form?: LockupForm; x: number; y: number }) {
  const caps = form.endsWith("caps"), name = caps ? "RIGLAM" : "riglam";
  if (form.startsWith("line")) {
    return <text class={"bn" + (caps ? " caps" : "")} x={x} y={y} text-anchor="middle">{name}<tspan class="bp" dx="7">practice</tspan></text>;
  }
  return <g>
    <text class={"bn big" + (caps ? " caps" : "")} x={x} y={y} text-anchor="middle" textLength={STACK_W} lengthAdjust="spacing">{name}</text>
    <text class="bp small" x={x} y={y + 19} text-anchor="middle" textLength={STACK_W} lengthAdjust="spacing">practice</text>
  </g>;
}
/** How far below the first baseline a lockup of this form reaches (its descenders included). */
export const lockupBottom = (form: LockupForm = LOCKUP_FORM) => (form.startsWith("line") ? 6 : 25);
