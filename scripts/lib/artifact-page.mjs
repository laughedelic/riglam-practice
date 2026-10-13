// Compares a published artifact page with a build of this repo (`npm run artifact:verify`). A page is an HTML fragment:
// a build comment, <title> and font links, one <style>, the markup, one <script>. The Artifact tool may wrap it in a
// document skeleton when the page is read back, so the fragment is cut out first, and what was cut off is checked: only
// the skeleton's own tags may stand there, anything else is an edit of the published page.

const BUILD_COMMENT = /^<!--\s*riglam-practice [^]*?-->\s*/;

// What may stand around the fragment: whitespace, the doctype, the html, head and body tags, meta tags, a style element of the
// skeleton (the frame's ground rules) and comments. A script, a link, markup or text there is not part of the skeleton.
const SKELETON = /\s+|<!doctype[^>]*>|<\/?(?:html|head|body)(?:\s[^>]*)?>|<meta(?:\s[^>]*)?>|<style(?:\s[^>]*)?>[^]*?<\/style>|<!--[^]*?-->/iy;

/** The first text in `outside` that is not skeleton, or "" when there is none. */
export function foreignText(outside) {
  let i = 0;
  while (i < outside.length) {
    SKELETON.lastIndex = i;
    const m = SKELETON.exec(outside);
    if (!m || !m[0]) return outside.slice(i).trim().replace(/\s+/g, " ").slice(0, 120);
    i += m[0].length;
  }
  return "";
}

/** The page cut into the text before the <title>, the fragment (<title> to the end of the last </script>) and the text after it. */
export function splitPage(html) {
  const text = String(html).replace(BUILD_COMMENT, "");
  const start = text.indexOf("<title>");
  const end = text.lastIndexOf("</script>");
  if (start < 0 || end < 0) throw new Error("not an artifact page: no <title> or no closing </script>");
  return { before: text.slice(0, start), fragment: text.slice(start, end + "</script>".length).trim(), after: text.slice(end + "</script>".length) };
}

/** The fragment of `html` from <title> to the end of the last </script>, without the build comment (it names the commit). */
export function pageFragment(html) {
  return splitPage(html).fragment;
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

/** Compares a published page with a build, part by part; the text outside the fragment is the part "wrapper", which must be skeleton only. */
export function comparePages(published, build) {
  const pa = splitPage(published), pb = splitPage(build);
  const a = pageParts(pa.fragment);
  const b = pageParts(pb.fragment);
  const parts = Object.keys(a).map((name) => ({ name, same: a[name] === b[name], difference: firstDifference(a[name], b[name]), publishedChars: a[name].length, buildChars: b[name].length }));
  const fa = foreignText(pa.before) || foreignText(pa.after);
  const fb = foreignText(pb.before) || foreignText(pb.after);
  parts.push({ name: "wrapper", same: !fa && !fb, difference: fa || fb ? { at: 0, published: fa, build: fb } : null, publishedChars: fa.length, buildChars: fb.length });
  return { same: parts.every((p) => p.same), parts };
}
