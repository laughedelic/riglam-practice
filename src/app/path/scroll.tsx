// The path's own scroll: the one part of a screen that moves under the top bar and over the foot. It is wired to the pulls (pulling on past
// its end tightens the thread to the station, gesture.ts), and while the keyboard is up it keeps the heading's count of the examples written above.
import type { ComponentChildren } from "preact";
import { useContext, useEffect, useRef } from "preact/hooks";
import { PullCtx } from "./shell.tsx";

/** While the keyboard is up: how many examples written are above the scroll's top, on the heading ("2 above · pull down"). */
export function aboveSync(root: HTMLElement | null) {
  if (!root) return;
  const kh = root.querySelector<HTMLElement>(".khead"), sc = root.querySelector<HTMLElement>(".pscroll"), t = root.querySelector<HTMLElement>(".kabt");
  if (!kh || !sc) return;
  let n = 0;
  if (root.classList.contains("kbup")) {
    const top = sc.getBoundingClientRect().top;
    for (const s of sc.querySelectorAll<HTMLElement>(".sb.done")) if (s.getBoundingClientRect().bottom <= top + 4) n++;
  }
  kh.classList.toggle("hasabove", n > 0);
  if (t) t.textContent = n ? n + " above · pull down" : "";
}

export function Scroll({ children, dim = false }: { children?: ComponentChildren; dim?: boolean }) {
  const pull = useContext(PullCtx), ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sc = ref.current; if (!sc) return;
    return pull.wireScroll(sc, () => aboveSync(sc.closest<HTMLElement>(".pa")));
  }, [pull]);
  return <div class={"pscroll" + (dim ? " dim" : "")} ref={ref}><div class="pathc">{children}</div></div>;
}
