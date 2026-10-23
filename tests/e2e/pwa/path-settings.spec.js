// Settings and the practice options' own pages on the Path (src/app/path/settings.tsx, options.tsx): the rows of the app drawn on the path
// (the Magic Key and its question before forgetting, voice, your data, the version), and the Stages and Voice pages. What each one does is
// the classic page's (settings.spec.js, stages.spec.js, voice.spec.js).
import { test, expect } from "../../support/test.js";
import { withCourse } from "../../support/data-key.js";

const onPath = () => { if (localStorage.getItem("rd-design") === null) localStorage.setItem("rd-design", "path"); };
async function start(page) {
  await page.addInitScript(onPath);
  await page.goto("/");
  await expect(page.locator("#path .chs .crow")).toHaveCount(5);
}
async function openSettings(page) {
  await page.locator(".tstn").click();
  await page.locator(".road .rfoot").getByRole("button", { name: "Settings" }).click();
  await expect(page.locator(".ppage .ptitle")).toHaveText("Settings");
}
const withKey = withCourse ? test : test.skip;

withKey("Settings on the Path: the Magic Key asks before it is forgotten, and its name opens a note", async ({ page }) => {
  await start(page);
  await openSettings(page);
  const key = page.locator(".srow", { has: page.getByRole("button", { name: "Magic Key" }) });
  await expect(key).toContainText("This device has the Magic Key");
  await key.getByRole("button", { name: "Magic Key" }).click();
  await expect(key.locator(".pkeynote")).toContainText("The Magic Key to the Path of Reasoning");
  await key.getByRole("button", { name: "Hide" }).click();
  await expect(key.locator(".pkeynote")).toHaveCount(0);
  await key.getByRole("button", { name: "Forget the key" }).click();
  await expect(key).toContainText("Forget the Magic Key on this device?");
  await key.getByRole("button", { name: "Keep it" }).click();
  await expect(key).toContainText("This device has the Magic Key");
  expect(await page.evaluate(() => localStorage.getItem("riglam.magicKey"))).not.toBeNull();
});

test("Settings on the Path: voice, your data and the version are rows of the path, in its own classes", async ({ page }) => {
  await start(page);
  await openSettings(page);
  await expect(page.locator("#path .pbr")).toHaveCount(0);   // nothing of Settings is hosted from the classic page
  const voice = page.getByRole("switch", { name: /^Voice/ });
  if (await voice.count()) {   // a browser with speech
    const was = await voice.getAttribute("aria-checked");
    await voice.click();
    await expect(voice).toHaveAttribute("aria-checked", was === "true" ? "false" : "true");
    expect(await page.evaluate(() => localStorage.getItem("rd-voice"))).toBe(was === "true" ? "0" : "1");
  }
  const data = page.locator(".srow", { hasText: "Your data" });
  await expect(data.getByRole("button", { name: "Export your data to a file" })).toHaveClass("pbtn");
  await expect(data.getByRole("button", { name: "Import data from a file" })).toBeVisible();
  await expect(page.locator(".srow", { hasText: "Version and updates" })).toContainText(/Version \d+\.\d+\.\d+ · build /);
});

test("the practice options' Stages page switches the stages on the path, and the last one on stays on", async ({ page }) => {
  await page.addInitScript(() => { if (localStorage.getItem("rd-stages") === null) localStorage.setItem("rd-stages", "1"); });
  await start(page);
  await page.getByRole("button", { name: "Practice options" }).click();
  const sheet = page.getByRole("dialog", { name: "Practice options" });
  await sheet.getByRole("button", { name: "Stages: more" }).click();
  const stage = (n) => sheet.getByRole("switch", { name: new RegExp("^Stage " + n + " ") });
  await expect(stage(1)).toHaveAttribute("aria-checked", "true");
  await expect(stage(1)).toHaveAttribute("aria-disabled", "true");
  await expect(sheet).toContainText("At least one stage stays on.");
  await stage(2).click();
  await expect(stage(2)).toHaveAttribute("aria-checked", "true");
  expect(await page.evaluate(() => localStorage.getItem("rd-stages"))).toBe("1,2");
  await stage(1).click();
  await expect(stage(1)).toHaveAttribute("aria-checked", "false");
  await stage(2).click({ force: true });   // the last one on stays on (a tap on it does nothing)
  await expect(stage(2)).toHaveAttribute("aria-checked", "true");
  expect(await page.evaluate(() => localStorage.getItem("rd-stages"))).toBe("2");
});

test("the Stages page also holds the negations and their brackets, and the Stages row says which are on", async ({ page }) => {
  await page.addInitScript(() => { if (localStorage.getItem("rd-stages") === null) localStorage.setItem("rd-stages", "1"); });
  await start(page);
  await page.getByRole("button", { name: "Practice options" }).click();
  const sheet = page.getByRole("dialog", { name: "Practice options" });
  await expect(sheet.getByRole("group", { name: "Negations" })).toHaveCount(0);          // not a row of the list: negations go with the stages
  await expect(sheet.locator(".porow", { hasText: "Stages" }).first()).not.toContainText("negations");
  await sheet.getByRole("button", { name: "Stages: more" }).click();
  const seg = sheet.getByRole("group", { name: "Negations" });
  await expect(seg.getByRole("button", { name: "Off" })).toHaveAttribute("aria-pressed", "true");
  await seg.getByRole("button", { name: "One side" }).click();
  expect(await page.evaluate(() => localStorage.getItem("rd-negation"))).toBe("one");
  const brackets = sheet.getByRole("switch", { name: /^Brackets/ });
  await expect(brackets).toHaveAttribute("aria-checked", "true");
  await brackets.click();
  await expect(brackets).toHaveAttribute("aria-checked", "false");
  expect(await page.evaluate(() => localStorage.getItem("rd-neg-brackets"))).toBe("0");
});

test("the practice options' Voice page is drawn on the path and keeps its choices", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("rd-voice", "1"));
  await start(page);
  await page.getByRole("button", { name: "Practice options" }).click();
  const sheet = page.getByRole("dialog", { name: "Practice options" });
  const more = sheet.getByRole("button", { name: "Voice: more" });
  test.skip(!(await more.count()), "this browser has no speech");
  await more.click();
  await expect(sheet.locator(".pbr")).toHaveCount(0);
  const speed = sheet.getByRole("group", { name: "Speed of reading" });
  if (await speed.count()) {
    await speed.getByRole("button", { name: "Fast" }).click();
    await expect(speed.getByRole("button", { name: "Fast" })).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => localStorage.getItem("rd-voice-rate"))).toBe("1.25");
  }
  const answer = sheet.getByRole("group", { name: "Answer by voice" });
  if (await answer.count()) {
    await answer.getByRole("button", { name: /^Tap the mic/ }).click();
    await expect(sheet.getByRole("group", { name: "After an answer is heard" })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("rd-voice-answer"))).toBe("tap");
  }
});
