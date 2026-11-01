// "Explanations by Claude" (the practice options of the exercise, `rd-autoexplain`): with Every answer, a checked answer asks the app's server for its explanation
// without a tap on Explain; by default Claude explains when asked. The server is a stand-in with routes, as in tutor.spec.js.
import { test as plain } from "@playwright/test";
import { test, expect } from "../../support/test.js";
import { answerFirst, explainChoice, ready } from "../../support/page.js";
import { serveCourse, withCourse } from "../../support/data-key.js";

const withKey = withCourse ? test : test.skip;

const sse = (...events) => events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
const ANSWER = sse({ type: "delta", text: "Stand-in tutor: " }, { type: "delta", text: "this is the stand-in answer." }, { type: "done", truncated: false });

async function server(page, tutor = [{ status: 200, body: ANSWER }]) {
  const asked = [];
  await page.route("**/api/health", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, tutor: "on" }) }));
  await page.route("**/api/tutor", async (route) => {
    asked.push(route.request().postDataJSON());
    const reply = tutor[Math.min(asked.length - 1, tutor.length - 1)];
    if (reply.delay) await new Promise((resolve) => setTimeout(resolve, reply.delay));
    return route.fulfill({ status: reply.status, contentType: reply.status === 200 ? "text/event-stream" : "application/json", body: reply.body });
  });
  return asked;
}

const explain = (page) => explainChoice(page);
const explanation = (page) => page.locator(".wtext");
const everyAnswer = (page) => page.getByRole("group", { name: "Explanations by Claude" }).getByRole("button", { name: "Every answer" });
const whenAsked = (page) => page.getByRole("group", { name: "Explanations by Claude" }).getByRole("button", { name: "When I ask" });

/** The page with the setting as given (null: never set, which is the default: Claude explains when asked), the server, and one answer checked. */
async function answered(page, { setting = "1", tutor } = {}) {
  // after the support script, which would otherwise start every page with the setting off
  await page.addInitScript((v) => (v === null ? localStorage.removeItem("rd-autoexplain") : localStorage.setItem("rd-autoexplain", v)), setting);
  const asked = await server(page, tutor);
  await page.goto("/");
  await ready(page);
  await answerFirst(page);
  return asked;
}

withKey("with Every answer a checked answer asks for its explanation by itself, once, and there is no Explain choice to take", async ({ page }) => {
  const asked = await answered(page);
  await expect.poll(() => asked.length).toBe(1);
  expect(asked[0].kind).toBe("explain");
  await expect(explanation(page)).toContainText("this is the stand-in answer.");
  await expect(explain(page)).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(asked).toHaveLength(1);
});

withKey("the practice options have the choice, on Every answer; When I ask makes the next answer wait for a tap on Explain", async ({ page }) => {
  const asked = await answered(page);
  await expect.poll(() => asked.length).toBe(1);
  await page.getByRole("button", { name: "Practice options" }).click();
  const sheet = page.getByRole("dialog", { name: "Practice options" });
  await expect(everyAnswer(page)).toHaveAttribute("aria-pressed", "true");
  await whenAsked(page).click();
  await expect(whenAsked(page)).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => localStorage.getItem("rd-autoexplain"))).toBe("0");
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await page.locator("#stn").click();
  await ready(page);
  await answerFirst(page);
  await expect(explain(page)).toBeVisible();
  await page.waitForTimeout(500);
  expect(asked).toHaveLength(1);
  await explain(page).click();
  await expect.poll(() => asked.length).toBe(2);
});

withKey("by default Claude explains when asked: Explain is there, and nothing is sent until it is taken", async ({ page }) => {
  const asked = await answered(page, { setting: null });
  await expect(explain(page)).toBeVisible();
  await page.waitForTimeout(500);
  expect(asked).toHaveLength(0);
  await explain(page).click();
  await expect.poll(() => asked.length).toBe(1);
  await expect(explanation(page)).toContainText("this is the stand-in answer.");
});

withKey("with When I ask set, nothing is asked until Explain is tapped", async ({ page }) => {
  const asked = await answered(page, { setting: "0" });
  await expect(explain(page)).toBeVisible();
  await page.waitForTimeout(500);
  expect(asked).toHaveLength(0);
});

withKey("an explanation that could not be had by itself leaves the Explanation row to try again", async ({ page }) => {
  const asked = await answered(page, { tutor: [{ status: 503, body: JSON.stringify({ error: { code: "unavailable", message: "x" } }) }, { status: 200, body: ANSWER }] });
  await expect.poll(() => asked.length).toBe(1);
  await expect(page.getByText(/could not answer just now/i)).toBeVisible();
  await page.getByRole("button", { name: /^Explanation/ }).click();   // the Explanation row asks again
  await expect.poll(() => asked.length).toBe(2);
  await expect(explanation(page)).toContainText("this is the stand-in answer.");
});

plain("a reader without the Magic Key is not asked for it: Explain says it needs the key and nothing is sent", async ({ page }) => {
  await serveCourse(page);
  await page.addInitScript(() => { localStorage.setItem("rd-start", "exercise"); localStorage.setItem("rd-autoexplain", "1"); });
  const asked = await server(page);
  await page.goto("/");
  await ready(page);
  await answerFirst(page);
  await expect(explain(page)).toContainText("needs the Magic Key");
  await page.waitForTimeout(500);
  expect(asked).toHaveLength(0);
  await expect(page.getByRole("textbox", { name: "Magic Key or link", exact: true }), "the Magic Key page did not open by itself").toHaveCount(0);
});

// The station has the focus when the answer is checked (a keyboard goes on from there). The explanation that starts by itself redraws the screen, twice: it
// must not take the focus away, as it would not if the learner had tapped Explain and stayed on the station.
withKey("the focus stays on the result's station while the explanation starts by itself and when it arrives", async ({ page }) => {
  const asked = await answered(page, { tutor: [{ status: 200, body: ANSWER, delay: 800 }] });
  const next = page.locator("#stn");
  await expect(next).toBeFocused();
  await expect.poll(() => asked.length).toBe(1);
  await page.waitForTimeout(100);
  await expect(next).toBeFocused(); // the explanation has started: the screen was drawn again
  await page.waitForTimeout(1000); // the explanation is in: drawn again
  await expect(explanation(page)).toContainText("this is the stand-in answer.");
  await expect(next).toBeFocused();
});
