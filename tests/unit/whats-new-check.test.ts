// The rule that a pull request changing what a learner sees adds an entry to What's new (scripts/lib/whats-new-check.mjs, run by .github/workflows/whats-new.yml).
import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { asksForEntry, checkWhatsNew, saysNone, whatsNewLine } from "../../scripts/lib/whats-new-check.mjs";
import { root } from "../../scripts/lib/course-files.mjs";

const news = "src/app/news.ts";

test("only feat: and fix: titles are asked for an entry", () => {
  for (const t of ["feat: a thing", "fix: a thing", "feat(path): a thing", "fix!: a thing", "Feat: a thing"]) expect(asksForEntry(t), t).toBe(true);
  for (const t of ["chore: a thing", "docs: a thing", "test: a thing", "ci: a thing", "chore(main): release 0.23.0", "refactor: a thing"]) expect(asksForEntry(t), t).toBe(false);
});

test("an entry in news.ts, or a reason in the body, settles it", () => {
  const base = { title: "feat: something", body: "Before:\n\nAfter:", files: ["src/app/path/roadmap.tsx"] };
  expect(checkWhatsNew(base), "no entry and no reason").toMatch(/src\/app\/news\.ts/);
  expect(checkWhatsNew({ ...base, files: [...base.files, news] })).toBeNull();
  expect(checkWhatsNew({ ...base, body: "How:\n\nWhat's new: none, a fix under the hood" })).toBeNull();
  expect(checkWhatsNew({ ...base, title: "chore: tidy" })).toBeNull();
});

test("'none' needs a reason", () => {
  expect(saysNone("What's new: none")).toBe(false);
  expect(saysNone("What's new: none, ")).toBe(false);
  expect(saysNone("What's new: none - the tools only")).toBe(true);
  expect(saysNone("text\nwhat’s new: None, internal\nmore")).toBe(true);
  expect(saysNone("The What's new entry is in news.ts")).toBe(false);
  expect(saysNone(null)).toBe(false);
});

test("the workflow runs on edits too, and passes the script what it needs", () => {
  const w = readFileSync(`${root}/.github/workflows/whats-new.yml`, "utf8");
  expect(w).toMatch(/types: \[[^\]]*\bedited\b[^\]]*\]/);
  expect(w).toMatch(/fetch-depth: 0/);
  for (const k of ["PR_TITLE", "PR_BODY", "BASE_SHA", "HEAD_SHA"]) expect(w).toContain(k + ":");
});

test("whatsNewLine reads the line a pull request prepared, and nothing for none or the placeholder", () => {
    expect(whatsNewLine("Before: x\n\nWhat's new: The update line shines less often.\n")).toBe("The update line shines less often.");
    expect(whatsNewLine("What's new: none, internal")).toBeNull();
    expect(whatsNewLine("What's new: (one line for the learner)")).toBeNull();
    expect(whatsNewLine(null)).toBeNull();
});
