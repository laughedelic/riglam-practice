// Draws an icon PNG: the flat SVG of a set (icon-art.mjs) at the wanted size, with the generated grain (grain.mjs) laid over it with
// soft-light. The grain is on the figure only (strong) and the page is left flat; the mask that says where comes from icon-art.mjs, so
// the shapes are drawn once.
// One grain tile covers the whole icon at every size: the 512 px master is the grain at the size of the lab's "felt x2", and the smaller
// icons get it shrunk, so the icon looks the same at 180, 192 and 512 px, the grain only getting finer. The SVG itself stays flat: at
// favicon size the grain would only average out. The PNG is stored as a palette image (256 colors, dithered): noise does not compress, and
// this keeps an icon near 100 KB instead of 380 KB with a mean change of under two gray levels, which no one can see.
import sharp from "sharp";
import { fineNoiseTile, stretchedTile, zonedGrain, STRONG } from "./grain.mjs";
import { grainMaskSvg, iconSvg } from "./icon-art.mjs";

const MASTER = 512;

// One grain level as `size` * `size` gray bytes: the 512 px master, shrunk (linearly) for a smaller icon.
async function grainBytes(strength, size) {
  let g = sharp(Buffer.from(stretchedTile(fineNoiseTile(strength))), { raw: { width: MASTER, height: MASTER, channels: 1 } });
  if (size !== MASTER) g = g.resize(size, size, { kernel: "linear" });
  return gray(await g.extractChannel(0).raw().toBuffer(), size); // sharp hands a gray image back as three channels: keep one
}
function gray(bytes, size) {
  if (bytes.length !== size * size) throw new Error(`expected ${size * size} gray bytes, got ${bytes.length}`);
  return new Uint8ClampedArray(bytes);
}

/** The sharp pipeline of the icon of `set` ("main" or "preview") at `size` px: call .toFile() or .toBuffer() on it. */
export async function renderIcon(set, size) {
  const mask = gray(await sharp(Buffer.from(grainMaskSvg()), { density: 384 }).resize(size, size).extractChannel(0).raw().toBuffer(), size);
  const none = new Uint8ClampedArray(size * size).fill(128); // neutral gray: soft-light leaves the page as it is
  const grain = zonedGrain(none, await grainBytes(STRONG, size), mask);
  const layer = await sharp(Buffer.from(grain), { raw: { width: size, height: size, channels: 1 } }).toColourspace("srgb").png().toBuffer();
  return sharp(Buffer.from(iconSvg(set)), { density: 384 })
    .resize(size, size)
    .composite([{ input: layer, blend: "soft-light" }])
    .png({ palette: true, quality: 80, effort: 10, dither: 1 });
}
