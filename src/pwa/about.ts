// Which build of the app this is, and whether the server has a newer one (shown in Options). The build knows its own commit
// (vite.config.js); `build.json` next to the page is the build the server has now. It is not precached, so the service worker
// cannot answer for an old copy. A staging build also has `staging-build.json` (docs/STAGING.md) with the branches it was made from.
import type { About } from "../platform/types";

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

/** The commit of the build the server has now, or null when it could not be asked. */
export async function latestCommit(doFetch: typeof fetch = (...a) => fetch(...a), waitMs = 4000): Promise<string | null> {
  const latest = await getJson("build.json", doFetch, waitMs);
  return typeof latest?.commit === "string" ? latest.commit : null;
}

export async function aboutThisBuild(build: { version: string; commit: string; builtAt: string } = __BUILD__, doFetch: typeof fetch = (...a) => fetch(...a), waitMs = 4000): Promise<About> {
  const [latest, staging] = await Promise.all([getJson("build.json", doFetch, waitMs), getJson("staging-build.json", doFetch, waitMs)]);
  const there = typeof latest?.commit === "string" ? latest.commit : null;
  const branches = Array.isArray(staging?.branches) ? (staging.branches as unknown[]).filter((b): b is string => typeof b === "string") : undefined;
  return { ...build, latest: there === null ? "unknown" : there === build.commit ? "current" : "newer", branches: branches?.length ? branches : undefined };
}
