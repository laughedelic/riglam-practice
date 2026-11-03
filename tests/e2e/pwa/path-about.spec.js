// Settings › About on the Path (src/app/path/about.tsx): what the app is and how to reach its author, the licenses, and, on Your data, what the app does with your data. The pages
// are plain words and links out of the app; what a link opens is GitHub's. The wording is the author's to judge, so the specs hold the facts and the places, not the sentences.
import { test, expect } from "../../support/test.js";
import { giveKey } from "../../support/data-key.js";

const REPO = "https://github.com/laughedelic/riglam-practice";

async function openSettings(page) {
  await page.goto("/");
  await expect(page.locator("#path .chs .crow")).toHaveCount(5);
  await page.locator(".tstn").click();
  await page.locator(".road .rfoot").getByRole("button", { name: "Settings" }).click();
  await expect(page.locator(".ppage .ptitle")).toHaveText("Settings");
}
/** The address a link line opens: a link that opens in a tab of its own, safe against the opened page reaching back. */
async function opens(page, name, href) {
  const a = page.getByRole("link", { name: name + " (opens in a new tab)" });
  await expect(a).toHaveAttribute("href", href);
  await expect(a).toHaveAttribute("target", "_blank");
  await expect(a).toHaveAttribute("rel", /noopener/);
}

test("Settings › About lists Version and updates, About and Licenses, in that order, each with its way back to Settings", async ({ page }) => {
  await openSettings(page);
  const about = page.locator(".sgrp", { has: page.getByRole("heading", { name: "About" }) });
  await expect(about.locator(".oltx b")).toHaveText(["Version and updates", "About RIGLAM practice", "Licenses"]);
  for (const title of ["Version and updates", "About RIGLAM practice", "Licenses"]) {
    await page.getByRole("button", { name: title + ": more" }).click();
    await expect(page.locator("#path .ptb-t")).toHaveText(title);
    await page.getByRole("button", { name: "Back to Settings", exact: true }).click();
    await expect(page.locator(".ppage .ptitle")).toHaveText("Settings");
  }
});

test("Version and updates holds What's new, and opening it counts the changes as seen", async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem("once")) { sessionStorage.setItem("once", "1"); localStorage.setItem("rd-news-seen", "2026-10-30-claude"); } });
  await openSettings(page);
  await expect(page.locator(".ppage .ol", { hasText: "Version and updates" })).toContainText(/\d+ new changes?/);   // said on its line
  await page.getByRole("button", { name: "Version and updates: more" }).click();
  const body = page.locator(".ppage");
  await expect(body).toContainText(/Version \d+\.\d+\.\d+ · build /);   // the version, where the update stands
  await expect(body.locator(".sgh", { hasText: "What's new" })).toBeVisible();   // and what changed, under it
  await expect(page.locator("#path .nwi.new").first()).toBeVisible();
  await expect(page.locator("#path .nwi").first()).toContainText("About, licenses and privacy");
  await page.getByRole("button", { name: "Back to Settings", exact: true }).click();
  await expect(page.locator(".ppage .ol", { hasText: "Version and updates" })).not.toContainText("new change");
});

test("About RIGLAM practice says what the app is and is not, then the source, then where to send feedback", async ({ page }) => {
  // a device with Claude, so that the point about flagging its explanations applies
  await giveKey(page);
  await page.route("**/api/health", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, tutor: "on", accounts: "on", reports: "on", learns: "on", known: "on" }) }));
  await openSettings(page);
  await page.getByRole("button", { name: "About RIGLAM practice: more" }).click();
  const body = page.locator(".ppage");
  await expect(body).toContainText("RIGLAM practice is a personal project");
  await expect(body).toContainText("does not replace practicing together or with a teacher");
  await expect(body).toContainText("not affiliated with any course and not endorsed by any organization");
  await expect(body.locator(".sgh")).toHaveText(["Source code", "Feedback", "Claude’s explanations"]);
  await expect(body).toContainText("Tell whoever shared the app with you");
  await expect(body).toContainText("use the flag beside it");
  await opens(page, "Source code", REPO);
  await opens(page, "Ideas and questions", REPO + "/discussions");
  await opens(page, "Bug reports", REPO + "/issues");
  await expect(page.locator("#path .ptb-t")).toHaveText("About RIGLAM practice");
});

test("Licenses names the code's license, the fonts' license and what the definitions are, with links to the texts", async ({ page }) => {
  await openSettings(page);
  await page.getByRole("button", { name: "Licenses: more" }).click();
  const body = page.locator(".ppage");
  await expect(body.locator(".sgh")).toHaveText(["The code", "Fonts", "Terms and definitions"]);
  await expect(body).toContainText("GNU Affero General Public License, version 3");
  await expect(body).toContainText("SIL Open Font License 1.1");
  await expect(body).toContainText("The definitions and notes are not");
  await expect(body).toContainText("shown only on a device with the Magic Key, for educational purposes only");
  await expect(body).toContainText("the code’s license does not cover them");
  await expect(body).toContainText("the published translations, commentaries, and other materials available online");
  await opens(page, "License text", REPO + "/blob/main/LICENSE");
  await opens(page, "Font licenses", REPO + "/blob/main/public/licenses/fonts-OFL.txt");
  await opens(page, "Source code", REPO);
});

test("Your data says, under Export and import, what stays on the device and, where the server is in play, who can read what it keeps", async ({ page }) => {
  // a server with its tutor, accounts, reports and learned facts on, and a device with the Magic Key: every part of the text applies
  await giveKey(page);
  await page.route("**/api/health", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, tutor: "on", accounts: "on", reports: "on", learns: "on", known: "on" }) }));
  await openSettings(page);
  await expect(page.locator(".ppage .ol", { hasText: "Your data" })).toContainText("privacy");
  await page.getByRole("button", { name: "Your data: more" }).click();
  const body = page.locator(".ppage");
  await expect(body.locator(".sgh")).toHaveText(["Export and import", "Privacy"]);
  await expect(page.getByRole("button", { name: "Export your data to a file" })).toBeVisible();
  await expect(body).toContainText("stay in this browser, on this device");
  await expect(body).toContainText("no ads and no analytics");
  await expect(body).toContainText("passkey: no email, no password");
  await expect(body).toContainText("sent through the app’s server to Anthropic");
  await expect(body).toContainText("never the words, apart from the examples you agree to share");
  await expect(body).toContainText("the person who runs the app can read them");
  await expect(body).toContainText("No name, no email");
});

test("Privacy leaves out what this server does not do: with no server, only what stays on the device", async ({ page }) => {
  await page.route("**/api/health", (r) => r.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
  await openSettings(page);
  await page.getByRole("button", { name: "Your data: more" }).click();
  await expect(page.locator(".ppage")).toContainText("stay in this browser, on this device");
  await expect(page.locator(".ppage")).not.toContainText("Anthropic");
  await expect(page.locator(".ppage")).not.toContainText("passkey");
});

test("a page of Settings opens at its top, and Back finds Settings where it was left", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 520 });   // a short screen: Settings scrolls
  await openSettings(page);
  const sc = page.locator("#path .ppage.sfull");
  await sc.evaluate((e) => { e.scrollTop = e.scrollHeight; });
  const was = await sc.evaluate((e) => e.scrollTop);
  expect(was).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Your data: more" }).evaluate((b) => b.click());   // a tap in the page: no scrolling to the line first
  await expect(page.locator("#path .ptb-t")).toHaveText("Your data");
  expect(await sc.evaluate((e) => e.scrollTop)).toBe(0);
  await page.getByRole("button", { name: "Back to Settings", exact: true }).click();
  await expect(page.locator(".ppage .ptitle")).toHaveText("Settings");
  expect(Math.abs((await sc.evaluate((e) => e.scrollTop)) - was)).toBeLessThan(2);
});
