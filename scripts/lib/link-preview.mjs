// What a link to the app looks like when it is pasted into a chat or a forum post: the title, the one line and a picture (the tags the apps read: Open Graph, and
// Twitter's card, which others read too). The picture is public/link-preview.jpg, drawn by `npm run social` from the same drawing as the README hero (scripts/social,
// `linkPreview` in its settings). Chat apps ask for it by its full address, so the page names the address it is served at: the real app's by default,
// RIGLAM_SITE_URL for a copy served somewhere else. Only the real app's page carries these tags (vite.config.js): a Preview and the staging deploy have no
// preview picture of their own and none from the real app.
export const SITE_URL = "https://riglam-practice.laughedelic.workers.dev";
export const PREVIEW_FILE = "link-preview.jpg";
export const PREVIEW_SIZE = { width: 1200, height: 600 };
export const PREVIEW_ALT = "Riglam: the path of reasoning. Three diamonds, gold, blue and green, beside the name on a dark blue ground.";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** The meta tags for the page's head, one to a line. */
export function linkPreviewHead({ name, description, site = SITE_URL }) {
  const image = site.replace(/\/+$/, "") + "/" + PREVIEW_FILE;
  const tags = [
    ["property", "og:type", "website"],
    ["property", "og:site_name", name],
    ["property", "og:title", name],
    ["property", "og:description", description],
    ["property", "og:image", image],
    ["property", "og:image:type", "image/jpeg"],
    ["property", "og:image:width", PREVIEW_SIZE.width],
    ["property", "og:image:height", PREVIEW_SIZE.height],
    ["property", "og:image:alt", PREVIEW_ALT],
    ["name", "twitter:card", "summary_large_image"],
  ];
  return tags.map(([key, k, v]) => `<meta ${key}="${k}" content="${esc(v)}">`).join("\n");
}
