// The comparison behind `npm run artifact:verify`, on small made-up pages.
import { expect, test } from "vitest";
import { comparePages, firstDifference, pageFragment, pageParts } from "../../scripts/lib/artifact-page.mjs";

const page = (over: { comment?: string; style?: string; markup?: string; script?: string } = {}) =>
  `${over.comment ?? "<!-- riglam-practice 0.1.0 (abc1234), artifact build. -->"}
<title>Dudra practice</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">
<style>
${over.style ?? "body{margin:0}"}
</style>

${over.markup ?? '<div id="app"></div>'}

<script>
${over.script ?? "(function(){ start(); })();"}
</script>
`;

test("the fragment runs from the title to the last closing script tag", () => {
  const f = pageFragment(page());
  expect(f.startsWith("<title>")).toBe(true);
  expect(f.endsWith("</script>")).toBe(true);
  expect(f).not.toContain("riglam-practice 0.1.0");
});

test("a document skeleton around the page is ignored", () => {
  const wrapped = `<!doctype html><html><head><meta charset=utf8></head><body>${page({ comment: "" })}</body></html>`;
  expect(comparePages(wrapped, page()).same).toBe(true);
});

test("the build comment is ignored: a build of another commit is the same page", () => {
  expect(comparePages(page({ comment: "<!-- riglam-practice 0.2.0 (fffffff), artifact build. -->" }), page()).same).toBe(true);
});

test("the part that differs is named, with the place", () => {
  const r = comparePages(page({ script: "(function(){ start(1); })();" }), page());
  expect(r.same).toBe(false);
  expect(r.parts.filter((p) => !p.same).map((p) => p.name)).toEqual(["script"]);
  expect(r.parts.find((p) => p.name === "script")!.difference!.published).toContain("start(1)");
  expect(comparePages(page({ style: "body{margin:1px}" }), page()).parts.filter((p) => !p.same).map((p) => p.name)).toEqual(["style"]);
  expect(comparePages(page({ markup: "<main></main>" }), page()).parts.filter((p) => !p.same).map((p) => p.name)).toEqual(["markup"]);
});

test("text that is not a page is refused with a reason", () => {
  expect(() => pageFragment("<p>hello</p>")).toThrow(/not an artifact page/);
  expect(() => pageParts("<title>x</title><p>no style</p><script>1</script>")).toThrow(/one <style>/);
});

test("firstDifference is null for equal texts", () => {
  expect(firstDifference("abc", "abc")).toBeNull();
  expect(firstDifference("abc", "abd")!.at).toBe(2);
});
