// The layout of the page at a matrix of window sizes, in the states where text is longest and boxes are tightest: the question, the
// answers, the result with each of its chips, the explanation with the notes it opens, the debate from its questions to its result,
// Blitz, the menu, the practice options, Settings, Review. After each step the page is scanned (tests/support/layout-scans.js): nothing may pass the window edge, a
// container that clips or scrolls sideways, or leave a control without room for its focus ring. A finding names the size, the flow, the
// step and the element. These specs replace the legacy scans (scanx3, sweep63, scan47, scan48, ring).
//
// The page is the artifact build with the mock `window.claude` of tests/support/claude-mock.js (the explanation needs `sample`; the PWA
// has none). The first pair is drawn from a seeded Math.random, so a size always shows the same pairs and a finding can be repeated;
// motion is reduced so that no step is scanned halfway through a slide.
import { test as base, expect } from "@playwright/test";
import { routeArtifact, seedRandom } from "../../support/artifact-host.js";
import { goTo, openMenu, relOptions } from "../../support/page.js";
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
      try { localStorage.setItem("rd-autoexplain", "0"); } catch { /* storage unavailable */ }
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
    await check("first screen");
    await page.waitForFunction(() => window.__t.tab === "practice");
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
    await page.click("#stage .pbar .fwd");
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

/** Opens every chip of the result in turn (in the result, under the table). */
async function eachChip({ page, check }, label) {
  const chips = page.locator("#stage .vchip");
  for (let i = 0, n = await chips.count(); i < n; i++) {
    if ((await chips.nth(i).getAttribute("aria-selected")) !== "true") await chips.nth(i).click();
    await check(`${label} chip ${i}`);
  }
}


const FLOWS = {
  async "practice, answer and result"(s) {
    const { page, check } = s;
    await check("question");
    const rel = await pickRelation(page);
    await check("relation picked");
    await answerAll(s, rel, LONG);
    await check("result");
    await eachChip(s, "result");
    const mark = page.locator(".terms .dterm");
    if (await mark.count()) { await mark.first().click(); await check("terms with a definition open"); }
  },

  async "practice, explanation and its notes"(s) {
    const { page, check } = s;
    const rel = await pickRelation(page);
    await answerAll(s, rel, LONG);
    await page.locator('#stage .verdict .xpl').first().click();
    await page.waitForFunction(() => window.__sampleDone >= 1);
    await check("explained");
    const notes = page.locator(".grid .qm");
    for (let i = 0, n = await notes.count(); i < n; i++) { await notes.nth(i).click(); await check(`note ${i}`); }
    await page.keyboard.press("Escape");
    const why = page.locator(".rq");
    if (await why.count()) { await why.click(); await check("what the relation means"); await page.keyboard.press("Escape"); }
  },

  async "debate, questions and result"(s) {
    const { page, check, settle } = s;
    await goTo(page, "Pervasions");
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
    const chips = page.locator("#stage .vchip");
    for (let i = 0, n = await chips.count(); i < n; i++) {
      if ((await chips.nth(i).getAttribute("aria-selected")) !== "true") await chips.nth(i).click();
      await check(`debate chip ${i}`);
      const rows = page.locator("#stage .qs");
      if (await rows.count()) {
        for (const k of [0, 3]) { await rows.nth(k).click(); await check(`debate chip ${i}, question ${k + 1}`); }
      }
    }
  },

  async "find a pair, naming it, examples and result"(s) {
    const { page, wide, check } = s;
    await goTo(page, "Find a pair");
    await check("pair step");
    await page.getByRole("button", { name: "Choose relation" }).click();
    await check("relation picker");
    await page.locator(".rels .rel").filter({ hasText: "Three possibilities, A in B" }).click();
    // the learner's own long words: a pair the page cannot judge, so its result is open
    await page.fill("#fw-a", LONG + "a");
    await page.fill("#fw-b", LONG + "b");
    await check("pair named");
    await page.getByRole("button", { name: "Use this pair" }).click();
    const rel = await page.evaluate(() => window.__t.ui.rel);
    await answerAll(s, rel, LONG);
    await check("result, pair not judged");
    await eachChip(s, "find result");
    await page.locator('#stage .verdict .xpl').first().click();
    await page.waitForFunction(() => window.__sampleDone >= 1);
    await check("explained, no verdict on the pair");
    // a pair of the course data, asked for a relation it may not have: the result says which one it has
    await page.getByRole("button", { name: "Next relation" }).click();
    await page.fill("#fw-a", "forms");
    await page.fill("#fw-b", "minds");
    await page.getByRole("button", { name: "Use this pair" }).click();
    await answerAll(s, await page.evaluate(() => window.__t.ui.rel), LONG);
    await check("result, pair of the data");
    await eachChip(s, "find result");
    if (!wide) await page.getByRole("button", { name: "Next relation" }).click();
  },

  async "consequences, replies, counter-example and result"(s) {
    const { page, check, settle } = s;
    await goTo(page, "Consequences");
    await check("consequence");
    /** draws until the consequence has this situation (the right reply follows from it) */
    const draw = (n) => page.evaluate((sit) => { for (let i = 0; i < 600 && window.__t.cur.c.situation !== sit; i++) window.__t.next(); }, n);
    // a wrong reply: what was mixed up, with each chip
    await draw(8);
    await settle();
    await check("consequence, reason fails too");
    await page.locator(".cqask .cqsay").nth(2).click();
    await check("wrong reply");
    await eachChip(s, "wrong reply");
    await page.click("#stage .pbar .fwd");
    // a right "no pervasion": the counter-example step, then a result with the example in it
    await draw(3);
    await settle();
    await page.locator(".cqask .cqsay").nth(2).click();
    await check("counter-example step");
    await page.fill("#cqex", LONG + "and on and on");
    await page.keyboard.press("Enter");
    await expect(page.locator(".cqres")).toBeVisible();
    await check("result, counter-example not checked");
    await eachChip(s, "right reply");
    await page.click("#stage .pbar .fwd");
    // the other wording, and the options of the exercise
    await page.locator("#msess").click();
    await check("practice options, Consequences");
    await page.getByRole("button", { name: "Textbook" }).click();
    await page.keyboard.press("Escape");
    await check("textbook wording");
  },

  async "Blitz, the menu, options and Review"(s) {
    const { page, wide, check } = s;
    // Review shows an empty note until there is history, so first leave an answer, a favorite and a skipped pair (F, Next pair, S on the keyboard)
    await answerAll(s, await pickRelation(page), LONG);
    await page.keyboard.press("f");
    await page.click("#stage .pbar .fwd");
    await page.keyboard.press("s");
    await goTo(page, "Pervasions");
    const blitz = page.locator("#mbz");
    await blitz.click();
    await check("Blitz on");
    await blitz.click();
    await openMenu(page);
    await check("menu");
    if (!wide) await page.keyboard.press("Escape");
    await page.locator("#msess").click();
    await check("practice options");
    await page.getByRole("button", { name: "Blitz: details" }).click();
    await check("practice options, Blitz");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await goTo(page, "Settings");
    await check("Settings");
    await page.keyboard.press("Escape");
    await goTo(page, "Review");
    // Overview, Mistakes, Favorites and Skipped
    const sections = page.locator(".rseg button");
    await expect(sections).toHaveCount(4);
    for (let i = 0; i < 4; i++) { await sections.nth(i).click(); await check(`Review, ${await sections.nth(i).innerText()}`); }
  },
};

// Which pairs each flow runs on, and whether it also runs with the text fields made wide. A pair changes the lengths of the terms and the
// number of cells; wide fields only matter where a field is on screen.
const RUNS = {
  "practice, answer and result": [{ seed: 1 }, { seed: 2 }, { seed: 1, wideFields: 45 }],
  "practice, explanation and its notes": [{ seed: 3 }, { seed: 3, wideFields: 45 }],
  "debate, questions and result": [{ seed: 1 }, { seed: 1, wideFields: 45 }],
  "find a pair, naming it, examples and result": [{ seed: 1 }, { seed: 1, wideFields: 45 }],
  "consequences, replies, counter-example and result": [{ seed: 1 }, { seed: 1, wideFields: 45 }],
  "Blitz, the menu, options and Review": [{ seed: 1 }],
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
