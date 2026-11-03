// Choices on the Path that slide onto it (src/app/path/choose.ts): a tap or a finger sends the mark onto the line with a knock, the others fade, the
// thread turns solid and the mark fills (and in a list rises); two short options stand on one row (Pervasions at None guidance). The rules of the practice are the other specs'.
import { test, expect } from "../../support/test.js";
import { exerciseAtRest } from "../../support/page.js";
import { giveKey } from "../../support/data-key.js";

const onPath = () => {
  window.__vib = []; navigator.vibrate = (v) => { window.__vib.push(v); return true; };
  // the page tells a finger from a mouse (state.hand: its knocks are for a finger); Playwright's mouse is made to read as a finger here, `window.__pointer = "mouse"` as a mouse again
  Object.defineProperty(PointerEvent.prototype, "pointerType", { get: () => window.__pointer || "touch", configurable: true });
};
const choices = (page) => page.locator("#path .chs .crow");
const gap = (page) => page.locator("#path .sx.gap:has(.chs)");   // the choices' own piece (the questions still to come are a dotted piece too)

test.beforeEach(async ({ page }) => { await page.addInitScript(onPath); });

async function openPervasions(page) {
  await page.goto("/");
  await expect(choices(page)).toHaveCount(5);
  await page.locator(".tstn").click();
  await page.getByRole("dialog", { name: "Roadmap" }).getByRole("button", { name: /^Pervasions/ }).click();
  await expect(page.locator(".ptb-t")).toContainText("Pervasions");
  await exerciseAtRest(page);
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

test("Pervasions at Detailed guidance: Accept and Why? in a list, Why? saying what a counter-example would be in the pair's words, and the line over its field asking for one the same way; at Hints with A and B", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openPervasions(page);
  await expect(page.locator("#path .chs.row2")).toHaveCount(0);
  const [acc, why] = [choices(page).nth(0), choices(page).nth(1)];
  await expect(acc.locator(".ct small"), "Accept needs no line").toHaveCount(0);
  const line = why.locator(".ct small");
  await expect(line).toContainText(/^something is /);   // a statement: "something is both a … and a …"
  await expect(line).not.toContainText("something that is");
  await expect(line.locator(".conn").first(), "the words that name the case in bold").toBeVisible();
  await expect(line).not.toContainText(/\bA\b/);
  await why.click();
  await expect(page.locator("#dex")).toBeVisible();
  await expect(page.locator("#path .qnow .qq")).toContainText("Name something that is");
  const color = (sel) => page.locator(sel).evaluate((e) => getComputedStyle(e).color);
  expect(await color("#path .qnow .qq"), "the line over the field is muted: not the statement's ink").not.toBe(await color("#path .qnow .qst"));
  await page.evaluate(() => { localStorage.setItem("rd-guided", JSON.stringify({ debate: "hints" })); });
  await page.reload();   // back in Pervasions at the same question, Why? picked
  await expect(page.locator(".ptb-t")).toContainText("Pervasions");
  await expect(page.locator("#dex")).toBeVisible();
  await expect(page.locator("#path .qnow .qq")).toContainText(/^Name something that is .*(\bA\b.*\bB\b|\bB\b.*\bA\b)/);
});

test("Pervasions at Hints guidance: Why? says it as a statement with A and B", async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem("rd-guided", JSON.stringify({ debate: "hints" })); });
  await openPervasions(page);
  const line = choices(page).nth(1).locator(".ct small");
  await expect(line).toContainText(/^something is /);
  await expect(line).toContainText(/(\bA\b.*\bB\b|\bB\b.*\bA\b)/);
  await expect(line.locator(".conn").first()).toBeVisible();
});

test("Accept and Why? stand on one row at None guidance; Why? slides to the line over the fading Accept, then its field opens", async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem("rd-guided", JSON.stringify({ debate: "none" })); });
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
  await lit.addInitScript(() => { localStorage.setItem("rd-look", JSON.stringify({ take: "lit" })); });
  await lit.goto("/");
  await expect(lit.locator("#path .chs .crow")).toHaveCount(5);
  await expect(lit.locator("#path .chs.slide")).toHaveCount(0);
  await lit.locator("#path .chs .crow").nth(2).click();
  await expect(lit.locator("#path .chs .crow").nth(2)).toHaveClass(/picked/);
  await expect(lit.locator("#cin")).toBeVisible();
});

// Explain on a result is a choice beside the line like these (path/wait.tsx): a tap, or a finger sliding it left onto the line, takes it. A finger's slide is not
// followed by a click (the browser drops the click of a touch that has moved), so the release itself takes it: past half way it snaps onto the line and Claude is
// asked, short of it the mark goes back.
const sse = (...events) => events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
const ANSWER = sse({ type: "delta", text: "this is the stand-in answer." }, { type: "done", truncated: false });
/** A result with Explain on offer, and the list of what Claude was asked. */
async function atExplain(page) {
  await giveKey(page);
  const asked = [];
  await page.route("**/api/health", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, tutor: "on" }) }));
  await page.route("**/api/tutor", (route) => { asked.push(route.request().postDataJSON()); return route.fulfill({ status: 200, contentType: "text/event-stream", body: ANSWER }); });
  await page.goto("/");
  await expect(choices(page)).toHaveCount(5);
  await choices(page).first().click();
  const field = page.locator("#cin");
  await expect(field).toBeVisible();
  for (let i = 0; i < 4 && (await field.isVisible()); i++) {
    await field.fill("thing " + (i + 1));
    if ((await field.getAttribute("enterkeyhint")) === "done") { await field.blur(); break; }
    await field.press("Enter");
  }
  await page.locator("#stn").click();
  await expect(page.locator(".pvline")).toBeVisible();
  await expect(page.locator(".cwex .crow")).toContainText(/explain/i);
  await page.evaluate(() => { window.__vib = []; });   // the knocks of the steps before are not the slide's
  return asked;
}
/** A real touch (the browser's own: it drops the click of a touch that has moved, as on a phone) that starts at `x, y` and moves `dx` px in steps; `up` lets go. */
async function touch(page, x, y, dx, { up = true, steps = 6 } = {}) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  const at = (px) => [{ x: px, y, id: 1 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(x) });
  for (let i = 1; i <= steps; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(x + (dx * i) / steps) });
  if (up) await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  return cdp;
}
const markLeft = (page) => page.locator(".cwex .crow .mc").evaluate((m) => m.getBoundingClientRect().left);

test("a finger sliding Explain onto the line snaps it there with a knock and asks Claude; the tap that follows a slide is not a second ask", async ({ page }) => {
  const asked = await atExplain(page);
  const row = page.locator(".cwex .crow"), b = await row.boundingBox(), y = b.y + b.height / 2, x = b.x + b.width / 2;
  const rest = await markLeft(page);
  const cdp = await touch(page, x, y, -30, { up: false });
  await expect.poll(() => markLeft(page), { message: "the mark follows the finger to the line" }).toBeLessThan(rest - 20);
  expect(await page.evaluate(() => window.__vib), "one knock where it reaches the line").toEqual([12]);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(page.locator(".cwex.taken")).toHaveCount(1);
  await expect(page.locator(".wtext")).toContainText("this is the stand-in answer.");   // Claude was asked, once
  expect(asked).toHaveLength(1);
});

test("a mouse that slides Explain a little and lets go does not take it with the click that follows; one that slides it onto the line does", async ({ page }) => {
  const asked = await atExplain(page);
  const row = page.locator(".cwex .crow"), b = await row.boundingBox(), y = b.y + b.height / 2, x = b.x + b.width / 2;
  const rest = await markLeft(page);
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x - 9, y, { steps: 3 }); await page.mouse.up();
  await expect.poll(() => markLeft(page), { message: "it goes back" }).toBeGreaterThan(rest - 1);
  await page.waitForTimeout(600);
  expect(asked).toHaveLength(0);
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x - 30, y, { steps: 5 }); await page.mouse.up();
  await expect(page.locator(".wtext")).toContainText("this is the stand-in answer.");
  expect(asked).toHaveLength(1);
});

test("a short slide of Explain goes back when the finger lets go, and asks nothing", async ({ page }) => {
  const asked = await atExplain(page);
  const row = page.locator(".cwex .crow"), b = await row.boundingBox(), y = b.y + b.height / 2, x = b.x + b.width / 2;
  const rest = await markLeft(page);
  await touch(page, x, y, -8);
  await expect.poll(() => markLeft(page), { message: "it springs back to where it stood" }).toBeGreaterThan(rest - 1);
  await page.waitForTimeout(600);
  await expect(page.locator(".cwex.taken")).toHaveCount(0);
  expect(asked).toHaveLength(0);
  expect(await page.evaluate(() => window.__vib), "no knock short of the line").toEqual([]);
  await row.click();   // a tap still takes it
  await expect(page.locator(".wtext")).toContainText("this is the stand-in answer.");
  expect(asked).toHaveLength(1);
});
