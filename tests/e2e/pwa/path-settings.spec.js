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

withKey("Settings on the Path: the Magic Key has its own page, which says what it is and asks before it is forgotten", async ({ page }) => {
  await start(page);
  await openSettings(page);
  await expect(page.locator(".ppage .ol", { hasText: "Magic Key" })).toContainText("entered on this device");
  await page.getByRole("button", { name: "Magic Key: more" }).click();
  await expect(page.locator("#path .ptb-t")).toHaveText("Magic Key");
  await expect(page.locator(".ppage")).toContainText("This device has the Magic Key");
  await expect(page.locator(".ppage .pkeynote")).toContainText("The Magic Key to the Path of Reasoning");
  await page.getByRole("button", { name: "Forget the key" }).click();
  await expect(page.locator(".ppage")).toContainText("Forget the Magic Key on this device?");
  await page.getByRole("button", { name: "Keep it" }).click();
  await expect(page.locator(".ppage")).toContainText("This device has the Magic Key");
  expect(await page.evaluate(() => localStorage.getItem("riglam.magicKey"))).not.toBeNull();
  await page.goBack();   // Back closes the page, not Settings
  await expect(page.locator(".ppage .ptitle")).toHaveText("Settings");
});

test("Settings on the Path: sections of lines, export and import and the version on pages of their own, and no Experiments in the released app", async ({ page }) => {
  await start(page);
  await openSettings(page);
  await expect(page.locator("#path .pbr")).toHaveCount(0);   // nothing of Settings is hosted from the classic page
  await expect(page.locator(".ppage .sgh")).toHaveText(["General", "Data", "About"]);   // Experiments: only in a Preview, or held open with the Magic Key
  await expect(page.getByRole("group", { name: "Theme" }).getByRole("button", { name: "System" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".ppage .ol", { hasText: "Version and updates" })).toContainText(/\d+\.\d+\.\d+/);
  await page.getByRole("button", { name: "Export and import: more" }).click();
  await expect(page.getByRole("button", { name: "Export your data to a file" })).toHaveClass("pbtn");
  await expect(page.getByRole("button", { name: "Import data from a file" })).toBeVisible();
  await page.getByRole("button", { name: "back to Settings" }).click();
  await page.getByRole("button", { name: "Version and updates: more" }).click();
  await expect(page.locator(".ppage")).toContainText(/Version \d+\.\d+\.\d+ · build /);
});

withKey("in the released app, holding Version with the Magic Key shows Experiments: the design, voice and the lab's settings, kept on the device", async ({ page }) => {
  await start(page);
  await openSettings(page);
  const ver = page.locator(".ppage .ol", { hasText: "Version and updates" }), box = await ver.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1700);
  await page.mouse.up();
  await expect(page.locator(".ppage .sgh")).toHaveText(["General", "Data", /^Experiments/, "About"]);
  await expect(page.locator("#path .ptb-t")).toHaveText("Settings");   // the tap that ends the hold opens nothing
  await expect(page.getByRole("group", { name: "Design" }).getByRole("button", { name: "Path" })).toHaveAttribute("aria-pressed", "true");
  const voice = page.getByRole("switch", { name: "Voice", exact: true });
  if (await voice.count()) {   // a browser with speech
    const was = await voice.getAttribute("aria-checked");
    await voice.click();
    expect(await page.evaluate(() => localStorage.getItem("rd-voice"))).toBe(was === "true" ? "0" : "1");
  }
  expect(await page.evaluate(() => localStorage.getItem("rd-exp"))).toBe("1");
});

test("the practice options' Difficulty page switches the stages on the path, and the last one on stays on", async ({ page }) => {
  await page.addInitScript(() => { if (localStorage.getItem("rd-stages") === null) localStorage.setItem("rd-stages", "1"); });
  await start(page);
  await page.getByRole("button", { name: "Practice options" }).click();
  const sheet = page.getByRole("dialog", { name: "Practice options" });
  await sheet.getByRole("button", { name: "Difficulty: more" }).click();
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

test("the practice options' Difficulty line leads on to the Difficulty page, which holds the negations and their brackets, and the line says which stages are on", async ({ page }) => {
  await page.addInitScript(() => { if (localStorage.getItem("rd-stages") === null) localStorage.setItem("rd-stages", "1,2"); });
  await start(page);
  await page.getByRole("button", { name: "Practice options" }).click();
  const sheet = page.getByRole("dialog", { name: "Practice options" });
  await expect(sheet.getByRole("group", { name: "Negations" })).toHaveCount(0);          // not a row of the list: negations go with the difficulty
  await expect(sheet.locator(".ol", { hasText: "Difficulty" }).first()).not.toContainText("negations");
  await sheet.getByRole("button", { name: "Difficulty: more" }).click();
  await expect(sheet.getByRole("group", { name: "Negations" })).toHaveCount(0);
  await sheet.getByRole("button", { name: "Difficulty", exact: true }).click();
  const seg = page.locator("#path .pdiff").getByRole("group", { name: "Negations" });
  await expect(seg.getByRole("button", { name: "Off" })).toHaveAttribute("aria-pressed", "true");
  await seg.getByRole("button", { name: "One side" }).click();
  expect(await page.evaluate(() => localStorage.getItem("rd-negation"))).toBe("one");
  const brackets = page.locator("#path .pdiff").getByRole("switch", { name: /^Brackets/ });
  await expect(brackets).toHaveAttribute("aria-checked", "true");
  await brackets.click();
  await expect(brackets).toHaveAttribute("aria-checked", "false");
  expect(await page.evaluate(() => localStorage.getItem("rd-neg-brackets"))).toBe("0");
  // Back goes to the exercise, whose Difficulty line says so
  await page.locator(".tstn").click();
  await expect(page.locator("#path .pdiff")).toHaveCount(0);
  await page.getByRole("button", { name: "Practice options" }).click();
  await expect(sheet.locator(".ol", { hasText: "Difficulty" }).first()).toContainText("negations: one side");
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

test("the practice options: the exercise's own lines under its name, then Practice, then the way on to Settings; Blitz keeps its own value in each exercise", async ({ page }) => {
  await start(page);
  const sheet = page.getByRole("dialog", { name: "Practice options" }), blitz = sheet.getByRole("switch", { name: "Blitz", exact: true });
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
  await expect(blitz).toHaveAttribute("aria-checked", "true");
  await blitz.click();
  await expect(blitz).toHaveAttribute("aria-checked", "false");
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem("rd-per-ex")))).toEqual({ practice: { blitzUse: false } });
  await fold();
  await go("Syllogisms");
  await options();
  await expect(sheet.locator(".sgh")).toHaveText(["Syllogisms", "Practice"]);
  await expect(blitz).toHaveAttribute("aria-checked", "false");   // not set here yet: the last choice made
  await blitz.click();
  await expect(blitz).toHaveAttribute("aria-checked", "true");
  await fold();
  await go("Relations");
  await options();
  await expect(blitz).toHaveAttribute("aria-checked", "false");   // Relations keeps its own
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
