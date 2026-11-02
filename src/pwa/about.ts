// Which build of the app this is, and whether the server has a newer one (shown in Options). The build knows its own commit
// (vite.config.js); `build.json` next to the page is the build the server has now. It is not precached, so the service worker
// cannot answer for an old copy. A staging build also has `staging-build.json` (docs/STAGING.md) with the branches it was made from.
import type { About, StagingPull } from "../platform/types";

async function getJson(url: string, doFetch: typeof fetch, waitMs: number): Promise<Record<string, unknown> | null> {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), waitMs);
  try {
    const res = await doFetch(url, { cache: "no-store", signal: stop.signal });
    if (!res.ok) return null;
    const body = await res.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null; // offline, slow, or the address answers with a page (a dev server)
  } finally {
    clearTimeout(timer);
  }
}

type Item = { id: string; title: string; text: string };
const isItem = (n: unknown): n is Item => !!n && typeof n === "object" && ["id", "title", "text"].every((k) => typeof (n as Record<string, unknown>)[k] === "string");

/** The build the server has now (its commit, its version when it says one, and the newest items of its What's new), or null when it could not be asked. */
export async function latestBuild(doFetch: typeof fetch = (...a) => fetch(...a), waitMs = 4000): Promise<{ commit: string; version: string | null; news?: Item[] } | null> {
  const latest = await getJson("build.json", doFetch, waitMs);
  if (typeof latest?.commit !== "string") return null;
  const news = Array.isArray(latest.news) ? (latest.news as unknown[]).filter(isItem).map(({ id, title, text }) => ({ id, title, text })) : undefined;
  return { commit: latest.commit, version: typeof latest.version === "string" ? latest.version : null, ...(news ? { news } : {}) };
}

/** The pull requests a staging build was made from (`staging-build.json`, docs/STAGING.md), or null where there is no such file (the real app, a pull request's own preview). */
export async function stagingPulls(doFetch: typeof fetch = (...a) => fetch(...a), waitMs = 4000): Promise<StagingPull[] | null> {
  const s = await getJson("staging-build.json", doFetch, waitMs);
  if (!Array.isArray(s?.pulls)) return null;
  const out: StagingPull[] = [];
  for (const p of s.pulls as unknown[]) {
    if (!p || typeof p !== "object") continue;
    const { number, title, news } = p as { number?: unknown; title?: unknown; news?: unknown };
    if (typeof number !== "number") continue;
    out.push({ number, ...(typeof title === "string" ? { title } : {}), ...(typeof news === "string" ? { news } : {}) });
  }
  // the titles and bodies as they are now on GitHub (public repository; the staging file may be older than an edit, or made before it held them); the file's own stay when it cannot be asked
  await Promise.all(out.map(async (p) => {
    const got = await getJson(`https://api.github.com/repos/laughedelic/riglam-practice/pulls/${p.number}`, doFetch, waitMs);
    if (typeof got?.title === "string") p.title = got.title;
    if (got && "body" in got) p.news = whatsNewLine(typeof got.body === "string" ? got.body : "");
  }));
  return out;
}

/** The commit of the build the server has now, or null when it could not be asked. */
export async function latestCommit(doFetch: typeof fetch = (...a) => fetch(...a), waitMs = 4000): Promise<string | null> {
  return (await latestBuild(doFetch, waitMs))?.commit ?? null;
}

export async function aboutThisBuild(build: { version: string; commit: string; builtAt: string } = __BUILD__, doFetch: typeof fetch = (...a) => fetch(...a), waitMs = 4000): Promise<About> {
  const [latest, staging] = await Promise.all([getJson("build.json", doFetch, waitMs), getJson("staging-build.json", doFetch, waitMs)]);
  const there = typeof latest?.commit === "string" ? latest.commit : null;
  const branches = Array.isArray(staging?.branches) ? (staging.branches as unknown[]).filter((b): b is string => typeof b === "string") : undefined;
  return { ...build, latest: there === null ? "unknown" : there === build.commit ? "current" : "newer", branches: branches?.length ? branches : undefined };
}

/** The line a pull request prepared for learners: the text after "What's new:" in its body; null when there is none, it says "none", or it is the template's placeholder. Same rule as scripts/lib/whats-new-check.mjs. */
export function whatsNewLine(body: string): string | null {
  const m = /^\s*what['’]s new:[ \t]*(.+)$/im.exec(body);
  const t = m ? m[1]!.trim() : "";
  return !t || t.startsWith("(") || /^none\b/i.test(t) ? null : t;
}
