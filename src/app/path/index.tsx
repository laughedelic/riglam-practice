// The page's entry: drawing the Path into #path. The page's render() (shell/render.js) calls renderPath, so every change of state that redraws the page redraws it.
import { render as draw } from "preact";
import { state } from "../state.js";
import { render } from "../shell/render.js";
import { App } from "./app.tsx";
import { currentLook } from "./look.ts";
import { coarse } from "./ui.tsx";

/** The tutor checks every answer by itself only where this device said so; else the look's default (tutorAuto). */
function autoExplainDefault(): void {
  let kept: string | null = null; try { kept = localStorage.getItem("rd-autoexplain"); } catch { /* storage blocked */ }
  if (kept === null) state.autoExplain = currentLook().tutorAuto === "on";
}
/** The focus ring (styles/05-path-base.css) shows once the Tab key has been pressed and goes at the next touch or click. The soft keyboard's Next key sends a Tab to
 *  the field on a touch screen: that is not a keyboard walking the page, and must not leave a ring on whatever takes the focus next. */
function ringOnTab(): void {
  const root = document.documentElement;
  addEventListener("keydown", (e) => { if (e.key === "Tab" && !(coarse() && (e.target as Element | null)?.classList?.contains("pfield"))) root.classList.add("pa-tab"); }, true);
  for (const t of ["pointerdown", "touchstart", "mousedown"]) addEventListener(t, () => root.classList.remove("pa-tab"), { capture: true, passive: true });
}
/** What touched the page last, a finger (or a pen) or a mouse: the Path's knocks go with a finger and not a click (gesture.ts). */
function watchHand(): void {
  addEventListener("pointerdown", (e) => { state.hand = e.pointerType === "mouse" ? "mouse" : "touch"; }, { capture: true, passive: true });
}
/** At the start: the defaults that depend on the look, the document marked as drawn by the Path (the rules of styles/05-path-base.css), and the listeners the Path needs. */
export function startPath(): void {
  document.getElementById("path")?.replaceChildren();     // the markup's own "Loading." line, until the first draw
  autoExplainDefault();
  ringOnTab();
  watchHand();
  document.documentElement.classList.add("design-path");
  try { matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (currentLook().mode === "system") render(); }); } catch { /* no media queries */ }
}

/** Draws the Path (from render()). A text field with an id keeps its focus and its selection across the draw. */
export function renderPath(): void {
  const host = document.getElementById("path"); if (!host) return;
  cancelAnimationFrame(state.pathQ); state.pathQ = 0;
  const a = document.activeElement as HTMLInputElement | null;
  const f = a && host.contains(a) && (a.tagName === "INPUT" || a.tagName === "TEXTAREA") && a.id ? { id: a.id, s: a.selectionStart, e: a.selectionEnd } : null;
  draw(<App />, host);
  if (f) {
    const n = document.getElementById(f.id) as HTMLInputElement | null;
    if (n && document.activeElement !== n && !n.disabled) { n.focus({ preventScroll: true }); try { n.setSelectionRange(f.s, f.e); } catch { /* not a text field */ } }
  }
}
/** Draws the Path again at the next frame: for what changes only the Path (a pull, a note, a word typed), without the page's whole render. */
export function refreshPath(): void {
  if (state.pathQ) return;
  state.pathQ = requestAnimationFrame(() => { state.pathQ = 0; renderPath(); });
}
/** The screen from its top (a new pair, a result). */
export function pathTop(): void {
  for (const n of document.querySelectorAll<HTMLElement>("#path .pscroll, #path .ppage, #path .pbr.card, #path .pbr.ptalk")) n.scrollTop = 0;
}
