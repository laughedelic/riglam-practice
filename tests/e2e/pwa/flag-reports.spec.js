// A learner's flag goes to the app's server, if the device has the Magic Key (src/pwa/reports.ts, worker/reports.ts): at Submit, and
// at the start for flags that were not sent; an edit sends it again, Delete takes it back. A device without the key cannot flag:
// Edit is greyed and opens the Magic Key prompt, as Explain does. The server is the Worker itself on a fake database (tests/support/server-bridge.js).
import { test as plain } from "@playwright/test";
import { test, expect } from "../../support/test.js";
import { ready } from "../../support/page.js";
import { dataKey, giveKey } from "../../support/data-key.js";
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

/**
 * Makes the first write of a flag document that has `field` wait until `window.__held.release()` and then fail as a passing storage fault does ("unavailable"), so that the
 * page's retry (put, practice/answers.js) comes after whatever the test does meanwhile. `window.__held.tried` counts the writes of flags with that field. Call before the page starts.
 */
async function holdWrite(page, field) {
  await page.addInitScript((field) => {
    const patch = (db) => {
      const real = db.collection.bind(db);
      const held = (window.__held = { tried: 0, release: () => {} });
      let first = true;
      db.collection = (name) => {
        const col = real(name);
        if (name !== "flags") return col;
        return new Proxy(col, {
          get(target, prop) {
            const v = Reflect.get(target, prop);
            if (prop !== "doc") return typeof v === "function" ? v.bind(target) : v;
            return (id) =>
              new Proxy(target.doc(id), {
                get(ref, p) {
                  const w = Reflect.get(ref, p);
                  if (p !== "set") return typeof w === "function" ? w.bind(ref) : w;
                  return (doc) => {
                    if (!doc[field]) return w.call(ref, doc);
                    held.tried++;
                    if (!first) return w.call(ref, doc);
                    first = false;
                    return new Promise((_, reject) => { held.release = () => reject({ code: "unavailable" }); });
                  };
                },
              });
          },
        });
      };
    };
    Object.defineProperty(window, "__riglam", {
      configurable: true,
      set(v) {
        Object.defineProperty(window, "__riglam", { value: v, writable: true, configurable: true });
        v.platform.db().then(patch);
      },
    });
  }, field);
}

/**
 * Makes the first deletion of a flag document fail as a storage fault does ("unavailable"), so that the page undoes the removal. Call before the page starts.
 */
async function failDelete(page) {
  await page.addInitScript(() => {
    const patch = (db) => {
      const real = db.collection.bind(db);
      let first = true;
      db.collection = (name) => {
        const col = real(name);
        if (name !== "flags") return col;
        return new Proxy(col, {
          get(target, prop) {
            const v = Reflect.get(target, prop);
            if (prop !== "doc") return typeof v === "function" ? v.bind(target) : v;
            return (id) =>
              new Proxy(target.doc(id), {
                get(ref, p) {
                  const w = Reflect.get(ref, p);
                  if (p !== "delete") return typeof w === "function" ? w.bind(ref) : w;
                  return () => {
                    if (!first) return w.call(ref);
                    first = false;
                    return Promise.reject({ code: "unavailable" });
                  };
                },
              });
          },
        });
      };
    };
    Object.defineProperty(window, "__riglam", {
      configurable: true,
      set(v) {
        Object.defineProperty(window, "__riglam", { value: v, writable: true, configurable: true });
        v.platform.db().then(patch);
      },
    });
  });
}

/** Opens the page on the world, puts the answer and the flag on the device, and opens Review's Flags. */
async function start(page, world, doc = flag) {
  const device = await bridge(page, world);
  await seed(page, doc);
  return device;
}
async function seed(page, doc = flag) {
  await page.goto("/");
  await ready(page);
  await page.evaluate(async ({ answer, flag }) => {
    const db = await window.__riglam.platform.db();
    await db.collection("answers").doc(answer.pairId).set(answer);
    await db.collection("flags").doc(flag.id).set(flag);
  }, { answer, flag: doc });
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

/** Holds the first upload of a flag until `release()`; `asked` notes every request to the server about flags, in the order they were made. */
async function holdFirstUpload(page) {
  const asked = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let held = false;
  await page.route("**/api/flags", async (route) => {
    const body = route.request().postDataJSON();
    asked.push(body.send ? "send" : body.withdraw ? "withdraw" : "other");
    if (body.send && !held) { held = true; await gate; }
    return route.fallback();
  });
  return { asked, release };
}
const pause = (page, ms = 400) => page.evaluate((t) => new Promise((resolve) => setTimeout(resolve, t)), ms);

test("an edit made while the earlier upload is on its way goes after it, so the server ends with the newer words", async ({ page }) => {
  await giveKey(page);
  const world = await serverWorld({}, { stubCourse: true });
  await start(page, world);
  await expect.poll(async () => (await stored(page)).fl_cell.sentAt).toBeTruthy();
  const hold = await holdFirstUpload(page);
  const li = await openFlags(page);
  for (const note of ["A bowl need not be round.", "A bowl is not a stove."]) {
    await li.getByRole("button", { name: "Edit" }).click();
    await page.locator("#flag-note").fill(note);
    await page.locator(".flagedit").getByRole("button", { name: "Submit" }).click();
    await expect(li.locator(".fbody")).toContainText("Your note: " + note);
  }
  await pause(page);
  expect(hold.asked).toEqual(["send"]); // the second upload waits for its turn
  hold.release();
  await expect.poll(() => reports(world).map((r) => JSON.parse(r.flag).note)).toEqual(["A bowl is not a stove."]);
  await expect.poll(async () => { const f = (await stored(page)).fl_cell; return f.sentAt >= f.updatedAt && f.note === "A bowl is not a stove."; }).toBe(true);
  expect(hold.asked).toEqual(["send", "send"]);
});

test("a flag deleted while its upload is on its way is taken back after the upload, not brought back by it", async ({ page }) => {
  await giveKey(page);
  const world = await serverWorld({}, { stubCourse: true });
  await start(page, world);
  await expect.poll(async () => (await stored(page)).fl_cell.sentAt).toBeTruthy();
  const hold = await holdFirstUpload(page);
  const li = await openFlags(page);
  await li.getByRole("button", { name: "Edit" }).click();
  await page.locator("#flag-note").fill("A bowl need not be round.");
  await page.locator(".flagedit").getByRole("button", { name: "Submit" }).click();
  await expect.poll(() => hold.asked.length).toBe(1); // the upload of the edit, held
  await li.getByRole("button", { name: "Delete" }).click();
  await pause(page);
  expect(hold.asked).toEqual(["send"]); // the removal waits for it
  hold.release();
  await expect.poll(() => hold.asked.filter((a) => a === "withdraw").length).toBe(1);
  await pause(page);
  expect(reports(world)).toEqual([]);
});

test("the write of the sent mark, tried again after a storage fault, does not put the old flag back over an edit made meanwhile", async ({ page }) => {
  await giveKey(page);
  const world = await serverWorld({}, { stubCourse: true });
  await holdWrite(page, "sentAt");
  await start(page, world);
  await expect.poll(() => reports(world).length).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__held.tried)).toBe(1); // the mark of the start's upload is held
  const li = await openFlags(page);
  await li.getByRole("button", { name: "Edit" }).click();
  await page.locator("#flag-note").fill("A bowl need not be round.");
  await page.locator(".flagedit").getByRole("button", { name: "Submit" }).click();
  await expect(li.locator(".fbody")).toContainText("Your note: A bowl need not be round.");
  await page.evaluate(() => window.__held.release()); // the held write fails; the page tries it again
  await expect.poll(() => page.evaluate(() => window.__held.tried)).toBeGreaterThanOrEqual(2);
  await pause(page);
  expect((await stored(page)).fl_cell.note).toBe("A bowl need not be round.");
  await expect.poll(async () => { const f = (await stored(page)).fl_cell; return f.sentAt >= f.updatedAt; }).toBe(true);
  expect(reports(world).map((r) => JSON.parse(r.flag).note)).toEqual(["A bowl need not be round."]);
});

test("a flag deleted while the device could not reach the server's reports is taken back when it can", async ({ page }) => {
  await giveKey(page);
  const world = await serverWorld({}, { stubCourse: true });
  const device = await start(page, world);
  await expect.poll(() => reports(world).length).toBe(1);
  await expect.poll(async () => (await stored(page)).fl_cell.sentAt).toBeTruthy();
  device.offline = true; // the start finds no server, so the page has no way to take the report back now
  await page.reload();
  await ready(page);
  const li = await openFlags(page);
  await li.getByRole("button", { name: "Delete" }).click();
  await expect.poll(async () => Object.keys(await stored(page))).toEqual([]);
  expect(reports(world).length).toBe(1);
  device.offline = false;
  await page.reload();
  await ready(page);
  await expect.poll(() => reports(world)).toEqual([]);
});

test("the removal of a flag is kept on the device at once, while an upload ahead of it is still on its way", async ({ page }) => {
  await giveKey(page);
  const world = await serverWorld({}, { stubCourse: true });
  await start(page, world);
  await expect.poll(async () => (await stored(page)).fl_cell.sentAt).toBeTruthy();
  const hold = await holdFirstUpload(page);
  const li = await openFlags(page);
  await li.getByRole("button", { name: "Edit" }).click();
  await page.locator("#flag-note").fill("A bowl need not be round.");
  await page.locator(".flagedit").getByRole("button", { name: "Submit" }).click();
  await expect.poll(() => hold.asked.length).toBe(1); // the upload of the edit, held
  await li.getByRole("button", { name: "Delete" }).click();
  await expect.poll(async () => Object.keys(await stored(page))).toEqual([]);
  // the page may be closed now: the removal is already on the device, and the next start sends it
  await expect.poll(() => page.evaluate(() => localStorage.getItem("riglam.flagsToWithdraw"))).toContain("fl_cell");
  expect(hold.asked).toEqual(["send"]);
  hold.release();
  await expect.poll(() => hold.asked.filter((a) => a === "withdraw").length).toBe(1);
  await expect.poll(() => reports(world)).toEqual([]);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("riglam.flagsToWithdraw"))).toBeNull();
});

test("a flag whose deletion fails is undone, and its report stays on the server", async ({ page }) => {
  await giveKey(page);
  const world = await serverWorld({}, { stubCourse: true });
  const device = await bridge(page, world);
  await failDelete(page);
  await seed(page);
  await expect.poll(() => reports(world).length).toBe(1);
  await expect.poll(async () => (await stored(page)).fl_cell.sentAt).toBeTruthy();
  const li = await openFlags(page);
  await pause(page);
  const asked = device.seen.filter((r) => r.includes("/api/flags")).length;
  await li.getByRole("button", { name: "Delete" }).click();
  await expect(page.locator(".status", { hasText: "could not be saved" })).toBeVisible();
  await pause(page);
  expect(Object.keys(await stored(page))).toEqual(["fl_cell"]);
  expect(device.seen.filter((r) => r.includes("/api/flags")).length).toBe(asked); // nothing took the report back
  expect(reports(world).length).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem("riglam.flagsToWithdraw"))).toBeNull();
  await expect(li.locator("summary").first()).toContainText("Sent to the maintainer");
});

test("a flag edited on a device whose clock is ahead is marked sent, and is not uploaded again and again", async ({ page }) => {
  await giveKey(page);
  const world = await serverWorld({}, { stubCourse: true });
  const ahead = "2099-01-01T00:00:00.000Z";
  const device = await start(page, world, { ...flag, updatedAt: ahead });
  await expect.poll(() => reports(world).length).toBe(1);
  await expect.poll(async () => (await stored(page)).fl_cell.sentAt >= ahead).toBe(true);
  const uploads = () => device.seen.filter((r) => r.includes("/api/flags")).length;
  const before = uploads();
  await pause(page, 800);
  expect(uploads()).toBe(before); // marked sent, so nothing goes again
  expect((await stored(page)).fl_cell.updatedAt).toBe(ahead);
});

plain("a Magic Key entered in the prompt lets the waiting flag go without a reload", async ({ page }) => {
  const world = await serverWorld({}, { stubCourse: true });
  await start(page, world);
  const li = await openFlags(page);
  await expect(li.locator("summary").first()).toContainText("Not reviewed yet");
  await li.getByRole("button", { name: "Edit" }).click();
  await page.fill("#unlock-key", dataKey);
  await page.locator("#unlock").getByRole("button", { name: "Unlock", exact: true }).click();
  await expect.poll(() => reports(world).length).toBe(1);
  await expect(li.locator("summary").first()).toContainText("Sent to the maintainer");
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
