// The Dudra terms in a text of the Path, dot-underlined where this device can read their definition (the classic page's withTerms,
// practice/terms.js, drawn by the Path): a tap opens the definition under the text, in the classic card for now.
import type { JSX } from "preact";
import { state } from "../state.js";
import type { DataIndex } from "../../ai-shared/lookup.ts";
import { termMentions } from "../../ai-shared/mentions.ts";
import { defCard, hasDef } from "../practice/terms.js";
import { render } from "../shell/render.js";
import { Bridge } from "./ui.tsx";

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
export function TermText({ text, where, seen }: { text: string; where: string; seen?: Set<string> }) {
  if (!state.DATA || !text) return <>{text}</>;
  const found = termMentions(state as unknown as DataIndex, text).sort((a, b) => a.start - b.start || b.end - a.end);
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
/** The definition opened from the text `where`, under it (the classic card), or nothing. */
export function DefCard({ where }: { where: string }) {
  const d = state.ui && state.ui.dterm;
  if (!d || !d.id.startsWith(where + "/")) return null;
  return <Bridge fill={() => defCard(where)} />;
}
