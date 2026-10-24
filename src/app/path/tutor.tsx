// The tutor's conversation on the Path: a page in the tutor's color, opened from its button in the top bar once there is a result. What it is
// about at the head, the question field (or Stop while the tutor writes), then the exchanges, the newest first, each answer above the question
// it answers and each with its flag. The conversation is the classic page's (state.ui.chat, ai/tutor.js ask), and so are the flags; openChat
// gives the field the cursor for the first question.
import { useRef } from "preact/hooks";
import { state } from "../state.js";
import { aiCase } from "../ai/flags.js";
import { ask } from "../ai/tutor.js";
import { canAsk } from "../core/ask.js";
import { REL } from "../core/rel.js";
import { closeChat } from "../shell/chat.js";
import { exName } from "../shell/exercises.js";
import { flagAsked } from "../../domain/flags.ts";
import { syllogismText } from "../../domain/syllogism.ts";
import type { RelKey } from "../../ai-shared/relations.ts";
import { FlagBtn, FlagEditor, TutorText } from "./flags.tsx";
import { refreshPath } from "./index.tsx";
import { Thinking, u0 } from "./parts.tsx";
import { Foot, Station, TopBar } from "./shell.tsx";
import { D, St, Sx, nofillInput } from "./ui.tsx";

interface Turn { role: string; content?: string; pending?: boolean; hidden?: boolean; kind?: string }
/** What the conversation is about: the pair and how the result went, or the syllogism and the reply. */
function About() {
  const u = u0(), c = state.cur!;
  if (u.syllogism) return <St d={<D cls="sec tut" />} cls="pabout"><b>{syllogismText(c.c!, state.syllogismWording)}</b><small>{u.timeout ? "Time is up" : u.grade && u.grade.correct ? "Right" : "Not quite"}</small></St>;
  // Find a pair: the pair is what is judged, and a pair of the learner's own stays open until the tutor has said whether it has the relation
  const p = c.p, r = u.checked && u.res, fd = !!u.find;
  const v = !r ? "" : r.relOpen ? (r.relUns ? "pair not settled" : "pair not judged yet") : ({ ok: "all right", part: (fd ? "pair" : "relation") + " right, not everything else", pend: (fd ? "pair" : "relation") + " and cells right", bad: "not quite" } as Record<string, string>)[r.overall];
  return <St d={<D cls="sec tut" />} cls="pabout"><b>{p.a} · {p.b}</b><small>{(fd ? "Asked for: " + REL[u.rel as RelKey].name : REL[p.relation].name) + (v ? " · " + v : "")}</small></St>;
}
/** The question field and Ask; while the tutor writes, Stop instead. */
function AskRow() {
  const u = u0(), ref = useRef<HTMLInputElement>(null);
  const send = () => { const q = (u.q || "").trim(); if (!q) return; u.q = ""; void ask(q); refreshPath(); };
  if (u.ctl) return <St d={<D cls="sub pthink" />} cls="pask"><Thinking label="the tutor is writing" /><button type="button" class="pbtn" onClick={() => u.ctl && u.ctl.abort()}>Stop</button></St>;
  if (!canAsk()) return null;
  return <St d={<D cls="sub pk" />} cls="pask"><div class="fieldrow"><input ref={ref} id="ask-in" class="pfield" placeholder="Ask a follow-up question" aria-label="Follow-up question" {...nofillInput()} enterKeyHint="send"
    value={u.q || ""} onInput={(e) => { u.q = (e.currentTarget as HTMLInputElement).value; }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); send(); } }} /></div>
    <button type="button" class="pbtn" onClick={send}>Ask</button></St>;
}
/** One answer of the tutor: its words, its flag (and the flag's editor), or the dots while it has none yet. */
function Answer({ t, idx }: { t: Turn; idx: number }) {
  const u = u0(), expl = t.kind === "explain", where = "o" + idx, q = !expl && u.chat ? u.chat[idx - 1] : null;
  const c = !u.syllogism && !t.pending && t.content && state.cur && state.cur.p ? aiCase(expl ? "explain" : "chat", expl ? "the tutor’s explanation" : "the tutor’s answer", t.content, expl ? null : idx, flagAsked(q)) : null;
  return <St d={<D cls={"sub " + (t.pending ? "pthink" : "tut")} />} cls="sb pans2"><span class="lab">{expl ? "the tutor’s explanation" : "the tutor"}</span>
    {t.content ? <div class="tsay"><TutorText text={t.content} where={"ct" + idx + "."} /></div> : <Thinking label="the tutor is thinking" />}
    {c ? <span class="pflgrow"><FlagBtn c={c} where={where} word /></span> : null}<FlagEditor where={where} /></St>;
}
export function TutorPage() {
  const u = u0(), groups: { q?: Turn; a?: Turn; ai?: number }[] = [];
  (u.chat || []).forEach((t: Turn, idx: number) => {
    if (t.hidden) return;
    if (t.role === "user") groups.push({ q: t });
    else { const g = groups[groups.length - 1]; if (g && g.q && !g.a) { g.a = t; g.ai = idx; } else groups.push({ a: t, ai: idx }); }
  });
  return <>
    <TopBar title="The tutor" />
    <div class="ppage ptalk">
      <Sx cls="walked first tutl"><div style={{ height: "14px" }} /><About /><AskRow />
        {u.chatErr ? <St d={<span />} cls="pnote2"><p class="terr">{u.chatErr}</p></St> : null}
        {groups.slice().reverse().map((g) => <>
          {g.a ? <Answer t={g.a} idx={g.ai!} /> : null}
          {g.q ? <St d={<D cls="sub yours" />} cls="sb pq2"><span class="lab">you asked</span><span class="pans">{g.q.content}</span></St> : null}
        </>)}
        <div style={{ height: "14px" }} /></Sx>
    </div>
    <Foot><Station name="Back to the result" hint={exName(state.tab)} act={closeChat} /></Foot>
  </>;
}
