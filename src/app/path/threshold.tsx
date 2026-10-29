// Several choices on the Path (Categories, step 1): a rule across the path parts what is chosen from what is not. A tap lifts a choice over the rule, where it
// latches onto the path (the solid gold piece above the rule, its mark on the line), in the list's order; the rest wait under the rule beside the dotted line,
// as single choices do. A tap on a latched one drops it back to its place, and "reset" on the rule drops them all. The margin says which side is which.
// A row moves from where it was to where it lands (measured before the change and played after it with the Web Animations API), its mark and its words each
// from their own old place, and keeps the keyboard's focus.
import { useLayoutEffect, useRef } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { moves } from "../shell/motion.js";
import { D, Sx } from "./ui.tsx";

export interface Pick { k: string; b: ComponentChildren; key?: string }
type Where = Map<string, { mc: DOMRect; ct: DOMRect }>;
const EASE = "cubic-bezier(.3,.8,.25,1)", MS = 420;

/** Where every row's mark and words are now, and which row has the focus. */
function measure(box: HTMLElement | null): { at: Where; focus: string | null } {
  const at: Where = new Map();
  box?.querySelectorAll<HTMLElement>(".crow[data-k]").forEach((r) => at.set(r.dataset.k!, { mc: r.querySelector(".mc")!.getBoundingClientRect(), ct: r.querySelector(".ct")!.getBoundingClientRect() }));
  const f = document.activeElement as HTMLElement | null;
  return { at, focus: f && box?.contains(f) && f.dataset.k != null ? f.dataset.k : null };
}

export function Threshold({ label, items, picked, onPick, onReset, above = "is", below = "not" }: { label: string; items: Pick[]; picked: string[]; onPick: (k: string) => void; onReset: () => void; above?: string; below?: string }) {
  const box = useRef<HTMLDivElement>(null), before = useRef<ReturnType<typeof measure> | null>(null);
  const take = (go: () => void) => { before.current = measure(box.current); go(); };
  useLayoutEffect(() => {
    const was = before.current; before.current = null; if (!was || !box.current) return;
    if (was.focus != null) box.current.querySelector<HTMLElement>(`.crow[data-k="${CSS.escape(was.focus)}"]`)?.focus({ preventScroll: true });
    if (!moves()) return;
    box.current.querySelectorAll<HTMLElement>(".crow[data-k]").forEach((r) => {
      const old = was.at.get(r.dataset.k!); if (!old) return;
      for (const [sel, from] of [[".mc", old.mc], [".ct", old.ct]] as const) {
        const el = r.querySelector<HTMLElement>(sel)!, now = el.getBoundingClientRect(), dx = from.left - now.left, dy = from.top - now.top;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
        const base = getComputedStyle(el).transform, rest = base === "none" ? "" : " " + base;
        try { el.animate([{ transform: `translate(${dx}px,${dy}px)` + rest }, { transform: rest || "none" }], { duration: MS, easing: EASE }); } catch { /* no animation */ }
      }
    });
  });
  const up = items.filter((it) => picked.includes(it.k)), down = items.filter((it) => !picked.includes(it.k));
  const row = (it: Pick, on: boolean) => <button type="button" key={it.k} data-k={it.k} class={"crow" + (on ? " on" : "")} aria-pressed={on ? "true" : "false"} aria-keyshortcuts={it.key} onClick={() => take(() => onPick(it.k))}>
    <span class="mc"><D cls={"sub " + (on ? "yours" : "pk")} /></span><span class="ct"><b>{it.b}</b></span></button>;
  return <div ref={box} class="thold" role="group" aria-label={label}>
    <Sx cls={"cur" + (up.length ? "" : " thempty")}><span class="thh" data-mv="above" aria-hidden="true">{above}</span>
      {up.length ? <div class="chs up" role="group" aria-label={above}>{up.map((it) => row(it, true))}</div> : null}</Sx>
    <Sx cls="cur thx"><span class="thl" data-mv="rule" />{up.length ? <button type="button" class="threset" onClick={() => take(onReset)}>reset</button> : null}</Sx>
    {down.length ? <Sx cls="gap"><span class="thh" data-mv="below" aria-hidden="true">{below}</span>
      <div class="chs down" role="group" aria-label={below}>{down.map((it) => row(it, false))}</div></Sx> : null}
  </div>;
}
