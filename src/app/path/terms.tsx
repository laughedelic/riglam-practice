// The Dudra terms in a text of the Path, dot-underlined where this device can read their definition (the classic page's withTerms,
// practice/terms.js, drawn by the Path): a tap opens the definition under the text, as a note on the path (Def). What is said is the classic page's
// (its data, its wording).
import type { JSX } from "preact";
import { state } from "../state.js";
import { sameNames } from "../../ai-shared/lookup.ts";
import type { DataIndex } from "../../ai-shared/lookup.ts";
import { termMentions } from "../../ai-shared/mentions.ts";
import { cap } from "../core/util.js";
import { isA } from "../practice/screen.js";
import { defParts, hasDef } from "../practice/terms.js";
import { termNames } from "../../domain/languages.ts";
import { cardExamples } from "../../domain/card-examples.ts";
import type { CardExample } from "../../domain/card-examples.ts";
import { render } from "../shell/render.js";

const markOf = (id: string) => document.querySelector<HTMLElement>('#path .dterm[data-dt="' + CSS.escape(id) + '"]');
function TermMark({ txt, term, id }: { txt: string; term: string; id: string }) {
  const on = !!state.ui && !!state.ui.dterm && state.ui.dterm.id === id;
  const toggle = (e: Event) => {
    e.stopPropagation(); if (!state.ui) return;
    state.ui.dterm = on ? null : { id, term, trail: [] }; render();
    const m = markOf(id); if (m) m.focus({ preventScroll: true });
    const c = document.getElementById("ddef"); if (c) c.scrollIntoView({ block: "nearest" });
  };
  return <span class={"dterm" + (on ? " on" : "")} role="button" tabIndex={0} data-dt={id} aria-expanded={on ? "true" : "false"} aria-controls={on ? "ddef" : undefined}
    onClick={toggle} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(e); } }}>{txt}</span>;
}
/**
 * A text with the terms it names marked. `where` names the text, so that the definition opened from it shows under it (DefCard with the
 * same `where`); with `seen`, each term is marked only the first time.
 */
export function TermText({ text, where, seen, quoted = false, own }: { text: string; where: string; seen?: Set<string>; quoted?: boolean; own?: Record<string, string> }) {
  if (!state.DATA || !text) return <>{text}</>;
  const found = termMentions(state as unknown as DataIndex, text, { quoted });
  // the words the caller knows name a term, where the matching of names does not find them (an everyday word that is also a name)
  for (const [word, term] of Object.entries(own || {})) for (const m of text.matchAll(new RegExp("(?<![\\w-])" + word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![\\w-])", "gi"))) found.push({ start: m.index!, end: m.index! + m[0].length, term });
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const out: (string | JSX.Element)[] = []; let at = 0;
  found.forEach((m, i) => {
    if (m.start < at || !hasDef(state.DATA!.terms[m.term]) || (seen && seen.has(m.term))) return;
    if (seen) seen.add(m.term);
    out.push(text.slice(at, m.start), <TermMark txt={text.slice(m.start, m.end)} term={m.term} id={where + "/" + i} />);
    at = m.end;
  });
  out.push(text.slice(at));
  return <>{out}</>;
}
/** One term, marked when its definition can be read: the class under a term of the pair ("each is a form"). */
export function OneTerm({ txt, term, where }: { txt: string; term: string; where: string }) {
  return state.DATA && hasDef(state.DATA.terms[term]) ? <TermMark txt={txt} term={term} id={where + "/0"} /> : <>{txt}</>;
}
/** The definition opened from the text `where`, under it, or nothing. */
export function DefCard({ where }: { where: string }) {
  const d = state.ui && state.ui.dterm;
  if (!d || !d.id.startsWith(where + "/") || !state.DATA!.terms[d.term]) return null;
  return <Def term={d.term} trail={d.trail || []} />;
}
const focusCard = () => { const c = document.getElementById("ddef"); if (c) { c.focus({ preventScroll: true }); c.scrollIntoView({ block: "nearest" }); } };
// a parent in the card's chain: tapping it puts that term's definition in the same card (which keeps the way back)
function goTo(n: string) {
  const d = state.ui!.dterm; if (!d) return;
  state.ui!.dterm = { id: d.id, term: n, trail: [...(d.trail || []), d.term] }; render(); focusCard();
}
function goBack() {
  const d = state.ui!.dterm, trail = d && (d.trail || []).slice(); if (!d || !trail || !trail.length) return;
  state.ui!.dterm = { id: d.id, term: trail.pop()!, trail }; render(); focusCard();
}
function ParentMark({ n }: { n: string }) {
  const go = (e: Event) => { e.stopPropagation(); goTo(n); };
  return <span class="dterm" role="button" tabIndex={0} data-dp={n} onClick={go} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(e); } }}>{n.toLowerCase()}</span>;
}
const endp = (s: string) => s.replace(/[.;,\s]+$/, "") + ".";
/**
 * Examples of the term, on its own stop under a heading of its own: a few, each with its stage; a reference example says why it is a good one.
 * They are everyday things of the practice list where it has them (`cardExamples`), so a device without the course's examples has them too.
 * The card under a question (Def) has none: they are for the stop. How well an example is confirmed is the data's bookkeeping, not something to teach.
 */
export const termExamples = (n: string): CardExample[] => cardExamples(state as unknown as DataIndex, state.EX ? state.EX.items : null, n);
export function Examples({ n }: { n: string }) {
  const list = termExamples(n); if (!list.length) return null;
  const open = state.ui && state.ui.dex;
  return <div class="pdex bare"><ul>{list.map((x) => {
    const key = n + "|" + x.n, on = open === key;
    const head = <><span class="pdexn">{x.n}</span><small>{"stage " + x.st}</small></>;
    if (!x.gloss) return <li><div class="pdexr">{head}</div></li>;
    const toggle = (e: Event) => { e.stopPropagation(); state.ui!.dex = on ? null : key; render(); };
    return <li><button type="button" class={"pdexr pdexb" + (on ? " on" : "")} aria-expanded={on ? "true" : "false"} onClick={toggle}>{head}</button>
      {on ? <p class="pdexw">{x.gloss + (x.cn ? " (this reading is less certain)" : "")}</p> : null}</li>;
  })}</ul></div>;
}
/** The languages that are on (Settings > Languages), besides English: Russian as the definitions' language, the rest as kept. */
export const languagesOn = (): string[] => [...(state.defLang === "enru" ? ["ru"] : []), ...state.langs];
/** The term's names in the languages that are on, one line each, those it has a name in; `skip` leaves some out (a card that names the term in Russian already). */
export function Names({ term, skip = [] }: { term: string; skip?: string[] }) {
  const t = state.DATA!.terms[term]; if (!t) return null;
  const names = termNames(t, languagesOn()).filter((n) => !skip.includes(n.id));
  return names.length ? <p class="tstop-names">{names.map((n) => <span class="nm" data-lang={n.id}><span lang={n.lang || undefined}>{n.main}</span>{n.rest}</span>)}</p> : null;
}

/** The terms mutually inclusive with a term, lower-cased, as a phrase ("existent, established base and object"), or "" when it has none. */
export function sameAsText(term: string): string {
  const n = [...sameNames(state as unknown as DataIndex, term)].filter((x) => x !== term).map((x) => x.toLowerCase());
  return n.length > 1 ? n.slice(0, -1).join(", ") + " and " + n[n.length - 1] : n[0] || "";
}
/** The definition of a term in words: where it comes from, the English text and, if chosen, the Russian. Nothing when this device cannot read one. */
export function DefText({ term }: { term: string }) {
  const t = state.DATA!.terms[term], en = defParts(t.d), ru = defParts(t.d_ru), ruOn = state.defLang === "enru", src = en.src || (ruOn ? ru.src : "");
  return <>
    {src ? <p class="pdsrc">{src + (en.body ? ":" : ".")}</p> : null}
    {en.body ? <p class="pdbody" lang="en">{endp(cap(en.body))}</p> : null}
    {ruOn && ru.body ? <p class="pdbody pdru" lang="ru">{endp(cap(ru.body))}</p> : null}
  </>;
}
/** The definition of a term, as the card under a mark: where the term sits, the definition in English and, if chosen, Russian. */
export function Def({ term, trail }: { term: string; trail: string[] }) {
  const t = state.DATA!.terms[term], en = defParts(t.d), ruOn = state.defLang === "enru";
  const back = trail.length ? trail[trail.length - 1] : "", up = ((state.DATA!.chains || {})[term] || [term]).slice(1), same = sameAsText(term);
  return <div class="pdef" id="ddef" tabIndex={-1}>
    {back ? <button type="button" class="pbtn quiet pdback" aria-label={"Back to " + back} onClick={(e) => { e.stopPropagation(); goBack(); }}>{"\u2190 " + back}</button> : null}
    <p class="pdh"><b>{t.name}</b>{ruOn && t.ru ? <span lang="ru">{" \u00b7 " + t.ru}</span> : null}{t.ch && en.ref ? <small>{" \u00b7 " + t.ch}</small> : null}</p>
    <Names term={term} skip={["ru"]} />
    {up.length ? <p class="pdup">{up.flatMap((m: string, i: number) => [i ? " " : "", <i class="pisa">{isA(m.toLowerCase())}</i>, " ", hasDef(state.DATA!.terms[m]) ? <ParentMark n={m} /> : m.toLowerCase()])}</p> : null}
    {same ? <p class="pdup"><i class="pisa">mutually inclusive with</i>{" " + same}</p> : null}
    <DefText term={term} />
  </div>;
}

