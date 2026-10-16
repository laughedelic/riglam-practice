// A learner's flag goes to the app's server, if the device has the Magic Key (src/pwa/reports.ts, worker/reports.ts): at Submit, and
// at the start for flags that were not sent; an edit sends it again, Delete takes it back. A device without the key cannot flag:
// Edit is greyed and opens the Magic Key prompt, as Explain does. The server is the Worker itself on a fake database (tests/support/server-bridge.js).
import { test as plain } from "@playwright/test";
import { test, expect } from "../../support/test.js";
import { ready } from "../../support/page.js";
import { giveKey } from "../../support/data-key.js";
import { bridge, serverWorld } from "../../support/server-bridge.js";

const at = "2026-10-14T09:00:00.000Z";
const answer = {
  pairId: "r-test1", a: "round things", b: "wooden things", catA: "round", catB: "wooden", chosen: "con", key: "4", correct: false, grade: "bad",
  cells: { both: { text: "", none: true, verdict: "bad" }, anb: { text: "a ball", none: false, verdict: "ok" }, bna: { text: "a wooden table", none: false, verdict: "ok" }, nei: { text: "a thought", none: false, verdict: "ok" } },
  at, pair: { id: "r-test1", a: "round things", b: "wooden things", catA: "round", catB: "wooden", relation: "4", ex: { both: "a wooden bowl", anb: "a ball", bna: "a wooden table", nei: "a thought" }, why: {} },
  explain: "Both: nothing given, but a wooden bowl is both.",
};
const flag = {
  id: "fl_cell", caseKey: "answers_r-test1", thing: "", part: "explain", model: "", runId: null, n: "both",
  shown: "nothing given, but a wooden bowl is both.", note: "A bowl can be square.", suggest: "",
  pair: { a: "round things", b: "wooden things", relation: "4", tab: "practice" }, at, updatedAt: at, state: "new",
};

const reports = (world) => world.sql("SELECT device, id, user_id, flag, answer FROM flag_reports ORDER BY id");
const stored = (page) => page.evaluate(async () => Object.fromEntries((await (await window.__riglam.platform.db()).collection("flags").get()).docs.map((d) => [d.id, d.data()])));

/** Opens the page on the world, puts the answer and the flag on the device, and opens Review's Flags. */
async function start(page, world) {
  const device = await bridge(page, world);
  await seed(page);
  return device;
}
async function seed(page) {
  await page.goto("/");
  await ready(page);
  await page.evaluate(async ({ answer, flag }) => {
    const db = await window.__riglam.platform.db();
    await db.collection("answers").doc(answer.pairId).set(answer);
    await db.collection("flags").doc(flag.id).set(flag);
  }, { answer, flag });
  await page.reload();
  await ready(page);
}
async function openFlags(page) {
  await page.getByRole("tab", { name: /review/i }).filter({ visible: true }).first().click();
  const seg = page.locator(".rseg button", { hasText: /^Flags/ });
  if (await seg.count()) await seg.click(); // a phone shows one part of Review at a time
  const li = page.locator(".section", { has: page.locator(".label", { hasText: /^Flags/ }) }).locator(".flags > li").first();
  await li.locator("summary").first().click();
  return li;
}

test("a flag that was not sent goes at the start, with its exercise; Edit sends it again and Delete takes it back", async ({ page }) => {
  await giveKey(page);
  const world = await serverWorld({}, { stubCourse: true });
  await start(page, world);
  await expect.poll(() => reports(world).length).toBe(1);
  const [row] = reports(world);
  expect(row).toMatchObject({ id: "fl_cell", user_id: null });
  expect(JSON.parse(row.flag).note).toBe("A bowl can be square.");
  expect(JSON.parse(row.answer).explain).toContain("a wooden bowl is both");
  await expect.poll(async () => (await stored(page)).fl_cell.sentAt).toBeTruthy();
  expect((await stored(page)).fl_cell.updatedAt).toBe(at); // marking it sent does not count as an edit

  const li = await openFlags(page);
  await expect(li.locator("summary").first()).toContainText("Sent to the maintainer");
  await li.getByRole("button", { name: "Edit" }).click();
  await expect(li.locator(".flagedit .fnote")).toHaveText("Submit sends this flag and the exercise it is on to the app’s maintainer.");
  await page.locator("#flag-note").fill("A bowl need not be round.");
  await page.locator(".flagedit").getByRole("button", { name: "Submit" }).click();
  await expect.poll(() => reports(world).map((r) => JSON.parse(r.flag).note)).toEqual(["A bowl need not be round."]);
  await expect.poll(async () => { const f = (await stored(page)).fl_cell; return f.sentAt >= f.updatedAt && f.updatedAt > at; }).toBe(true);
  await expect(li.locator("summary").first()).toContainText("Sent to the maintainer");

  await li.getByRole("button", { name: "Delete" }).click();
  await expect.poll(() => reports(world)).toEqual([]);
});

test("a flag that could not be sent waits, says so, and goes when the server is back", async ({ page }) => {
  await giveKey(page);
  const world = await serverWorld({}, { stubCourse: true });
  let down = true; // the server answers the health check, so the device knows it takes reports, but the reports do not get through
  await bridge(page, world);
  await page.route("**/api/flags", (route) => (down ? route.abort("connectionfailed") : route.fallback()));
  await seed(page);
  const li = await openFlags(page);
  await expect(li.locator("summary").first()).toContainText("Waiting to be sent");
  expect(reports(world)).toEqual([]);
  down = false;
  await page.reload();
  await ready(page);
  await expect.poll(() => reports(world).length).toBe(1);
});

plain("a device without the Magic Key cannot flag: Edit is greyed and opens the prompt, and nothing is sent", async ({ page }) => {
  const world = await serverWorld();
  const device = await start(page, world);
  const li = await openFlags(page);
  await expect(li.locator("summary").first()).toContainText("Not reviewed yet");
  const edit = li.getByRole("button", { name: "Edit" });
  await expect(edit).toHaveClass(/needs-key/);
  await expect(edit).toHaveAttribute("title", "Flagging needs the Magic Key");
  await edit.click();
  await expect(page.locator("#unlock")).toBeVisible();
  await expect(page.locator("#flag-note")).toHaveCount(0);
  expect(device.seen.filter((r) => r.includes("/api/flags"))).toEqual([]);
  expect(reports(world)).toEqual([]);
});
