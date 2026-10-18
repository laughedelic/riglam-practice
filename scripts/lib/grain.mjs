// The grain of the app icons: a gray tile (128 = neutral) that is laid over the flat icon with soft-light, so the colors keep their look and
// gain the fine, even noise that the felt of the booklet covers gave the first drafts. It is the "fine noise" recipe of the Riglam Icon Lab,
// made from a seed, so that the PNGs can be rebuilt exactly and no scanned tile is needed. A pure function: no files, no network.

export const TILE = 256;
export const AMPLITUDE = 42; // gray levels per standard deviation of the noise at normal strength
export const STRONG = 1.6; // the strength the icons use
export const SEED = 20261017;

/** The seeded generator (mulberry32) behind the tile; the lattice of the hero images draws its cells from it too. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// About N(0, 1): six uniform numbers summed and scaled.
const gauss = (r) => (r() + r() + r() + r() + r() + r() - 3) * 1.4142;

/** The grain as TILE * TILE gray bytes, the noise normalized to mean 0 and deviation 1, then scaled to `strength` times AMPLITUDE. */
export function fineNoiseTile(strength = STRONG, seed = SEED) {
  const r = rng(seed);
  const f = new Float32Array(TILE * TILE);
  let mean = 0;
  for (let i = 0; i < f.length; i++) {
    f[i] = gauss(r);
    mean += f[i];
  }
  mean /= f.length;
  let variance = 0;
  for (let i = 0; i < f.length; i++) {
    f[i] -= mean;
    variance += f[i] * f[i];
  }
  const deviation = Math.sqrt(variance / f.length) || 1;
  const k = (AMPLITUDE * strength) / deviation;
  const bytes = new Uint8ClampedArray(f.length);
  for (let i = 0; i < f.length; i++) bytes[i] = Math.round(128 + f[i] * k);
  return bytes;
}

/** The tile stretched to twice its size, the way a browser stretches a pattern image (bilinear between pixel centers, wrapping at the
 *  edges): TILE * 2 square gray bytes. With the 256 px tile this is the 512 px master of the icons, the grain at its "felt x2" size. */
export function stretchedTile(tile = fineNoiseTile()) {
  const n = TILE * 2, out = new Uint8ClampedArray(n * n);
  const at = (x, y) => tile[((y + TILE) % TILE) * TILE + ((x + TILE) % TILE)];
  for (let y = 0; y < n; y++) {
    const fy = (y + 0.5) / 2 - 0.5, y0 = Math.floor(fy), ty = fy - y0;
    for (let x = 0; x < n; x++) {
      const fx = (x + 0.5) / 2 - 0.5, x0 = Math.floor(fx), tx = fx - x0;
      out[y * n + x] = Math.round(
        at(x0, y0) * (1 - tx) * (1 - ty) + at(x0 + 1, y0) * tx * (1 - ty) + at(x0, y0 + 1) * (1 - tx) * ty + at(x0 + 1, y0 + 1) * tx * ty,
      );
    }
  }
  return out;
}
