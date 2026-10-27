// The cover of the installed app (cover.html, drawn from the page's first paint): it stays until the app has left its "Loading." screen, but at least a moment so that it reads as a
// welcome and not as a flash, and then fades. The page marks that screen with a status line in #stage (index.html's recovery panel reads the same), and it goes (for the data's
// "could not be loaded" message, too: that one has its own text). The recovery panel and the other notices of the shell lie above the cover.
const HOLD_MS = 700; // counted from the start of the page
const FADE_MS = 400;

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
    const wait = quick ? 0 : Math.max(0, HOLD_MS - performance.now());
    setTimeout(() => {
      cover.classList.add("gone");
      setTimeout(() => cover.remove(), quick ? 0 : FADE_MS);
    }, wait);
  };
  const watcher = new MutationObserver(go);
  const stage = document.getElementById("stage");
  if (stage) watcher.observe(stage, { childList: true, subtree: true, characterData: true });
  go();
}
