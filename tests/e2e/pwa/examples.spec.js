// The course's reference examples in the installed app: fetched in the background once the Magic Key fits, kept on the device under
// their own version, read into the page at the start and again when a newer copy arrives, and left alone without the key. The server is a
// stand-in (tests/support/data-key.js) that serves a few invented examples.
import { test, expect } from "@playwright/test";
import { dataKey, KEY_STORE, serveCourse } from "../../support/data-key.js";
import { ready } from "../../support/page.js";

// lets the spec read the page's state without asking the build for it again
const hook = () => { window.__riglamTest = (t) => { window.__t = t; }; };
const exampleNames = (page) => page.evaluate(() => (window.__t.EX ? window.__t.EX.items.map((i) => i.n) : null));
const kept = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("riglam.examples") ?? "null"));
const withKey = async (page) => page.addInitScript(([store, key]) => { try { localStorage.setItem(store, key); } catch { /* storage unavailable */ } }, [KEY_STORE, dataKey]);

const part = (version, names) => ({
  version,
  part: { format: "riglam-examples-device", version: 2, sources: {}, items: names.map((n) => ({ n, cls: ["Color"], lv: 1, cf: "confirmed", s: [] })) },
});

test.beforeEach(async ({ page }) => { await page.addInitScript(hook); });

test("with the key the examples are fetched in the background, kept on the device and read into the page", async ({ page }) => {
  await withKey(page);
  const calls = await serveCourse(page, dataKey, { stub: true, examples: part("e1", ["a vemo lake", "a kipa stone"]) });
  await page.goto("/");
  await ready(page);
  await expect.poll(() => exampleNames(page)).toEqual(["a vemo lake", "a kipa stone"]);
  expect((await kept(page)).version).toBe("e1");
  expect(calls.examples.map((c) => c.fits)).toEqual([true]);
});

test("a later visit reads the kept copy at once, asks whether it is current, and takes a newer copy without a reload", async ({ page }) => {
  await withKey(page);
  const first = await serveCourse(page, dataKey, { stub: true, examples: part("e1", ["a vemo lake"]) });
  await page.goto("/");
  await ready(page);
  await expect.poll(() => exampleNames(page)).toEqual(["a vemo lake"]);

  const held = await serveCourse(page, dataKey, { stub: true, examples: part("e1", ["a vemo lake"]) });
  await page.goto("/?again=1");
  await ready(page);
  expect(await exampleNames(page), "the kept copy is read at the start, before the server answers").toEqual(["a vemo lake"]);
  await expect.poll(() => held.examples.map((c) => c.have)).toEqual(["e1"]);
  expect(first.examples).toHaveLength(1);

  const newer = await serveCourse(page, dataKey, { stub: true, examples: part("e2", ["a vemo lake", "a new pot"]) });
  await page.goto("/?again=2");
  await ready(page);
  await expect.poll(() => exampleNames(page)).toEqual(["a vemo lake", "a new pot"]);
  expect((await kept(page)).version).toBe("e2");
  expect(newer.examples.map((c) => c.have)).toEqual(["e1"]);
});

test("a server without examples leaves the page as it was", async ({ page }) => {
  await withKey(page);
  const calls = await serveCourse(page, dataKey, { stub: true });
  await page.goto("/");
  await ready(page);
  await expect.poll(() => calls.examples.length).toBe(1);
  expect(await exampleNames(page)).toBeNull();
  expect(await kept(page)).toBeNull();
});

test("without the key nothing is asked and the page has no examples", async ({ page }) => {
  const calls = await serveCourse(page, dataKey, { examples: part("e1", ["a vemo lake"]) });
  await page.goto("/");
  await ready(page);
  await page.waitForTimeout(500);
  expect(calls.examples).toEqual([]);
  expect(await exampleNames(page)).toBeNull();
});
