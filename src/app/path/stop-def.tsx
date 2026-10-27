// What a course term's stop shows under its heading (path/stop.tsx): the term, sized to fit its line, with its names in the course's languages, then
// the sections the learner reads one after another, each a small stop on the line: the definition, where the term sits (a tree of the terms above it
// and the divisions met so far, with a sign of those to come, and the divisions that have no stop of their own, each with its definition folded), and examples. A section whose content is missing (no definition without the Magic Key,
// no division in the course) is left out.
import type { ComponentChildren } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { state } from "../state.js";
import { stopTree } from "../practice/stops.ts";
import { hasDef } from "../practice/terms.js";
import type { Stop } from "../../domain/intro.ts";
import { DefText, Examples, sameAsText, termExamples } from "./terms.tsx";
import { D, St } from "./ui.tsx";

/** The smallest the term shrinks to, as a share of its size in the style sheet (the largest). */
const SMALLEST = 0.5;
/**
 * The term at the size of the style sheet, made smaller when a word of it would not fit on a line, so that no word breaks: the whole term shrinks, not
 * the longest word. A word's width is measured at 100px and scaled, so one measure is enough; it is taken again when the box or the fonts change.
 * Below SMALLEST of the size a word breaks, as before. `whole`: until the whole text is on one line (the title of a stage station).
 */
export function FitTerm({ text, whole = false }: { text: string; whole?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const fit = () => {
    const el = ref.current, host = el && el.parentElement; if (!el || !host) return;
    el.style.fontSize = ""; el.classList.remove("tight");
    const avail = el.clientWidth, cs = getComputedStyle(el), max = parseFloat(cs.fontSize); if (!avail || !max) return;
    const wide = (t: string) => {
      const s = document.createElement("span"); s.textContent = t;
      s.style.cssText = `position:absolute;left:-9999px;top:0;visibility:hidden;white-space:nowrap;font-family:${cs.fontFamily};font-weight:${cs.fontWeight};font-style:${cs.fontStyle};letter-spacing:${cs.letterSpacing};font-size:100px`;
      host.appendChild(s); const w = s.getBoundingClientRect().width; s.remove(); return w;
    };
    const best = Math.floor(avail * 100 / Math.max(...(whole ? [text] : text.split(/\s+/)).map(wide)) * 2) / 2, size = Math.min(max, Math.max(max * SMALLEST, best));
    if (size < max) el.style.fontSize = size + "px";
    if (best < max * SMALLEST) el.classList.add("tight");
  };
  useLayoutEffect(fit);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(fit); ro.observe(el);
    const fonts = document.fonts; fonts?.ready.then(fit); fonts?.addEventListener?.("loadingdone", fit);
    return () => { ro.disconnect(); fonts?.removeEventListener?.("loadingdone", fit); };
  }, [text]);
  return <span ref={ref} class="cs" lang="en">{text}</span>;
}

/** A section: its label beside a small node on the line, then its content under the text column. */
function Section({ label, children }: { label: string; children: ComponentChildren }) {
  return <>
    <St d={<D cls="sub done" />} cls="stm thing tstop-sec"><span class="tstop-sech">{label}</span></St>
    <div class="wtext tstop-def"><div class="pdef pdplain">{children}</div></div>
  </>;
}

/** A division of the term that has no stop of its own (primary color under color): its name, and a tap shows its definition under it, where this device can read one. */
function Part({ n, lv, def }: { n: string; lv: number; def: boolean }) {
  const [open, setOpen] = useState(false), can = def && !!state.DATA && hasDef(state.DATA.terms[n]);
  return <li class="kid part" style={{ "--lv": lv } as never}>
    {can ? <button type="button" class="tpartb" aria-expanded={open ? "true" : "false"} onClick={() => setOpen(!open)}>{n}</button> : n}
    {can && open ? <div class="tpartd"><DefText term={n} /></div> : null}
  </li>;
}

/**
 * Where the term sits: the terms mutually inclusive with it (hidden phenomenon is existent, which has no place of its own in the tree), then the terms
 * above it, the broadest first, down to the term and the divisions of it that have come; those whose stop has not come are gray. The divisions without
 * a stop follow, named from the start.
 */
function Tree({ s, name, def }: { s: Stop; name: string; def: boolean }) {
  const { up, kids, more, parts } = stopTree(s), same = sameAsText(name), tree = up.length > 0 || kids.length > 0 || more || parts.length > 0;
  if (!tree && !same) return null;
  const lv = (n: number) => ({ "--lv": n }) as never;
  return <Section label="Categories">
    {same ? <p class="tstop-mi">{"Mutually inclusive with " + same + "."}</p> : null}
    {tree ? <ul class="ttree" aria-label="Where it sits">
      {up.map((t, i) => <li class={t.met ? "" : "gray"} style={lv(i)}>{t.name}{t.met ? null : <em>later</em>}</li>)}
      <li class="me" aria-current="true" style={lv(up.length)}>{name}</li>
      {kids.map((n) => <li class="kid" style={lv(up.length + 1)}>{n}</li>)}
      {parts.map((n) => <Part n={n} lv={up.length + 1} def={def} />)}
      {more ? <li class="kid gray" style={lv(up.length + 1)}><span aria-hidden="true">{"…"}</span><span class="vh">more divisions come later</span><em>later</em></li> : null}
    </ul> : null}
  </Section>;
}

/** The sections of a stop: definition (when this device can read one), categories, examples (when the term has some). */
export function StopSections({ s, name, def }: { s: Stop; name: string; def: boolean }) {
  return <>
    {def ? <Section label="Definition"><DefText term={name} /></Section> : null}
    <Tree s={s} name={name} def={def} />
    {termExamples(name).length ? <Section label="Examples"><Examples n={name} /></Section> : null}
  </>;
}
