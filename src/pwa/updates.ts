// Keeping the installed app current. A new version of the service worker (vite.config.js) takes over as soon as it is installed. It must:
// a worker that waits for every page of the app to close never gets its turn on a phone, where "closing" the app often leaves a page
// alive, and a cold start opens the old version again (the old worker is the one that answers). The page that is open keeps running the
// version it loaded until it is reloaded, and that is never done behind the reader's back (they may be in the middle of an answer): the
// app looks for a newer version when it starts, when it comes back to the screen, when the connection returns and in Options, and offers
// the reload in the banner (./update-banner.ts) and in Options.
import { registerSW } from "virtual:pwa-register";
import type { UpdateStatus, Updates } from "../platform/types";
import { latestCommit } from "./about";

const LOOK_EVERY_MS = 15 * 60_000; // how long the app may stay in view before it looks again
let status: UpdateStatus = "unknown"; // until a look has succeeded: offline, a registration that exists says nothing
let registration: ServiceWorkerRegistration | undefined;
let lastLook = 0;
let pending: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(next: UpdateStatus): void {
  if (next === status) return;
  status = next;
  for (const fn of [...listeners]) fn();
}

function apply(): void {
  if (status === "ready") location.reload();
}

// A page that was controlled by a worker when it opened sees "controllerchange" when a newer worker takes over. The first install of the
// app has no earlier controller (the new worker does not claim open pages), so it is not an update.
const hadController = !!navigator.serviceWorker?.controller;
navigator.serviceWorker?.addEventListener("controllerchange", () => {
  if (!hadController) return;
  set("ready");
});

registerSW({
  immediate: true,
  // The library reloads the page on its own when a version that was waiting takes over (its prompt mode); the reader decides when (see the header).
  onNeedReload: () => {},
  onRegisteredSW: (_url, r) => {
    registration = r;
    if (!r) return set("unknown");
    void check(); // the browser's own look as the page loads may have failed (offline): the status is "current" only after one that worked
    r.addEventListener("updatefound", () => {
      if (!r.active) return; // the first install of the app, not a newer version
      const worker = r.installing;
      if (status !== "ready") set("downloading");
      worker?.addEventListener("statechange", () => {
        if (worker.state === "redundant" && status === "downloading") set("unknown"); // the download failed
        // A page that no worker controlled has no "controllerchange" to wait for (the first install does not claim it, and it never saw an earlier one): the new worker being active is the signal.
        if (worker.state === "activated" && status === "downloading") set("ready");
      });
    });
  },
  onRegisterError: () => set("unknown"),
});

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
    // `updatefound` and "controllerchange" may already have said more than this.
    if (status !== "checking") return;
    if (registration.installing) return set("downloading");
    // Nothing is being installed. If the server's build is not the one this page runs, a worker that took over before this page started
    // (so that no "controllerchange" was seen) already has the newer files: reloading brings them.
    const there = await latestCommit();
    if (status === "checking") set(there !== null && there !== __BUILD__.commit ? "ready" : "current");
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
