// What's new (src/app/news.ts): the learner's list of changes, and which of them a device has not shown yet.
import { expect, test } from "vitest";
import { NEWS, buildLine, buildWords, comingNews, newsSince, type NewsItem } from "../../src/app/news";

const list: NewsItem[] = [{ id: "c", title: "C", text: "" }, { id: "b", title: "B", text: "" }, { id: "a", title: "A", text: "" }];

test("the items above the last one shown are new, newest first", () => {
  expect(newsSince("a", list).map((n) => n.id)).toEqual(["c", "b"]);
  expect(newsSince("c", list)).toEqual([]);
});

test("a device that has shown nothing, or an item no longer listed, has nothing new (no backlog)", () => {
  expect(newsSince(null, list)).toEqual([]);
  expect(newsSince("gone", list)).toEqual([]);
});

test("every entry has a unique id, a title and words for the learner, without pull request numbers or file names", () => {
  expect(NEWS.length).toBeGreaterThan(0);
  expect(new Set(NEWS.map((n) => n.id)).size).toBe(NEWS.length);
  for (const n of NEWS) {
    expect(n.id).toMatch(/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/);
    expect(n.title.length).toBeGreaterThan(0);
    expect(n.text.length).toBeGreaterThan(20);
    expect(n.text + n.title, n.id).not.toMatch(/#\d+|\.tsx?\b|\.js\b|\bPR\b/);
  }
  const ids = NEWS.map((n) => n.id.slice(0, 10));
  expect([...ids].sort().reverse(), "newest first").toEqual(ids);
});

test("a version that waits: plain words in the app, its version, build and pull requests on a Preview", () => {
  expect(buildWords(null)).toBe("New version ready");
  expect(buildWords({ version: "0.21.4", commit: "ce48d24aa", pulls: [{ number: 197 }, { number: 204 }] })).toBe("v0.21.4 · ce48d24 · #197 #204");
  expect(buildWords({ version: null, commit: "ce48d24", pulls: [] })).toBe("ce48d24");
});

test("what a version that waits brings: its items above the newest this build has", () => {
  const remote = [{ id: "e", title: "E", text: "" }, { id: "d", title: "D", text: "" }, ...list];
  expect(comingNews(remote, list).map((n) => n.id)).toEqual(["e", "d"]);
  expect(comingNews(list, list)).toEqual([]);
  expect(comingNews(undefined, list)).toEqual([]);
  expect(comingNews([{ id: "z", title: "Z", text: "" }], list)).toEqual([]);   // nothing in common: the list cannot be trusted to be newer
});

test("a Preview's line says what the build is made of and offers a look, which says so while it runs", () => {
  const own = { version: "0.23.0", commit: "ce48d24aa", pulls: [{ number: 206 }, { number: 207 }] };
  expect(buildLine("current", own)).toEqual({ text: "v0.23.0 · ce48d24 · #206 #207", label: "Check", act: "check" });
  expect(buildLine("unknown", { ...own, pulls: null })).toEqual({ text: "v0.23.0 · ce48d24", label: "Try again", act: "check" });
  expect(buildLine("checking", own)).toMatchObject({ label: "Checking…", act: null });
  expect(buildLine("downloading", own).act).toBeNull();
});
