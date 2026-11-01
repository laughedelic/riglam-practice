// The art of the app icons, as numbers: one page with the figure of the four possibilities on it, two rhombi stood one above the other,
// yellow over blue, green where they overlap. The page is the Path's own, ivory for Main (the real app) and slate for Preview (staging and
// pull request builds), so the two are told apart at any size by their page, and both are the pages the app draws. The figure has the grain,
// the page is flat (the Icon Lab's A7 "No bands": the picks of 1 Nov 2026).
// A pure module: scripts/make-icons.mjs writes public/icons/icon.svg and public/icons/preview/icon.svg from it, and render-icon.mjs
// asks it where the grain is (the figure).

export const SIZE = 512; // the drawing box; the SVGs scale it
export const SAFE_RADIUS = 0.4 * SIZE; // the circle of 80% of the width that every mask (adaptive, maskable, round) keeps

export const SETS = {
  main: { page: "#fbf9f2" },
  preview: { page: "#161a20" },
};
export const COLORS = { a: "#faaf3f", b: "#3155a4", overlap: "#4c8a63" }; // the overlap is the true mix of yellow and blue

export const FIGURE = 0.95; // the figure's reach (its farthest corner from the middle), as a share of the safe circle's radius
export const OVERLAP = 0.5; // how far the rhombi overlap, as a share of their width
export const A_OF_B = 0.8; // the upper rhombus against the lower one

const diamond = (cx, cy, r) => [[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]];

// Sutherland-Hodgman: the part of the convex polygon `subject` that lies inside the convex polygon `clipper`.
function clip(subject, clipper) {
  const sign = Math.sign(clipper.reduce((s, p, i) => s + p[0] * clipper[(i + 1) % clipper.length][1] - clipper[(i + 1) % clipper.length][0] * p[1], 0));
  let out = subject;
  for (let i = 0; i < clipper.length && out.length; i++) {
    const a = clipper[i], b = clipper[(i + 1) % clipper.length];
    const side = (p) => sign * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));
    const input = out;
    out = [];
    input.forEach((p, j) => {
      const q = input[(j + 1) % input.length], sp = side(p), sq = side(q);
      if (sp >= 0) out.push(p);
      if ((sp >= 0) !== (sq >= 0)) out.push([p[0] + (q[0] - p[0]) * (sp / (sp - sq)), p[1] + (q[1] - p[1]) * (sp / (sp - sq))]);
    });
  }
  return out;
}

/** The three polygons of the figure, in drawing units: the upper rhombus (a), the lower one (b) and where they overlap. */
export function figure() {
  const k = 2 - 2 * OVERLAP; // the lab's measure: 1 puts the rhombi half a width apart
  const apart = ((A_OF_B + 1) / 2) * k;
  const a = diamond(0, -apart / 2, A_OF_B), b = diamond(0, apart / 2, 1);
  const all = [...a, ...b];
  const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  const mx = (Math.min(...xs) + Math.max(...xs)) / 2, my = (Math.min(...ys) + Math.max(...ys)) / 2;
  const reach = Math.max(...all.map((p) => Math.hypot(p[0] - mx, p[1] - my)));
  const s = (FIGURE * SAFE_RADIUS) / reach;
  const place = (poly) => poly.map((p) => [SIZE / 2 + (p[0] - mx) * s, SIZE / 2 + (p[1] - my) * s]);
  const A = place(a), B = place(b);
  return { a: A, b: B, overlap: clip(A, B) };
}

const points = (poly) => poly.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");

/** The flat SVG of a set ("main" or "preview"): this is public/icons/icon.svg and public/icons/preview/icon.svg. */
export function iconSvg(set) {
  const { page } = SETS[set];
  const { a, b, overlap } = figure();
  const note =
    set === "main"
      ? "Main: the ivory page of the Path, the figure of the four possibilities on it"
      : "Preview (staging and pull request builds): the slate page of the Path, the same figure";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}">
  <!-- ${note}: two rhombi, one over the other, and where they
       overlap the colors make green, as the Dudra set has it. Made by scripts/make-icons.mjs from scripts/lib/icon-art.mjs. The art stays
       inside the central 80% circle that every mask keeps; only the page runs to the edge. -->
  <rect width="${SIZE}" height="${SIZE}" fill="${page}"/>
  <polygon points="${points(a)}" fill="${COLORS.a}"/>
  <polygon points="${points(b)}" fill="${COLORS.b}"/>
  <polygon points="${points(overlap)}" fill="${COLORS.overlap}"/>
</svg>
`;
}

/** The grain map as an SVG: white where there is no grain (the page), black where it is strong (the figure). */
export function grainMaskSvg() {
  const { a, b } = figure();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="#fff"/>
  <polygon points="${points(a)}" fill="#000"/>
  <polygon points="${points(b)}" fill="#000"/>
</svg>
`;
}
