// Review lists the learner's flags on what Claude said, each with the exercise it was made on (review/flag-list.js),
// and a mistake opens to show its exercise too (review/exercise.js). The answer and the flags are written to the device's
// database before the page starts, so the test does not depend on which pair the page draws.
import { test, expect } from "../../support/test.js";
import { ready } from "../../support/page.js";
import { giveKey } from "../../support/data-key.js";

const at = "2026-10-14T09:00:00.000Z";
const answer = {
  pairId: "r-test1", a: "round things", b: "wooden things", catA: "round", catB: "wooden", chosen: "con", key: "4", correct: false, grade: "bad",
  cells: {
    both: { text: "", none: true, verdict: "bad" },
    anb: { text: "a ball", none: false, verdict: "ok" },
    bna: { text: "a wooden table", none: false, verdict: "ok", by: "claude" },
    nei: { text: "a thought", none: false, verdict: "ok" },
  },
  at,
  pair: { id: "r-test1", a: "round things", b: "wooden things", catA: "round", catB: "wooden", relation: "4", ex: { both: "a wooden bowl", anb: "a ball", bna: "a wooden table", nei: "a thought" }, why: {} },
  explain: "Both: nothing given, but a wooden bowl is both.\nCommon locus: yes, a wooden bowl.",
};
const flags = {
  fl_cell: {
    id: "fl_cell", caseKey: "answers_r-test1", thing: "", part: "explain", model: "", runId: null, n: "both",
    shown: "nothing given, but a wooden bowl is both.", note: "A bowl can be square.", suggest: "a round wooden bowl",
    pair: { a: "round things", b: "wooden things", relation: "4", tab: "practice" }, at, updatedAt: at, state: "new",
  },
  fl_chat: {
    id: "fl_chat", caseKey: "answers_r-test1", thing: "", part: "chat", model: "", runId: null, n: "3",
    shown: "A thought is round in shape.", asked: "Is a thought round?", note: "A thought has no shape.", suggest: "",
    pair: { a: "round things", b: "wooden things", relation: "4", tab: "practice" }, at: "2026-10-14T09:05:00.000Z", updatedAt: "2026-10-14T09:05:00.000Z", state: "new",
  },
};

async function openReview(page) {
  await giveKey(page); // flagging needs the Magic Key, also in a run without the course data
  await page.goto("/");
  await ready(page);
  await page.evaluate(async ({ answer, flags }) => {
    const db = await window.__riglam.platform.db();
    await db.collection("answers").doc(answer.pairId).set(answer);
    for (const [id, f] of Object.entries(flags)) await db.collection("flags").doc(id).set(f);
  }, { answer, flags });
  await page.reload();
  await ready(page);
  await page.getByRole("tab", { name: /review/i }).filter({ visible: true }).first().click();
  const seg = page.locator(".rseg button", { hasText: /^Flags/ });
  if (await seg.count()) await seg.click(); // a phone shows one part of Review at a time
}
const flagsSection = (page) => page.locator(".section", { has: page.locator(".label", { hasText: /^Flags/ }) });
const item = (page, text) => flagsSection(page).locator(".flags > li", { hasText: text });

test("Review lists the flags, newest first, each with what it is on", async ({ page }) => {
  await openReview(page);
  await expect(flagsSection(page).locator(".label .hint")).toHaveText("2 flagged");
  const summaries = flagsSection(page).locator(".flags > li > details > summary");
  await expect(summaries).toHaveCount(2);
  await expect(summaries.nth(0)).toContainText("Claude’s answer in the chat · Not reviewed yet");
  await expect(summaries.nth(1)).toContainText("round things / wooden things");
  await expect(summaries.nth(1)).toContainText("Claude’s note on Both");
});

test("a flag opens to show what Claude said, the note and the exercise it was made on", async ({ page }) => {
  await openReview(page);
  const li = item(page, "Claude’s note on Both");
  await li.locator("summary").first().click();
  const body = li.locator(".fbody");
  await expect(body.locator(".fsaid")).toContainText("a wooden bowl is both");
  await expect(body).toContainText("Your note: A bowl can be square.");
  await expect(body).toContainText("It should be: a round wooden bowl");
  await expect(body).toContainText("Relation: Four possibilities. You chose mutually exclusive.");
  await expect(body.locator(".grid .cell")).toHaveCount(4);
  await expect(body.locator(".grid .cell.v-bad")).toContainText("Reference: a wooden bowl.");
  await expect(body.locator(".grid .cell", { hasText: "a wooden table" })).toContainText("Checked by Claude.");
  await body.locator(".xexp summary").click();
  await expect(body.locator(".xexp .ans")).toContainText("Common locus: yes, a wooden bowl.");
  // the learner's question comes with a flag on an answer in the chat
  const chat = item(page, "Claude’s answer in the chat");
  await chat.locator("summary").first().click();
  await expect(chat.locator(".fsaid .q")).toHaveText("Is a thought round?");
  // the check lab's marks are for the artifact, where the lab runs
  await expect(body.getByRole("button", { name: "Reviewed" })).toHaveCount(0);
});

test("a flag can be edited and deleted from Review", async ({ page }) => {
  await openReview(page);
  const li = item(page, "Claude’s note on Both");
  await li.locator("summary").first().click();
  await li.getByRole("button", { name: "Edit" }).click();
  await expect(page.locator("#flag-note")).toHaveValue("A bowl can be square.");
  await page.locator("#flag-note").fill("A bowl need not be round.");
  await page.locator(".flagedit").getByRole("button", { name: "Submit" }).click();
  await expect(li.locator(".fbody")).toContainText("Your note: A bowl need not be round.");
  const stored = () => page.evaluate(async () => {
    const db = await window.__riglam.platform.db();
    return Object.fromEntries((await db.collection("flags").get()).docs.map((d) => [d.id, d.data()]));
  });
  await expect.poll(async () => (await stored()).fl_cell?.note).toBe("A bowl need not be round.");
  expect((await stored()).fl_cell.at).toBe(at);
  await li.getByRole("button", { name: "Delete" }).click();
  await expect(flagsSection(page).locator(".flags > li")).toHaveCount(1);
  await expect.poll(async () => Object.keys(await stored())).toEqual(["fl_chat"]);
});

test("a mistake opens to show the exercise as it was checked", async ({ page }) => {
  await openReview(page);
  const seg = page.locator(".rseg button", { hasText: /^Mistakes/ });
  if (await seg.count()) await seg.click();
  const li = page.locator(".mist > li", { hasText: "round things / wooden things" });
  await li.locator("summary").first().click();
  await expect(li.locator(".grid .cell")).toHaveCount(4);
  await expect(li).toContainText("You chose mutually exclusive.");
  await expect(li.getByRole("button", { name: "Practice this pair" })).toBeVisible();
});
