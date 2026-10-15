// Features still on trial: each is off unless turned on for this device, so a build that carries one (staging, or
// production before it is finished) behaves as before. The switch is in Options, in the row of the feature, and stays
// there whether the feature is on or off. The choice is kept on the device (not in the export file). The address can set
// it too, for a page opened from a link or a test: `?features=voice` turns voice on, `?features=-voice` turns it off and
// `?features=none` turns all off; the parameter is taken out of the address afterwards.

export const FEATURES = ["voice"] as const;
export type Feature = (typeof FEATURES)[number];

const KEY = "riglam.features";
const known = (x: string): x is Feature => (FEATURES as readonly string[]).includes(x);

/** The features on after the address's `features` parameter (comma-separated) is applied to those saved. */
export function applyParam(saved: readonly string[], param: string | null): Feature[] {
  const on = new Set(saved.filter(known));
  for (const raw of (param || "").split(",")) {
    const w = raw.trim().toLowerCase();
    if (w === "none") on.clear();
    else if (w.startsWith("-") && known(w.slice(1))) on.delete(w.slice(1) as Feature);
    else if (known(w)) on.add(w);
  }
  return FEATURES.filter((f) => on.has(f));
}

function saved(): string[] {
  try { return (localStorage.getItem(KEY) || "").split(",").filter(Boolean); } catch { return []; }
}
export function saveFeatures(list: readonly Feature[]): void {
  try { if (list.length) localStorage.setItem(KEY, list.join(",")); else localStorage.removeItem(KEY); } catch { /* storage blocked: for this visit only */ }
}

/** The features on for this page: those saved on the device, changed by the address if it says so. */
export function loadFeatures(): Feature[] {
  let param: string | null = null;
  try { param = new URLSearchParams(location.search).get("features"); } catch { /* no address */ }
  const list = applyParam(saved(), param);
  if (param !== null) {
    saveFeatures(list);
    try {
      const u = new URL(location.href);
      u.searchParams.delete("features");
      history.replaceState(history.state, "", u.pathname + u.search + u.hash);
    } catch { /* the frame does not let the page change its address */ }
  }
  return list;
}

/** The features on after `f` is switched on or off. */
export function withFeature(list: readonly Feature[], f: Feature, on: boolean): Feature[] {
  const next = new Set(list);
  if (on) next.add(f); else next.delete(f);
  return FEATURES.filter((x) => next.has(x));
}
