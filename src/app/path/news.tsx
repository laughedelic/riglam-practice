// A newer version and what it brings, said where nothing is covered (the lab "Updates and what's new", round 2, picked 1 Nov 2026). While a version waits, one line is
// pinned above the bottom: above the stage rings on the roadmap, and on the thread above the next station in an exercise, where Claude's waiting line stands (Claude's
// line, while Claude is at work, keeps the row). Its Update reloads the app, and the start after that opens What's new, the learner's list of what changed (../news.ts):
// only after that tap, never unasked. A start that took a new version without it (a cold start) shows "What's new" on the roadmap's line instead, until it is read.
// The page is in Settings too, under About. The device keeps the newest item it has shown (`rd-news-seen`); a device that has shown none starts from the newest,
// so a first start shows no backlog.
import { state } from "../state.js";
import { render } from "../shell/render.js";
import { setTab } from "../shell/tabs.js";
import { toggleOpts } from "../shell/options.js";
import { NEWS, newsSince, buildWords, type NewsGo, type NewsItem } from "../news.ts";
import { u0 } from "./parts.tsx";

const SEEN = "rd-news-seen";
const OPEN = "rd-news-open"; // set by Update just before the reload: the next start opens What's new

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* storage blocked */ } };

/** What this device has not shown yet. */
export const unseen = (): NewsItem[] => newsSince(read(SEEN));

/** Reloads onto the newer version, and asks the next start to open What's new. */
export function updateNow(): void {
  const u = state.updates; if (!u || u.status() !== "ready") return;
  write(OPEN, "1");
  u.apply();
}

/**
 * Opens What's new as a page of Settings. `direct`: from the roadmap's line or after an update, so its way back goes where it was opened from, not to the
 * Settings list. The items not shown before are marked new on the page, and are shown from now on.
 */
export function openNews(direct: boolean): void {
  state.newsSince = read(SEEN);
  if (NEWS[0]) write(SEEN, NEWS[0].id);
  state.newsDirect = direct;
  if (direct) { state.fromRoad = state.menuOpen; state.menuOpen = false; state.sessOpen = false; state.sessPage = null; state.skipAsk = false; }
  state.optsPage = "news";
  if (state.optsOpen) render(); else toggleOpts(true);
}

/** At the start: a first start remembers the newest item as shown; the start after Update opens What's new, once the cover has gone, if there is anything new. */
export function startNews(): void {
  if (read(SEEN) === null && NEWS[0]) write(SEEN, NEWS[0].id);
  if (read(OPEN) === null) return;
  write(OPEN, null);
  if (!unseen().length) return;
  const t0 = Date.now();
  const when = () => {
    if ((document.getElementById("cover") || state.mode === "loading") && Date.now() - t0 < 6000) { setTimeout(when, 150); return; }
    openNews(true);
  };
  setTimeout(when, 150);
}

/** The pinned line: a gold diamond on the thread, a few words, and the way on. */
function PinLine({ cls, text, label, act }: { cls: string; text: string; label: string; act: () => void }) {
  return <div class={"pinln " + cls} role="status">
    <span class="pind" aria-hidden="true" />
    <span class="pint">{text}</span>
    <button type="button" class="pinb" onClick={act}>{label}</button>
  </div>;
}

/** What the line says of a version that waits: the real app just says it is there; a Preview (staging) names it, its build and the pull requests in it. */
export const readyWords = (): string => buildWords(state.preview ? state.updates?.coming?.() ?? null : null);

/** The roadmap's line above its foot: a version that waits, else what is new since the last look. */
export function RoadPin() {
  const u = state.updates;
  if (u && u.status() === "ready") return <PinLine cls={"onroad" + (state.preview ? " pre" : "")} text={readyWords()} label="Update" act={updateNow} />;
  const n = unseen();
  if (n.length) return <PinLine cls="onroad news" text={"What's new: " + n[0]!.title} label="Read" act={() => openNews(true)} />;
  return null;
}

/** The exercise's line above its next station, while a version waits and Claude is not at work. */
export function FootPin() {
  const u = state.updates;
  if (!u || u.status() !== "ready" || state.mode !== "quiz" || u0().ctl) return null;
  return <PinLine cls={"onfoot" + (state.preview ? " pre" : "")} text={readyWords()} label="Update" act={updateNow} />;
}

const GO_LABEL: Record<NewsGo, string> = { settings: "Open Settings", practice: "Try it", find: "Try it", debate: "Try it", syllogism: "Try it", categories: "Try it", instance: "Try it" };
function go(to: NewsGo) {
  toggleOpts(false);
  if (to === "settings") { state.fromRoad = false; toggleOpts(true); return; }
  state.menuOpen = false;
  setTab(to);
}

/** The page: the items new on this device first, marked, then the earlier ones; each a stop on a thread. */
export function NewsPage() {
  const fresh = new Set(newsSince(state.newsSince).map((n) => n.id));
  const item = (n: NewsItem) => <li class={"nwi" + (fresh.has(n.id) ? " new" : "")} key={n.id}>
    <span class="nwd" aria-hidden="true" />
    <div class="nwb">
      <p class="nwt">{n.title}{fresh.has(n.id) ? <span class="nwtag">new</span> : null}</p>
      <p class="nwx">{n.text}</p>
      {n.go ? <button type="button" class="pbtn" onClick={() => go(n.go!)}>{GO_LABEL[n.go]}</button> : null}
    </div>
  </li>;
  return <>
    <p class="sintro">What changed in the app lately, newest first.</p>
    <ul class="nwl">{NEWS.map(item)}</ul>
  </>;
}
