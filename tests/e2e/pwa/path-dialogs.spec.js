// The two dialogs the classic page opens over the Path (the question before a device's examples are kept, ai/share-notice.js; the Magic Key,
// pwa/unlock.ts) are native dialogs outside #path: they take the Path's palette, its face and its text buttons (11-path-bridge.css), and keep
// what they did on the classic page (known.spec.js, unlock.spec.js).
import { test as plain, expect as plainExpect } from "@playwright/test";
import { test, expect } from "../../support/test.js";
import { serveCourse, withCourse } from "../../support/data-key.js";

const onPath = () => { if (localStorage.getItem("rd-start") === null) localStorage.setItem("rd-start", "exercise"); };
const withKey = withCourse ? test : test.skip;
const sse = (...events) => events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
const shot = (page, name) => (process.env.DLG_SHOTS ? page.screenshot({ path: process.env.DLG_SHOTS + name + ".png" }) : null);

/** What a dialog looks like against the Path's own ground: its paper, its face, a flat edge, and its buttons without a ground of their own. */
const looks = (page, dialog) => page.evaluate((sel) => {
  const d = document.querySelector(sel), pa = document.querySelector("#path .pa");
  const cs = getComputedStyle(d), ground = getComputedStyle(pa);
  const buttons = [...d.querySelectorAll("button.btn")].map((b) => getComputedStyle(b));
  return { paper: cs.backgroundColor === ground.backgroundColor, ink: cs.color === ground.color, face: cs.fontFamily === ground.fontFamily, flat: cs.boxShadow === "none",
    quiet: buttons.length > 0 && buttons.every((b) => b.backgroundColor === "rgba(0, 0, 0, 0)" && b.boxShadow === "none" && b.textTransform === "none") };
}, dialog);

withKey("the question before examples are kept takes the Path's look, and still has no way out but its two answers", async ({ page }) => {
  await page.addInitScript(onPath);
  await page.route("**/api/health", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, tutor: "on", learns: "on" }) }));
  await page.route("**/api/known", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ known: [] }) }));
  await page.route("**/api/tutor", (route) => route.fulfill({ status: 200, contentType: "text/event-stream", body: sse({ type: "delta", text: "Stand-in tutor." }, { type: "done", truncated: false }) }));
  await page.goto("/");
  await expect(page.locator("#path .chs .crow")).toHaveCount(5);
  await page.locator("#path .chs .crow").first().click();
  const field = page.locator("#cin");
  await expect(field).toBeVisible();
  for (let i = 0; i < 4 && (await field.isVisible()); i++) { await field.fill("thing " + (i + 1)); if ((await field.getAttribute("enterkeyhint")) === "done") { await field.blur(); break; } await field.press("Enter"); }   // (the last one is left without Enter, which would take the Check at once)
  await page.locator("#stn").click();
  await page.locator(".cwex .crow").click();   // Explain, a choice beside the line (path/wait.tsx)
  const dlg = page.getByRole("dialog", { name: "Share your examples?" });
  await expect(dlg).toBeVisible();
  expect(await looks(page, ".sharedlg")).toEqual({ paper: true, ink: true, face: true, flat: true, quiet: true });
  await shot(page, "share-" + (await page.evaluate(() => (matchMedia("(max-width:700px)").matches ? "phone" : "desktop"))));
  const box = await dlg.boundingBox(), { width, height } = page.viewportSize();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(width);
  expect(box.y + box.height).toBeLessThanOrEqual(height);
  for (const key of ["Escape", "Escape", "n", "Enter"]) await page.keyboard.press(key);
  await expect(dlg).toBeVisible();
  await dlg.getByRole("button", { name: "Ok", exact: true }).click();
  await expect(dlg).toHaveCount(0);
  await expect(page.locator(".wtext")).toContainText("Stand-in tutor.");
});

plain("the Magic Key prompt takes the Path's look, light and dark", async ({ page }) => {
  await serveCourse(page);
  await page.addInitScript(onPath);
  await page.goto("/");
  await plainExpect(page.locator("#path .chs .crow")).toHaveCount(5);
  const prompt = async () => {
    // the roadmap's Magic Key opens the prompt (Settings' Magic Key page takes the key in its own field)
    if (!(await page.locator(".road.on").count())) await page.locator(".tstn").click();
    await page.locator(".road .rfoot").getByRole("button", { name: "Magic Key" }).click();
    await plainExpect(page.locator("#unlock")).toBeVisible();
    plainExpect(await looks(page, "#unlock")).toEqual({ paper: true, ink: true, face: true, flat: true, quiet: true });
  };
  await prompt();
  await shot(page, "unlock-light");
  await page.locator("#unlock-skip").click();
  await page.emulateMedia({ colorScheme: "dark" });
  await prompt();
  await shot(page, "unlock-dark");
  await page.locator("#unlock-skip").click();
});
