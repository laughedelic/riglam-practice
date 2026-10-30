// The flag on the tutor's note on the Path is a small mark (14px) on a line of its own, so it needs a larger tap target than it draws: a finger could not
// hit the 14 by 24 pixels it had. The stand-in key and server do not need the course data, so this runs in every build.
import { test, expect } from "@playwright/test";
import { giveKey } from "../../support/data-key.js";

const sse = (...events) => events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
const FACTS = [
  "Both: a scent of parfume | class: smell | A yes: it is perceived by the nose | B yes: it is a form | => yes",
  "Neither: a rabbit horn | A no: it does not exist | B no: it is not a sound, because it makes none",
].join("\n");

test("the flag on the tutor's note can be tapped within a 40 by 40 pixel area", async ({ page }) => {
  await giveKey(page);
  await page.route("**/api/health", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, tutor: "on" }) }));
  await page.route("**/api/tutor", (route) => route.fulfill({ status: 200, contentType: "text/event-stream", body: sse({ type: "delta", text: FACTS }, { type: "done", truncated: false }) }));
  await page.addInitScript(() => { localStorage.setItem("rd-design", "path"); localStorage.setItem("rd-start", "exercise"); localStorage.setItem("rd-autoexplain", "0"); });
  await page.goto("/");
  const choices = page.locator("#path .chs .crow");
  await expect(choices).toHaveCount(5);
  await choices.first().click();
  const field = page.locator("#cin");
  await expect(field).toBeVisible();
  for (let i = 0; i < 4 && (await field.isVisible()); i++) {
    await field.fill("thing " + (i + 1));
    if ((await field.getAttribute("enterkeyhint")) === "done") { await field.blur(); break; }
    await field.press("Enter");
  }
  await page.locator("#stn").click();
  await expect(page.locator(".pvline")).toBeVisible();
  await page.locator(".wrow").filter({ hasText: "Explanation" }).click();
  const flag = page.locator(".exr .tnote .pflg").first();
  await flag.evaluate((el) => el.scrollIntoView({ block: "center" })); // away from the bars at the edges, which would cover part of the area
  const box = await flag.boundingBox();
  // how far around the mark's centre a point still lands on the button
  const hit = await page.evaluate(({ x, y }) => {
    const el = document.querySelector(".exr .tnote .pflg");
    let left = 0, right = 0, top = 0, bottom = 0;
    for (let d = 0; d <= 30; d++) {
      if (el.contains(document.elementFromPoint(x - d, y))) left = d;
      if (el.contains(document.elementFromPoint(x + d, y))) right = d;
      if (el.contains(document.elementFromPoint(x, y - d))) top = d;
      if (el.contains(document.elementFromPoint(x, y + d))) bottom = d;
    }
    return { w: left + right + 1, h: top + bottom + 1 };
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  expect(hit.w).toBeGreaterThanOrEqual(40);
  expect(hit.h).toBeGreaterThanOrEqual(40);
  // the mark itself is as it was drawn
  expect(box.width).toBeLessThan(20);
});
