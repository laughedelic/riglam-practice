import { test, expect } from "../../support/test.js";

test("the page declares an installable web app", async ({ page, request }) => {
  await page.goto("/");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toBeTruthy();
  const res = await request.get(new URL(href, page.url()).href);
  expect(res.ok()).toBe(true);
  const m = await res.json();

  expect(m.name).toBeTruthy();
  expect(m.short_name).toBeTruthy();
  expect(m.display).toBe("standalone");
  expect(m.start_url).toBeTruthy();
  const sizes = m.icons.map((i) => `${i.sizes}${i.purpose ? " " + i.purpose : ""}`);
  expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512", "512x512 maskable"]));
  for (const icon of m.icons) {
    const r = await request.get(new URL(icon.src, new URL(href, page.url())).href);
    expect(r.ok(), icon.src).toBe(true);
    expect(r.headers()["content-type"]).toContain("image/png");
  }
  expect((await request.get(new URL("sw.js", page.url()).href)).ok()).toBe(true);
});

test("the head matches the artifact frame and the phone", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /viewport-fit=cover/);
  await expect(page.locator('meta[name="theme-color"]')).toHaveCount(2);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  await expect(page).toHaveTitle("Riglam practice");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /path of reasoning/);
});
