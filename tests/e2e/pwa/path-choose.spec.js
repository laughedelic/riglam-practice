// Choices on the Path that slide onto it (src/app/path/choose.ts): a tap or a finger sends the mark onto the line with a knock, the others fade, the
// thread turns solid and the mark fills (and in a list rises); two short options stand on one row. The rules of the practice are the other specs'.
import { test, expect } from "../../support/test.js";

const onPath = () => {
  if (localStorage.getItem("rd-design") === null) localStorage.setItem("rd-design", "path");
  window.__vib = []; navigator.vibrate = (v) => { window.__vib.push(v); return true; };
};
const choices = (page) => page.locator("#path .chs .crow");
const gap = (page) => page.locator("#path .sx.gap");

test.beforeEach(async ({ page }) => { await page.addInitScript(onPath); });

async function openPervasions(page) {
  await page.goto("/");
  await expect(choices(page)).toHaveCount(5);
  await page.locator(".tstn").click();
  await page.getByRole("dialog", { name: "Roadmap" }).getByRole("button", { name: /^Pervasions/ }).click();
  await expect(page.locator(".ptb-t")).toContainText("Pervasions");
  await expect(choices(page)).toHaveCount(2);
}
/** The mark of a row, centered: its x against the line's (the section's left edge plus --m). */
const markX = (row) => row.locator(".mc").evaluate((m) => { const e = (m.firstElementChild || m).getBoundingClientRect(); return e.left + e.width / 2; });
const lineX = (page) => gap(page).evaluate((g) => g.getBoundingClientRect().left + parseFloat(getComputedStyle(g).getPropertyValue("--m")));

test("the choices stand beside the path: each mark a little to the right of the line, the words after it", async ({ page }) => {
  await page.goto("/");
  await expect(choices(page)).toHaveCount(5);
  await expect(page.locator("#path .chs.slide")).toHaveCount(1);
  const line = await lineX(page);
  for (let i = 0; i < 5; i++) expect(Math.abs((await markX(choices(page).nth(i))) - line - 22), "mark " + i).toBeLessThan(1.5);
});

test("a tap takes the choice in stages: the mark snaps onto the line with one knock, the thread turns solid, the others fade, and the step goes on", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(choices(page)).toHaveCount(5);
  const g = gap(page), taken = choices(page).nth(2);
  await taken.click();
  await expect(g).toHaveAttribute("data-fx", "list");
  await expect(g).toHaveAttribute("data-snap", "1");   // it landed
  expect(await page.evaluate(() => window.__vib), "one short knock when it lands").toEqual([12]);
  // while it runs the others fade out and the thread turns solid
  await expect.poll(() => g.evaluate((e) => parseFloat(e.style.getPropertyValue("--f")))).toBeGreaterThan(0.99);
  await expect.poll(() => g.evaluate((e) => parseFloat(e.style.getPropertyValue("--g")))).toBeGreaterThan(0.99);
  await expect(choices(page).nth(0)).toHaveCSS("opacity", "0");
  await expect(page.locator("#path .sx.gap .thr")).toBeVisible();
  // then the step goes on (the examples), and nothing of the stages is left over
  await expect(page.locator("#cin")).toBeVisible();
  await expect(page.locator("#path [data-fx]")).toHaveCount(0);
  expect(await page.evaluate(() => window.__vib.length), "still one knock").toBe(1);
  expect(errors).toEqual([]);
});

test("a finger slides a choice to the left: short of half way it goes back, past it the choice is taken", async ({ page }) => {
  await page.goto("/");
  await expect(choices(page)).toHaveCount(5);
  const row = choices(page).nth(1), b = await row.boundingBox(), y = b.y + b.height / 2, x = b.x + b.width - 40;
  const drag = async (d, steps = 6) => { await page.mouse.move(x, y); await page.mouse.down(); for (let i = 1; i <= steps; i++) await page.mouse.move(x - (d * i) / steps, y); };
  // 9 px of 22: it follows the hand, and goes back when let go
  await drag(9);
  await expect(gap(page)).toHaveAttribute("data-fx", "list");
  expect(await row.evaluate((e) => new DOMMatrix(getComputedStyle(e).transform).m41), "it follows the hand").toBeLessThan(-6);
  expect(await page.evaluate(() => window.__vib), "no knock before the line").toEqual([]);
  await page.mouse.up();
  await expect(page.locator("#path [data-fx]")).toHaveCount(0);
  await expect(choices(page)).toHaveCount(5);
  expect(await row.evaluate((e) => getComputedStyle(e).transform)).toBe("none");
  // all the way: it is taken, with the knock where it reaches the line, and the lift of the finger sets it going
  await drag(30);
  await expect(gap(page)).toHaveAttribute("data-snap", "1");
  expect(await page.evaluate(() => window.__vib)).toEqual([12]);
  await page.mouse.up();
  await expect(page.locator("#cin")).toBeVisible();
  await expect(page.locator("#path [data-fx]")).toHaveCount(0);
});

test("a choice slid onto the line, back off it and onto it again without letting go knocks each time it snaps", async ({ page }) => {
  await page.goto("/");
  await expect(choices(page)).toHaveCount(5);
  const row = choices(page).nth(1), b = await row.boundingBox(), y = b.y + b.height / 2, x = b.x + b.width - 40;
  const to = async (d) => { for (let i = 1; i <= 4; i++) await page.mouse.move(x - d, y); };
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x - 8, y); await to(30);
  expect(await page.evaluate(() => window.__vib), "the first snap").toEqual([12]);
  await to(26);   // a hair off the line: no knock again
  await to(30);
  expect(await page.evaluate(() => window.__vib)).toEqual([12]);
  await to(8);    // back off it, and on again
  await to(30);
  expect(await page.evaluate(() => window.__vib), "the second snap").toEqual([12, 12]);
  await page.mouse.up();
  await expect(page.locator("#cin")).toBeVisible();
});

test("Accept and Why? stand on one row; Why? slides to the line over the fading Accept, then its field opens", async ({ page }) => {
  await openPervasions(page);
  await expect(page.locator("#path .chs.row2")).toHaveCount(1);
  const [acc, why] = [choices(page).nth(0), choices(page).nth(1)];
  const [ya, yw] = [(await acc.boundingBox()).y, (await why.boundingBox()).y];
  expect(Math.abs(ya - yw), "one row").toBeLessThan(2);
  const line = await lineX(page);
  expect(Math.abs((await markX(acc)) - line - 34), "Accept's mark stands 34 px from the line, 12 farther than a list's").toBeLessThan(1.5);
  const word = await acc.locator(".ct b").boundingBox(), wordEnd = word.x + word.width;
  expect(await markX(why), "Why? after Accept's word").toBeGreaterThan(wordEnd - 1);
  expect(Math.abs((await markX(why)) - wordEnd - 41), "36 px between Accept's word and Why?'s mark (its centre is 5 px in)").toBeLessThan(2);
  await why.click();
  await expect(gap(page)).toHaveAttribute("data-fx", "row");
  await expect(gap(page)).toHaveAttribute("data-snap", "1");
  await expect(page.locator("#dex")).toBeVisible();
  await expect(page.locator("#path [data-fx]")).toHaveCount(0);
});

test("Accept on the one row goes on to the next question", async ({ page }) => {
  await openPervasions(page);
  await choices(page).nth(0).click();
  await expect(page.locator("#path .sb.done")).toHaveCount(1);
  await expect(choices(page)).toHaveCount(2);
  await expect(page.locator("#path [data-fx]")).toHaveCount(0);
  await expect(choices(page).nth(0)).toHaveCSS("opacity", "1");
});

test("with reduced motion, or the look's take set to lit, a choice is lit for a moment and nothing slides", async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(choices(page)).toHaveCount(5);
  await choices(page).nth(2).click();
  await expect(choices(page).nth(2)).toHaveClass(/picked/);
  await expect(page.locator("#path [data-fx]")).toHaveCount(0);
  await expect(page.locator("#cin")).toBeVisible();
  const lit = await context.newPage();
  await lit.addInitScript(() => { localStorage.setItem("rd-design", "path"); localStorage.setItem("rd-look", JSON.stringify({ take: "lit" })); });
  await lit.goto("/");
  await expect(lit.locator("#path .chs .crow")).toHaveCount(5);
  await expect(lit.locator("#path .chs.slide")).toHaveCount(0);
  await lit.locator("#path .chs .crow").nth(2).click();
  await expect(lit.locator("#path .chs .crow").nth(2)).toHaveClass(/picked/);
  await expect(lit.locator("#cin")).toBeVisible();
});
