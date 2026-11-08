// The link preview: the tags a chat or a forum reads from the page's head (scripts/lib/link-preview.mjs, put in the real app's page by vite.config.js) and the
// picture they name (public/link-preview.jpg, drawn by `npm run social`). A chat asks for the picture by its full address and some apps skip one over 300 KB.
import { expect, test } from "vitest";
import sharp from "sharp";
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { linkPreviewHead, PREVIEW_FILE, PREVIEW_SIZE, SITE_URL } from "../../scripts/lib/link-preview.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const content = (head: string, k: string) => new RegExp(`<meta (?:property|name)="${k}" content="([^"]*)">`).exec(head)?.[1];

test("the tags give the title, the line and the picture's full address, size and description, and ask for the large card", () => {
  const head = linkPreviewHead({ name: "Riglam practice", description: "Practice in logic and debate." });
  expect(content(head, "og:title")).toBe("Riglam practice");
  expect(content(head, "og:site_name")).toBe("Riglam practice");
  expect(content(head, "og:description")).toBe("Practice in logic and debate.");
  expect(content(head, "og:image")).toBe(`${SITE_URL}/link-preview.jpg`);
  expect(content(head, "og:image:type")).toBe("image/jpeg");
  expect([content(head, "og:image:width"), content(head, "og:image:height")]).toEqual(["1200", "600"]);
  expect(content(head, "og:image:alt")).toMatch(/^Riglam/);
  expect(content(head, "twitter:card")).toBe("summary_large_image");
});

test("a copy served elsewhere names its own address, with or without a slash at the end", () => {
  for (const site of ["https://example.org/riglam", "https://example.org/riglam/"]) {
    expect(content(linkPreviewHead({ name: "x", description: "y", site }), "og:image")).toBe("https://example.org/riglam/link-preview.jpg");
  }
});

test("words with quotes or angle brackets stay inside their attribute", () => {
  const head = linkPreviewHead({ name: 'A "quoted" <name>', description: "Dudra & Tarig" });
  expect(head).toContain('content="A &quot;quoted&quot; &lt;name>"');
  expect(head).toContain('content="Dudra &amp; Tarig"');
  expect(head.split("\n").every((l) => /^<meta [^<]*>$/.test(l))).toBe(true);
});

test("the picture is a 1200 x 600 JPEG under 300 KB, drawn from the 2:1 link preview of the repository's settings", async () => {
  const file = resolve(root, "public", PREVIEW_FILE);
  expect(existsSync(file)).toBe(true);
  const meta = await sharp(file).metadata();
  expect([meta.format, meta.width, meta.height]).toEqual(["jpeg", PREVIEW_SIZE.width, PREVIEW_SIZE.height]);
  expect(statSync(file).size).toBeLessThan(300 * 1024);
  const settings = JSON.parse(readFileSync(resolve(root, "scripts/social/settings.json"), "utf8"));
  expect(settings.linkPreview).toMatchObject({ from: "social-preview", file: "public/link-preview.jpg", width: PREVIEW_SIZE.width, height: PREVIEW_SIZE.height });
  expect(settings.images["social-preview"].height * 2).toBe(1280);
});
