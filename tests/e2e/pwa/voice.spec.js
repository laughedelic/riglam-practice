// Voice: the questions read aloud and answers by voice (src/app/shell/voice.js), a feature on trial: its switch in Settings is off in the
// real app (and so in this build) until it is turned on, and these specs turn it on for the device unless they test the switch itself.
// The choices are on the first page of the Practice options, the speaker and the microphone are at the foot of the Path, and what was heard waits above the foot.
// A heard answer waits for Yes (or "yes") where the microphone is tapped, and goes on by itself after a short bar in Hands-free, or when the options say so; the step that went on
// stays above the foot for a few seconds as a chip with Change. The browser's speech is stood in for:
// speechSynthesis notes what it is asked to say and ends each utterance at once; SpeechRecognition answers each start
// with the next phrase the test queued (a phrase, or a list of guesses best first), or with "no-speech" when none comes.
import { test, expect } from "../../support/test.js";
import { goTo, openSettings, ready, overflow, relOptions } from "../../support/page.js";
import { voice, said, spoken, hearNext, docs, mic, listening, idle, waiting, confirm, change, settle, hear } from "../../support/voice.js";

/** The question of Pervasions on the path now: "Q1" to "Q4". */
const qNow = (page) => page.locator("#path .sb.now .qnm");
/** The speaker at the foot: tap says the question again, hold pauses the reading for this visit. */
const speaker = (page) => page.locator("#vhear");
/** Presses and holds a control (the foot's microphone or speaker) for `ms`, then lets go: a click whose press lasts, found and waited for as any click is. */
const holdDown = (page, loc, ms) => loc.click({ delay: ms });
const blitzSwitch = (page) => page.getByRole("switch", { name: /^Sprint/ });
const sheet = (page) => page.getByRole("dialog", { name: "Practice options" });
const openPracticeOptions = async (page) => { await page.getByRole("button", { name: "Practice options" }).click(); await expect(sheet(page)).toBeVisible(); };
/** The Voice page of the practice options (its line "More about voice"). */
const moreVoice = (page) => sheet(page).getByRole("button", { name: "More about voice" });
const openVoicePage = async (page) => { await openPracticeOptions(page); await moreVoice(page).click(); };
const closeSheet = async (page) => { for (let i = 0; i < 3 && (await sheet(page).isVisible()); i++) await page.keyboard.press("Escape"); await expect(sheet(page)).toBeHidden(); };
/** The experiments of Settings are shown on this device (a hold on Version does it in the released app). */
const showExperiments = (page) => page.addInitScript(() => localStorage.setItem("rd-exp", "1"));

test("Voice is off in the real app until its switch in Settings turns it on; that switch is the only voice control there", async ({ page }) => {
  await voice(page, { on: false, settings: { read: "1", answer: "tap" } });
  await showExperiments(page);
  await page.goto("/");
  await ready(page);
  await expect(page.locator("#vfield, #vmic, #vhear")).toHaveCount(0);   // nothing of it on the screen
  expect(await said(page)).toEqual([]);
  await openPracticeOptions(page);
  await expect(moreVoice(page)).toHaveCount(0);   // and no Voice choices in the Practice options
  await expect(sheet(page).getByRole("switch", { name: "Read aloud" })).toHaveCount(0);
  await closeSheet(page);
  await openSettings(page);
  const sw = page.getByRole("switch", { name: "Voice features", exact: true });
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await expect(page.locator(".ppage")).toContainText("sent to Google");   // where the audio goes is said where voice is switched on
  await expect(page.getByRole("switch", { name: /read aloud/i })).toHaveCount(0);   // its choices are not in Settings

  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("switch", { name: /read aloud/i })).toHaveCount(0);   // still just the one switch
  expect(await page.evaluate(() => localStorage.getItem("rd-voice"))).toBe("1");
  await page.reload();   // the choice is kept on the device
  await ready(page);
  await expect(mic(page)).toBeVisible();

  await openSettings(page);
  await page.getByRole("switch", { name: "Voice features", exact: true }).click();
  await expect(page.getByRole("switch", { name: "Voice features", exact: true })).toHaveAttribute("aria-checked", "false");
  expect(await page.evaluate(() => localStorage.getItem("rd-voice"))).toBe("0");
  await page.reload();
  await ready(page);
  await expect(page.locator("#vfield, #vmic, #vhear")).toHaveCount(0);
  expect(await said(page)).toEqual([]);
});

test("with no speech in the browser there is no Voice switch, no microphone and no voice bar", async ({ page }) => {
  await voice(page, { none: true, settings: { read: "1", answer: "tap" } });
  await showExperiments(page);
  await page.goto("/");
  await ready(page);
  await expect(page.locator("#vfield, #vmic, #vhear")).toHaveCount(0);
  await openSettings(page);
  await expect(page.locator(".ppage .sgh")).toContainText(["Experiments"]);
  await expect(page.getByRole("switch", { name: "Voice features", exact: true })).toHaveCount(0);
});

test("every exercise with a voice has the Voice choices in its options: Read aloud, how an answer is given, and More about voice", async ({ page }) => {
  await voice(page, { settings: { read: "1", answer: "tap" } });
  await page.goto("/");
  await ready(page);
  for (const name of ["Pervasions", "Find a pair", "Syllogisms", "Categories", "Find an instance"]) {
    await goTo(page, name);
    await openPracticeOptions(page);
    await expect(moreVoice(page), name).toHaveCount(1);
    await expect(sheet(page).getByRole("switch", { name: "Read aloud" }), name).toHaveCount(1);
    await closeSheet(page);
  }
});

test("the microphone is a field in the lower part of the screen, with a thin diamond and no box; it lights up while it listens, and a line says what a tap and a hold do", async ({ page }) => {
  await voice(page, { settings: { answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await expect(page.locator("#path #vfield #vmic")).toBeVisible();
  await expect(page.locator("#path .ptb #vmic")).toHaveCount(0);   // and not in the top bar
  await expect(page.locator("#vfield .vg")).toBeVisible();   // the thin diamond
  await expect(mic(page)).toHaveAttribute("aria-label", "Answer by voice. Tap, or hold to talk.");
  const [m, f, vp] = await Promise.all([mic(page).boundingBox(), page.locator("#path .foot").boundingBox(), page.evaluate(() => ({ w: innerWidth, h: innerHeight }))]);
  expect(m.width, "the whole width of the screen is the touch area (as wide as the foot)").toBeGreaterThanOrEqual(f.width * 0.95);
  expect(m.height, "a touch area a thumb can hit").toBeGreaterThanOrEqual(120);
  expect(m.y, "in the lower part of the screen").toBeGreaterThan(vp.h * 0.4);
  expect(m.y + m.height, "just above the foot").toBeLessThanOrEqual(f.y + 1);
  await expect(page.locator("#vfield .vhint")).toHaveText("Tap, or hold to talk");
  expect(await overflow(page)).toBeLessThanOrEqual(0);

  await page.evaluate(() => { window.__dead = true; });   // a recognizer that stays on, so that the lit microphone can be looked at
  await mic(page).click();
  await listening(page);   // lit while it listens (aria-pressed, the ring)
  await expect(page.locator("#vfield")).toHaveClass(/\bon\b/);
  await expect(mic(page)).toHaveAttribute("aria-label", /^Listening/);
  await expect(page.locator("#vfield .vst")).toHaveText("Listening…");
  await mic(page).click();   // a press stops it
  await idle(page);
  await page.evaluate(() => { window.__dead = false; });
  expect(await page.evaluate(() => localStorage.getItem("rd-voice-tried"))).toBe("1");
  await expect(page.locator("#vfield .vst")).toContainText("Nothing was heard");   // what is said now is what happened; the label of the field is back when that goes
  await hear(page, "mutually exclusive");
  await expect(waiting(page)).toBeVisible();
  await page.keyboard.press("Escape");   // Escape takes it back, as Change does
  await expect(waiting(page)).toHaveCount(0);
});

test("hold to talk: the microphone listens while it is held and sends the moment it is let go; a tap listens until a pause", async ({ page }) => {
  await voice(page, { settings: { answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await page.evaluate(() => { window.__dead = true; });   // listening that does not end by itself: only the finger decides
  // a quick press and lift is a tap: it keeps listening
  await mic(page).click();
  await listening(page);
  await expect(page.locator("#vfield")).not.toHaveClass(/\bhold\b/);
  await mic(page).click();   // and a press while it listens stops it
  await idle(page);
  await page.evaluate(() => { window.__dead = false; });
  // a long press is hold to talk: it swells while held, and says so
  const b = await mic(page).boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await listening(page);
  await expect(page.locator("#vfield")).toHaveClass(/\bhold\b/, { timeout: 2000 });
  await expect(page.locator("#vfield .vst")).toHaveText(/Listening… let go to send|“/);
  await hearNext(page, "four possibilities");   // said while the finger is down
  await expect(page.locator("#vfield .vst")).toHaveText("“four possibilities”");   // shown as it is said, above the thumb
  await expect(waiting(page)).toHaveCount(0);   // and not taken until it is let go
  await page.mouse.up();
  await expect(page.locator("#vfield .vwhat b")).toHaveText("Four possibilities");
  await expect(page.locator("#vfield")).not.toHaveClass(/\bhold\b/);
  await idle(page);
});

test("the strip above the field says the question again, stops it, and a hold pauses the reading for this visit", async ({ page }) => {
  await voice(page, { settings: { read: "1", answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await expect(page.locator("#path .ptb [aria-label='Read aloud']")).toHaveCount(0);   // no longer in the top bar
  await expect(speaker(page)).toBeVisible();
  const y = (loc) => loc.evaluate((e) => e.getBoundingClientRect().top);
  expect(await y(speaker(page)), "the strip is along the top of the field, above the touch area").toBeLessThan(await y(mic(page)));
  expect(await said(page)).toEqual([]);   // the first question the app opened on is held back
  await expect(page.locator("#vfield .vst")).toContainText("Tap above to hear the question");
  await speaker(page).click();
  await spoken(page, 1);
  expect((await said(page)).at(-1)).toMatch(/What is the relation\?$/);
  await expect(page.locator("#vfield .vst")).toHaveCount(0);   // the line that asked for the tap is gone (the label of the field stays)
  await speaker(page).click();   // again
  await spoken(page, 2);
  await page.keyboard.press("r");   // the key too
  await spoken(page, 3);

  // a long reading: a tap while it reads stops it
  await page.evaluate(() => { window.__speakMs = 4000; });
  await speaker(page).click();
  await expect.poll(async () => (await said(page)).length).toBe(4);
  await expect(speaker(page)).toHaveClass(/\bon\b/);   // lit while it reads
  await speaker(page).click();
  expect(await page.evaluate(() => window.speechSynthesis.cur)).toBeNull();
  await page.evaluate(() => { window.__speakMs = 20; });

  // a hold pauses the reading for this visit: the next question is not read, and a tap reads the one on the screen
  await holdDown(page, speaker(page), 700);
  await expect(speaker(page)).toHaveClass(/\boff\b/);
  await expect(page.locator("#vfield .vst")).toContainText("Reading is paused for this visit");
  await hear(page, "mutually exclusive");
  await confirm(page);
  await page.waitForTimeout(300);
  expect(await said(page)).toHaveLength(4);   // nothing more was read
  await speaker(page).click();   // takes the pause away and reads the question on the screen
  await expect(speaker(page)).not.toHaveClass(/\boff\b/);
  await expect.poll(async () => (await said(page)).length).toBe(5);
  // it is for this visit only: the choice in the options is still Read aloud on
  expect(await page.evaluate(() => localStorage.getItem("rd-voice-read"))).toBe("1");
});

test("from the keyboard: M pauses the reading for the visit and takes the pause away; after the microphone was started with the keys, the field keeps the focus, so Enter confirms the answer that waits", async ({ page }) => {
  await voice(page, { settings: { read: "1", answer: "tap", confirm: "wait" } });
  await page.goto("/");
  await ready(page);
  await goTo(page, "Pervasions");
  await spoken(page, 1);
  await page.keyboard.press("m");
  await expect(speaker(page)).toHaveClass(/off/);
  await page.keyboard.press("m");
  await expect(speaker(page)).not.toHaveClass(/off/);
  await spoken(page, 2);
  await mic(page).focus();
  await hearNext(page, "I accept");
  await page.keyboard.press("Space");   // a key on the focused microphone listens
  await settle(page);
  await expect(waiting(page)).toBeVisible();
  await expect(mic(page)).toBeFocused();
  await page.keyboard.press("Enter");   // Enter confirms, though the focus is on the field
  await expect(qNow(page)).toHaveText("Q2");
});

test("the Voice choices are on the first page of the Practice options: Read aloud, Answer by voice, and the rest behind More about voice", async ({ page }) => {
  await voice(page, { settings: { read: "0", answer: "off" } });
  await page.goto("/");
  await ready(page);
  await expect(speaker(page)).toHaveCount(0);   // Read aloud is off: no speaker
  await expect(mic(page)).toHaveCount(0);   // Answer by voice is off: no microphone
  await openPracticeOptions(page);
  const ra = sheet(page).getByRole("switch", { name: "Read aloud" });
  await expect(ra).toHaveAttribute("aria-checked", "false");
  await ra.click();
  await expect(ra).toHaveAttribute("aria-checked", "true");
  await sheet(page).getByRole("button", { name: "Tap or hold" }).click();   // the three choices are words on the line
  await expect(sheet(page).getByRole("button", { name: "Tap or hold" })).toHaveAttribute("aria-pressed", "true");
  await closeSheet(page);
  await expect(speaker(page)).toBeVisible();
  await expect(mic(page)).toBeVisible();
  expect(await page.evaluate(() => [localStorage.getItem("rd-voice-read"), localStorage.getItem("rd-voice-answer")])).toEqual(["1", "tap"]);
  await openVoicePage(page);   // the voice, its speed and what happens after an answer is heard are one page in
  await expect(sheet(page).getByRole("group", { name: "After an answer is heard" })).toBeVisible();
  await expect(sheet(page).getByRole("switch", { name: "Read aloud" })).toHaveCount(0);   // and not twice
  await sheet(page).getByRole("button", { name: "Always wait for Yes" }).click();
  expect(await page.evaluate(() => localStorage.getItem("rd-voice-confirm"))).toBe("wait");
});

test("Pervasions: each question is read aloud and answered with the mic; the answer waits on its own question for Yes", async ({ page }) => {
  await voice(page, { settings: { read: "1", answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await goTo(page, "Pervasions");
  await expect(qNow(page)).toHaveText("Q1");
  await expect.poll(async () => (await said(page)).at(-1) || "").toMatch(/^.+ and .+\. Do you accept that if it is .+, it follows it is not .+\?$/);

  // Why? with the example in one breath: it is shown with what it was taken as, on this question, and goes on at Yes
  await hear(page, "Why? A wooden table.");
  await expect(qNow(page)).toHaveText("Q1");
  await expect(page.locator("#vfield .vwhat small")).toHaveText("Heard");   // it is what was said, so there is no "taken as"
  await expect(page.locator("#vfield .vwhat b")).toHaveText("Why? a wooden table");
  await confirm(page);
  await expect(qNow(page)).toHaveText("Q2");
  await expect(waiting(page)).toHaveCount(0);
  await expect(page.locator("#vfield .vst")).toHaveCount(0);   // nothing of the last answer on the next question
  for (const n of [3, 4]) {
    await hear(page, "I accept");
    await confirm(page);
    await expect(qNow(page)).toHaveText("Q" + n);
  }
  await hear(page, "except");   // how a recognizer often hears "accept"
  await expect(page.locator("#vfield .vwhat b")).toHaveText("Accept");
  await expect(page.locator("#vfield .vwhat small")).toHaveText("Heard “except”, taken as");
  await confirm(page);
  await expect.poll(async () => (await said(page)).at(-1)).toBe("Which relation do your answers give?");

  await hear(page, "four possibilities");
  await expect(page.locator("#vfield .vwhat b")).toHaveText("Four possibilities");
  await page.keyboard.press("Enter");   // Enter confirms too
  await expect(page.locator("#vfield")).toBeHidden();
  await expect.poll(async () => (await docs(page, "debates")).length).toBe(1);
  const [d] = await docs(page, "debates");
  expect(d.chosen).toBe("4");
  expect(d.qs.map((q) => q.say)).toEqual(["why", "accept", "accept", "accept"]);
  expect(d.qs[0].text).toBe("a wooden table");
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

test("a heard answer can be taken back with Change, with \"no\" or by saying another, and a wait is not counted in the response time", async ({ page }) => {
  await voice(page, { settings: { answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await goTo(page, "Pervasions");
  await expect(qNow(page)).toHaveText("Q1");

  await hear(page, "I accept");
  await page.waitForTimeout(1600);   // the answer waits; the time it waits is not the time the answer took
  await change(page);   // Change: gone, and the mic is open again for the right answer
  await expect(waiting(page)).toHaveCount(0);
  await listening(page);
  await expect(qNow(page)).toHaveText("Q1");
  await hearNext(page, "why a gold ring");   // the open mic takes it
  await expect(page.locator("#vfield .vwhat b")).toHaveText("Why? a gold ring");
  await hearNext(page, "wooden table");   // another answer replaces the waiting one ("why" is implied for an item named alone)
  await page.keyboard.press("v");
  await settle(page);
  await expect(page.locator("#vfield .vwhat b")).toHaveText("Why? wooden table");
  await hearNext(page, "no");
  await page.keyboard.press("v");
  await expect(waiting(page)).toHaveCount(0);
  await listening(page);   // and open again
  await hearNext(page, "yes");   // "yes" with nothing waiting is the answer Accept
  await expect(page.locator("#vfield .vwhat b")).toHaveText("Accept");
  await hearNext(page, "yes");   // and with an answer waiting it confirms
  await page.keyboard.press("v");
  await settle(page);
  await expect(qNow(page)).toHaveText("Q2");
  await expect(waiting(page)).toHaveCount(0);

  for (const n of [3, 4, 5]) {
    await hear(page, "accept");
    await page.keyboard.press("Enter");
    if (n < 5) await expect(qNow(page)).toHaveText("Q" + n);
  }
  await hear(page, "mutually exclusive");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await docs(page, "debates")).length).toBe(1);
  const [d] = await docs(page, "debates");
  expect(d.qs[0].ms).toBeLessThan(1200);
});

test("Relations, hands-free with \"Always wait for Yes\": the relation and each example are heard in turn, each confirmed by \"yes\", and the answer is checked", async ({ page }) => {
  // "nothing" is refused for a case the relation asks for (the second one), and taken for the neither case
  await voice(page, { settings: { answer: "auto", confirm: "wait" }, heard: ["mutually exclusive", "yes", "a gold ring", "yes", "nothing", "a red apple", "yes", "nothing", "yes"] });
  await page.goto("/");
  await ready(page);
  // the question the app opens on waits for the person: nothing listens until the microphone is tapped
  await expect(page.locator("#vfield .vst")).toHaveText("Tap here to start answering.");
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__listens)).toBe(0);
  await mic(page).click();
  await expect.poll(() => docs(page, "answers").then((a) => a.length), { timeout: 10_000 }).toBe(1);
  const [a] = await docs(page, "answers");
  expect(a.chosen).toBe("con");
  expect([a.cells.anb.text, a.cells.bna.text, a.cells.nei.text]).toEqual(["a gold ring", "a red apple", ""]);
  // the field never took the focus, so a phone keeps its keyboard down
  expect(await page.evaluate(() => document.activeElement && document.activeElement.tagName)).not.toBe("INPUT");
});

test("Relations, hands-free: the answer goes on by itself after a short bar, with no \"yes\", and the step stays above the foot as a chip", async ({ page }) => {
  await voice(page, { settings: { answer: "auto" }, heard: ["mutually exclusive", "a gold ring", "a red apple", "nothing"] });
  await page.goto("/");
  await ready(page);
  await mic(page).click();   // the question the app opens on waits for the person; from here on it runs by itself
  await expect(page.locator("#vfield .vrunl")).toBeVisible();
  await expect(page.locator("#vfield .vgo i")).toHaveCount(0);   // no Yes to press: the bar is the wait
  await expect.poll(() => docs(page, "answers").then((a) => a.length), { timeout: 15_000 }).toBe(1);
  const [a] = await docs(page, "answers");
  expect(a.chosen).toBe("con");
  expect([a.cells.anb.text, a.cells.bna.text, a.cells.nei.text]).toEqual(["a gold ring", "a red apple", ""]);
});

test("after a spoken answer went on, the step stays above the foot as a chip for six seconds: Change puts the question back as it was, with the microphone open", async ({ page }) => {
  await voice(page, { settings: { read: "1", answer: "tap", confirm: "wait" } });
  await page.goto("/");
  await ready(page);
  await goTo(page, "Pervasions");
  await expect(qNow(page)).toHaveText("Q1");
  await expect.poll(async () => (await said(page)).length).toBe(1);
  await hear(page, "I accept");
  await confirm(page);
  await expect(qNow(page)).toHaveText("Q2");
  const chip = page.locator("#vfield .vchip");
  await expect(chip).toBeVisible();
  await expect(chip.locator("b")).toHaveText("Accept");
  await expect.poll(async () => (await said(page)).length).toBe(2);   // Q2 is being read
  await chip.getByRole("button", { name: "Change" }).click();
  await expect(qNow(page)).toHaveText("Q1");   // the question is open again with nothing said
  await expect(chip).toHaveCount(0);
  await listening(page);   // and the microphone is open
  await page.waitForTimeout(300);
  expect(await said(page), "the question is not read again").toHaveLength(2);
  expect(await docs(page, "debates"), "nothing was saved before the check").toHaveLength(0);

  // "back" after it went on does the same
  await hearNext(page, "Why? a gold ring");
  await settle(page);
  await confirm(page);
  await expect(qNow(page)).toHaveText("Q2");
  await expect(chip.locator("b")).toHaveText("Why? a gold ring");
  await hearNext(page, "back");
  await page.keyboard.press("v");
  await expect(qNow(page)).toHaveText("Q1");
  await listening(page);
  await page.keyboard.press("v");   // stop the open microphone
  await idle(page);

  // but "no" is an answer here (Why?), so while the chip is up it answers the next question and leaves the step alone
  await hear(page, "I accept");
  await confirm(page);
  await expect(qNow(page)).toHaveText("Q2");
  await expect(chip).toBeVisible();
  await hearNext(page, "no");
  await page.keyboard.press("v");
  await settle(page);
  await expect(page.locator("#vfield .vwhat b")).toHaveText("Why?");
  await expect(qNow(page)).toHaveText("Q2");
  await page.keyboard.press("Escape");   // Escape changes it, and the mic is open for another
  await listening(page);
  await page.keyboard.press("v");
  await idle(page);

  // the chip goes by itself after six seconds, and the answer stands
  await hear(page, "I accept");
  await confirm(page);
  await expect(qNow(page)).toHaveText("Q3");
  await expect(chip).toBeVisible();
  await expect(chip).toHaveCount(0, { timeout: 7500 });
  await expect(qNow(page)).toHaveText("Q3");
});

test("Relations: Change on the chip puts back the relation list, or the case that was written, with what it held; the last case checks the pair and has no chip", async ({ page }) => {
  await voice(page, { settings: { answer: "tap", confirm: "wait" } });
  await page.goto("/");
  await ready(page);
  const chip = page.locator("#vfield .vchip");
  await hear(page, "mutually exclusive");
  await confirm(page);
  await expect(page.locator("#cin")).toBeVisible();   // the examples came
  await expect(chip.locator("b")).toHaveText("Mutually exclusive");
  await chip.getByRole("button", { name: "Change" }).click();
  await expect(page.locator("#cin")).toHaveCount(0);   // the relation is open again
  await expect(relOptions(page)).toHaveCount(5);
  await listening(page);   // and the mic is open again
  await hearNext(page, "mutually exclusive");
  await settle(page);
  await expect(waiting(page)).toBeVisible();
  await confirm(page);
  await hear(page, "a gold ring");   // the first case
  await confirm(page);
  await expect(chip.locator("b")).toHaveText("a gold ring");
  await chip.getByRole("button", { name: "Change" }).click();   // back to that case, empty
  await expect(page.locator("#cin")).toHaveValue("");
  await listening(page);
  await hearNext(page, "a gold ring");
  await settle(page);
  await confirm(page);
  await hear(page, "a red apple");
  await confirm(page);
  await hear(page, "nothing");   // the last case: it checks the pair
  await confirm(page);
  await expect.poll(() => docs(page, "answers").then((a) => a.length)).toBe(1);
  await expect(chip).toHaveCount(0);
});

test("\"Always go on by itself\": the answer shows a running bar of 1.5 s, goes on, and Change stops it", async ({ page }) => {
  await voice(page, { settings: { answer: "tap", confirm: "auto" } });
  await page.goto("/");
  await ready(page);
  await hear(page, "four possibilities");
  await expect(page.locator("#vfield .vrunl")).toBeVisible();
  await expect(page.locator("#vfield .vgo i")).toHaveCount(0);
  await change(page);   // stopped before the bar ran out
  await expect(waiting(page)).toHaveCount(0);
  await page.waitForTimeout(1900);
  await expect(page.locator("#cin")).toHaveCount(0);   // nothing was chosen
  await expect(relOptions(page)).toHaveCount(5);

  await listening(page);   // Change opened the microphone again
  await hearNext(page, "mutually exclusive");
  await settle(page);
  await expect(page.locator("#vfield .vwhat b")).toHaveText("Mutually exclusive");
  await expect(page.locator("#cin")).toHaveCount(0);   // still waiting
  await expect(page.locator("#cin")).toBeVisible({ timeout: 2500 });   // the bar is 1.5 s without Sprint: the relation is taken, and the examples come
  await expect(page.locator("#path .pstrip")).toContainText("Mutually exclusive");
  await expect(waiting(page)).toHaveCount(0);
});

test("a touch on the field while the bar runs holds it: the answer then waits for Yes; holding the field says another answer, which replaces it", async ({ page }) => {
  await voice(page, { settings: { answer: "tap", confirm: "auto" } });
  await page.goto("/");
  await ready(page);
  await hear(page, "four possibilities");
  await expect(page.locator("#vfield .vrunl")).toBeVisible();
  await mic(page).click();   // the touch holds the bar: it does not go on
  await expect(page.locator("#vfield .vrunl")).toHaveCount(0);
  await expect(page.locator("#vfield")).toHaveAttribute("data-s", "heard");   // what was heard waits for Yes now ("Tap for Yes")
  await expect(page.locator("#vfield .vgo i")).toBeVisible();
  await page.waitForTimeout(1900);   // longer than the bar
  await expect(page.locator("#cin")).toHaveCount(0);   // it did not go on
  // a hold says another answer: it is listened for while the finger is down, and replaces the one that waited
  const b = await mic(page).boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await listening(page);
  await hearNext(page, "three possibilities, A in B");
  await expect(page.locator("#vfield .vst")).toHaveText("“three possibilities, A in B”");
  await page.mouse.up();
  await expect(page.locator("#vfield .vwhat b")).toHaveText("Three possibilities, A in B");
  await expect(page.locator("#vfield .vrunl")).toBeVisible();   // the bar runs again for the new answer
});

test("an answer that waits: a tap on the field is Yes, and Enter is too", async ({ page }) => {
  await voice(page, { settings: { answer: "tap", confirm: "wait" } });
  await page.goto("/");
  await ready(page);
  await hear(page, "four possibilities");
  await expect(page.locator("#vfield .vgo")).toHaveText("Tap for Yes");
  await expect(page.locator("#vfield .vhint")).toHaveText("Hold to say it again");
  expect(await docs(page, "answers")).toHaveLength(0);
  await confirm(page);   // a tap
  await expect(waiting(page)).toHaveCount(0);
  await expect(page.locator("#cin")).toBeVisible();   // the cases to fill in
});

test("with Blitz on the countdown stops while an answer waits, and goes on when it is taken back", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });   // (the bar does not move with reduced motion, so it has no play state to look at)
  await page.addInitScript(() => localStorage.setItem("rd-blitz", "1"));
  await voice(page, { settings: { answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await goTo(page, "Pervasions");
  await expect(bar(page)).toHaveCount(1);   // the question's countdown runs
  await expect(bar(page)).toHaveCSS("animation-play-state", "running");
  await hear(page, "accept");
  await expect(bar(page)).toHaveCSS("animation-play-state", "paused");   // stands still while the answer waits
  await change(page);
  await expect(bar(page)).toHaveCSS("animation-play-state", "running");   // and runs again
  await hearNext(page, "accept");
  await page.keyboard.press("v");
  await settle(page);
  await expect(waiting(page)).toBeVisible();
  await confirm(page);
  await expect(qNow(page)).toHaveText("Q2");
  await expect(bar(page)).toHaveCount(1);   // the next question has its own
});

const bar = (page) => page.locator("#path .pclock i");
// how much of the countdown the bar shows as gone, in ms (the bar's own offset, `--e`, is set once when it is drawn: clock.tsx)
const elapsed = (page) => page.locator("#path .pclock").evaluate((e) => { const a = e.querySelector("i").getAnimations()[0]; return a ? a.effect.getComputedTiming().progress * parseFloat(e.style.getPropertyValue("--t")) : parseFloat(e.style.getPropertyValue("--e")); });

test("Blitz: an answer given by hand while a spoken one waits leaves the next question with its own countdown", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => localStorage.setItem("rd-blitz", "1"));
  await voice(page, { settings: { answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await goTo(page, "Pervasions");
  await expect(bar(page)).toHaveCount(1);
  await hear(page, "accept");
  await expect(bar(page)).toHaveCSS("animation-play-state", "paused");
  await page.getByRole("button", { name: /^Accept/ }).click();   // by hand, not Yes
  await expect(qNow(page)).toHaveText("Q2");
  await expect(bar(page)).toHaveCount(1);
  await expect(bar(page)).toHaveCSS("animation-play-state", "running");
  expect(await elapsed(page)).toBeLessThan(1500);   // the next question's own time, not the one the held question had used

  // and Why? by hand while another waits: the example is a step of its own, with its own bar from full
  await page.waitForTimeout(1200);
  await hear(page, "accept");
  const why = Date.now();
  await page.getByRole("button", { name: /^Why\?/ }).click();
  await expect(page.locator("#dex")).toBeVisible();
  await expect(bar(page)).toHaveCount(1);
  await expect(bar(page)).toHaveCSS("animation-play-state", "running");
  expect(await elapsed(page), "no more than the time since Why? was taken").toBeLessThan(Date.now() - why + 300);
});

test("Blitz: an attempt put aside with a spoken answer waiting gets its countdown back when it returns", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("rd-blitz", "1"));
  await voice(page, { settings: { answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await goTo(page, "Pervasions");
  await hear(page, "accept");
  await goTo(page, "Relations");
  await goTo(page, "Pervasions");
  await expect(qNow(page)).toHaveText("Q1");
  await expect(bar(page)).toHaveCount(1);
  await expect(bar(page)).toHaveCSS("animation-play-state", "running");
});

test("Blitz: a question's countdown starts when its reading ends, not before", async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem("rd-blitz", "1"); localStorage.setItem("rd-timer-q", "2000"); });
  await voice(page, { settings: { read: "1", answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await page.evaluate(() => { window.__speakMs = 3200; });   // a long question
  await goTo(page, "Pervasions");
  await expect.poll(async () => (await said(page)).at(-1) || "").toMatch(/Do you accept that/);
  await page.waitForTimeout(2600);   // longer than the countdown, but the question is still being read
  await expect(qNow(page)).toHaveText("Q1");
  await expect(mic(page)).toBeVisible();
  await expect(qNow(page)).toHaveText("Q2", { timeout: 6000 });   // then it runs out after its own 2 seconds
});

test("Blitz in Relations: a case answered by hand while a spoken one waits leaves the next case with a countdown of its own", async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem("rd-blitz", "1"); window.__riglamTest = (t) => { window.__t = t; }; });
  await voice(page, { settings: { answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await hear(page, "mutually exclusive");
  await confirm(page);
  await expect(bar(page)).toHaveCount(1);
  const first = await page.evaluate(() => window.__t.ui.tq.key);
  await page.waitForTimeout(1500);
  await hear(page, "a gold ring");   // waits
  await page.locator("#cin").fill("a clay pot");
  await page.locator("#cin").press("Enter");   // by hand: the next case
  await expect(page.locator("#path .sb.done")).toHaveCount(1);
  await expect(bar(page)).toHaveCount(1);
  expect(await elapsed(page), "the next case begins with its own time, not the stopped one's").toBeLessThan(900);
  expect(await page.evaluate(() => window.__t.ui.tq.key), "a case of its own").not.toBe(first);
});

test("the relation said as what is written under the option, or three possibilities and then which is inside", async ({ page }) => {
  await page.addInitScript(() => { window.__riglamTest = (t) => { window.__t = t; }; });
  await voice(page, { settings: { answer: "tap" } });
  await page.goto("/");
  await ready(page);
  const [a, b] = await page.evaluate(() => [window.__t.cur.p.a, window.__t.cur.p.b]);
  await hear(page, `all ${b} are ${a}, but not the reverse`);
  await expect(page.locator("#vfield .vwhat b")).toHaveText("Three possibilities, B in A");
  // the same through "three possibilities", whose direction the page asks for; the recognizer writes "A in B" as it likes
  await hearNext(page, "three possibilities");
  await page.keyboard.press("v");
  await settle(page);
  await expect(page.locator("#vfield .vst")).toHaveText(`Three possibilities: which is inside the other, ${a} or ${b}?`);
  await hearNext(page, "ANB");
  await page.keyboard.press("v");
  await settle(page);
  await expect(page.locator("#vfield .vwhat b")).toHaveText("Three possibilities, A in B");
  await hearNext(page, "A & B");
  await page.keyboard.press("v");
  await settle(page);
  await expect(page.locator("#vfield .vwhat b")).toHaveText("Three possibilities, A in B");
  await hearNext(page, "three possibilities");   // asked again, and this time the term that is inside is the answer
  await page.keyboard.press("v");
  await settle(page);
  await expect(page.locator("#vfield .vwhat")).toHaveCount(0);
  await hearNext(page, b);
  await page.keyboard.press("v");
  await settle(page);
  await expect(page.locator("#vfield .vwhat b")).toHaveText("Three possibilities, B in A");
});

test("words that are not an answer are said back, and the mic stays for another try", async ({ page }) => {
  await voice(page, { settings: { answer: "tap" } });
  await page.goto("/");
  await ready(page);
  const hint = "Say the relation, such as “four possibilities”, or what is written under it.";
  await hearNext(page, "good morning");
  await mic(page).click();
  await settle(page);
  await expect(page.locator("#vfield .vst")).toHaveText("Heard “good morning”. " + hint);
  await hearNext(page, "three possibilities");
  await mic(page).click();
  await settle(page);
  await expect(page.locator("#vfield .vst")).toContainText("which is inside the other");
  await hearNext(page, "B in A");
  await page.keyboard.press("v");
  await settle(page);
  await expect(page.locator("#vfield .vwhat b")).toHaveText("Three possibilities, B in A");
  await expect(page.locator("#vfield .vwhat small")).toHaveText("Heard “B in A”, taken as");
  await confirm(page);
  await expect(page.locator("#cin")).toBeVisible();   // the relation is taken: the examples come
  // the next screen asks for the first example and shows nothing of the last answer
  await expect(page.locator("#vfield .vst")).toHaveCount(0);
});

test("a recognizer that never ends does not leave the mic stuck: the next tap ends it and the one after listens", async ({ page }) => {
  await voice(page, { settings: { answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await page.evaluate(() => { window.__dead = true; });
  await mic(page).click();
  await listening(page);
  await mic(page).click();   // stop it; the recognizer does not answer, so the page ends the listening itself
  await idle(page);
  await expect(page.locator("#vfield .vst")).toContainText("Nothing was heard");
  await page.evaluate(() => { window.__dead = false; });
  await hear(page, "four possibilities");
  await expect(page.locator("#vfield .vwhat b")).toHaveText("Four possibilities");
});

test("the question the app opens on is not read until it is asked for; later ones are read by themselves", async ({ page }) => {
  await voice(page, { settings: { read: "1", answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await expect(page.locator("#vfield .vst")).toContainText("Tap above to hear the question");   // the speaker is the way to ask
  await expect(page.getByRole("button", { name: "Hear the question", exact: true })).toHaveCount(0);   // there is no link for it any more: the speaker is "Hear the question again"
  await page.waitForTimeout(500);
  expect(await said(page)).toEqual([]);   // nothing was said, and nothing is waiting to be said
  await speaker(page).click();
  await expect.poll(async () => (await said(page)).at(-1) || "").toMatch(/What is the relation\?$/);
  await expect(page.locator("#vfield .vst")).toHaveCount(0);   // and the line that asked for the tap goes away
  const before = (await said(page)).length;
  await goTo(page, "Pervasions");   // moving on by hand: this screen is read by itself
  await expect.poll(async () => (await said(page)).length).toBeGreaterThan(before);
  await expect.poll(async () => (await said(page)).at(-1) || "").toMatch(/Do you accept that/);
});

test("the first question can also be read with the R key, or by pausing and resuming Read aloud", async ({ page }) => {
  await voice(page, { settings: { read: "1", answer: "tap" } });
  await page.goto("/");
  await ready(page);
  expect(await said(page)).toEqual([]);
  await holdDown(page, speaker(page), 700);   // pause
  await expect(speaker(page)).toHaveClass(/\boff\b/);
  expect(await said(page)).toEqual([]);
  await speaker(page).click();   // and resume: reads the question on the screen
  await expect.poll(async () => (await said(page)).length).toBe(1);
  expect((await said(page)).at(-1)).toMatch(/What is the relation\?$/);
  await page.keyboard.press("r");
  await expect.poll(async () => (await said(page)).length).toBe(2);
});

test("\"I don't know\" gets a friendly nudge, said too with Read aloud, and nothing is taken as an answer", async ({ page }) => {
  await voice(page, { settings: { read: "1", answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await goTo(page, "Pervasions");
  await expect.poll(async () => (await said(page)).at(-1) || "").toMatch(/Do you accept that/);
  const nudge = "It's okay not to know. Make a guess, then learn from the review. Mistakes are how we learn.";
  for (const phrase of ["I don't know", "no idea"]) {   // "no idea" starts with "no", which would otherwise be Why?
    await hearNext(page, phrase);
    await mic(page).click();
    await expect.poll(async () => (await said(page)).at(-1)).toBe(nudge);
    await expect(page.locator("#vfield .vst")).toHaveText(nudge);
    await expect(waiting(page)).toHaveCount(0);
    await expect(qNow(page)).toHaveText("Q1");
  }
  await hear(page, "I accept");   // and the next try is taken as usual
  await confirm(page);
  await expect(qNow(page)).toHaveText("Q2");
});

/* ---------- what a second review of the Blitz clock found ---------- */

test("Blitz: an answer given by hand while a spoken one waits is timed by the clock that stood still", async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem("rd-blitz", "1"); localStorage.setItem("rd-timer-q", "8000"); });
  await voice(page, { settings: { answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await goTo(page, "Pervasions");
  await hear(page, "accept");
  await page.waitForTimeout(2200);   // the answer waits; the clock is stopped
  await page.getByRole("button", { name: /^Accept/ }).click();   // by hand
  for (const n of [2, 3, 4]) {
    await expect(qNow(page)).toHaveText("Q" + n);
    await page.getByRole("button", { name: /^Accept/ }).click();
  }
  await relOptions(page).first().click();
  await expect.poll(async () => (await docs(page, "debates")).length).toBe(1);
  const [d] = await docs(page, "debates");
  expect(d.qs[0].ms).toBeLessThan(1500);   // not the 2 seconds it waited
});

test("Blitz switched on while an answer waits: the question gets its full time when the answer is taken back", async ({ page }) => {
  await voice(page, { settings: { answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await goTo(page, "Pervasions");
  await page.waitForTimeout(1500);   // thinking time from before Blitz was on
  await hear(page, "accept");
  await blitzSwitch(page).click();
  await change(page);
  await expect(bar(page)).toHaveCount(1);
  await expect(bar(page)).toHaveCSS("animation-play-state", "running");
  expect(await elapsed(page)).toBeLessThan(900);
});

test("Blitz: going to Review with an answer waiting leaves no countdown on the Review screen", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("rd-blitz", "1"));
  await voice(page, { settings: { answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await goTo(page, "Pervasions");
  await hear(page, "accept");
  await goTo(page, "Review");
  await page.waitForTimeout(300);
  await expect(page.locator("#path .pclock")).toHaveCount(0);
});

test("Blitz in Relations: the examples countdown waits while the relation list is shown, and goes on from where it stood", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("rd-blitz", "1"));
  await voice(page, { settings: { read: "1", answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await relOptions(page).first().click();   // by hand: the examples, with their countdown
  await expect(bar(page)).toHaveCount(1);
  await page.waitForTimeout(1500);
  await page.locator("#cin").blur();   // (on a phone the strip is out of the way while the keyboard is up)
  await page.locator("#path .pstrip").click();   // look back at the relation, and pick another: the relation list, which is read as a new screen
  await page.getByRole("button", { name: "Pick another" }).click();
  await expect.poll(async () => (await said(page)).at(-1) || "").toMatch(/What is the relation\?$/);
  await page.waitForTimeout(200);
  await expect(bar(page), "no countdown behind the list").toHaveCount(0);
  await relOptions(page).first().click();   // the same relation again: back to the first case
  await expect(bar(page)).toHaveCount(1);
  expect(await elapsed(page), "it went on from where it stood").toBeGreaterThan(1200);
});

test("Hands-free: after the nudge for \"I don't know\" the microphone opens again, with Read aloud off", async ({ page }) => {
  await voice(page, { settings: { answer: "auto" }, heard: ["I don't know", "I accept"] });
  await page.goto("/");
  await ready(page);
  await goTo(page, "Pervasions");   // moving on by hand: this screen listens by itself
  await expect(waiting(page)).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("#vfield .vwhat b")).toHaveText("Accept");
  expect(await page.evaluate(() => window.__listens)).toBeGreaterThanOrEqual(2);
});

test("on the Path the answer heard waits above the foot until it is confirmed, and the thread goes on", async ({ page }) => {
  await voice(page, { settings: { answer: "tap" } });
  await page.addInitScript(() => { window.__riglamTest = (t) => { window.__t = t; }; });
  await page.goto("/");
  await ready(page);
  await expect(page.locator("#path #vfield #vmic")).toBeVisible();
  await hear(page, "four possibilities");
  await expect(page.locator("#path .vfieldh #vfield")).toContainText("Four possibilities");
  await confirm(page);
  await expect(page.locator("#cin")).toBeVisible();   // the relation is taken: the examples come
  await expect(page.locator("#path .pstrip")).toContainText("Four possibilities");
});

test("Hands-free with Always wait for Yes: a tap on the field is Yes, though the microphone listens for \"yes\" meanwhile", async ({ page }) => {
  await voice(page, { settings: { answer: "auto", confirm: "wait" } });
  await page.goto("/");
  await ready(page);
  await goTo(page, "Pervasions");   // moving on by hand: the screens after this one listen by themselves
  await goTo(page, "Relations");
  await listening(page);
  await hearNext(page, "four possibilities");
  await expect(waiting(page)).toBeVisible({ timeout: 10_000 });
  await listening(page);   // it listens for "yes", "no" or another answer
  await expect(page.locator("#vfield .vgo")).toHaveText("Tap for Yes");
  await confirm(page);   // the first tap is Yes, not the end of the listening
  await expect(waiting(page)).toHaveCount(0);
  await expect(page.locator("#cin")).toBeVisible();   // the cases to fill in
});

test("the app going to the background in the middle of a touch does not confirm the answer that waits", async ({ page }) => {
  await voice(page, { settings: { answer: "tap", confirm: "wait" } });
  await page.goto("/");
  await ready(page);
  await hear(page, "four possibilities");
  await expect(mic(page)).toBeVisible();
  const b = await mic(page).boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { value: true, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
  await page.mouse.up();
  await expect(waiting(page)).toBeVisible();   // still waiting for Yes
  await expect(page.locator("#cin")).toHaveCount(0);
});

test("a screen reader's activation (a click with no touch or key) does what a tap does: it listens, and it is Yes for an answer that waits; what waits is told from a live region", async ({ page }) => {
  await voice(page, { settings: { answer: "tap", confirm: "wait" } });
  await page.goto("/");
  await ready(page);
  await hearNext(page, "four possibilities");
  await mic(page).evaluate((el) => el.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 })));
  await settle(page);
  await expect(waiting(page)).toBeVisible();
  await expect(page.locator("#vfield .vsr")).toContainText("Four possibilities");
  await mic(page).evaluate((el) => el.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 })));
  await expect(page.locator("#cin")).toBeVisible();   // the relation is taken
});

test("the field and its strip show a ring for a keyboard that tabs, inside their edges", async ({ page }) => {
  await voice(page, { settings: { read: "1", answer: "tap" } });
  await page.goto("/");
  await ready(page);
  await page.keyboard.press("Tab");   // a Tab turns the rings on
  await mic(page).focus();
  await expect(mic(page)).toHaveCSS("outline-offset", "-4px");
  await expect(mic(page)).toHaveCSS("outline-style", "solid");
  await speaker(page).focus();
  await expect(speaker(page)).toHaveCSS("outline-offset", "-4px");
});
