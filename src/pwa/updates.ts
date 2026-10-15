// Keeping the installed app current. The service worker (vite.config.js) installs a new version in the background but never takes over
// by itself, and a browser that keeps the app alive in the background never lets the old version go ("closing" it often does not close
// it). So the app asks for the switch itself:
//   - it looks for a newer version when it starts, when it comes back to the screen, when the connection returns and in Options;
//   - a version that was downloaded during an earlier visit and is still waiting is started at once, as the app opens;
//   - a version found while the app is in use waits for the reader's word (the banner in ./update-banner.ts, the button in Options),
//     because starting it reloads the page.
import { registerSW } from "virtual:pwa-register";
import type { UpdateStatus, Updates } from "../platform/types";

const LOOK_EVERY_MS = 15 * 60_000; // how long the app may stay in view before it looks again
const APPLIED_KEY = "rd-update-applied";
const LOOP_GUARD_MS = 30_000; // a version started less than this long ago is not started again on its own

let status: UpdateStatus = "current";
let registration: ServiceWorkerRegistration | undefined;
let lastLook = Date.now(); // the browser itself looked as the page loaded
let pending: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(next: UpdateStatus): void {
  if (next === status) return;
  status = next;
  for (const fn of [...listeners]) fn();
}

function startedRecently(): boolean {
  try {
    return Date.now() - Number(localStorage.getItem(APPLIED_KEY)) < LOOP_GUARD_MS;
  } catch {
    return false;
  }
}

const updateSW = registerSW({
  immediate: true,
  // The page is reloaded by us (below) once the new worker has taken control.
  onNeedReload: () => location.reload(),
  onNeedRefresh: () => set("ready"),
  onRegisteredSW: (_url, r) => {
    registration = r;
    if (!r) return set("unknown");
    r.addEventListener("updatefound", () => {
      if (!r.active) return; // the first install of the app, not a newer version
      const worker = r.installing;
      if (status !== "ready") set("downloading");
      worker?.addEventListener("statechange", () => {
        if (worker.state === "redundant" && status === "downloading") set("unknown"); // the download failed
      });
    });
    // A version fetched during an earlier visit and never started: the app has only just opened, so there is nothing to lose.
    if (r.waiting) {
      set("ready");
      if (!startedRecently()) apply();
    }
  },
  onRegisterError: () => set("unknown"),
});

function apply(): void {
  if (status !== "ready") return;
  try {
    localStorage.setItem(APPLIED_KEY, String(Date.now()));
  } catch {
    /* private mode: the loop guard is best effort */
  }
  void updateSW(true);
  // The worker takes control and the page reloads. If that did not happen (a browser that ignores the message), reload anyway.
  setTimeout(() => location.reload(), 5000);
}

function check(maxAgeMs = 0): Promise<void> {
  if (pending) return pending;
  if (status === "ready" || status === "downloading") return Promise.resolve();
  if (Date.now() - lastLook < maxAgeMs) return Promise.resolve();
  lastLook = Date.now();
  pending = (async () => {
    if (!registration) return set("unknown");
    set("checking");
    try {
      await registration.update();
    } catch {
      return set("unknown"); // offline, or the server did not answer
    }
    // `updatefound` and the waiting event may already have said more than this.
    if (status === "checking") set(registration.waiting ? "ready" : registration.installing ? "downloading" : "current");
  })().finally(() => {
    pending = null;
  });
  return pending;
}

function lookWhenSeen(): void {
  const again = () => {
    if (document.visibilityState === "visible" && Date.now() - lastLook > LOOK_EVERY_MS) void check();
  };
  document.addEventListener("visibilitychange", again);
  setInterval(again, 5 * 60_000);
  window.addEventListener("online", () => void check());
}
lookWhenSeen();

export const updates: Updates = {
  status: () => status,
  check,
  apply,
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
