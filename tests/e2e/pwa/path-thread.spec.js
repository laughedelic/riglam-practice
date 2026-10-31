// The thread of the Path (src/app/styles/34-path-line.css and the pieces that draw it): every piece of it is one plain box, --lw wide, so that it draws the same width at every screen
// density. A clip or a mask makes a piece come out a fraction of a pixel thinner than a plain one at a fractional density (the Pixel's 2.625), which showed as a thread that was thicker
// in one stretch and thinner in the next. The first spec reads the styles of every piece in the states of one exercise; the second measures the pixels (at the project's own density:
// the phone is a Pixel 7, 2.625, the desktop 1).
import { test, expect } from "../../support/test.js";

const choices = (page) => page.locator("#path .chs .crow");
// the page tells a finger from a mouse (state.hand); Playwright's mouse is made to read as a finger, as the other Path specs do
test.beforeEach(async ({ page }) => { await page.addInitScript(() => Object.defineProperty(PointerEvent.prototype, "pointerType", { get: () => "touch", configurable: true })); });

/** Four possibilities with its four cases written, the Check ready. */
async function written(page) {
  await page.goto("/");
  await expect(choices(page)).toHaveCount(5);
  await choices(page).nth(3).click();
  const field = page.locator("#cin");
  await expect(field).toBeVisible();
  for (const t of ["a red book", "a red pot", "a blue book"]) { await field.fill(t); await field.press("Enter"); }
  await field.fill("a cloud");
  await field.blur();
  await expect(page.locator("#stn")).toContainText("Check");
}
const checked = async (page) => {
  await page.locator("#stn").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#path .pvline")).toBeVisible();
  await expect(page.locator("#stn")).toContainText("Next pair");
};

/** Every piece that draws the thread, with the pseudo-element it draws it with. */
const PIECES = "#path .pathc > .sx::before, #path .foot::before, #path .pstrip::after, #path .pbr.pvoice::before";
const styles = (page) => page.evaluate((list) => {
  const out = [];
  for (const spec of list.split(",").map((s) => s.trim())) {
    const [sel, pseudo] = spec.split("::");
    for (const e of document.querySelectorAll(sel)) {
      const c = getComputedStyle(e, "::" + pseudo);
      out.push({ at: sel + "::" + pseudo + (e.className ? "." + String(e.className).trim().split(/\s+/).join(".") : ""), content: c.content, width: parseFloat(c.width), clip: c.clipPath, mask: c.maskImage || c.webkitMaskImage || "none",
        lw: parseFloat(getComputedStyle(e.closest(".pa")).getPropertyValue("--lw")) });
    }
  }
  return out;
}, PIECES);

test("every piece of the thread is one plain box as wide as the line weight: no clip and no mask, whatever the state of the exercise", async ({ page }) => {
  await written(page);
  const seen = [];
  const look = async (state) => {
    const ps = (await styles(page)).filter((p) => p.content !== "none" && p.content !== "normal");
    expect(ps.length, state + ": pieces drawn").toBeGreaterThan(2);
    for (const p of ps) {
      expect(p.clip, state + ": " + p.at + " has no clip").toBe("none");
      expect(p.mask, state + ": " + p.at + " has no mask").toBe("none");
      expect(p.width, state + ": " + p.at + " is the line weight wide").toBeCloseTo(p.lw, 1);
      seen.push(p.at);
    }
  };
  await look("the cases written");
  await checked(page);
  await look("the result");
  expect(seen.some((a) => /\.ptail/.test(a)) && seen.some((a) => /\.foot::/.test(a)) && seen.some((a) => /\.sx::before.*\.cur/.test(a)), "the current step, the path ahead and the foot were all looked at").toBe(true);
});

/** The widths of the thread in a screenshot, in CSS pixels: for each piece the median over the rows where the thread stands alone on the ground. Decoded in a page of its own. */
async function widths(page, shot, dpr, pieces) {
  const side = await page.context().newPage();
  try {
    return await side.evaluate(async ([b64, d, ps]) => {
      const bmp = await createImageBitmap(await (await fetch("data:image/png;base64," + b64)).blob());
      const cv = document.createElement("canvas"); cv.width = bmp.width; cv.height = bmp.height;
      const g = cv.getContext("2d", { willReadFrequently: true }); g.drawImage(bmp, 0, 0);
      const out = {};
      for (const { name, ranges } of ps) {
        const ws = [], why = {};
        for (const { x, y0, y1 } of ranges) {
        const xa = Math.floor((x - 5) * d), xb = Math.ceil((x + 5) * d);
        for (let y = Math.floor(y0 * d); y <= Math.floor(y1 * d); y += 2) {
          const row = g.getImageData(xa, y, xb - xa + 1, 1).data, n = row.length / 4, p0 = [row[0], row[1], row[2]], pn = [row[(n - 1) * 4], row[(n - 1) * 4 + 1], row[(n - 1) * 4 + 2]];
          if (p0.some((v, i) => Math.abs(v - pn[i]) > 3)) { why.sides = (why.sides || 0) + 1; continue; }           // something other than the ground beside the thread: not a clean row
          const dd = []; for (let i = 0; i < n; i++) dd.push(Math.abs(row[i * 4] - p0[0]) + Math.abs(row[i * 4 + 1] - p0[1]) + Math.abs(row[i * 4 + 2] - p0[2]));
          const mx = Math.max(...dd); if (mx < 40) { why.faint = (why.faint || 0) + 1; continue; }                  // a gap of the dotted line, or the end of a fade
          const w = dd.reduce((a, b) => a + b, 0) / mx / d; if (w < 3.5) ws.push(w);
        }
        }
        ws.sort((a, b) => a - b); out[name] = { rows: ws.length, w: ws.length ? ws[Math.floor(ws.length / 2)] : 0, why };
      }
      return out;
    }, [shot.toString("base64"), dpr, pieces]);
  } finally { await side.close(); }
}
/** Where a piece stands: for each section that matches, the middle of the thread (x) and the rows (y) to look at, in CSS pixels on the page's screen: without its first `from` px (the color
 *  blends in them) and above the foot (the foot's own stub: its first rows). */
const place = (page, name, sel, from, to) => page.evaluate(([n, s, f, t]) => {
  const es = [...document.querySelectorAll(s)]; if (!es.length) return null;
  const foot = document.querySelector("#path .foot");
  return { name: n, ranges: es.map((e) => {
    const r = e.getBoundingClientRect(), m = parseFloat(getComputedStyle(e).getPropertyValue("--m")), lim = e === foot || !foot ? innerHeight : foot.getBoundingClientRect().top - 2;
    return { x: r.left + m, y0: Math.max(r.top + f, 0), y1: Math.min(r.bottom - 6, r.top + t, lim) };
  }) };
}, [name, sel, from, to]);

test("every piece of the thread is as wide as the line weight in the pixels, the same width in each", async ({ page }) => {
  const dpr = await page.evaluate(() => window.devicePixelRatio);
  await written(page);
  const measure = async (state, list) => {
    const ps = []; for (const [name, sel, f = 36, t = 1e5] of list) { const p = await place(page, name, sel, f, t); expect(p, state + ": " + name + " is on the page").not.toBeNull(); ps.push(p); }
    return widths(page, await page.screenshot(), dpr, ps);
  };
  const all = {
    ...await measure("the cases written", [["the step you are on", "#path .pathc > .sx.cur", 36], ["the path ahead", "#path .pathc > .sx.ptail", 4], ["the stub at the foot", "#path .foot", 2, 24]]),
  };
  await checked(page);
  Object.assign(all, await measure("the result", [["a step done", "#path .pathc > .sx.walked", 60], ["a verdict's step", "#path .pathc > .sx.nop, #path .pathc > .sx.okp, #path .pathc > .sx.ptp", 36]]));
  for (const [name, m] of Object.entries(all)) {
    expect(m.rows, name + ": rows where the thread stands alone " + JSON.stringify(m)).toBeGreaterThan(5);
    expect(m.w, name + ": its width in CSS pixels at " + dpr + "×").toBeGreaterThan(1.8);
    expect(m.w, name + ": its width in CSS pixels at " + dpr + "×").toBeLessThan(2.2);
  }
  const ws = Object.values(all).map((m) => m.w);
  expect(Math.max(...ws) - Math.min(...ws), "the widest and the thinnest piece differ by less than a fifth of a pixel: " + JSON.stringify(all)).toBeLessThan(0.2);
});
