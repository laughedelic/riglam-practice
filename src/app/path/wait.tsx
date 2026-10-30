// Claude at work, said in one place (the Design Lab's "Waiting for Claude", picked 30 Oct 2026): a stop of its own on the line just above the station, Claude's
// diamond with a line of words that turn every few seconds and shimmer, the seconds at its right end, and Stop. The open examples it checks wear a light round
// their diamonds' edge, the next station waits muted, and the result's other lines no longer say that Claude is on it. Explain, when Claude explains only when
// asked, is a choice beside the line: a tap, or a finger sliding it left, takes it onto the line, and it becomes this stop.
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { askTutor, needsKey, u0 } from "./parts.tsx";
import { currentLook } from "./look.ts";
import { D } from "./ui.tsx";

/** The words, after "Claude is": a few of the work of reading an answer, and a few of the debate courtyard's own, some of them the texts' definitions (a
 *  functioning thing performs a function, a phenomenon holds its own entity, an imputed thing is merely imputed). */
export const WAIT_VERBS = ["checking", "thinking", "considering", "pondering", "reflecting", "contemplating", "deliberating", "cogitating", "cognizing", "debating",
  "meditating", "manifesting", "cerebrating", "ruminating", "disintegrating", "testing the pervasion", "establishing reason", "performing a function", "producing effects",
  "merely imputing", "holding its own entity"];
/** Seconds each verb stays. */
const PERIOD = 5;
/** The order of one wait: a single word first, any of them, so the first words are simple; then all the others shuffled. `rnd` gives numbers in [0, 1). */
export function waitOrder(rnd: () => number = Math.random, list: readonly string[] = WAIT_VERBS): string[] {
  const one = list.filter((v) => !v.includes(" ")), first = one[Math.floor(rnd() * one.length)] ?? list[0], rest = list.filter((v) => v !== first), out = [first];
  while (rest.length) out.push(rest.splice(Math.floor(rnd() * rest.length), 1)[0]);
  return out;
}
const cap = (v: string) => v[0].toUpperCase() + v.slice(1);

/** The words of the line: when they change the old ones fade out where they stand, laid over the new ones, and only then do the new ones fade in; nothing moves. */
function Phrase({ text }: { text: string }) {
  const [s, setS] = useState({ cur: text, prev: "", n: 0 });
  useLayoutEffect(() => { if (s.cur !== text) setS({ cur: text, prev: s.cur, n: s.n + 1 }); }, [text]);
  return <>{s.n ? <span class="cwph old" key={"o" + s.n}>{s.prev}</span> : null}<span class={"cwph" + (s.n ? " new" : "")} key={"i" + s.n}>{s.cur}</span></>;
}

/**
 * The line of the wait: the words, ending in an ellipsis, and, at its right end, the seconds since it began. "Claude is" comes before the verb when the two fit
 * the line, else the verb stands alone (measured on the line as it is, so a narrow phone says less, never a cut word).
 */
export function ClaudeLine() {
  const [t0] = useState(Date.now), [order] = useState(() => waitOrder()), [, tick] = useState(0);
  const box = useRef<HTMLSpanElement>(null), probe = useRef<HTMLSpanElement>(null);
  useEffect(() => { const id = setInterval(() => tick((x) => x + 1), 250); return () => clearInterval(id); }, []);
  const secs = Math.floor((Date.now() - t0) / 1000), v = order[Math.floor(secs / PERIOD) % order.length], full = "Claude is " + v;
  const fits = () => { const p = probe.current, b = box.current; if (!p || !b) return true; p.textContent = full + "…"; return p.offsetWidth <= b.clientWidth; };
  return <div class="think cwait" role="status"><span class="vh">Claude is at work</span>
    <span class="cwv" ref={box} aria-hidden="true"><Phrase text={(fits() ? full : cap(v)) + "…"} /><span class="cwprobe" ref={probe} /></span>
    <span class="secs" aria-hidden="true">{secs}s</span></div>;
}

/** The stop of the wait, over the station: there while Claude works on the answer on screen, else folded away. Taken from Explain, it comes down from where Explain was. */
export function WaitStop() {
  const u = u0(), on = !!u.ctl, inn = useRef<HTMLDivElement>(null), fly = on && u.waitFrom !== undefined;
  useLayoutEffect(() => {
    const from = u.waitFrom as number | undefined, d = inn.current && inn.current.querySelector(".d"); u.waitFrom = undefined;
    if (!on || from === undefined || !d || !inn.current || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    inn.current.animate([{ transform: `translateY(${from - d.getBoundingClientRect().top}px)` }, { transform: "none" }], { duration: 420, easing: "cubic-bezier(.3,.8,.3,1)" });
  }, [on]);
  return <div class={"cwstop" + (on ? " on" : "") + (fly ? " fly" : "")}>{on ? <div class="cwin" ref={inn}><D cls="sub pthink" /><ClaudeLine />
    <button type="button" class="pbtn quiet" onClick={() => u.ctl && u.ctl.abort()}>Stop</button></div> : null}</div>;
}

/**
 * Explain as a choice (when Claude explains only when asked): Claude's hollow diamond beside the line, the words after it. A tap, or a finger sliding it left,
 * takes it onto the line, and then the wait begins there and goes down to its stop over the station. `name`: what it says (Check & explain, Explain, ...).
 * With `go` it is another action of Claude's that leaves the page (Ask a follow-up opens the chat): taken, it goes onto the line and `go` runs, in place of the
 * wait; `hint` is what it says under its name.
 */
export function ExplainChoice({ name, hint, go }: { name: string; hint?: string; go?: () => void }) {
  const [dx, setDx] = useState(0), [taking, setTaking] = useState(false), from = useRef<number | null>(null), me = useRef<HTMLButtonElement>(null), once = useRef(false);
  const beside = currentLook().take === "slide", key = needsKey();
  // the release that ends a slide is also the row's click, which takes it
  const take = () => {
    if (once.current) return;
    once.current = true; setTaking(true); setDx(0);
    setTimeout(() => {
      if (go) go();
      else { const d = me.current && me.current.querySelector(".mc .d"), u = u0(); if (d) u.waitFrom = d.getBoundingClientRect().top; askTutor(); }
      once.current = false; setTaking(false);
    }, beside ? 420 : 0);
  };
  const drag = beside && !taking ? {
    onPointerDown: (e: PointerEvent) => { from.current = e.clientX; },
    onPointerMove: (e: PointerEvent) => { if (from.current !== null && e.buttons) setDx(Math.max(-22, Math.min(0, e.clientX - from.current))); },
    onPointerUp: () => { from.current = null; },
    onPointerCancel: () => { from.current = null; setDx(0); },
  } : {};
  return <section class={"sx walked cwex" + (taking ? " taken" : "") + (dx ? " drag" : "")}>
    <div class={"chs" + (beside ? " slide" : "")}><button type="button" ref={me} class="crow" style={{ "--dx": dx + "px" } as never} onClick={take} {...drag}>
      <span class="mc"><D cls="sub tut" /></span><span class="ct"><b>{name}</b><small>{hint || (key ? "needs the Magic Key" : "Using Claude")}</small></span>
    </button></div></section>;
}
