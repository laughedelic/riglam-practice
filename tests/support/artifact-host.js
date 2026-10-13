// Serves the artifact build the way the Claude artifact frame would show it, for specs that compare it with the PWA:
// the same document skeleton, a stand-in `window.claude` (an empty `db`, no `sample`), and the page's Google Fonts
// answered from the local copies in src/pwa/fonts, so the comparison does not depend on the network.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { CLAUDE_MOCK } from "./claude-mock.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const fontsDir = resolve(root, "src/pwa/fonts");

const SKELETON_HEAD =
  '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}html{scroll-padding-top:env(safe-area-inset-top,0px)}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#fff;color:#000}img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>';

const EMPTY_DB = `<script>
const q=()=>{const s={orderBy:()=>s,limit:()=>s,where:()=>s,onSnapshot:f=>{setTimeout(()=>f({docs:[],size:0,empty:true}),10);return()=>{}},doc:()=>({set:async()=>{},delete:async()=>{},update:async()=>{}})};return s};
window.claude={use:async n=>n==='db'?{collection:q,doc:()=>q().doc()}:null};
</script>`;

/** `ai: true` swaps the empty stand-in for the mock of claude-mock.js: a `db` that keeps documents and a `sample` that answers. */
export function artifactDocument({ ai = false } = {}) {
  const page = readFileSync(resolve(root, "dist/artifact/index.html"), "utf8");
  return SKELETON_HEAD + (ai ? CLAUDE_MOCK : EMPTY_DB) + page + "</body></html>";
}

/** Routes the artifact document at http://artifact.test/ and the page's Google Fonts to local files. */
export async function routeArtifact(page, options) {
  const html = artifactDocument(options);
  const css = readFileSync(resolve(root, "src/pwa/fonts.css"), "utf8").replaceAll("url(./fonts/", "url(https://fonts.gstatic.com/local/");
  const files = new Set(readdirSync(fontsDir));
  await page.route("http://artifact.test/**", (r) => r.fulfill({ body: html, contentType: "text/html" }));
  await page.route("https://fonts.googleapis.com/**", (r) => r.fulfill({ body: css, contentType: "text/css" }));
  await page.route("https://fonts.gstatic.com/**", (r) => {
    const name = r.request().url().split("/").pop();
    return files.has(name) ? r.fulfill({ body: readFileSync(resolve(fontsDir, name)), contentType: "font/woff2" }) : r.abort();
  });
}

/** A fixed Math.random so both builds draw the same first pair. */
export const seedRandom = (seed = 12345) => {
  let s = seed;
  Math.random = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
};
