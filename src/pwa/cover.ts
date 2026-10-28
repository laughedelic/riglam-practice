// The cover of the installed app (cover.html, drawn from the page's first paint): it stays until the app has left its "Loading." screen, but at least until its entrance is over, so that it
// reads as a welcome and not as a flash. Then, when the app has opened on its roadmap, the cover flies its figure and its name into their places at the head of the roadmap while its ground
// fades away (the zoom-out); when the app opened on an exercise instead, the cover just fades. The page marks the "Loading." screen with a status line in #stage (index.html's recovery panel
// reads the same), and the cover goes for the data's "could not be loaded" message, too: that one has its own text. The recovery panel and the other notices of the shell lie above the cover.
const HOLD_MS = 2300; // counted from the cover's own start: its entrance is over by then, with a moment to look at it
const FADE_MS = 400;
const ZOOM_MS = 950;
const EASE = "cubic-bezier(.5,0,.15,1)";

type Box = { x: number; y: number; width: number; height: number };

/**
 * Flies `el` (an element of the cover that has not moved) onto `to`: its top left corner goes there and it takes the size of the box. The roadmap's own figure and name are hidden while it flies
 * (`cv-zoom` on the root) and come back, exactly where it lands, as it fades out over them.
 */
function fly(el: Element, to: Box) {
  const a = el.getBoundingClientRect(), node = el as HTMLElement;
  node.style.transformOrigin = "0 0";
  node.style.transition = `transform ${ZOOM_MS}ms ${EASE}`;
  node.style.transform = `translate(${to.x - a.x}px, ${to.y - a.y}px) scale(${to.width / a.width})`;
}

/** The figure's place at the head of the roadmap: its box is 36 by 48, and the drawing in it (312 by 412) fills the width and is centered in the height. */
function figureBox(r: DOMRect): Box {
  const h = (r.width * 412) / 312;
  return { x: r.x, y: r.y + (r.height - h) / 2, width: r.width, height: h };
}

/** The cover flies into the roadmap, if the app opened on it. Whether it did. */
function zoom(cover: HTMLElement): boolean {
  const road = document.querySelector(".pa .road.on");
  const fig = road?.querySelector(".rfig"), box = road?.querySelector(".rbox");
  const f = cover.querySelector(".cv-fig"), n = cover.querySelector(".cv-name");
  if (!road || !fig || !box || !f || !n) return false;
  const root = document.documentElement;
  root.classList.add("cv-zoom");
  cover.classList.add("zm");
  cover.style.setProperty("--cv-s", ZOOM_MS + "ms");
  cover.style.setProperty("--cv-t", ZOOM_MS * 0.6 + "ms");
  cover.style.setProperty("--cv-td", ZOOM_MS * 0.15 + "ms");
  cover.style.backgroundColor = "transparent";
  fly(f, figureBox(fig.getBoundingClientRect()));
  fly(n, box.getBoundingClientRect());
  // the words take the roadmap's own colors on the way
  for (const [sel, cls] of [[".n", ".bn"], [".p", ".bp"]] as const) {
    const t = cover.querySelector<SVGElement>(sel), r = road.querySelector(cls);
    if (t && r) t.style.fill = getComputedStyle(r).fill;
  }
  // The roadmap draws its own figure and name under the cover's, which are then fading out over them: the same picture, so that nothing is seen to change.
  setTimeout(() => {
    root.classList.remove("cv-zoom");
    cover.classList.add("out");
    setTimeout(() => cover.remove(), 220);
  }, ZOOM_MS + 60);
  return true;
}

export function mountCover(): void {
  const cover = document.getElementById("cover");
  if (!cover) return;
  // A browser driven by a test has no one to welcome: the cover goes at once.
  const quick = navigator.webdriver === true || matchMedia("(prefers-reduced-motion: reduce)").matches;
  const loading = () => {
    const s = document.querySelector("#stage .status");
    return !!s && (s.textContent || "").startsWith("Loading.");
  };
  let going = false;
  const go = () => {
    if (going || loading()) return;
    going = true;
    watcher.disconnect();
    const since = (window as unknown as { __riglamCoverAt?: number }).__riglamCoverAt ?? 0;
    const wait = quick ? 0 : Math.max(0, HOLD_MS - (performance.now() - since));
    setTimeout(() => {
      if (!quick && zoom(cover)) return;
      cover.classList.add("gone");
      setTimeout(() => cover.remove(), quick ? 0 : FADE_MS);
    }, wait);
  };
  const watcher = new MutationObserver(go);
  const stage = document.getElementById("stage");
  if (stage) watcher.observe(stage, { childList: true, subtree: true, characterData: true });
  go();
}
