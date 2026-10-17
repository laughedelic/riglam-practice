// The layout of the page at a matrix of window sizes, in the states where text is longest and boxes are tightest: the question, the
// answers, the result with each of its chips, the explanation with the notes it opens, the debate from its questions to its result,
// Blitz, Options, Review. After each step the page is scanned (tests/support/layout-scans.js): nothing may pass the window edge, a
// container that clips or scrolls sideways, or leave a control without room for its focus ring. A finding names the size, the flow, the
// step and the element. These specs replace the legacy scans (scanx3, sweep63, scan47, scan48, ring).
//
// The page is the artifact build with the mock `window.claude` of tests/support/claude-mock.js (the explanation needs `sample`; the PWA
// has none). The first pair is drawn from a seeded Math.random, so a size always shows the same pairs and a finding can be repeated;
// motion is reduced so that no step is scanned halfway through a slide.
import { test as base, expect } from "@playwright/test";
import { routeArtifact, seedRandom } from "../../support/artifact-host.js";
import { relOptions } from "../../support/page.js";
import { scanPage } from "../../support/layout-scans.js";

// The widths at which the layout changes (360, 520 and 1100 px) and the ones around them, from the narrowest phone to a laptop.
const SIZES = [[320, 640], [360, 740], [390, 844], [430, 932], [521, 900], [768, 1024], [1099, 800], [1100, 800], [1280, 800]];
const ORDER = { mi: 0, "3ab": 1, "3ba": 2, 4: 3, con: 4 };
// the cells a relation fills by itself (the learner answers the other ones)
const IMPLIED = { mi: ["anb", "bna"], con: ["both"], "3ab": ["anb"], "3ba": ["bna"], 4: [] };
const LONG = "a very long example phrase that goes on and on ";
const CLAUDE_REPLY = "Both: a clay pot fits.\nNeither: a stone is B, not A.\nCommon locus: yes, a clay pot, which is long enough to wrap over several lines on a narrow phone.\nPervasion: whatever is A is B.\nMisconception: none.";

const test = base.extend({
  seed: [1, { option: true }],
  wideFields: [0, { option: true }],
  /** the page, started, and a `check(step)` that scans it and keeps what it finds */
  screen: async ({ page, seed, wideFields }, use) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(seedRandom, seed);
    await page.addInitScript((reply) => {
      window.__riglamTest = (t) => { window.__t = t; };
      window.__reply = reply;
      try { localStorage.setItem("rd-lab", "0"); localStorage.setItem("rd-autoexplain", "0"); } catch { /* storage unavailable */ }
    }, CLAUDE_REPLY);
    await routeArtifact(page, { ai: true });
    await page.goto("http://artifact.test/");
    await page.waitForFunction(() => window.__t && window.__t.cur);
    await page.evaluate(() => document.fonts.ready);

    const findings = [];
    const wide = await page.evaluate(() => matchMedia("(min-width:1100px)").matches);
    const settle = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await settle();
    const check = async (step) => {
      await settle();
      const found = await page.evaluate(scanPage, { wideFields });
      if (found.length) findings.push(`${step}: ${found.join(" | ")}`);
    };
    await use({ page, wide, check, settle });
    expect(errors, "uncaught errors in the page").toEqual([]);
    expect(findings, "layout findings").toEqual([]);
  },
});

/** Clicks the relation the pair has and returns it. */
async function pickRelation(page) {
  const rel = await page.evaluate(() => window.__t.cur.p.relation);
  await relOptions(page).nth(ORDER[rel]).click();
  return rel;
}

/** Gives every cell an example (a field per cell on a wide screen, one cell at a time on a phone) and ends with the result on screen. */
async function answerAll({ page, wide, check, settle }, rel, text) {
  if (wide) {
    const ids = await page.locator(".cell input:not([disabled])").evaluateAll((a) => a.map((x) => x.id));
    for (const id of ids) await page.fill("#" + id, text);
    await check("cells filled");
    await page.click("#stage .actions .btn:not(.ghost):not(.fav)");
  } else {
    const n = 4 - IMPLIED[rel].length;
    for (let i = 0; i < n; i++) {
      if (i === 0) await check("first cell");
      await page.fill("#cin", text + i);
      await page.keyboard.press("Enter");
      await settle();
    }
  }
  await expect(page.locator(".vchip").first()).toBeVisible();
}

/** Opens every chip of the result in turn (on a wide screen they are in the coach panel, on a phone under the table). */
async function eachChip({ page, wide, check }, label) {
  const chips = page.locator((wide ? ".coach" : "#stage") + " .vchip");
  for (let i = 0, n = await chips.count(); i < n; i++) {
    if ((await chips.nth(i).getAttribute("aria-selected")) !== "true") await chips.nth(i).click();
    await check(`${label} chip ${i}`);
  }
}

const tab = (page, name) => page.getByRole("tab", { name }).filter({ visible: true }).first();

const FLOWS = {
  async "practice, answer and result"(s) {
    const { page, check } = s;
    await check("question");
    const rel = await pickRelation(page);
    await check("relation picked");
    await answerAll(s, rel, LONG);
    await check("result");
    await eachChip(s, "result");
    const toggle = page.locator(".tm-tog");
    if (await toggle.count()) { await toggle.click(); await check("terms with definitions"); }
  },

  async "practice, explanation and its notes"(s) {
    const { page, wide, check } = s;
    const rel = await pickRelation(page);
    await answerAll(s, rel, LONG);
    await page.locator((wide ? ".coach" : "#stage") + ' button:has-text("xplain")').first().click();
    await page.waitForFunction(() => window.__sampleDone >= 1);
    await check("explained");
    const notes = page.locator(".grid .qm");
    for (let i = 0, n = await notes.count(); i < n; i++) { await notes.nth(i).click(); await check(`note ${i}`); }
    await page.keyboard.press("Escape");
    const why = page.locator(".rq");
    if (await why.count()) { await why.click(); await check("what the relation means"); await page.keyboard.press("Escape"); }
  },

  async "debate, questions and result"(s) {
    const { page, wide, check, settle } = s;
    await tab(page, "Pervasions").click();
    await check("first question");
    const card = page.locator(".qcard");
    await card.locator(".btn").first().click(); // question 1: accept
    await settle();
    await check("second question");
    await card.locator(".btn.ghost").click(); // question 2: ask why, which asks for an example
    await check("example field");
    await page.fill("#dex", LONG + "and on and on");
    await page.keyboard.press("Enter");
    await settle();
    await card.locator(".btn").first().click(); // question 3: accept
    await settle();
    await card.locator(".btn").first().click(); // question 4: accept
    await check("relation step");
    await relOptions(page).first().click();
    await expect(page.locator(".vchip").first()).toBeVisible();
    await check("debate result");
    const chips = page.locator((wide ? ".coach" : "#stage") + " .vchip");
    for (let i = 0, n = await chips.count(); i < n; i++) {
      if ((await chips.nth(i).getAttribute("aria-selected")) !== "true") await chips.nth(i).click();
      await check(`debate chip ${i}`);
      const rows = page.locator((wide ? ".coach" : "#stage") + " .qs");
      if (await rows.count()) {
        for (const k of [0, 3]) { await rows.nth(k).click(); await check(`debate chip ${i}, question ${k + 1}`); }
      }
    }
  },

  async "Blitz, Options and Review"(s) {
    const { page, wide, check } = s;
    // Review shows an empty note until there is history, so first leave an answer, a favorite and a skipped pair (F, Enter, S on the keyboard)
    await answerAll(s, await pickRelation(page), LONG);
    await page.keyboard.press("f");
    await page.keyboard.press("Enter");
    await page.keyboard.press("s");
    await tab(page, "Pervasions").click();
    const blitz = page.locator("#mbz, .actions .bz").filter({ visible: true }).first();
    if (await blitz.count()) {
      await blitz.click();
      await check("Blitz on");
      const seconds = page.locator(".trow .tval");
      if (await seconds.count()) { await seconds.click(); await check("Blitz seconds being edited"); await page.keyboard.press("Escape"); }
      await blitz.click();
    }
    await page.locator("#mopt, #obtn").filter({ visible: true }).first().click();
    await check("Options");
    await page.keyboard.press("Escape");
    await tab(page, "Review").click();
    if (wide) {
      await expect(page.locator(".rev3 .rcol")).toHaveCount(3);
      await check("Review");
    } else {
      // Overview, Mistakes, Favorites and Skipped
      const sections = page.locator(".rseg button");
      await expect(sections).toHaveCount(4);
      for (let i = 0; i < 4; i++) { await sections.nth(i).click(); await check(`Review, ${await sections.nth(i).innerText()}`); }
    }
  },
};

// Which pairs each flow runs on, and whether it also runs with the text fields made wide. A pair changes the lengths of the terms and the
// number of cells; wide fields only matter where a field is on screen.
const RUNS = {
  "practice, answer and result": [{ seed: 1 }, { seed: 2 }, { seed: 1, wideFields: 45 }],
  "practice, explanation and its notes": [{ seed: 3 }, { seed: 3, wideFields: 45 }],
  "debate, questions and result": [{ seed: 1 }, { seed: 1, wideFields: 45 }],
  "Blitz, Options and Review": [{ seed: 1 }],
};

for (const [w, h] of SIZES) {
  test.describe(`${w}x${h}`, () => {
    const phone = w < 500;
    test.use({ viewport: { width: w, height: h }, isMobile: phone, hasTouch: phone, colorScheme: "light" });
    for (const [name, flow] of Object.entries(FLOWS)) {
      for (const run of RUNS[name]) {
        test.describe(`pair ${run.seed}${run.wideFields ? ", wide fields" : ""}`, () => {
          test.use(run);
          test(name, async ({ screen }) => { await flow(screen); });
        });
      }
    }
  });
}
