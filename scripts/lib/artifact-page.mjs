// Compares a published artifact page with a build of this repo (`npm run artifact:verify`). A page is an HTML fragment:
// a build comment, <title> and font links, one <style>, the markup, one <script>. The Artifact tool may wrap it in a
// document skeleton when the page is read back, so the fragment is cut out first.

const BUILD_COMMENT = /^<!--\s*riglam-practice [^]*?-->\s*/;

/** The fragment of `html` from <title> to the end of the last </script>, without the build comment (it names the commit). */
export function pageFragment(html) {
  const text = String(html).replace(BUILD_COMMENT, "");
  const start = text.indexOf("<title>");
  const end = text.lastIndexOf("</script>");
  if (start < 0 || end < 0) throw new Error("not an artifact page: no <title> or no closing </script>");
  return text.slice(start, end + "</script>".length).trim();
}

/** The four parts of a fragment: head, style, markup and script. */
export function pageParts(fragment) {
  const s0 = fragment.indexOf("<style>");
  const s1 = fragment.indexOf("</style>");
  const j0 = fragment.indexOf("<script>", s1);
  if (s0 < 0 || s1 < 0 || j0 < 0) throw new Error("not an artifact page: expected one <style> and one <script>");
  return {
    head: fragment.slice(0, s0).trim(),
    style: fragment.slice(s0, s1 + "</style>".length),
    markup: fragment.slice(s1 + "</style>".length, j0).trim(),
    script: fragment.slice(j0),
  };
}

/** Where two texts first differ, with some text around it; null when they are equal. */
export function firstDifference(a, b, around = 60) {
  if (a === b) return null;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const cut = (t) => t.slice(Math.max(0, i - around), i + around).replace(/\s+/g, " ");
  return { at: i, published: cut(a), build: cut(b) };
}

/** Compares a published page with a build, part by part. */
export function comparePages(published, build) {
  const a = pageParts(pageFragment(published));
  const b = pageParts(pageFragment(build));
  const parts = Object.keys(a).map((name) => ({ name, same: a[name] === b[name], difference: firstDifference(a[name], b[name]), publishedChars: a[name].length, buildChars: b[name].length }));
  return { same: parts.every((p) => p.same), parts };
}
