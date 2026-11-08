// The built page tells a chat or a forum how to show a link to the app: title, line and a picture, named by a full address (src: scripts/lib/link-preview.mjs).
// The address is the real app's, so here the picture is fetched by its file name from the server under test.
import { test, expect } from "../../support/test.js";

test("the page names its link preview: title, line, a large card and a JPEG under 300 KB that the server has", async ({ page, request }) => {
  await page.goto("/");
  const meta = (k) => page.locator(`head meta[property="${k}"], head meta[name="${k}"]`).first().getAttribute("content");
  expect(await meta("og:title")).toBe(await page.title());
  expect(await meta("og:description")).toBe(await page.locator('head meta[name="description"]').getAttribute("content"));
  expect(await meta("twitter:card")).toBe("summary_large_image");
  const image = new URL((await meta("og:image")) ?? "");
  expect(image.protocol).toBe("https:");
  expect(image.pathname).toBe("/link-preview.jpg");
  const res = await request.get("/link-preview.jpg");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/jpeg");
  expect((await res.body()).length).toBeLessThan(300 * 1024);
});
