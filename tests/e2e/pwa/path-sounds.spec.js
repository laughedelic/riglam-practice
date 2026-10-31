// The sounds of the app (src/app/sound) in the page: the Sounds switch in Settings (on from the start, kept on the device, a sample when it is turned on), and the moments that
// have a sound on the way through a question: the station taken with a mouse, the verdict when the result lands, the next question. What each sound is made of, how long it lasts and
// when one may play is tests/unit/sounds.test.ts; here the real audio context is wrapped so that the spec can tell which sound was scheduled, by the pitch of its first note.
import { test, expect } from "../../support/test.js";
import { seedRandom } from "../../support/artifact-host.js";
import { goTo } from "../../support/page.js";

/** The first note of each sound, in Hz, as the wrapped audio context sees it (src/app/sound/courtyard.ts: the wood starts a tenth above its pitch and falls to it). */
const FIRST = { 726: "right", 572: "partly", 330: "wrong", 1375: "next", 990: "knock", 392: "definition", 550: "stage", 2600: "claude", 770: "timeup" };

const init = () => {
  window.__snd = []; window.__ctxs = 0;
  const Real = window.AudioContext;
  let open = false;
  window.AudioContext = class extends Real {
    constructor(...a) { super(...a); window.__ctxs++; }
    createOscillator() {
      const o = super.createOscillator();
      if (!open) {
        open = true; queueMicrotask(() => { open = false; });   // the first oscillator of a sound says which sound it is
        const set = o.frequency.setValueAtTime.bind(o.frequency);
        o.frequency.setValueAtTime = (v, t) => { window.__snd.push(Math.round(v)); o.frequency.setValueAtTime = set; return set(v, t); };
      }
      return o;
    }
  };
};
const heard = (page) => page.evaluate((names) => window.__snd.map((f) => names[f] || f), FIRST);
const choices = (page) => page.locator("#path .chs .crow");

async function start(page) {
  await page.addInitScript(seedRandom);   // the same pairs each time: a verdict is heard only where the page can judge the examples (not "right so far, examples unchecked")
  await page.addInitScript(init);
  await page.goto("/");
  await expect(choices(page)).toHaveCount(5);
}
/** The examples of a pair written and the Check taken (a mouse click on the station): the result is on screen. */
async function toResult(page) {
  await start(page);
  await choices(page).first().click();
  const field = page.locator("#cin");
  await expect(field).toBeVisible();
  for (let i = 0; i < 4 && (await field.isVisible()); i++) { await field.fill("thing " + (i + 1)); if ((await field.getAttribute("enterkeyhint")) === "done") { await field.blur(); break; } await field.press("Enter"); }
  await page.locator("#stn").click();
  await expect(page.locator(".pvline")).toBeVisible();
  await expect(page.locator("#stn")).toContainText("Next pair");
}
async function openSettings(page) {
  await page.locator(".tstn").click();
  await page.locator(".road .rfoot").getByRole("button", { name: "Settings" }).click();
  await expect(page.locator(".ppage .ptitle")).toHaveText("Settings");
}
const sounds = (page) => page.getByRole("switch", { name: "Sounds", exact: true });

test("through a question: the station knocks under a mouse, the verdict sounds as the result lands, and the next question has its own sound", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await toResult(page);
  await expect.poll(() => heard(page)).toHaveLength(2);
  const [knock, verdict] = await heard(page);
  expect(knock, "the Check was taken with a mouse").toBe("knock");
  expect(["right", "partly", "wrong"], "then the verdict").toContain(verdict);
  await page.waitForTimeout(400);
  expect(await heard(page), "typing, choosing and the scan made no sound, and the verdict sounded once").toHaveLength(2);
  await page.locator("#stn").click();
  await expect.poll(() => heard(page)).toHaveLength(4);
  expect((await heard(page)).slice(2), "taking Next knocks, and the question that comes in sounds").toEqual(["knock", "next"]);
  expect(errors).toEqual([]);
});

test("a finger has its vibration in the hand and no knock: the station taken by touch is silent, the verdict is not", async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(PointerEvent.prototype, "pointerType", { get: () => "touch", configurable: true }); });
  await toResult(page);
  await expect.poll(() => heard(page)).toHaveLength(1);
  expect(["right", "partly", "wrong"]).toContain((await heard(page))[0]);
});

test("Sounds is a switch in Settings: on from the start, a sample when it is turned on, kept on this device when it is turned off", async ({ page }) => {
  await start(page);
  await openSettings(page);
  await expect(sounds(page)).toHaveAttribute("aria-checked", "true");
  await sounds(page).click();
  await expect(sounds(page)).toHaveAttribute("aria-checked", "false");
  expect(await page.evaluate(() => localStorage.getItem("rd-sounds"))).toBe("0");
  expect(await heard(page), "turning them off makes no sound").toEqual([]);
  await page.reload();
  await expect(choices(page)).toHaveCount(5);
  await openSettings(page);
  await expect(sounds(page), "kept").toHaveAttribute("aria-checked", "false");
  await sounds(page).click();
  await expect(sounds(page)).toHaveAttribute("aria-checked", "true");
  expect(await page.evaluate(() => localStorage.getItem("rd-sounds"))).toBe("1");
  await expect.poll(() => heard(page)).toEqual(["right"]);
});

test("with the switch off nothing is played and no audio context is even made", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("rd-sounds", "0"));
  await toResult(page);
  await page.locator("#stn").click();
  await expect(page.locator(".pvline")).toBeHidden();
  await page.waitForTimeout(400);
  expect(await heard(page)).toEqual([]);
  expect(await page.evaluate(() => window.__ctxs)).toBe(0);
});

test("a Pervasions question that runs out of time plays the time-up sound, as every other countdown does", async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem("rd-blitz", "1"); localStorage.setItem("rd-timer-q", "2000"); localStorage.setItem("rd-timer-rel", "60000"); });
  await page.addInitScript(init);
  await page.goto("/");
  await expect(choices(page)).toHaveCount(5);
  await goTo(page, "Pervasions");
  await expect.poll(() => heard(page), { timeout: 6000 }).toContain("timeup");
});
