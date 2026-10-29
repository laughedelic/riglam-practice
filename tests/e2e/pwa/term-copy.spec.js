// A term underlined in the tutor's note is a span with role "button", and every button is user-select: none (01-base.css), so the text of the
// term was left out when a learner copied a note ("its  is black"). This needs no definitions: the page's own rule is checked on markup like termMark's.
import { test, expect } from "@playwright/test";

test("an underlined term is copied with the text around it", async ({ page }) => {
  await page.goto("/");
  const copied = await page.evaluate(() => {
    const p = document.createElement("p");
    p.id = "term-copy";
    p.innerHTML = 'It follows it is a black thing, because its <span class="dterm" role="button" tabindex="0">color</span> is black.';
    document.body.append(p);
    const range = document.createRange();
    range.selectNodeContents(p);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    return sel.toString();
  });
  expect(copied).toBe("It follows it is a black thing, because its color is black.");
});
