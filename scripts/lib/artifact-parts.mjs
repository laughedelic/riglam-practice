// Splits a published artifact page (an HTML fragment: <title>, font links, <style>, markup, one <script>)
// into the parts the repo keeps as separate source files, and applies the seams that differ between the
// artifact and this repo. Used by `npm run artifact:import` and `artifact:drift`.
//
// Seams (everything else is the page's code, unchanged):
//   1. the page script is one IIFE; the repo keeps its body as an ES module (module scope replaces the IIFE);
//   2. the page's fetch("drill-data.json") becomes window.__riglam.fetchData(), provided by each build;
//   3. a test hook block at the end of app.js that the browser tests use to read internals. It belongs to the
//      repo's app.js, so an import keeps the block that is already there.

const DATA_FETCH = 'fetch("drill-data.json")';
const DATA_HOOK = "window.__riglam.fetchData()";

export const HOOK_BEGIN =
  "/* ---------- test hook (begin): lets the browser tests in tests/ read internals; inert unless a test defines window.__riglamTest ---------- */";
export const HOOK_END = "/* ---------- test hook (end) ---------- */";

// What the tests needed from the page when the repo was set up (page version 63). A new export for a test is
// added to the block in src/app/app.js itself.
const DEFAULT_HOOK_EXPORTS =
  "get cur(){return cur},get ui(){return ui},get tab(){return tab},get favs(){return favs},get mode(){return mode},get view(){return view},get optsOpen(){return optsOpen},favKey,refOf,render,choose,fbNode,defParts,termsNode,setDefLang,get defLang(){return defLang},get DATA(){return DATA},next,advance,get skips(){return skips},set skips(v){skips=v},skipPair,undoSkip,isSkipped,hiddenKeys,get POOL(){return POOL},nextGenerated,SKIP_DAYS,get lab(){return lab},setLab,labThings,get flags(){return flags},get labruns(){return labruns},labRuns,LAB_MODELS,labRef,labParse,flagId,labAgain,openFlag,saveFlag,removeFlag,setFlagState,get labPause(){return labPause},set labPause(v){labPause=v},get labSpotN(){return labSpotN},set labSpotN(v){labSpotN=v},labJudgeNow,aiCase,aiFlag,decorateAns";

export const DEFAULT_HOOK = `${HOOK_BEGIN}\nif(typeof window.__riglamTest==="function") window.__riglamTest({${DEFAULT_HOOK_EXPORTS}});\n${HOOK_END}`;

export class SplitError extends Error {}

function between(html, open, close, from = 0) {
  const a = html.indexOf(open, from);
  if (a < 0) throw new SplitError(`missing ${open}`);
  const b = html.indexOf(close, a + open.length);
  if (b < 0) throw new SplitError(`missing ${close}`);
  return { start: a, end: b + close.length, inner: html.slice(a + open.length, b) };
}

/** Separates the test hook block from an app.js text. */
export function extractHook(appJs) {
  const a = appJs.indexOf(HOOK_BEGIN);
  const b = appJs.indexOf(HOOK_END);
  if (a < 0 || b < a) return { body: appJs.replace(/\s+$/, ""), hook: null };
  return { body: appJs.slice(0, a).replace(/\s+$/, ""), hook: appJs.slice(a, b + HOOK_END.length) };
}

/**
 * @param {string} html the page exactly as published to the artifact
 * @param {{ hook?: string | null }} [opts] the test hook block to append (default: DEFAULT_HOOK)
 */
export function splitArtifact(html, opts = {}) {
  const style = between(html, "<style>", "</style>");
  const script = between(html, "<script>", "</script>", style.end);
  const head = html.slice(0, style.start).trim();
  const markup = html.slice(style.end, script.start).trim();
  const tail = html.slice(script.end).trim();
  if (tail) throw new SplitError(`unexpected content after the script: ${tail.slice(0, 80)}`);
  if (!/<title>[^<]+<\/title>/.test(head)) throw new SplitError("no <title> in the head part");

  const m = script.inner.trim().match(/^\(function\(\)\{\n([\s\S]*)\n\}\)\(\);$/);
  if (!m) throw new SplitError("the script is not a single (function(){ ... })(); block");
  const n = m[1].split(DATA_FETCH).length - 1;
  if (n !== 1) throw new SplitError(`expected one ${DATA_FETCH} in the script, found ${n}`);
  const body = m[1].replace(DATA_FETCH, DATA_HOOK).replace(/\s+$/, "");

  return {
    "src/artifact/head.html": head + "\n",
    "src/app/app.css": style.inner.replace(/^\n/, "").replace(/\s+$/, "") + "\n",
    "src/app/markup.html": markup + "\n",
    "src/app/app.js": `${body}\n\n${opts.hook ?? DEFAULT_HOOK}\n`,
  };
}

/** The reverse of the seams: the repo's app.js as the script text a published page holds, for drift checks. */
export function toPublishedScript(appJs) {
  return `(function(){\n${extractHook(appJs).body.replace(DATA_HOOK, DATA_FETCH)}\n})();`;
}
