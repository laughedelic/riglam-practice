// What the tutor says, as the Path draws it, and the flags on it: a text of the tutor (its lines, the notes on the examples in words), the flag
// on it and the flag's editor, and Quorum's panel of a result. The flags are ai/flags.js's (it keeps and sends them), and so is what Quorum knows (ai/quorum.js).
import type { ComponentChildren } from "preact";
import { state } from "../state.js";
import { aiCase, cancelFlag, flagId, flagKeyOf, flagOf, openFlag, removeFlag, saveFlag } from "../ai/flags.js";
import { mname, statusOf } from "../ai/quorum-panel.js";
import { quorumNeeded, quorumThings, runReading } from "../ai/quorum.js";
import { factText, factTextIn } from "../practice/screen.js";
import { CELL_NAME } from "../../ai-shared/prompts.ts";
import type { CellId } from "../../ai-shared/relations.ts";
import { VERDICT_RE, parseFactLine } from "../../domain/verdict.ts";
import { DefCard, TermText } from "./terms.tsx";
import { Icon, NOFILL, nofillInput } from "./ui.tsx";

/** A case a flag is on (ai/flags.js): what was said, by whom, on which answer. */
export interface FlagCase { caseKey: string; part: string; partLabel?: string; shown?: string; n?: string | null; asked?: string; thing?: string; model?: string; runId?: string | null; id?: string; pair?: unknown }
/** How a stored note is read: its own pair, and which questions were accepted (review/exercise.js, noteContext). */
export interface NoteCtx { p: unknown; accepted: (f: unknown) => boolean }

/**
 * A text of the tutor, a paragraph a line: a line on an example as the page words it ("Take a pot: ..."), a line with a heading in bold. `ctx`
 * reads a stored note against its own answer (Review); `where` marks the terms it names, so that their definitions open under it.
 */
export function TutorText({ text, ctx, where }: { text: string; ctx?: NoteCtx; where?: string }) {
  const seen = new Set<string>(), out: ComponentChildren[] = [];
  const say = (t: string, w: string) => where ? <TermText text={t} where={w} seen={seen} /> : t;
  String(text || "").split("\n").map((s) => s.trim()).filter(Boolean).forEach((ln0, i) => {
    const w = (where || "") + i, f = parseFactLine(ln0);
    if (f) { out.push(<p class="whyt"><b>{f.label}:</b> {say(ctx ? factTextIn(f, ctx) : factText(f), w)}</p>); if (where) out.push(<DefCard where={w} />); return; }
    const ln = ln0.replace(/^[-•*]\s*/, "").replace(/\*\*/g, "").replace(VERDICT_RE, "").trim(); if (!ln) return;
    const m = ln.match(/^([A-Za-z][A-Za-z0-9 ,'’-]{0,28}):\s+(.*)$/);
    out.push(<p class="whyt">{m ? <><b>{m[1]}:</b> {say(m[2], w)}</> : say(ln, w)}</p>);
    if (where) out.push(<DefCard where={w} />);
  });
  return <>{out}</>;
}

const flagTitle = (c: FlagCase, on: boolean) => state.unlock ? "Flagging needs the Magic Key" : on ? "Flagged. Tap to change" : "Flag " + (c.partLabel || c.part);
/** The flag on a text of the tutor (with `word`, its word beside it): pressed once flagged; a tap opens the editor at `where`. */
export function FlagBtn({ c, where, word = false }: { c: FlagCase | null; where: string; word?: boolean }) {
  if (!c || !state.db || !state.ui) return null;
  const on = !!flagOf(c), F = state.ui.flagEdit, active = !!F && flagId(F.c) === flagId(c);
  return <button type="button" data-fid={flagId(c)} class={"pflg" + (on ? " on" : "") + (active ? " active" : "")} aria-pressed={on ? "true" : "false"}
    aria-label={(on ? "Flagged: " : "Flag ") + (c.partLabel || c.part)} title={flagTitle(c, on)} onClick={(e) => { e.stopPropagation(); openFlag(c, where); }}>
    <Icon n="flag" />{word ? <span>{on ? "Flagged" : "Flag"}</span> : null}</button>;
}
/** A value that can be flagged (Quorum's panel): its words; flagged, with the flag before them. */
function FlagVal({ c, where, text, cls = "" }: { c: FlagCase; where: string; text: string; cls?: string }) {
  const on = !!flagOf(c), F = state.ui && state.ui.flagEdit, active = !!F && flagId(F.c) === flagId(c);
  return <button type="button" data-fid={flagId(c)} class={"pfv" + (cls ? " " + cls : "") + (on ? " on" : "") + (active ? " active" : "")} aria-pressed={on ? "true" : "false"}
    aria-label={"Flag " + (c.partLabel || c.part) + ": " + text + (on ? " (flagged)" : "")} title={on ? "Flagged. Tap to change" : "Tap to flag"} onClick={(e) => { e.stopPropagation(); openFlag(c, where); }}>
    {on ? <Icon n="flag" /> : null}{text}</button>;
}
/** The flag being written at `where`: a note, what it should be, Submit, Cancel and (once flagged) Remove. */
export function FlagEditor({ where }: { where: string }) {
  const F = state.ui && state.ui.flagEdit; if (!F || F.where !== where) return null;
  const had = flagOf(F.c), nm = (F.c.model ? mname(F.c.model) + ": " : "") + (F.c.partLabel || F.c.part);
  const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancelFlag(); } };
  return <div class="pflag" role="group" aria-label="Flag">
    <p class="pfh"><Icon n="flag" /><b>{had ? "Flagged: " : "Flag: "}</b><span>{nm}</span></p>
    <textarea id="flag-note" class="pfield parea" rows={2} placeholder="What is wrong, or why it is right" aria-label="Note" {...NOFILL} value={F.note}
      onInput={(e) => { F.note = (e.currentTarget as HTMLTextAreaElement).value; }} onKeyDown={esc} />
    <input id="flag-sug" class="pfield" placeholder="I think it should be … (optional)" aria-label="It should be" {...nofillInput()} value={F.suggest}
      onInput={(e) => { F.suggest = (e.currentTarget as HTMLInputElement).value; }}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveFlag(); } else esc(e); }} />
    {state.reports ? <p class="pnoteline">Submit sends this flag and the exercise it is on to the app’s maintainer.</p> : null}
    <div class="tact"><button type="button" class="pbtn" onClick={saveFlag}>Submit</button><button type="button" class="pbtn quiet" onClick={cancelFlag}>Cancel</button>
      {had ? <button type="button" class="pbtn quiet" onClick={() => removeFlag(flagId(F.c))}>Remove flag</button> : null}</div>
  </div>;
}
/** The flag on the tutor's explanation of the answer on screen, or on its note on a case (`cell`, with its words), as ai/flags.js makes them. */
export function explainCase(content: string, cell?: string, label?: string, thing?: string): FlagCase | null {
  if (!state.db || !state.ui || state.ui.syllogism || !state.cur || !state.cur.p || !content) return null;
  return cell ? aiCase("explain", "Claude’s note on " + label, content, cell, undefined, thing) : aiCase("explain", "Claude’s explanation", content, null);
}

/* ---------- Quorum ---------- */
const sign = (a: string) => a === "yes" ? "✓" : a === "no" ? "✗" : "?";
interface Run { name: string; ok: boolean; error?: string; ms: number; text: string }
/**
 * Quorum's panel of the result on screen (where the server offers it and this device has it on): how the run went, then for each example the
 * learner wrote what every model and the judge said of it, beside the page's verdict, and the answers themselves. Any value can be flagged.
 */
export function QuorumPanel() {
  const U = state.ui!, s = statusOf(U), q = U.quorum, rec = q && q.record;
  const head = <p class="pqm-h"><b>Quorum</b> <span>{s.sum}</span></p>;
  if (!rec) {
    const why = q && q.busy ? "The models answer one after the other; the explanation appears when they are done."
      : !q && !quorumNeeded(U) ? "Quorum is for examples the page could not check itself. Every example here has a verdict, so one model explains and the server keeps nothing."
      : "With Quorum on, the explanation of an answer with an example the page could not check comes from several models, and this panel shows each of them. The server keeps the run so the models can be compared.";
    return <div class="pqm">{head}<p class="pnoteline">{why}</p></div>;
  }
  const runs: Run[] = rec.models.concat(rec.judge ? [rec.judge] : []);
  const errs = runs.filter((r) => !r.ok).map((r) => r.name + ": failed (" + (r.error || "error") + ")");
  const p = state.cur!.p, tab = U.debate ? "debate" : "practice", J = rec.judge && rec.judge.ok ? rec.judge : null, caseKey = flagKeyOf(U);
  const things = quorumThings(U).map((t: { text: string; cells: string[] }, i: number) => {
    const where = "t" + i, base = { caseKey, thing: t.text, runId: rec.id, pair: { a: p.a, b: p.b, relation: p.relation, tab } };
    const jr = runReading(J, t.text), jcell = jr && jr.cell;
    const row = (run: Run) => {
      const judge = run === rec.judge, name = judge ? "Judge’s ruling" : run.name;
      if (!run.ok) return <div class="pqm-r off"><span class="pqm-n">{name}</span><span class="pqm-w">no answer</span></div>;
      const r = runReading(run, t.text);
      if (!r) return <div class="pqm-r"><span class="pqm-n">{name}</span><span class="pqm-w">does not mention it</span></div>;
      const c = { ...base, model: judge ? "judge" : run.name.toLowerCase() };
      const V = (part: string, partLabel: string, shown: string, text: string, cls?: string) => <FlagVal c={{ ...c, part, partLabel, shown }} where={where} text={text} cls={cls} />;
      const same = !!r.cell && t.cells.includes(r.cell), vs = !judge && jcell && r.cell ? r.cell === jcell : null;
      return <div class={"pqm-r" + (judge ? " ruling" : "")}><span class="pqm-n">{name}</span>
        <span class="pqm-v">{r.cell ? V("cell", "cell", CELL_NAME[r.cell as keyof typeof CELL_NAME], CELL_NAME[r.cell as keyof typeof CELL_NAME], same ? "ok" : "diff") : V("unsure", "cell", "unsure", "unsure", "uns")}
          {V("inA", "in A", sign(r.a), "A " + sign(r.a))}{V("inB", "in B", sign(r.b), "B " + sign(r.b))}</span>
        <span class="pqm-s">{vs === null ? null : <b class={"pqm-vs " + (vs ? "yes" : "no")} title={vs ? "The same cell as the judge’s" : "A different cell from the judge’s"}>{vs ? "= ruling" : "≠ ruling"}</b>}{(run.ms / 1000).toFixed(1)} s</span></div>;
    };
    const pv = t.cells.map((cell) => {
      const rr = U.res.cells[cell as CellId] as { v: string; by?: string } | undefined; if (!rr) return null;
      const says = ({ ok: "fits", bad: "does not fit", cmp: "not checked" } as Record<string, string>)[rr.v] || rr.v;
      return { cell, txt: CELL_NAME[cell as keyof typeof CELL_NAME] + ": " + says + (rr.by === "claude" ? " (checked by Claude)" : "") };
    }).filter(Boolean) as { cell: string; txt: string }[];
    return <div class="pqm-c">
      <p class="pqm-t"><b lang="en">“{t.text}”</b> <span class="pqm-you">you put it in {t.cells.map((c) => CELL_NAME[c as keyof typeof CELL_NAME]).join(", ")}</span>
        <FlagVal c={{ ...base, part: "check", partLabel: "the whole check", shown: "all runs" }} where={where} text="Flag all" cls="all" /></p>
      {rec.models.map(row)}{rec.judge ? row(rec.judge) : null}
      <div class="pqm-r page"><span class="pqm-n">Page</span><span class="pqm-v">{pv.map((x) => <FlagVal c={{ ...base, part: "verdict", partLabel: "page verdict", n: x.cell, shown: x.txt }} where={where} text={x.txt} />)}</span></div>
      <FlagEditor where={where} />
    </div>;
  });
  return <div class="pqm">{head}
    {errs.length ? <p class="pnoteline bad">{errs.join(". ")}.</p> : null}
    <p class="pnoteline">The answer you see is {rec.shown === "Judge" ? "the judge’s" : rec.shown + "’s"}.</p>
    {things}
    <details class="pqm-x"><summary>The answers</summary>{runs.filter((r) => r.ok).map((r) => <><p class="pqm-xn"><b>{(r === rec.judge ? "Judge" : r.name) + (rec.shown === r.name ? " (shown)" : "")}</b></p><p class="pqm-xt">{r.text}</p></>)}</details>
    <p class="pnoteline">Tap any value to flag it. The server keeps this run so the models can be compared; the page verdicts are the ones from the answer you see.</p>
    {state.flagErr ? <p class="pnoteline bad">{state.flagErr}</p> : null}
  </div>;
}
