// The Path's small parts, as the Path Lab draws them: the line icons, the diamonds, a stop on the path, a section of the line, a section's
// heading, the relation figures, the marks of a verdict, the toggles, the words in a row, and the host of a part still drawn by the classic page.
import type { ComponentChildren, InputHTMLAttributes } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";
import { state } from "../state.js";
import { currentLook } from "./look.ts";

const I: Record<string, string> = {
  blitz: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 2M9.5 2.5h5M12 2.5V6M18.5 6.5l1.5-1.5"/>',
  opts: '<path d="M4 8h9M17 8h3M4 16h3M11 16h9"/><circle cx="15" cy="8" r="2"/><circle cx="9" cy="16" r="2"/>',
  tutor: '<path d="M3 3h11v7H7.5L5 12.5V10H3z"/><path d="M10 13h11v7h-2v2.5L16.5 20H10z"/>',
  skip: '<path d="M5 6l8 6-8 6zM17 6v12"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8L3.5 9.7l5.9-.8z"/>',
  eight: '<path stroke-linejoin="miter" d="M12.00 1.80L14.99 4.79L19.21 4.79L19.21 9.01L22.20 12.00L19.21 14.99L19.21 19.21L14.99 19.21L12.00 22.20L9.01 19.21L4.79 19.21L4.79 14.99L1.80 12.00L4.79 9.01L4.79 4.79L9.01 4.79z"/>',
  mark: '<path d="M6.8 3.5h10.4v17l-5.2-3.9-5.2 3.9z"/>',
  chev: '<path d="M9 5l7 7-7 7"/>',
  arrow: '<path d="M4 12h15M13 6l6 6-6 6"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  locked: '<rect x="5" y="10.5" width="14" height="10" rx="1.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  unlocked: '<rect x="5" y="10.5" width="14" height="10" rx="1.5"/><path d="M8 10.5V7.5a4 4 0 0 1 7.7-1.5"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l2 2M14 9l2 2"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  cross: '<path d="M7 7l10 10M17 7L7 17"/>',
  q: '<path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14"/><path d="M12 17.5v.01"/>',
  speak: '<path d="M11 5L6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
  speakoff: '<path d="M11 5L6 9H2v6h4l5 4z"/><path d="M16 9l6 6M22 9l-6 6"/>',
  mic: '<rect x="9" y="2.5" width="6" height="11.5" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v3.5"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v4h-4"/>',
  flag: '<path d="M6 21V3.5M6 4h11.5l-2.5 4 2.5 4H6"/>',
  skipped: '<path d="M5 6l6 6-6 6M12 6l6 6-6 6"/>',
  again: '<path d="M12 7.5v4.8l-3.1 1.9"/><path d="M19.9 13.6A8 8 0 1 1 17.7 6.3"/><path d="M20.4 3.9v3.9h-3.9"/>',     // a clock turning forward: it comes again later
};
/** A line icon; the favorites mark is drawn in the shape the look names. */
export function Icon({ n, cls = "i" }: { n: string; cls?: string }) {
  const name = n === "star" ? ({ eight: "eight", bookmark: "mark" } as Record<string, string>)[currentLook().starShape] || "star" : n;
  return <svg class={cls} viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: I[name] || "" }} />;
}

/** A diamond on the line: `cls` is its size and state (sec, sub, big; now, done, yours, ok, no, pt, tut ...), `mark` an icon inside it. */
export const D = ({ cls, mark }: { cls: string; mark?: string }) => <span class={"d " + cls}>{mark ? <span class="mk"><Icon n={mark} /></span> : null}</span>;
/** A stop on the path: its mark in the margin, its text beside the line. */
export const St = ({ d, cls = "", children }: { d: ComponentChildren; cls?: string; children?: ComponentChildren }) => <div class={"st " + cls}>{d}<div class="ptx">{children}</div></div>;
/** A section of the path, which draws its own piece of the line (walked, cur, gap, ahead, okp, nop, ptp, ptail). */
export const Sx = ({ cls, children }: { cls: string; children?: ComponentChildren }) => <section class={"sx " + cls}>{children}</section>;
/** The heading of a step: "1 Relation", and what it asks in a lighter voice; `aside` at its right (Skip, where the step has no favorites mark). */
export const Head = ({ d, h, sub, later, aside }: { d: ComponentChildren; h: string; sub?: string; later?: boolean; aside?: ComponentChildren }) =>
  <St d={d} cls={"sechead" + (aside ? " hasaside" : "")}><span class={"ph" + (later ? " later" : "")}>{h}{sub ? <span>{sub}</span> : null}</span>{aside}</St>;
export const Gap = ({ h }: { h: number }) => <div style={{ height: h + "px" }} />;

// the relation figures, vertical: A above, B below (the diagrams transposed); the keys are the app's relations
const SH: Record<string, [number[], number[]]> = { mi: [[30, 52, 32], [30, 52, 32]], "3ab": [[30, 44, 14], [30, 56, 32]], "3ba": [[30, 48, 32], [30, 60, 14]], "4": [[30, 36, 26], [30, 68, 26]], con: [[30, 24, 20], [30, 80, 20]] };
const OV: Record<string, number[] | null> = { mi: [30, 52, 23], "3ab": [30, 44, 14], "3ba": [30, 60, 14], "4": [30, 52, 10], con: null };
export const dia = (cx: number, cy: number, h: number) => `${cx},${cy - h} ${cx + h},${cy} ${cx},${cy + h} ${cx - h},${cy}`;
/** The figure of a relation: two diamonds, A above B, and what they share filled. */
export function Fig({ k, size = "r" }: { k: string; size?: string }) {
  const sh = SH[k]; if (!sh) return null;
  const [a, b] = sh, full = k === "mi" && currentLook().miFig === "full", o = full ? [30, 52, 32] : OV[k];
  const pa = <polygon class="a" vector-effect="non-scaling-stroke" points={dia(a[0], a[1], a[2])} />;
  const pb = <polygon class="b" vector-effect="non-scaling-stroke" points={dia(b[0], b[1], b[2])} />;
  const big = a[2] >= b[2] && k !== "4" && k !== "con";
  return <svg class={"rfig " + size + (k === "mi" && !full ? " mii" : "")} viewBox="-3 1 66 102" aria-hidden="true">
    {big ? [pa, pb] : [pb, pa]}{o ? <polygon class="o" vector-effect="non-scaling-stroke" points={dia(o[0], o[1], o[2])} /> : null}
  </svg>;
}
/** A verdict's mark: right, wrong, or not settled yet. */
export const Mark = ({ m }: { m: string }) => <span class={"mark " + m}><Icon n={m === "ok" ? "check" : m === "no" ? "cross" : "q"} /></span>;
/** Four small diamonds for the cases of an answer, or the answers of a day. */
export const Minis = ({ list }: { list: string[] }) => <span class="minis">{list.map((c) => <i class={c} />)}</span>;

/** A toggle in the look's style; the row around it is the button. */
/** A switch's mark. The look's `both` (the Design Lab's pick, 28 Oct): two diamonds, a hollow one and a small filled one beside it, which move toward each other until the
 *  small one sits inside, so that off (the pair) and on (one figure) both stand in the middle of the mark's place; the other looks draw the older forms (37-path-panels.css). */
export const Toggle = ({ on }: { on: boolean }) => currentLook().toggle === "both"
  ? <svg class={"dtg" + (on ? " on" : "")} viewBox="0 0 40 22" aria-hidden="true">
    <polygon class="dtb" points="20,2 29,11 20,20 11,11" /><polygon class="dts" points="20,6.5 24.5,11 20,15.5 15.5,11" /></svg>
  : <span class={"tg" + (on ? " on" : "")} aria-hidden="true"><i /></span>;
/** Words in a row: one of them pressed. */
export function Words<T extends string | number>({ label, items, cur, on }: { label: string; items: [T, string][]; cur: T; on: (v: T) => void }) {
  return <span class="seg2" role="group" aria-label={label}>{items.map(([v, l]) =>
    <button type="button" aria-pressed={cur === v ? "true" : "false"} onClick={() => on(v)}>{l}</button>)}</span>;
}
/** A knob that pulls (a strip, a sheet): a quiet chevron. */
export const Knob = ({ up, label, onClick, cls = "" }: { up?: boolean; label: string; onClick?: () => void; cls?: string }) =>
  <button type="button" class={"knob" + (up ? " up" : "") + (cls ? " " + cls : "")} aria-label={label} onClick={onClick}><span class="mk"><Icon n="chev" /></span></button>;

type Kids = Node | string | null | undefined | false | Kids[];
const flat = (k: Kids, out: (Node | string)[] = []) => {
  if (Array.isArray(k)) for (const x of k) flat(x, out); else if (k !== null && k !== undefined && k !== false) out.push(k);
  return out;
};
/**
 * A part the classic page still draws (src/app/shell, practice ...), hosted in the Path until it is drawn on the path itself. `fill` builds
 * its nodes on every draw, as the classic page does, and `after` runs once they are in; the host keeps its scroll. The host has the class
 * `pbr`, under which the classic rules apply (38-path-bridge.css), unless `own`: nodes built in the Path's classes by the classic builders.
 */
export function Bridge({ fill, after, cls = "", own = false, id }: { fill: (host: HTMLElement) => Kids; after?: (host: HTMLElement) => void; cls?: string; own?: boolean; id?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const h = ref.current; if (!h) return;
    const y = h.scrollTop, kids = flat(fill(h));
    h.replaceChildren(...kids);
    if (y) h.scrollTop = y;
    if (after) after(h);
  });
  return <div ref={ref} id={id} class={(own ? "pdom" : "pbr") + (cls ? " " + cls : "")} />;
}

/** Whether this device has the hover of a mouse, and whether it is a touch screen (the layout with the keyboard up is for those). */
export const coarse = () => { try { return matchMedia("(pointer: coarse)").matches; } catch { return false; } };
/** The pair on screen, when there is one. */
export const pairNow = () => (state.cur && state.cur.p) || null;

/**
 * The hints for a field of the practice that is not a form for the browser: no saved passwords, cards or addresses offered for it, no spell
 * checker or capital letters on a learner's example, and the password managers told to leave it alone. A page can only ask: Chrome on Android
 * keeps a bar of key, card and address icons above the keyboard on every text field whatever `autocomplete` says (Chromium issue 40236405).
 */
export const NOFILL = {
  autoComplete: "off", autoCapitalize: "off", autoCorrect: "off", spellcheck: false,
  "data-lpignore": "true", "data-1p-ignore": "true", "data-bwignore": "true", "data-form-type": "other",
} as const;
/**
 * The same for an `<input>`, which on a touch screen is a search field: Chrome on Android leaves the bar of saved keys, cards and addresses off the keyboard for one, where the
 * hints above leave it on a text field (not on the first focus, but on the next one). The role keeps it a text box for a screen reader; the Enter key is the one `enterKeyHint`
 * names. Elsewhere it stays a text field (a search field clears at Escape). `list` is the id of a datalist of suggestions, when there is one.
 * Preact's input types follow ARIA in HTML, which has no text box role on a search field or on a field with a list: this is a deliberate exception, so the type is set by hand.
 */
export const nofillInput = (list?: string) => ({ ...NOFILL, type: coarse() ? "search" : "text", role: "textbox", ...(list ? { list } : {}) }) as unknown as InputHTMLAttributes<HTMLInputElement>;
