// The redesign's entry: which design draws the page (Settings > Design, `rd-design`), and drawing the Path into #path. The classic page
// calls renderPath from its render() while the Path is on (shell/render.js), so every change of state that redraws the page redraws it.
import { render as draw } from "preact";
import { state } from "../state.js";
import { render } from "../shell/render.js";
import { App } from "./app.tsx";
import { currentLook, restoreClassic } from "./look.ts";

const KEY = "rd-design";
/** Whether the Path draws the page now. */
export const pathOn = () => state.design === "path";

/** The tutor checks every answer by itself only where this device said so; else the Path's default (the look's tutorAuto), the classic page's on Classic. */
function autoExplainDefault(): void {
  let kept: string | null = null; try { kept = localStorage.getItem("rd-autoexplain"); } catch { /* storage blocked */ }
  if (kept === null && pathOn()) state.autoExplain = currentLook().tutorAuto === "on";
}
/** At the start: the device's choice, else the Path in a Preview and the classic page in the real app. */
export function startDesign(preview: boolean): void {
  let kept: string | null = null; try { kept = localStorage.getItem(KEY); } catch { /* storage blocked */ }
  state.design = kept === "path" || kept === "classic" ? kept : preview ? "path" : "classic";
  autoExplainDefault();
  syncDesign();
  try { matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (pathOn() && currentLook().mode === "system") render(); }); } catch { /* no media queries */ }
}
/** The page's own parts for the design in use: the classic page hidden under the Path, or the Path's colors taken off the browser's bar. */
function syncDesign(): void {
  const on = pathOn(), host = document.getElementById("path");
  document.documentElement.classList.toggle("design-path", on);
  if (host) host.hidden = !on;
  if (!on) { if (host) draw(null, host); restoreClassic(); }
}
/** Settings > Design: the Path or the classic page, kept on this device. */
export function setDesign(d: "path" | "classic"): void {
  if (d === state.design) return;
  state.design = d;
  try { localStorage.setItem(KEY, d); } catch { /* the choice holds for this visit */ }
  let kept: string | null = null; try { kept = localStorage.getItem("rd-autoexplain"); } catch { /* storage blocked */ }
  if (kept === null) state.autoExplain = d === "path" ? currentLook().tutorAuto === "on" : true;
  syncDesign();
  render();
}

/** Draws the Path (from the classic render()). A text field with an id keeps its focus and its selection across the draw. */
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
/** Draws the Path again at the next frame: for what changes only the Path (a pull, a note, a word typed), without the classic render's work. */
export function refreshPath(): void {
  if (!pathOn() || state.pathQ) return;
  state.pathQ = requestAnimationFrame(() => { state.pathQ = 0; renderPath(); });
}
/** The screen from its top (a new pair, a result). */
export function pathTop(): void {
  for (const n of document.querySelectorAll<HTMLElement>("#path .pscroll, #path .ppage, #path .pbr.card, #path .pbr.ptalk")) n.scrollTop = 0;
}
