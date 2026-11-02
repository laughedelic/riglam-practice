// Settings and the practice options' own pages on the Path (src/app/path/settings.tsx, options.tsx): the rows of the app drawn on the path
// (the Magic Key and its question before forgetting, voice, your data, the version), and the Voice page; the stages and the difficulty, which are on the
// Progression page. What each one does is shell/options.js's and the voice specs'.
import { test as plain, expect as plainExpect } from "@playwright/test";
import { test, expect } from "../../support/test.js";
import { dataKey, serveCourse, withCourse } from "../../support/data-key.js";

async function start(page) {
  await page.goto("/");
  await expect(page.locator("#path .chs .crow")).toHaveCount(5);
}
async function openSettings(page) {
  await page.locator(".tstn").click();
  await page.locator(".road .rfoot").getByRole("button", { name: "Settings" }).click();
  await expect(page.locator(".ppage .ptitle")).toHaveText("Settings");
}
const withKey = withCourse ? test : test.skip;
/** The box of `loc` once it stands still (a page slides in). */
async function steady(loc) {
  let was = null;
  for (;;) {
    const box = await loc.boundingBox();
    if (was && box && Math.abs(box.x - was.x) < 0.5 && Math.abs(box.y - was.y) < 0.5) return box;
    was = box; await loc.page().waitForTimeout(60);
  }
}

withKey("Settings on the Path: the Magic Key has its own page, which says what it is and asks before it is forgotten", async ({ page }) => {
  await start(page);
  await openSettings(page);
  await expect(page.locator(".ppage .ol", { hasText: "Magic Key" })).toContainText("entered on this device");
  await expect(page.locator(".ppage .ol", { hasText: "Magic Key" }).locator(".olic")).toHaveCount(1);   // the lock, open
  await page.getByRole("button", { name: "Magic Key: more" }).click();
  await expect(page.locator("#path .ptb-t")).toHaveText("Magic Key");
  await expect(page.locator(".ppage")).toContainText("This device has the Magic Key");
  await expect(page.locator(".ppage .pkeynote")).toBeHidden();   // why it has its name, under a fold
  await page.locator(".ppage .pkeyfun summary").click();
  await expect(page.locator(".ppage .pkeynote")).toContainText("The Magic Key to the Path of Reasoning");
  await page.getByRole("button", { name: "Forget the key" }).click();
  await expect(page.locator(".ppage")).toContainText("Forget the Magic Key on this device?");
  await page.getByRole("button", { name: "Keep it" }).click();
  await expect(page.locator(".ppage")).toContainText("This device has the Magic Key");
  expect(await page.evaluate(() => localStorage.getItem("riglam.magicKey"))).not.toBeNull();
  await page.getByRole("button", { name: "Enter another key" }).click();   // on the page, in a field of its own
  await expect(page.getByRole("textbox", { name: "Another Magic Key or link" })).toBeVisible();
  await expect(page.locator(".ppage")).toContainText("a phrase that unlocks the definitions");   // what the key is, where it is entered
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.goBack();   // Back closes the page, not Settings
  await expect(page.locator(".ppage .ptitle")).toHaveText("Settings");
});

plain("without the key, the Magic Key page takes it in its own field, and Settings stays open; the top bar's chevron is the way back", async ({ page }) => {
  await serveCourse(page);
  await page.goto("/");
  await plainExpect(page.locator("#path .chs .crow")).toHaveCount(5);
  if (!(await page.locator(".road.on").count())) await page.locator(".tstn").click();   // without the key the roadmap may be up already
  await page.locator(".road .rfoot").getByRole("button", { name: "Settings" }).click();
  await plainExpect(page.locator("#path .foot")).toHaveCount(0);   // no station at the foot of Settings
  await plainExpect(page.locator(".ppage .ol", { hasText: "Magic Key" })).toContainText("not on this device yet");
  await page.getByRole("button", { name: "Magic Key: more" }).click();
  await plainExpect(page.locator(".ppage")).toContainText("a phrase that unlocks the definitions");
  await plainExpect(page.locator(".ppage")).toContainText("open the app’s link again");   // the shared link is the usual way in, not a teacher
  const field = page.getByRole("textbox", { name: "Magic Key or link", exact: true }), unlock = page.getByRole("button", { name: "Unlock", exact: true });
  await field.fill("hello there");
  await field.blur();   // on a phone the keyboard layout (the top bar steps aside) ends here, before the tap
  await unlock.click();
  await plainExpect(page.locator(".ppage [role=alert]")).toContainText("does not look like the Magic Key");
  await plainExpect(page.locator("dialog[open]")).toHaveCount(0);   // nothing over the page
  await plainExpect(page.locator("#path .ptb-t")).toHaveText("Magic Key");
  if (withCourse) {
    await field.fill(dataKey);
    await field.blur();
    await unlock.click();
    await plainExpect(page.locator(".ppage")).toContainText("This device has the Magic Key");
    await plainExpect(page.locator("#path .ptb-t")).toHaveText("Magic Key");   // still on its page
  }
  await page.getByRole("button", { name: "Back to Settings", exact: true }).click();
  await plainExpect(page.locator(".ppage .ptitle")).toHaveText("Settings");
  await page.getByRole("button", { name: "Back to the roadmap", exact: true }).click();
  await plainExpect(page.getByRole("dialog", { name: "Roadmap" })).toBeVisible();
});

test("Settings on the Path: sections of lines, export and import and the version on pages of their own, and no Experiments in the released app", async ({ page }) => {
  await start(page);
  await openSettings(page);
  await expect(page.locator("#path .pbr")).toHaveCount(0);   // nothing of Settings is hosted from another part of the page
  await expect(page.locator(".ppage .sgh")).toHaveText(["General", "Data", "About"]);   // Experiments: only in a Preview, or held open with the Magic Key
  await expect(page.getByRole("group", { name: "Theme" }).getByRole("button", { name: "System" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".ppage .ol", { hasText: "Version and updates" })).toContainText(/\d+\.\d+\.\d+/);
  await page.getByRole("button", { name: "Export and import: more" }).click();
  await expect(page.getByRole("button", { name: "Export your data to a file" })).toHaveClass("pbtn");
  await expect(page.getByRole("button", { name: "Import data from a file" })).toBeVisible();
  await page.getByRole("button", { name: "Back to Settings", exact: true }).click();   // the top bar's chevron
  await page.getByRole("button", { name: "Version and updates: more" }).click();
  await expect(page.locator(".ppage")).toContainText(/Version \d+\.\d+\.\d+ · build /);
});

withKey("in the released app, holding Version with the Magic Key shows Experiments: voice and the lab's settings, kept on the device", async ({ page }) => {
  await start(page);
  await openSettings(page);
  const ver = page.locator(".ppage .ol", { hasText: "Version and updates" }), box = await steady(ver);   // where it stands once Settings has slid in
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1700);
  await page.mouse.up();
  await expect(page.locator(".ppage .sgh")).toHaveText(["General", "Data", /^Experiments/, "About"]);
  await expect(page.locator("#path .ptb-t")).toHaveText("Settings");   // the tap that ends the hold opens nothing
  await expect(page.locator(".ppage .ol", { hasText: "The lab's settings" })).toBeVisible();
  const voice = page.getByRole("switch", { name: "Voice features", exact: true });
  if (await voice.count()) {   // a browser with speech
    const was = await voice.getAttribute("aria-checked");
    await voice.click();
    expect(await page.evaluate(() => localStorage.getItem("rd-voice"))).toBe(was === "true" ? "0" : "1");
  }
  expect(await page.evaluate(() => localStorage.getItem("rd-exp"))).toBe("1");
});

/** The Progression page, from the top bar's ring sheet: its stages, or its difficulty. */
async function progression(page, link) {
  await page.getByRole("button", { name: /^Progression: stage/ }).click();
  await page.getByRole("button", { name: link, exact: true }).click();
  await expect(page.locator("#path .ptb-t")).toHaveText("Progression");
}

test("with Natural progression off the Progression page switches the stages on the path, and the last one on stays on", async ({ page }) => {
  await page.addInitScript(() => { if (localStorage.getItem("rd-stages") === null) localStorage.setItem("rd-stages", "1"); });
  await start(page);
  await progression(page, "All stages and their terms");
  const pg = page.locator("#path .pprog");
  const stage = (n) => pg.getByRole("switch", { name: new RegExp("^Stage " + n + " ") });
  await expect(stage(1)).toHaveCount(0);
  const nat = pg.getByRole("switch", { name: "Natural progression" });
  await nat.click();
  await expect(nat).toHaveAttribute("aria-checked", "false");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("rd-stage-run")).manual)).toBe(true);
  await expect(stage(1)).toHaveAttribute("aria-checked", "true");
  await expect(stage(1)).toHaveAttribute("aria-disabled", "true");
  await stage(2).click();
  await expect(stage(2)).toHaveAttribute("aria-checked", "true");
  expect(await page.evaluate(() => localStorage.getItem("rd-stages"))).toBe("1,2");
  await stage(1).click();
  await expect(stage(1)).toHaveAttribute("aria-checked", "false");
  await expect(pg.locator(".prgl").nth(1)).toHaveClass(/\boff\b/);
  await stage(2).click({ force: true });   // the last one on stays on (a tap on it does nothing)
  await expect(stage(2)).toHaveAttribute("aria-checked", "true");
  expect(await page.evaluate(() => localStorage.getItem("rd-stages"))).toBe("2");
  // on again, the stages move by themselves and have no switches
  await nat.click();
  await expect(stage(2)).toHaveCount(0);
});

test("the practice options hold neither the stages nor the difficulty; the Progression page holds the negations and their brackets", async ({ page }) => {
  await page.addInitScript(() => { if (localStorage.getItem("rd-stages") === null) localStorage.setItem("rd-stages", "1,2"); });
  await start(page);
  await page.getByRole("button", { name: "Practice options" }).click();
  const sheet = page.getByRole("dialog", { name: "Practice options" });
  await expect(sheet.locator(".ol").first()).toBeVisible();
  await expect(sheet.getByRole("group", { name: "Negations" })).toHaveCount(0);
  await expect(sheet.locator(".ol", { hasText: /Difficulty|Stages/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Close the practice options" }).click();
  await progression(page, "Difficulty");
  const diff = page.locator("#path .pprog .sgrp").first();
  const seg = diff.getByRole("group", { name: "Negations" });
  await expect(seg.getByRole("button", { name: "Off" })).toHaveAttribute("aria-pressed", "true");
  await seg.getByRole("button", { name: "One side" }).click();
  expect(await page.evaluate(() => localStorage.getItem("rd-negation"))).toBe("one");
  const brackets = diff.getByRole("switch", { name: /^Brackets/ });
  await expect(brackets).toHaveAttribute("aria-checked", "true");
  await brackets.click();
  await expect(brackets).toHaveAttribute("aria-checked", "false");
  expect(await page.evaluate(() => localStorage.getItem("rd-neg-brackets"))).toBe("0");
  // Back goes to the exercise
  await page.locator(".tstn").click();
  await expect(page.locator("#path .pprog")).toHaveCount(0);
  await expect(page.locator("#path .ptb-t")).toHaveText("Relations");
});

test("the practice options' Voice choices are on the first page, and the page behind More about voice is drawn on the path and keeps its choices", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("rd-voice", "1"));
  await start(page);
  await page.getByRole("button", { name: "Practice options" }).click();
  const sheet = page.getByRole("dialog", { name: "Practice options" });
  const more = sheet.getByRole("button", { name: "More about voice" });
  test.skip(!(await more.count()), "this browser has no speech");
  const answer = sheet.getByRole("group", { name: "Answer by voice" });
  if (await answer.count()) {
    await answer.getByRole("button", { name: "Tap or hold" }).click();
    await expect(answer.getByRole("button", { name: "Tap or hold" })).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => localStorage.getItem("rd-voice-answer"))).toBe("tap");
  }
  await more.click();
  await expect(sheet.locator(".pbr")).toHaveCount(0);
  const speed = sheet.getByRole("group", { name: "Speed of reading" });
  if (await speed.count()) {
    await speed.getByRole("button", { name: "Fast" }).click();
    await expect(speed.getByRole("button", { name: "Fast" })).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => localStorage.getItem("rd-voice-rate"))).toBe("1.25");
  }
  if (await answer.count()) await expect(sheet.getByRole("group", { name: "After an answer is heard" })).toBeVisible();
});

test("the practice options: the exercise's own lines under its name, then Practice, then the way on to Settings; Sprint keeps its own value in each exercise", async ({ page }) => {
  await start(page);
  const sheet = page.getByRole("dialog", { name: "Practice options" }), sprint = sheet.getByRole("switch", { name: "Sprint", exact: true });
  const options = async () => { await page.getByRole("button", { name: "Practice options" }).click(); await expect(sheet.locator(".sgh").first()).toBeVisible(); };
  const fold = () => sheet.getByRole("button", { name: "Fold the practice options away" }).click();
  const go = async (name) => {
    await page.locator(".tstn").click();
    await page.getByRole("dialog", { name: "Roadmap" }).getByRole("button", { name: new RegExp("^" + name) }).click();
    await expect(page.locator(".ptb-t")).toContainText(name);
  };
  await options();
  await expect(sheet.locator(".sgh")).toHaveText(["Relations", "Practice"]);
  await expect(sheet.locator(".ol", { hasText: "Wording and notation" })).toContainText("Shorthand · A and B: letters");
  await expect(sheet.getByRole("button", { name: "Other app settings: more" })).toBeVisible();
  await expect(sprint).toHaveAttribute("aria-checked", "false");
  await sprint.click();
  await expect(sprint).toHaveAttribute("aria-checked", "true");
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem("rd-per-ex")))).toEqual({ practice: { blitz: true } });
  await fold();
  await go("Syllogisms");
  await options();
  await expect(sheet.locator(".sgh")).toHaveText(["Syllogisms", "Practice"]);
  await expect(sprint).toHaveAttribute("aria-checked", "false");   // not set here yet: it does not follow the one in Relations
  await sprint.click();
  await expect(sprint).toHaveAttribute("aria-checked", "true");
  await sprint.click();
  await expect(sprint).toHaveAttribute("aria-checked", "false");
  await fold();
  await go("Relations");
  await options();
  await expect(sprint).toHaveAttribute("aria-checked", "true");   // Relations keeps its own
});

test("Wording and notation: the notation, and A and B in the text with Off for the A/B markers", async ({ page }) => {
  await start(page);
  await page.getByRole("button", { name: "Practice options" }).click();
  const sheet = page.getByRole("dialog", { name: "Practice options" });
  await sheet.getByRole("button", { name: "Wording and notation: more" }).click();
  await expect(page.locator("#path .ptb-t")).toHaveText("Wording and notation");
  await sheet.getByRole("group", { name: "Notation" }).getByRole("button", { name: "Sets" }).click();
  expect(await page.evaluate(() => localStorage.getItem("rd-notation"))).toBe("sets");
  const ab = sheet.getByRole("group", { name: "A and B in the text" });
  await ab.getByRole("button", { name: "Off" }).click();
  expect(await page.evaluate(() => localStorage.getItem("rd-ab"))).toBe("0");
  await ab.getByRole("button", { name: "Inks" }).click();
  expect(await page.evaluate(() => localStorage.getItem("rd-ab"))).toBe("1");
  await expect(ab.getByRole("button", { name: "Inks" })).toHaveAttribute("aria-pressed", "true");
});
