// The two terms of the pair where the text names them: a term of the pair, A or B, stands out from the words around it in the way the look's
// `subj` says (italic, a small A or B before it, a small diamond, each in its own quiet ink; 38-path-exercises.css). The classic page marked them
// with a red and a blue chip and italic; the Path's colors mean other things, so the marks here are quiet. The practice option "A/B markers"
// turns them off.
import type { ComponentChildren } from "preact";

type Names = { a: string; b: string };

/** A term of the pair, named in the text; `k` says which one. */
export const Sub = ({ k, children }: { k: "a" | "b"; children: ComponentChildren }) => <span class={"sj " + k} data-k={k.toUpperCase()}>{children}</span>;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A text of the app's own wording with the names of the pair marked wherever they occur (the longer name first, whole words only, any case).
 * `also` are other spellings of the names, such as the singular a question says ("a sound" for "sounds").
 */
export function Subjects({ text, p, also }: { text: string; p: Names; also?: [string, "a" | "b"][] }): ComponentChildren {
  if (!text) return text;
  const names: [string, "a" | "b"][] = [[p.a, "a"], [p.b, "b"], ...(also || [])];
  const list = names.filter(([n]) => n && n.trim()).sort((x, y) => y[0].length - x[0].length);
  if (!list.length) return text;
  const re = new RegExp("(?<![\\w-])(" + list.map(([n]) => esc(n)).join("|") + ")(?![\\w-])", "gi");
  const out: ComponentChildren[] = []; let at = 0;
  for (const m of text.matchAll(re)) {
    const k = list.find(([n]) => n.toLowerCase() === m[0].toLowerCase())![1];
    out.push(text.slice(at, m.index), <Sub k={k}>{m[0]}</Sub>);
    at = m.index! + m[0].length;
  }
  out.push(text.slice(at));
  return out;
}
/** The strings among some nodes (a text cut into pieces by other marks), with the names of the pair marked in them. */
export function markNames(nodes: ComponentChildren, p: Names): ComponentChildren {
  return Array.isArray(nodes) ? nodes.map((n) => (typeof n === "string" ? <Subjects text={n} p={p} /> : n)) : typeof nodes === "string" ? <Subjects text={nodes} p={p} /> : nodes;
}
