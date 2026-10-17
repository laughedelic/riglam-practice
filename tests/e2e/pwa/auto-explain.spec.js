// "Check every answer with AI" (Options, `rd-autoexplain`): a checked answer asks the app's server for its explanation without a tap on Explain.
// On by default. The server is a stand-in with routes, as in tutor.spec.js.
import { test as plain } from "@playwright/test";
import { test, expect } from "../../support/test.js";
import { ready, relOptions, isPhone } from "../../support/page.js";
import { serveCourse, withCourse } from "../../support/data-key.js";

const withKey = withCourse ? test : test.skip;

const sse = (...events) => events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
const ANSWER = sse({ type: "delta", text: "Stand-in tutor: " }, { type: "delta", text: "this is the stand-in answer." }, { type: "done", truncated: false });

async function server(page, tutor = [{ status: 200, body: ANSWER }]) {
  const asked = [];
  await page.route("**/api/health", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, tutor: "on" }) }));
  await page.route("**/api/tutor", (route) => {
    asked.push(route.request().postDataJSON());
    const reply = tutor[Math.min(asked.length - 1, tutor.length - 1)];
    return route.fulfill({ status: reply.status, contentType: reply.status === 200 ? "text/event-stream" : "application/json", body: reply.body });
  });
  return asked;
}

async function answerOnPhone(page) {
  await relOptions(page).first().click();
  for (let i = 0; i < 4 && (await page.locator("#cin").isVisible()); i++) {
    await page.fill("#cin", "thing " + (i + 1));
    await page.keyboard.press("Enter");
    await page.waitForTimeout(100);
  }
}
const explain = (page) => page.getByRole("button", { name: /^explain$|check and explain/i });
const discuss = (page) => page.getByRole("button", { name: /discuss with ai/i });
const toggle = (page) => page.getByRole("switch", { name: /check every answer with ai/i });

/** The page with the setting as given (null: never set, which is the default), the server, and one answer checked. */
async function answered(page, testInfo, { setting = null, tutor } = {}) {
  test.skip(!isPhone(testInfo), "the answer flow is exercised in the phone layout");
  // after the support script, which would otherwise start every page with the setting off
  await page.addInitScript((v) => (v === null ? localStorage.removeItem("rd-autoexplain") : localStorage.setItem("rd-autoexplain", v)), setting);
  const asked = await server(page, tutor);
  await page.goto("/");
  await ready(page);
  await answerOnPhone(page);
  return asked;
}

withKey("by default a checked answer asks for its explanation by itself, once, and there is no Explain button to tap", async ({ page }, testInfo) => {
  const asked = await answered(page, testInfo);
  await expect.poll(() => asked.length).toBe(1);
  expect(asked[0].kind).toBe("explain");
  await expect(discuss(page)).toBeVisible();
  await expect(explain(page)).toHaveCount(0);
  await discuss(page).click();
  await expect(page.getByLabel("Discuss with AI").getByText("this is the stand-in answer.")).toBeVisible();
  expect(asked).toHaveLength(1);
});

withKey("Options has the switch, on; turning it off makes the next answer wait for a tap on Explain", async ({ page }, testInfo) => {
  const asked = await answered(page, testInfo);
  await expect.poll(() => asked.length).toBe(1);
  await page.getByRole("button", { name: "Options" }).first().click();
  await expect(toggle(page)).toHaveAttribute("aria-checked", "true");
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute("aria-checked", "false");
  expect(await page.evaluate(() => localStorage.getItem("rd-autoexplain"))).toBe("0");
  await page.getByRole("button", { name: /close options/i }).first().click();
  await page.getByRole("button", { name: /next pair/i }).click();
  await ready(page);
  await answerOnPhone(page);
  await expect(explain(page)).toBeVisible();
  await page.waitForTimeout(500);
  expect(asked).toHaveLength(1);
  await explain(page).click();
  await expect.poll(() => asked.length).toBe(2);
});

withKey("with the setting off nothing is asked until Explain is tapped", async ({ page }, testInfo) => {
  const asked = await answered(page, testInfo, { setting: "0" });
  await expect(explain(page)).toBeVisible();
  await page.waitForTimeout(500);
  expect(asked).toHaveLength(0);
});

withKey("an explanation that could not be had by itself leaves Explain to try again", async ({ page }, testInfo) => {
  const asked = await answered(page, testInfo, { tutor: [{ status: 503, body: JSON.stringify({ error: { code: "unavailable", message: "x" } }) }, { status: 200, body: ANSWER }] });
  await expect.poll(() => asked.length).toBe(1);
  await expect(page.getByText(/could not answer just now/i)).toBeVisible();
  await explain(page).click();
  await expect.poll(() => asked.length).toBe(2);
  await expect(discuss(page)).toBeVisible();
});

plain("a reader without the Magic Key is not asked for it: the grayed Explain stays and nothing is sent", async ({ page }, testInfo) => {
  plain.skip(!isPhone(testInfo), "the answer flow is exercised in the phone layout");
  await serveCourse(page);
  const asked = await server(page);
  await page.goto("/");
  await ready(page);
  await answerOnPhone(page);
  await expect(page.getByRole("button", { name: /^explain$/i })).toHaveAttribute("aria-disabled", "true");
  await page.waitForTimeout(500);
  expect(asked).toHaveLength(0);
  await expect(page.locator("#unlock")).toHaveCount(0);
});
