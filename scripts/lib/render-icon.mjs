// Draws an icon PNG from its flat SVG: the SVG at the wanted size, with the generated grain (grain.mjs) laid over it with soft-light.
// One grain tile covers the whole icon at every size: the 512 px master is the grain at the size of the lab's "felt x2", and the smaller
// icons get it shrunk, so the icon looks the same at 180, 192 and 512 px, the grain only getting finer. The SVG itself stays flat: at
// favicon size the grain would only average out. The PNG is stored as a palette image (256 colors, dithered): noise does not compress, and
// this keeps an icon near 100 KB instead of 380 KB with a mean change of under two gray levels, which no one can see.
import sharp from "sharp";
import { stretchedTile } from "./grain.mjs";

const MASTER = 512;

export async function renderIcon(svg, size) {
  let grain = sharp(Buffer.from(stretchedTile()), { raw: { width: MASTER, height: MASTER, channels: 1 } });
  if (size !== MASTER) grain = grain.resize(size, size, { kernel: "linear" });
  return sharp(svg, { density: 384 })
    .resize(size, size)
    .composite([{ input: await grain.toColourspace("srgb").png().toBuffer(), blend: "soft-light" }])
    .png({ palette: true, quality: 80, effort: 10, dither: 1 });
}
