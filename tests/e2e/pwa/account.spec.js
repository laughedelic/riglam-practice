// The optional account in the installed app: a passkey to sign in with and a server copy of the documents (docs/SERVER.md).
// The server is the Worker itself on a fake database (tests/support/server-bridge.js) and the passkeys are Chromium's virtual
// authenticator, so the ceremonies, the cookie rules and the sync run for real; only the network and the biometrics are stood in for.
import { test, expect } from "../../support/test.js";
import { ready, overflow } from "../../support/page.js";
import { dataKey, KEY_STORE, withCourse } from "../../support/data-key.js";
import { bridge, serverWorld, virtualAuthenticator } from "../../support/server-bridge.js";

const openOptions = (page) => page.getByRole("button", { name: /options/i }).filter({ visible: true }).first().click();
const acct = (page) => page.locator(".acct");
const status = (page) => acct(page).locator(".onote[role=status]");

async function start(page, world) {
  const device = await bridge(page, world);
  const keys = await virtualAuthenticator(page);
  await page.goto("/");
  await ready(page);
  return { device, keys };
}

/** A second device of the same person: its own browser context (own storage), the same server. */
async function otherDevice(browser, testInfo, world, credentials, { withKey = true } = {}) {
  const context = await browser.newContext(testInfo.project.use);
  await context.addInitScript(([store, key]) => {
    try {
      if (key) localStorage.setItem(store, key);
    } catch { /* storage unavailable */ }
  }, [KEY_STORE, withCourse && withKey ? dataKey : null]);
  const page = await context.newPage();
  const device = await bridge(page, world);
  const keys = await virtualAuthenticator(page);
  await keys.add(credentials);
  await page.goto("/");
  await ready(page);
  return { context, page, device, keys };
}

const put = (page, col, id, doc) =>
  page.evaluate(async ([c, i, d]) => { await (await window.__riglam.platform.db()).collection(c).doc(i).set(d); }, [col, id, doc]);
const get = (page, col, id) =>
  page.evaluate(async ([c, i]) => { const s = await (await window.__riglam.platform.db()).collection(c).doc(i).get(); return s.exists ? s.data() : null; }, [col, id]);

const outboxKeys = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("riglam-sync");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const all = open.result.transaction("outbox").objectStore("outbox").getAllKeys();
          all.onsuccess = () => { open.result.close(); resolve(all.result); };
        };
      }),
  );

test("without accounts on the server the Options screen has no Account row", async ({ page }) => {
  await page.route("**/api/health", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, tutor: "off", accounts: "off" }) }));
  await page.goto("/");
  await ready(page);
  await openOptions(page);
  await expect(page.getByText("Your data", { exact: true })).toBeVisible();
  await expect(page.getByText("Account", { exact: true })).toHaveCount(0);
});

test("an account is made with a passkey and the documents follow the person to another device", async ({ page, browser }, testInfo) => {
  const world = await serverWorld();
  const { keys } = await start(page, world);
  await put(page, "labruns", "lr_before", { kind: "run", at: "2026-10-01T10:00:00.000Z" });

  await openOptions(page);
  await expect(acct(page)).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await acct(page).getByLabel("A name for the account").fill("Test person");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(acct(page)).toContainText("Signed in as Test person");
  await expect(acct(page)).toContainText("1 passkey");
  await expect(status(page).first()).toContainText("Up to date", { timeout: 15_000 });
  expect(await overflow(page)).toBeLessThanOrEqual(0);

  // what was on the device before the account is on the server
  expect(world.sql("SELECT col, id FROM docs")).toEqual([{ col: "labruns", id: "lr_before" }]);
  expect(world.sql("SELECT name FROM users")).toEqual([{ name: "Test person" }]);

  // a second device, with the same passkey (as a synced passkey would be), signs in and receives it
  const { page: other, context, device } = await otherDevice(browser, testInfo, world, await keys.credentials());
  await openOptions(other);
  await other.getByRole("button", { name: "Sign in" }).click();
  await expect(acct(other)).toContainText("Signed in as Test person");
  await expect(status(other).first()).toContainText("Up to date", { timeout: 15_000 });
  expect(await get(other, "labruns", "lr_before")).toMatchObject({ kind: "run" });

  // a change made later on the first device reaches the second one
  await put(page, "labruns", "lr_after", { kind: "run", at: "2026-10-13T10:00:00.000Z" });
  await expect.poll(() => world.sql("SELECT id FROM docs ORDER BY id").map((r) => r.id), { timeout: 15_000 }).toEqual(["lr_after", "lr_before"]);
  await other.getByRole("button", { name: "Sync now" }).click();
  await expect.poll(() => get(other, "labruns", "lr_after"), { timeout: 15_000 }).toMatchObject({ kind: "run" });
  expect(device.seen.filter((r) => r === "POST /api/sync").length).toBeGreaterThan(0);
  await context.close();
});

test("the account is still there after a reload, and signing out ends it", async ({ page }) => {
  const world = await serverWorld();
  await start(page, world);
  await openOptions(page);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(acct(page)).toContainText("Signed in as Practice");
  await page.reload();
  await ready(page);
  await openOptions(page);
  await expect(acct(page)).toContainText("Signed in as Practice");

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
  await expect(acct(page)).toContainText("Signed out");
  await page.reload();
  await ready(page);
  await openOptions(page);
  await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(acct(page)).toContainText("Signed in as Practice");
});

test("changes made without a connection wait and are sent when it returns", async ({ page }) => {
  const world = await serverWorld();
  const { device } = await start(page, world);
  await openOptions(page);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(status(page).first()).toContainText("Up to date", { timeout: 15_000 });

  device.offline = true;
  await put(page, "flags", "f_offline", { id: "f_offline", state: "new", updatedAt: "2026-10-13T10:00:00.000Z" });
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(status(page).first()).toContainText("No connection");
  await expect(status(page).first()).toContainText("1 change is waiting");
  expect(world.sql("SELECT id FROM docs")).toEqual([]);
  // the change is noted on the device, in the outbox database of its own
  expect(await outboxKeys(page)).toEqual(["flags/f_offline"]);

  device.offline = false;
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(status(page).first()).toContainText("Up to date");
  expect(world.sql("SELECT id FROM docs")).toEqual([{ id: "f_offline" }]);
  expect(await outboxKeys(page)).toEqual([]);
});

test("deleting the account removes the server copy and keeps the device's", async ({ page }) => {
  const world = await serverWorld();
  await start(page, world);
  await put(page, "flags", "f_keep", { id: "f_keep", state: "new", updatedAt: "2026-10-13T10:00:00.000Z" });
  await openOptions(page);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(status(page).first()).toContainText("Up to date", { timeout: 15_000 });
  expect(world.sql("SELECT id FROM docs")).toHaveLength(1);

  await page.getByRole("button", { name: "Delete account ..." }).click();
  await expect(page.getByRole("alert")).toContainText("deletes the account");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Delete account ..." }).click();
  await page.getByRole("button", { name: "Delete account", exact: true }).click();
  await expect(acct(page)).toContainText("Account deleted");
  expect(world.sql("SELECT * FROM users")).toEqual([]);
  expect(world.sql("SELECT * FROM docs")).toEqual([]);
  expect(await get(page, "flags", "f_keep")).toMatchObject({ state: "new" });
});

test("a person who closes the passkey dialog is told nothing was changed", async ({ page }) => {
  const world = await serverWorld();
  await start(page, world);
  await page.evaluate(() => {
    navigator.credentials.create = () => Promise.reject(new DOMException("closed", "NotAllowedError"));
  });
  await openOptions(page);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(acct(page)).toContainText("Cancelled. Nothing was changed.");
  expect(world.sql("SELECT * FROM users")).toEqual([]);
});

test.describe("the Magic Key follows the account", () => {
  test.skip(!withCourse, "needs the course data to unlock the definitions");

  test("a device that signs in without the key gets it from the account and opens unlocked", async ({ page, browser }, testInfo) => {
    const world = await serverWorld();
    const { keys } = await start(page, world);
    await openOptions(page);
    await acct(page).getByLabel("A name for the account").fill("Key person");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(acct(page)).toContainText("Signed in as Key person");
    await expect(acct(page)).toContainText("carries the Magic Key");
    expect(world.sql("SELECT has_key FROM users")).toEqual([{ has_key: 1 }]);

    const { page: other, context } = await otherDevice(browser, testInfo, world, await keys.credentials(), { withKey: false });
    expect(await other.evaluate(() => localStorage.getItem("riglam.magicKey"))).toBeNull();
    await openOptions(other);
    await other.getByRole("button", { name: "Sign in" }).click();
    // the page starts again with the key (polling, because the page navigates while it is asked)
    await expect.poll(() => other.evaluate(() => localStorage.getItem("riglam.magicKey")).catch(() => null), { timeout: 15_000 }).toBe(dataKey);
    await ready(other);
    await expect(other.locator("#unlock")).toHaveCount(0);
    await context.close();
  });
});
