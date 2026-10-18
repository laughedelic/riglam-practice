// Draws the Riglam hero images on a canvas: the logo figure on the left, the name, the line and a faint Tibetan name on the right, on the booklet
// page, the divider page or a lattice. It runs in the page scripts/social/page.html, in headless Chromium, started by scripts/make-social.mjs.
// This is the picked design of the Riglam Social Lab (the exploration page), reduced to what the three pictures use and with every choice
// written out in settings.json. Sizes are in units of a picture 1280 wide.
import { fineNoiseTile, rng, TILE } from "../lib/grain.mjs";

const W = 1280;
const BAND = Math.round(W * 0.094); // the booklet's side band, 9.4% of the page width
const STRENGTH = { soft: 0.55, mid: 1, strong: 1.6 }; // the grain strengths of the icons, as multiples of the normal noise
const GRAIN_SEED = 20261017;
const LATTICE = { cell: 64, gap: 2.5, amplitude: 0.16, seed: 77 };

const TITLE = { family: '"Sorts Mill Goudy"', weight: 400, tracking: 0.1, size: 190 }; // capitals, spaced
const LINE = { family: '"Sorts Mill Goudy"', weight: 400, scale: 1.15 };
const TIBETAN = { family: '"Noto Serif Tibetan"', weight: 600 };

// The logo's stacked figure (public/icons/preview/icon.svg): two rhombi and the one shape where they overlap, in a 512 unit box.
const FIGURE = {
  a: [[256, 55.3], [374.9, 174.2], [256, 293.2], [137.1, 174.2]],
  b: [[256, 159.4], [404.7, 308], [256, 456.7], [107.3, 308]],
  o: [[322.9, 226.3], [256, 293.2], [189.1, 226.3], [256, 159.4]],
};

const font = (f, px) => `${f.weight} ${px}px ${f.family}`;
const measure = (() => {
  let ctx;
  return () => (ctx ??= document.createElement("canvas").getContext("2d"));
})();

function polygon(ctx, points, fill) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/* ---------- ground ---------- */

// A field of rhombi, each a little lighter or darker than the ground, with thin gaps between them.
function lattice(ctx, x0, y0, x1, y1) {
  const { cell: d, gap, amplitude, seed } = LATTICE;
  const random = rng(seed);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, x1 - x0, y1 - y0);
  ctx.clip();
  for (let j = Math.floor(y0 / d) - 1; j <= y1 / d + 1; j++) {
    for (let i = Math.floor(x0 / (2 * d)) - 1; i <= x1 / (2 * d) + 1; i++) {
      const cx = i * 2 * d + (j & 1 ? d : 0), cy = j * d, a = (random() - 0.5) * amplitude;
      ctx.beginPath();
      ctx.moveTo(cx, cy - d + gap);
      ctx.lineTo(cx + d - gap, cy);
      ctx.lineTo(cx, cy + d - gap);
      ctx.lineTo(cx - d + gap, cy);
      ctx.closePath();
      ctx.fillStyle = a > 0 ? `rgba(255,255,255,${a.toFixed(3)})` : `rgba(0,0,0,${(-a * 1.3).toFixed(3)})`;
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawGround(ctx, ground, height) {
  const banded = ground.kind === "bands";
  ctx.fillStyle = banded ? ground.center : ground.base;
  ctx.fillRect(0, 0, W, height);
  if (banded) {
    ctx.fillStyle = ground.sides;
    ctx.fillRect(0, 0, BAND, height);
    ctx.fillRect(W - BAND, 0, BAND, height);
  } else lattice(ctx, 0, 0, W, height);
}

/* ---------- figure ---------- */

const bounds = [...FIGURE.a, ...FIGURE.b];
const box = {
  x0: Math.min(...bounds.map((p) => p[0])), x1: Math.max(...bounds.map((p) => p[0])),
  y0: Math.min(...bounds.map((p) => p[1])), y1: Math.max(...bounds.map((p) => p[1])),
};

// Puts the context in the figure's own units, centered in `rect` and scaled to fit it (times `size` percent).
function placeFigure(ctx, rect, size) {
  const w = box.x1 - box.x0, h = box.y1 - box.y0;
  const s = Math.min((rect.x1 - rect.x0) / w, (rect.y1 - rect.y0) / h) * (size / 100);
  ctx.translate((rect.x0 + rect.x1) / 2, (rect.y0 + rect.y1) / 2);
  ctx.scale(s, s);
  ctx.translate(-(box.x0 + box.x1) / 2, -(box.y0 + box.y1) / 2);
}

function drawFigure(ctx, figure, rect, banded) {
  ctx.save();
  if (banded) {
    ctx.beginPath();
    ctx.rect(BAND, 0, W - 2 * BAND, 1e4);
    ctx.clip();
  }
  placeFigure(ctx, rect, figure.size);
  polygon(ctx, FIGURE.a, figure.a);
  polygon(ctx, FIGURE.b, figure.b);
  polygon(ctx, FIGURE.o, figure.overlap);
  ctx.restore();
}

/* ---------- grain ---------- */

// The generated grain (scripts/lib/grain.mjs) laid over the picture with soft-light, so colors keep their look and gain fine, even noise.
// The ground, the sides and the figure can each have their own strength; where they all agree it is one layer over everything.
const tiles = {};
function tileCanvas(strength) {
  if (tiles[strength]) return tiles[strength];
  const gray = fineNoiseTile(STRENGTH[strength], GRAIN_SEED), c = document.createElement("canvas");
  c.width = c.height = TILE;
  const x = c.getContext("2d"), image = x.createImageData(TILE, TILE);
  for (let i = 0; i < gray.length; i++) {
    image.data[i * 4] = image.data[i * 4 + 1] = image.data[i * 4 + 2] = gray[i];
    image.data[i * 4 + 3] = 255;
  }
  x.putImageData(image, 0, 0);
  return (tiles[strength] = c);
}

function fillGrain(ctx, strength, size, height) {
  if (strength === "none") {
    ctx.fillStyle = "rgb(128,128,128)"; // neutral: soft-light leaves the color as it is
  } else {
    const pattern = ctx.createPattern(tileCanvas(strength), "repeat");
    pattern.setTransform(new DOMMatrix().scale(size));
    ctx.fillStyle = pattern;
  }
  ctx.fillRect(0, 0, W, height);
}

function drawGrain(ctx, image, rect) {
  const { grain, ground, height } = image, banded = ground.kind === "bands", figured = !!rect;
  const strengths = [grain.ground, ...(banded ? [grain.sides] : []), ...(figured ? [grain.figure] : [])];
  if (strengths.every((s) => s === strengths[0])) {
    if (strengths[0] === "none") return;
    ctx.save();
    ctx.globalCompositeOperation = "soft-light";
    fillGrain(ctx, grain.ground, grain.size, height);
    ctx.restore();
    return;
  }
  const layer = document.createElement("canvas");
  layer.width = W;
  layer.height = height;
  const target = layer.getContext("2d");
  fillGrain(target, grain.ground, grain.size, height);
  if (banded) {
    target.save();
    target.beginPath();
    target.rect(0, 0, BAND, height);
    target.rect(W - BAND, 0, BAND, height);
    target.clip();
    fillGrain(target, grain.sides, grain.size, height);
    target.restore();
  }
  if (figured) {
    target.save();
    if (banded) {
      target.beginPath();
      target.rect(BAND, 0, W - 2 * BAND, height);
      target.clip();
    }
    placeFigure(target, rect, image.figure.size);
    target.beginPath();
    for (const points of [FIGURE.a, FIGURE.b]) {
      points.forEach(([x, y], i) => (i ? target.lineTo(x, y) : target.moveTo(x, y)));
      target.closePath();
    }
    target.setTransform(1, 0, 0, 1, 0, 0);
    target.clip();
    fillGrain(target, grain.figure, grain.size, height);
    target.restore();
  }
  ctx.save();
  ctx.globalCompositeOperation = "soft-light";
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
}

/* ---------- text ---------- */

function width(f, str, px, tracking = 0) {
  const m = measure();
  m.font = font(f, px);
  if (!tracking) return m.measureText(str).width;
  let w = 0;
  for (const ch of str) w += m.measureText(ch).width + tracking * px;
  return w - tracking * px;
}

function capHeight(f, px) {
  const m = measure();
  m.font = font(f, px);
  return m.measureText("H").actualBoundingBoxAscent;
}

function descender(f, px, str) {
  const m = measure();
  m.font = font(f, px);
  return /[gjpqy,;]/.test(str) ? m.measureText("g").actualBoundingBoxDescent : 0;
}

function wrap(f, str, px, max) {
  const lines = [];
  let current = "";
  for (const word of str.split(/\s+/)) {
    const trial = current ? `${current} ${word}` : word;
    if (!current || width(f, trial, px) <= max) current = trial;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// One line a little smaller beats a wrapped line at full size; otherwise wrap, shrinking until it fits in `maxLines`.
function fitLines(f, str, px0, max, maxLines) {
  const w1 = width(f, str, px0);
  if (w1 <= max) return { px: px0, lines: [str] };
  if (max / w1 >= 0.8) return { px: (px0 * max) / w1 * 0.995, lines: [str] };
  let px = px0, lines;
  for (let i = 0; i < 14; i++) {
    lines = wrap(f, str, px, max);
    if (lines.length <= maxLines) break;
    px *= 0.94;
  }
  return { px, lines };
}

// The name and the line under it, from the cap height of the name (y = 0) down to the baseline of the last line; `u` shrinks every size.
function layoutText(text, availW, u) {
  const title = text.title.toUpperCase(), tracking = TITLE.tracking;
  const t = { family: TITLE.family, weight: TITLE.weight };
  const coef = width(t, title, 100, tracking) / 100;
  const T = Math.min(TITLE.size * u, (availW * 0.985) / coef);
  const nameCap = capHeight(t, T), nameDesc = descender(t, T, title);
  const items = [{ str: title, font: t, px: T, y: nameCap, tracking, name: true }];
  let h = nameCap;
  if (text.line) {
    const lf = { family: LINE.family, weight: LINE.weight };
    const size = (text.line.length <= 32 ? 52 : text.line.length <= 48 ? 46 : text.line.length <= 90 ? 40 : 34) * LINE.scale * (text.lineSize / 100) * u;
    const fit = fitLines(lf, text.line, size, availW, 3);
    const cap = capHeight(lf, fit.px), lh = fit.px * 1.3, gap = Math.max(24, Math.min(50, T * 0.24));
    const y = h + nameDesc + gap + cap;
    fit.lines.forEach((str, i) => items.push({ str, font: lf, px: fit.px, y: y + i * lh }));
    h = y + (fit.lines.length - 1) * lh;
  }
  return { items, h, T };
}

function drawRun(ctx, run, color) {
  ctx.save();
  ctx.font = font(run.font, run.px);
  ctx.fillStyle = color;
  ctx.textBaseline = "alphabetic";
  if (run.tracking) {
    let x = run.x;
    for (const ch of run.str) {
      ctx.fillText(ch, x, run.y);
      x += ctx.measureText(ch).width + run.tracking * run.px;
    }
  } else ctx.fillText(run.str, run.x, run.y);
  ctx.restore();
}

// "rgba(r,g,b,a)" for a color and an opacity, so the line can be a hair softer than the name.
function withAlpha(hex, alpha) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ---------- the picture ---------- */

/** Draws one image of settings.json (`image`) with the words (`text`) on `canvas`, which becomes 1280 wide and `image.height` tall. */
export async function draw(canvas, text, image) {
  await Promise.all([
    document.fonts.load(font(TITLE, 32), "RIGLAM"),
    document.fonts.load(font(LINE, 32), text.line),
    document.fonts.load(font(TIBETAN, 32), text.tibetan),
  ]);
  const H = image.height, banded = image.ground.kind === "bands";
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  drawGround(ctx, image.ground, H);

  // Where things go: the figure at the left in the full height between the margins, the text in the rest, centered on the same line.
  const margin = Math.max(26, Math.min(64, H * 0.11));
  const xl = Math.max(72, banded ? BAND + 56 : 72), xr = W - xl;
  const y0 = margin, y1 = H - margin, availH = y1 - y0, cy = (y0 + y1) / 2;
  const figW = Math.min((availH * (box.x1 - box.x0)) / (box.y1 - box.y0), (xr - xl) * 0.46, 560);
  const figure = { x0: xl, y0, x1: xl + figW, y1 };
  const tx0 = figure.x1 + 48, availW = xr - tx0;
  let u = 1, block;
  for (let i = 0; i < 4; i++) {
    block = layoutText(text, availW, u);
    if (block.h <= availH + 0.5) break;
    u *= (availH / block.h) * 0.985;
  }

  // The faint Tibetan name: large, behind everything, centered in the text area.
  const m = measure();
  let px = H * 0.9 * (text.tibetanSize / 100);
  m.font = font(TIBETAN, px);
  let tm = m.measureText(text.tibetan);
  px *= Math.min(1, (availW * 0.98) / tm.width, (availH * 1.02) / (tm.actualBoundingBoxAscent + tm.actualBoundingBoxDescent));
  m.font = font(TIBETAN, px);
  tm = m.measureText(text.tibetan);
  ctx.save();
  ctx.font = font(TIBETAN, px);
  ctx.fillStyle = image.tibetanColor;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text.tibetan, tx0 + (availW - tm.width) / 2, cy + (tm.actualBoundingBoxAscent - tm.actualBoundingBoxDescent) / 2);
  ctx.restore();

  drawFigure(ctx, image.figure, figure, banded);
  drawGrain(ctx, image, figure); // under the text: the letters stay clean
  const top = cy - block.h / 2 - 4;
  for (const item of block.items) {
    drawRun(ctx, { ...item, x: tx0, y: top + item.y }, item.name ? image.textColor : withAlpha(image.textColor, 0.97));
  }
  return { nameSize: block.T, scale: u };
}
