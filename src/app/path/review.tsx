// Review on the Path: today's trail as the lab draws it (each answer a stop on the line, its verdict the stop's color and its cases as small
// diamonds, the newest at the bottom), and the classic page's other sections in the same grammar: the totals, the mistakes, the favorites,
// the pairs skipped and the flags. A row of a checked pair unfolds into the answer as it was checked. What is counted, and the steps (practice
// a pair again, retry the mistakes, remove a favorite, edit a flag), are the classic page's (src/app/review, practice/, ai/flags.js).
import type { ComponentChildren } from "preact";
import { state } from "../state.js";
import { checkReplies, isSent } from "../ai/flag-reports.js";
import { flagId, openFlag, removeFlag, setFlagState } from "../ai/flags.js";
import { mname } from "../ai/quorum-panel.js";
import { CELLS, REL, notaOf, refOf } from "../core/rel.js";
import { dayOf, gradeOf, isMiss, today } from "../core/util.js";
import { QCELL, qPlain } from "../debate/text.js";
import { removeFav, startFav } from "../practice/favorites.js";
import { SKIP_DAYS, skipActive, startSkipped, unskipKey } from "../practice/skips.js";
import { answerList } from "../practice/universe.js";
import { debateStats } from "../review/debate-stats.js";
import { noteContext, practiceAgain } from "../review/exercise.js";
import { findLine, findStats } from "../review/find-stats.js";
import { REPLY_HEAD, answerOf, byNewest, caseOf, replyCase } from "../review/flag-list.js";
import { RNAME, mistakeLine, overview, pairFromAnswer, pct, startRetry, uniqueMistakePairs, weakSpots } from "../review/review.js";
import { SAID, SAY, sylExample, sylLine, syllogismStats } from "../review/syllogism-stats.js";
import { exName } from "../shell/exercises.js";
import { setTab } from "../shell/tabs.js";
import { flagStateText, flaggedPart } from "../../domain/flags.ts";
import { FIND_RELS } from "../../domain/find.ts";
import { syllogismText } from "../../domain/syllogism.ts";
import type { CellId, RelKey } from "../../ai-shared/relations.ts";
import type { AnswerDoc, FavDoc, FlagDoc, SkipDoc } from "../types.ts";
import { FlagEditor, TutorText } from "./flags.tsx";
import { refreshPath } from "./index.tsx";
import { CASE } from "./parts.tsx";
import { Foot, Station, TopBar } from "./shell.tsx";
import { StoredAnswer, isOpen, toggleOpen } from "./stored.tsx";
import { D, Fig, Gap, Icon, Minis, St, Sx, Words } from "./ui.tsx";

const NAME: Record<string, string> = { practice: "Relations", debate: "Pervasions", find: "Find a pair", syllogism: "Syllogisms", categories: "Categories" };
// "pend" is right so far with cases still to check, as the result says; "open" is a pair of the learner's own the tutor has not judged yet
const WORD: Record<string, string> = { ok: "Right", part: "Partly right", bad: "Not quite", pend: "Right so far", open: "Not judged yet" };
const STOP: Record<string, string> = { ok: "ok", part: "pt", bad: "no", pend: "ok", open: "nil" };
const MINI: Record<string, string> = { ok: "ok", bad: "bad", cmp: "cmp", open: "cmp", part: "part" };
const hm = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); };

/** An answer of any exercise as a row of a trail: when, which exercise, what it was about, how it went and its cases. */
interface Entry { key: string; at: string; mode: string; title: string; v: string; minis: string[]; doc: any; sub?: string }
function entryOf(a: any, debate: boolean): Entry {
  const mode = debate ? "debate" : a.mode || "practice", v = mode === "find" && a.relOpen ? "open" : gradeOf(a) || "bad";
  const pair = mode === "practice" || mode === "debate" || mode === "find";
  const title = mode === "syllogism" ? syllogismText(a, a.wording) : mode === "categories" ? String(a.thing || "") : a.a + " · " + a.b;
  const minis = !pair ? [] : mode === "debate" ? (QCELL as CellId[]).map((c) => { const q = (a.qs || []).find((y: { c: string }) => y.c === c); return q && q.verdict ? MINI[q.verdict] || "" : ""; }).filter(Boolean)
    : (CELLS as CellId[]).map((c) => { const x = a.cells && a.cells[c]; return x && x.verdict ? MINI[x.verdict] || "" : ""; }).filter(Boolean);
  const sub = mode === "syllogism" ? [sylLine(a), sylExample(a)].filter(Boolean).join(". ") : mode === "categories" ? catLine(a) : mode === "find" ? findLine(a) : undefined;
  return { key: (debate ? "d|" : "a|") + (a.pairId || "") + "|" + a.at, at: a.at || "", mode, title, v, minis, doc: pair ? a : null, sub };
}
function catLine(a: any) {
  const rows = (a.rows || []) as { yes: boolean; said: boolean }[], right = rows.filter((r) => r.yes === r.said).length;
  return (a.s1 ? "step 1 right" : "step 1: " + right + " of " + rows.length + " right") + (a.s2 === undefined ? "" : a.s2 ? ", the most specific right" : ", not the most specific");
}
const allEntries = () => [...Object.values(state.answers).map((a) => entryOf(a, false)), ...Object.values(state.debates).map((a) => entryOf(a, true))];

/** A row of a trail: the stop's color is the verdict; a checked pair unfolds into its answer, with the way to practice it again. */
function TrailRow({ e, when }: { e: Entry; when: string }) {
  const k = "r:" + e.key, open = !!e.doc && isOpen(k), p = e.doc && e.mode !== "find" ? pairFromAnswer(e.doc) : e.doc && e.doc.pair && !e.doc.pair.own ? e.doc.pair : null;
  const head = <><span class="ex2">{when} · {NAME[e.mode] || e.mode}</span><b>{e.title}</b>
    <span class={"rs " + e.v}>{WORD[e.v] || WORD.bad}{e.minis.length ? <Minis list={e.minis} /> : null}</span>{e.sub ? <small class="tsub">{e.sub}</small> : null}</>;
  return <>
    <St d={<D cls={"sec " + (STOP[e.v] || "no")} />} cls={"trow" + (e.doc ? " can" : "") + (open ? " open" : "")}>
      {e.doc ? <button type="button" class="trb" aria-expanded={open ? "true" : "false"} onClick={() => toggleOpen(k)}>{head}<span class="arr"><Icon n="chev" /></span></button> : head}
    </St>
    {open ? <div class="pfold"><StoredAnswer doc={e.doc as AnswerDoc} k={k} />
      {p ? <St d={<span />} cls="pacts"><button type="button" class="pbtn" onClick={() => practiceAgain(p, "Retry")}>Practice this pair</button></St> : null}</div> : null}
  </>;
}
const Empty = ({ children }: { children: ComponentChildren }) => <p class="pempty">{children}</p>;
const Trail = ({ children }: { children: ComponentChildren }) => <Sx cls="walked first ptrail"><Gap h={6} />{children}<Gap h={6} /></Sx>;
const Group = ({ h, sub }: { h: string; sub?: string }) => <p class="pgh"><b>{h}</b>{sub ? <span>{sub}</span> : null}</p>;

function Today() {
  const t = today(), list = allEntries().filter((e) => dayOf(e.at) === t).sort((x, y) => x.at.localeCompare(y.at));
  if (!list.length) return <Empty>Nothing answered today yet. Each answer joins this trail as you practice, the newest at the bottom.</Empty>;
  return <Trail>{list.map((e) => <TrailRow e={e} when={hm(e.at)} />)}</Trail>;
}

/* ---------- the totals ---------- */
const Bar = ({ p }: { p: number }) => <span class={"pmeter" + (p < 50 ? " low" : p < 80 ? " half" : "")} aria-hidden="true"><i style={{ width: p + "%" }} /></span>;
/** A line of the totals: what is counted, how many of how many, and a meter. */
const Stat = ({ fig, name, k, n, text }: { fig?: string; name: ComponentChildren; k?: number; n?: number; text?: string }) =>
  <St d={fig ? <Fig k={fig} size="xs" /> : <D cls="sub done" />} cls="pstat"><span class="nm">{name}</span>
    <span class="num">{text !== undefined ? text : n ? k + " / " + n : "–"}{text === undefined && n ? <Bar p={pct(k || 0, n)} /> : null}</span></St>;
function Overview() {
  const all = answerList(), d = debateStats(), f = findStats(), y = syllogismStats();
  const out: ComponentChildren[] = [];
  if (all.length) {
    const { relOk, G, segs, days, byRel } = overview(all);
    const mx = Math.max(1, ...days.map((x) => x[1]));
    out.push(<Group h="Relations" sub={all.length + (all.length === 1 ? " pair" : " pairs") + " answered, the relation right " + pct(relOk, all.length) + "%"} />,
      <div class="pgrades"><div class="psbar" role="img" aria-label={segs.map(([g, l]) => l + " " + pct(G[g], all.length) + "%").join(", ")}>
        {segs.map(([g, l]) => <span class={"g-" + g} style={{ flex: G[g] }} title={l + ": " + G[g]} />)}</div>
        <ul class="plegend2">{segs.map(([g, l]) => <li><i class={"g-" + g} />{l} <b>{pct(G[g], all.length)}%</b></li>)}</ul></div>,
      <Group h="Last 14 days" sub="pairs per day" />,
      <div class="pdays">{days.map(([day, n], i) => <div class={"pday" + (i === 13 ? " today" : "")} title={day + ": " + n}>
        <span class="pdc"><i class={n ? "has" : ""} style={{ height: Math.max(2, Math.round(44 * n / mx)) + "px" }} /></span><span class="dn">{n ? String(n) : ""}</span></div>)}</div>,
      <Group h="By relation" sub="the relation chosen right" />,
      <Sx cls="walked">{byRel.map(([r, n, k]) => <Stat fig={r === "3" ? "3ab" : r} name={RNAME[r as keyof typeof RNAME]} k={k} n={n} />)}</Sx>);
  } else out.push(<Empty>No answers in Relations yet. Your history and weak spots will show up here.</Empty>);
  if (d) out.push(<Group h="Pervasions" sub={d.n + " pairs, the relation right " + pct(d.relOk, d.n) + "%"} />,
    <Sx cls="walked">{(d.rows as [number, number, number][]).map(([i, n, k]) => <Stat name={"Question " + (i + 1) + ": " + qPlain(i)} k={k} n={n} />)}
      {d.med != null ? <Stat name="Median time to answer, blitz" text={(d.med / 1000).toFixed(1) + " s"} /> : null}
      {d.timedN ? <Stat name="Ran out of time (counted as accepted)" text={d.outN + " / " + d.timedN} /> : null}</Sx>);
  if (f) out.push(<Group h="Find a pair" sub={f.all.length + " pairs, the pair right " + pct(f.right, f.judged.length) + "%"} />,
    <Sx cls="walked">{FIND_RELS.map((r: RelKey, i: number) => <Stat fig={r} name={REL[r].name} k={f.rows[i][2] as number} n={f.rows[i][1] as number} />)}
      {f.own ? <Stat name="Pairs of your own words, judged by the tutor" text={String(f.own)} /> : null}</Sx>,
    <Trail>{f.all.slice().reverse().slice(0, 10).map((a: any) => { const e = entryOf(a, false); return <TrailRow e={e} when={dayOf(a.at)} />; })}</Trail>);
  if (y) out.push(<Group h="Syllogisms" sub={y.all.length + (y.all.length === 1 ? " syllogism" : " syllogisms") + ", the reply right " + pct(y.right, y.all.length) + "%"} />,
    <Sx cls="walked">{(y.rows as [string, number, number][]).map(([r, n, k]) => <Stat name={SAY[r as keyof typeof SAY]} k={k} n={n} />)}
      {y.given.length ? <Stat name="Counter-examples that were one" k={y.shown} n={y.given.length} /> : null}
      {y.late ? <Stat name="Time ran out (Blitz)" text={y.late + (y.late === 1 ? " time" : " times")} /> : null}
      {y.mixed.map(([k, n]: [string, number]) => { const [said, was] = k.split(">"); return <Stat name={"Said “" + SAID[said as keyof typeof SAID] + "” when it was “" + SAID[was as keyof typeof SAID] + "”"} text={n + (n === 1 ? " time" : " times")} />; })}</Sx>,
    <Trail>{y.all.slice().reverse().slice(0, 10).map((a: any) => <TrailRow e={entryOf(a, false)} when={dayOf(a.at)} />)}</Trail>);
  return <>{out}</>;
}

/* ---------- the mistakes ---------- */
function Mistakes() {
  const all = answerList(), miss = all.filter(isMiss).reverse(), retry = uniqueMistakePairs(miss), weak = weakSpots(all), n = Math.min(10, retry.length);
  return <>
    {!miss.length ? <Empty>None yet.</Empty> : <Trail>{miss.slice(0, 25).map((a: any) => <TrailRow e={{ ...entryOf(a, false), sub: mistakeLine(a) }} when={dayOf(a.at)} />)}</Trail>}
    {retry.length ? <p class="pline2"><button type="button" class="pbtn" onClick={() => startRetry(retry)}>{"Retry " + n + (n > 1 ? " mistakes" : " mistake")}</button></p> : null}
    {weak.length ? <><Group h="Weak spots" sub="categories in pairs you missed" />
      <Sx cls="walked">{weak.map(([c, o]: [string, { n: number; bad: number }]) => <Stat name={<>{state.CAT[c].labels[0]}<small class="ptype">{state.CAT[c].type}</small></>} text={o.bad + " of " + o.n + " missed"} />)}</Sx></> : null}
  </>;
}

/* ---------- the favorites and the pairs skipped ---------- */
function Favs() {
  const list = Object.values(state.favs).sort((x, y) => (y.at || "").localeCompare(x.at || "")) as FavDoc[];
  if (!list.length) return <Empty>Press the star (or F) on a pair while you practice. It stays here with its relation and examples, whether or not you answered it right.</Empty>;
  return <><Trail>{list.map((f) => {
    const p = (f.pair || { a: f.a, b: f.b, relation: f.relation, ex: {}, why: {} }) as any, rel = REL[p.relation as RelKey] || REL[f.relation], k = "f:" + f.key, open = isOpen(k);
    return <>
      <St d={<span class="pmk fav"><Icon n="star" /></span>} cls={"trow can" + (open ? " open" : "")}><button type="button" class="trb" aria-expanded={open ? "true" : "false"} onClick={() => toggleOpen(k)}>
        <span class="ex2">{f.at ? "saved " + dayOf(f.at) : "saved"}</span><b>{p.a} · {p.b}</b><span class="rs">{rel ? rel.name : ""}</span><span class="arr"><Icon n="chev" /></span></button></St>
      {open ? <div class="pfold">
        {rel ? <St d={<Fig k={p.relation} size="m" />} cls="srel"><span class="pq"><b>{rel.name}:</b> {rel.gloss(p.a, p.b).toLowerCase()}.{notaOf(p.relation) && state.nota !== "codes" ? <span class="rsym">{notaOf(p.relation)}</span> : null}</span></St> : null}
        {(CELLS as CellId[]).map((c) => { const ref = refOf(p, c); return <St d={<D cls={"sub " + (ref ? "done" : "nil")} />} cls="sb exr"><span class="lab">{CASE[c]}</span>
          <div class="line1">{ref ? <span class="ans2 ref">{ref}</span> : <span class="ans2 nil">nothing goes here</span>}</div>{!ref && p.why && p.why[c] ? <p class="xnote">{p.why[c]}</p> : null}</St>; })}
        {(p.typeA || p.typeB || p.note) ? <St d={<span />} cls="pnote2"><p class="xnote">{(p.typeA || p.typeB) ? <span class="ptype">{p.a + ": " + (p.typeA || "?") + " · " + p.b + ": " + (p.typeB || "?")}</span> : null} {p.note || ""}</p></St> : null}
        <St d={<span />} cls="pacts"><button type="button" class="pbtn" onClick={() => startFav(p)}>Practice this pair</button><button type="button" class="pbtn quiet" onClick={() => { delete state.pathOpen[k]; removeFav(f); }}>Remove</button></St>
      </div> : null}
    </>;
  })}</Trail>{state.favErr ? <p class="pnoteline bad perr">{state.favErr}</p> : null}</>;
}
function Skips() {
  const list = Object.values(state.skips).sort((x, y) => (y.at || "").localeCompare(x.at || "")) as SkipDoc[];
  if (!list.length) return <Empty>{"Skip a pair that is too hard or too easy. It stays out of the drill for " + SKIP_DAYS + " days and is kept here, apart from your mistakes."}</Empty>;
  return <>
    <p class="pempty">{"Skipped pairs stay out of the drill for " + SKIP_DAYS + " days. Practice one from here when you want it. A pair you answer leaves this list." + (list.some((f) => f.from === "find") ? " A pair skipped in Find a pair is only kept here." : "")}</p>
    <Trail>{list.map((f) => {
      const p = f.pair || { a: f.a, b: f.b }, until = new Date(Date.parse(f.at) + SKIP_DAYS * 864e5).toISOString(), asked = REL[(f.asked || f.relation) as RelKey];
      const sub = "skipped " + dayOf(f.at) + (f.n > 1 ? ", " + f.n + " times" : "") + " · " + (f.from === "find" ? "Find a pair, " + (asked ? asked.name : "") : skipActive(f) ? "back in the drill after " + dayOf(until) : "back in the drill");
      return <St d={<span class="pmk skp"><Icon n="skipped" /></span>} cls="trow"><span class="ex2">{sub}</span><b>{p.a} · {p.b}</b>
        <span class="pacts in"><button type="button" class="pbtn" onClick={() => startSkipped(f)}>Practice</button><button type="button" class="pbtn quiet" onClick={() => unskipKey(f.key)}>Remove</button></span></St>;
    })}</Trail>
    {state.skipErr ? <p class="pnoteline bad perr">{state.skipErr}</p> : null}
  </>;
}

/* ---------- the flags ---------- */
const editingAt = (where: string) => !!(state.ui && state.ui.flagEdit && state.ui.flagEdit.where === where);
function Reply({ f }: { f: FlagDoc }) {
  const r = f.review; if (!r) return null;
  if (!r.reply) return r.state === "maintainer" ? <p class="xnote">The maintainer will decide on this.</p> : null;
  const c = replyCase(f), where = "rr:" + f.id, had = state.flags[flagId(c)], editing = editingAt(where);
  return <div class="preply"><p class="lab">{(REPLY_HEAD as Record<string, string>)[r.state] || "Reply"}</p><p class="rtext">{r.reply}</p>
    <FlagEditor where={where} />
    {state.ui && !editing ? <button type="button" class="pbtn quiet" onClick={() => { state.pathOpen["g:" + f.id] = true; openFlag(c, where); }}>{had ? "Edit your follow-up" : "Flag this reply"}</button> : null}</div>;
}
function FlagRow({ f }: { f: FlagDoc }) {
  const auto = !!f.auto, doc = answerOf(f), what = auto ? (f.thing ? "“" + f.thing + "” · " : "") + "Quorum (automatic)" // the flagged part as the Path names it: the tutor, not Claude
    : flaggedPart(f as any, mname).replace(/^Claude’s/, "The tutor’s"), where = "rv:" + f.id;
  const editing = editingAt(where) || editingAt("rr:" + f.id), k = "g:" + f.id, open = isOpen(k) || editing;
  const pair = f.pair ? f.pair.a + " · " + f.pair.b : doc ? doc.a + " · " + doc.b : "A flag";
  const ctx = doc ? noteContext(doc) : f.pair ? { p: f.pair, accepted: () => false } : undefined;
  return <>
    <St d={<span class={"pmk flag " + f.state}><Icon n="flag" /></span>} cls={"trow can" + (open ? " open" : "")}><button type="button" class="trb" aria-expanded={open ? "true" : "false"} onClick={() => toggleOpen(k)}>
      <span class="ex2">{flagStateText(f.state, state.reports ? isSent(f) : undefined, f.review && f.review.state) + " · " + dayOf(f.at)}</span><b>{pair}</b><span class="rs">{what}</span><span class="arr"><Icon n="chev" /></span></button></St>
    {open ? <div class="pfold">
      <St d={<D cls="sub tut" />} cls="sb psaid"><span class="lab">{what}</span>{f.asked ? <p class="pq">{f.asked}</p> : null}<div class="tsay"><TutorText text={f.shown || ""} ctx={ctx} /></div>
        {f.note ? <p class="xnote"><b>Your note: </b>{f.note}</p> : null}{f.suggest ? <p class="xnote"><b>It should be: </b>{f.suggest}</p> : null}
        <Reply f={f} /><FlagEditor where={where} /></St>
      {doc ? <StoredAnswer doc={doc} k={k} /> : <St d={<span />} cls="pnote2"><p class="xnote">The answer this flag was made on is not saved on this device.</p></St>}
      <St d={<span />} cls="pacts">
        {auto && f.state === "new" ? <button type="button" class="pbtn quiet" onClick={() => setFlagState(f.id, "reviewed")}>Reviewed</button> : null}
        {auto && f.state !== "resolved" ? <button type="button" class="pbtn quiet" onClick={() => setFlagState(f.id, "resolved")}>Resolved</button> : null}
        {state.ui && !editing && !auto ? <button type="button" class="pbtn" data-fid={f.id} title={state.unlock ? "Flagging needs the Magic Key" : undefined} onClick={() => openFlag(caseOf(f, what), where)}>Edit</button> : null}
        <button type="button" class="pbtn quiet" onClick={() => { delete state.pathOpen[k]; removeFlag(f.id); }}>Delete</button></St>
    </div> : null}
  </>;
}
function Flags() {
  if (!state.db) return null;
  checkReplies();     // asks the server about the sent flags (at most once a minute); the answer draws again
  const list = (Object.values(state.flags) as FlagDoc[]).sort(byNewest);
  if (!list.length) return <Empty>{"Tap the flag on anything the tutor wrote to say what is wrong with it. Your flags stay here with the exercise they were made on" + (state.reports ? ", and each is sent to the app’s maintainer." : ".")}</Empty>;
  return <><Trail>{list.map((f) => <FlagRow f={f} />)}</Trail>{state.flagErr ? <p class="pnoteline bad perr">{state.flagErr}</p> : null}</>;
}

/** The sections of Review, each with how many it holds: today, the totals and the mistakes always; the rest where there is something. */
function sections(): [string, string, string][] {
  const t = today(), nToday = allEntries().filter((e) => dayOf(e.at) === t).length, nMiss = answerList().filter(isMiss).length;
  const nf = Object.keys(state.favs).length, ns = Object.keys(state.skips).length, nfl = state.db ? Object.keys(state.flags).length : 0;
  const out: [string, string, string][] = [["today", "Today", nToday ? String(nToday) : ""], ["overview", "Totals", ""], ["mistakes", "Mistakes", nMiss ? String(nMiss) : ""]];
  if (state.db) out.push(["favs", "Favorites", nf ? String(nf) : ""]);
  if (ns) out.push(["skips", "Skipped", String(ns)]);
  if (nfl) out.push(["flags", "Flags", String(nfl)]);
  return out;
}
const SUB: Record<string, (n: string) => string> = {
  today: (n) => n ? n + (n === "1" ? " answer" : " answers") + " today, the newest at the bottom" : "your answers of today",
  overview: () => "how your answers went, exercise by exercise",
  mistakes: (n) => n ? "the pairs you missed, the newest first" : "the pairs you missed",
  favs: () => "the pairs you starred",
  skips: () => "the pairs set aside for a while",
  flags: () => "what you flagged in what the tutor wrote",
};
export function ReviewPage() {
  const parts = sections();
  if (!parts.some((p) => p[0] === state.pathSeg)) state.pathSeg = "today";
  const seg = state.pathSeg, n = (parts.find((p) => p[0] === seg) || ["", "", ""])[2];
  const go = (v: string) => { state.pathSeg = v; refreshPath(); const pg = document.querySelector<HTMLElement>("#path .prv"); if (pg) pg.scrollTop = 0; };
  return <>
    <TopBar title="Review" />
    <div class="ppage prv">
      <p class="ptitle">Review</p><p class="psub">{SUB[seg](n)}</p>
      <div class="prseg"><Words label="Review sections" items={parts.map(([k, l, c]) => [k, l + (c ? " " + c : "")] as [string, string])} cur={seg} on={go} /></div>
      {seg === "today" ? <Today /> : seg === "overview" ? <Overview /> : seg === "mistakes" ? <Mistakes /> : seg === "favs" ? <Favs /> : seg === "skips" ? <Skips /> : <Flags />}
      <div style={{ height: "30px" }} />
    </div>
    <Foot><Station name="Continue practice" hint={exName(state.own)} act={() => setTab(state.own)} /></Foot>
  </>;
}
