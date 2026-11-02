// Settings › About on the Path (src/app/path/about.tsx): what the app is and how to reach its author, the licenses, and what it does with your data. The pages are
// plain words and links out of the app; what a link opens is GitHub's. The wording is the author's to judge, so the specs hold the facts and the places, not the sentences.
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

test("Settings › About lists the pages, each with its way back to Settings", async ({ page }) => {
  await openSettings(page);
  const about = page.locator(".sgrp", { has: page.getByRole("heading", { name: "About" }) });
  await expect(about.locator(".oltx b")).toHaveText(["About RIGLAM", "Version and updates", "What's new", "Licenses", "Privacy"]);
  for (const [name, title] of [["About RIGLAM", "About RIGLAM"], ["Licenses", "Licenses"], ["Privacy", "Privacy"]]) {
    await page.getByRole("button", { name: name + ": more" }).click();
    await expect(page.locator("#path .ptb-t")).toHaveText(title);
    await page.getByRole("button", { name: "Back to Settings", exact: true }).click();
    await expect(page.locator(".ppage .ptitle")).toHaveText("Settings");
  }
});

test("About RIGLAM says what the app is and is not, and links to feedback and the source", async ({ page }) => {
  await openSettings(page);
  await page.getByRole("button", { name: "About RIGLAM: more" }).click();
  const body = page.locator(".ppage");
  await expect(body).toContainText("personal project");
  await expect(body).toContainText("does not replace practicing together or with a teacher");
  await expect(body).toContainText("not affiliated with the course and not endorsed by its organizers");
  await expect(body).toContainText("Tell whoever shared the app with you");
  await opens(page, "Write on GitHub", REPO + "/issues");
  await opens(page, "Source code", REPO);
  await expect(page.locator("#path .ptb-t")).toHaveText("About RIGLAM");
});

test("Licenses names the code's license, the fonts' license and what the definitions are, with links to the texts", async ({ page }) => {
  await openSettings(page);
  await page.getByRole("button", { name: "Licenses: more" }).click();
  const body = page.locator(".ppage");
  await expect(body.locator(".sgh")).toHaveText(["The code", "Fonts", "Terms and definitions"]);
  await expect(body).toContainText("GNU Affero General Public License, version 3");
  await expect(body).toContainText("SIL Open Font License 1.1");
  await expect(body).toContainText("The definitions and notes are not");
  await expect(body).toContainText("shown only on a device with the Magic Key");
  await expect(body).toContainText("the code’s license does not cover them");
  await opens(page, "License text", REPO + "/blob/main/LICENSE");
  await opens(page, "Font licenses", REPO + "/blob/main/public/licenses/fonts-OFL.txt");
  await opens(page, "Source code", REPO);
});

test("Privacy says what stays on the device, and where the server is in play, who can read what it keeps", async ({ page }) => {
  // a server with its tutor, accounts, reports and learned facts on, and a device with the Magic Key: every part of the page applies
  await giveKey(page);
  await page.route("**/api/health", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, tutor: "on", accounts: "on", reports: "on", learns: "on", known: "on" }) }));
  await openSettings(page);
  await page.getByRole("button", { name: "Privacy: more" }).click();
  const body = page.locator(".ppage");
  await expect(body.locator(".sgh")).toHaveText(["On this device", "Account", "Claude", "Examples you share", "Flags"]);
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
  await page.getByRole("button", { name: "Privacy: more" }).click();
  await expect(page.locator(".ppage .sgh")).toHaveText(["On this device"]);
  await expect(page.locator(".ppage")).not.toContainText("Anthropic");
});

test("a page of Settings opens at its top, and Back finds Settings where it was left", async ({ page }) => {
  await openSettings(page);
  const sc = page.locator("#path .ppage.sfull");
  await sc.evaluate((e) => { e.scrollTop = e.scrollHeight; });
  const was = await sc.evaluate((e) => e.scrollTop);
  expect(was).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Privacy: more" }).evaluate((b) => b.click());   // a tap in the page: no scrolling to the line first
  await expect(page.locator("#path .ptb-t")).toHaveText("Privacy");
  expect(await sc.evaluate((e) => e.scrollTop)).toBe(0);
  await page.getByRole("button", { name: "Back to Settings", exact: true }).click();
  await expect(page.locator(".ppage .ptitle")).toHaveText("Settings");
  expect(Math.abs((await sc.evaluate((e) => e.scrollTop)) - was)).toBeLessThan(2);
});
