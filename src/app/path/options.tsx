// The practice options of the exercise on screen, as the lab draws them: a sheet from the top bar, one row per option with its name in the
// margin, its choices as words in a row or a toggle, and "more" into the option's own page. The settings themselves are the classic page's
// (shell/session.js, stages.js and voice.js keep them and store them on the device).
import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { state } from "../state.js";
import { NOT } from "../../ai-shared/debate.ts";
import { setQuorum } from "../ai/quorum.js";
import { setCategoriesAsk } from "../categories/flow.js";
import { setInstanceSuggest } from "../instance/flow.ts";
import { canAsk } from "../core/ask.js";
import { setTimer } from "../debate/flow.js";
import { WORDINGS } from "../debate/text.js";
import { exName } from "../shell/exercises.js";
import { setStages } from "../shell/stages.js";
import { render } from "../shell/render.js";
import { GUIDES, guided, setGuided } from "../practice/guided.ts";
import { resetProgress } from "../practice/progress.ts";
import { movesUp, setMovesUp } from "../practice/stage-offer.ts";
import { toggleOpts } from "../shell/options.js";
import { PAGES, SYMS, openPage, quorumNote, sessBack, setAutoExplain, setBlitzUse, setDefLang, setNegBrackets, setNegation, setNota, setShow, setSyllogismWording, setWording, toggleSess } from "../shell/session.js";
import { kindMs } from "../shell/timers.js";
import { ANSWERS, ANSWER_PICKS, CONFIRM_PICKS, RATES, READ_NOTE, SAMPLE, VOICE_LEAD, VOICE_SAY, WHERE, hookVoices, setVoice, voiceGroups, voiceShown } from "../shell/voice.js";
import { stageCounts } from "../../domain/reference.ts";
import { STAGES, itemStage, toggleStage } from "../../domain/stages.ts";
import { canHear, canSpeak, speak, voiceList } from "../../ui/speech";
import { D, Icon, Knob, Toggle, Words, NOFILL } from "./ui.tsx";

// the names in the margin are short, as the lab's are: six letters fit beside the line
const Row = ({ lb, children, go }: { lb: string; children?: ComponentChildren; go?: { page: string; label?: string } }) =>
  <div class={"porow" + (go ? " pgo" : "")}><span class="lb">{lb}</span><div class="ptx">{children}</div>{go ? <More {...go} /> : null}</div>;
/** A row that is a switch: its name and what it does, and the toggle. */
const Switch = ({ lb, title, note, on, toggle }: { lb: string; title: string; note?: string; on: boolean; toggle: () => void }) =>
  <Row lb={lb}><button type="button" class="two" role="switch" aria-checked={on ? "true" : "false"} onClick={toggle}><span><b>{title}</b>{note ? <small>{note}</small> : null}</span><Toggle on={on} /></button></Row>;
/** The way into a row's own page: a control at the row's right edge, as tall as the row, so that it takes no line of the row and is easy to tap. */
const More = ({ page, label = "more" }: { page: string; label?: string }) => <button type="button" class="more" aria-label={PAGES[page as keyof typeof PAGES] + ": " + label} onClick={() => openPage(page)}><Icon n="chev" /></button>;
const secs = (kind: string) => Math.round(kindMs(kind) / 1000);
const timesLine = () => state.tab === "syllogism" ? "Syllogism " + secs("syl") + " s" : "Relation " + secs("rel") + " s · Example " + secs("ex") + " s";
// the exercises that draw negated pairs, and so show the Negations choice with the stages
const negates = () => state.tab === "practice" || state.tab === "debate";
const NEG_NAME: Record<string, string> = { one: "one side", both: "both sides" };
// the stages that are on, in a line: runs joined ("Stages 1–3, 5"), and the negations where they are drawn
const stagesLine = () => {
  const runs: [number, number][] = [];
  for (const n of state.stages as number[]) { const r = runs[runs.length - 1]; if (r && r[1] === n - 1) r[1] = n; else runs.push([n, n]); }
  return (state.stages.length === 1 ? "Stage " : "Stages ") + runs.map(([a, b]) => (a === b ? String(a) : a + "–" + b)).join(", ") + (negates() && NEG_NAME[state.negation] ? " · negations: " + NEG_NAME[state.negation] : "");
};
const toSettings = () => { toggleSess(false); toggleOpts(true); };
/** Whether the Tutor row (and its page) is in the list: where the tutor can be asked, and the Quorum switch is offered. Categories and Find an instance have neither. */
const quorumShown = () => state.quorumOffered && !!state.db && state.tab !== "syllogism" && state.tab !== "categories" && state.tab !== "instance";
const tutorShown = () => state.tab !== "categories" && state.tab !== "instance" && (canAsk() || quorumShown());

/** Voice in the list: Read aloud, and how an answer is taken (or, where the browser cannot listen, the voice and its speed), with its page. */
function VoiceRows() {
  const v = state.voice; hookVoices();
  return <>
    {canSpeak() ? <Switch lb="Read" title="Read aloud" note="each question" on={v.read} toggle={() => setVoice("read", !v.read)} /> : null}
    {canHear() ? <Row lb="Voice" go={{ page: "voice" }}><b>Answer by voice</b><Words label="Answer by voice" items={ANSWERS as [string, string][]} cur={v.answer} on={(k) => setVoice("answer", k)} /></Row>
      : <Row lb="Voice" go={{ page: "voice" }}><b>Voice</b><small>Voice and speed</small></Row>}
  </>;
}

function List() {
  const tab = state.tab, perv = tab === "debate", syl = tab === "syllogism", cats = tab === "categories", timed = tab === "practice" || perv;
  const tutor = canAsk();
  const tutorRow = tutorShown() ? <Row lb="Tutor" go={{ page: "tutor" }}><b>Tutor</b>{canAsk() ? <small>{state.autoExplain ? "explains every answer" : "explains when you ask"}</small> : null}</Row> : null;
  const blitz = <Row lb="Blitz" go={state.blitzUse ? { page: "times", label: "times" } : undefined}><button type="button" class="two" role="switch" aria-checked={state.blitzUse ? "true" : "false"} onClick={() => setBlitzUse(!state.blitzUse)}>
    <span><b>Blitz</b><small>{state.blitzUse ? timesLine() : "off"}</small></span><Toggle on={state.blitzUse} /></button></Row>;
  const stages = <Row lb="Stages" go={{ page: "stages" }}><b>Stages</b><small>{stagesLine()}</small></Row>;
  // the exercise's guided form (practice/guided.ts): on until the exercise has its right answers, then as set
  const guide = GUIDES[tab] ? <Switch lb="Guide" title="Guided" note={GUIDES[tab]!.on} on={guided(tab)} toggle={() => setGuided(tab, !guided(tab))} /> : null;
  const foot = <p class="pnoteline" style={{ padding: "10px 18px 4px calc(var(--m) + 22px)" }}>The languages, the Magic Key, your account, data{tutor && state.learns ? ", sharing your examples" : ""} and the version are in <button type="button" class="pbtn" style={{ padding: 0 }} onClick={toSettings}>Settings</button>.</p>;
  if (tab === "instance") return <>
    <Switch lb="Hints" title="Suggest things" note="things the course knows, as you write" on={state.instSuggest} toggle={() => setInstanceSuggest(!state.instSuggest)} />
    {stages}{foot}</>;
  if (cats) return <>
    <Row lb="Ask"><b>How step 1 asks</b><Words label="How step 1 asks" items={[["all", "All at once"], ["one", "One by one"]]} cur={state.catsAsk} on={setCategoriesAsk} /></Row>
    {stages}{foot}</>;
  if (syl) return <>
    <Row lb="Words"><b>Wording of the syllogism</b><Words label="Wording" items={[["take", "Take X"], ["formal", "Formal"]]} cur={state.syllogismWording} on={setSyllogismWording} /></Row>
    {guide}
    {stages}{blitz}{tutorRow}{foot}</>;
  return <>
    {perv ? <Row lb="Words" go={{ page: "wording" }}><b>Wording of the questions</b><Words label="Wording of the questions" items={Object.entries(WORDINGS).map(([k, w]) => [k, (w as { name: string }).name] as [string, string])} cur={state.wording} on={setWording} /></Row> : null}
    {guide}
    <Row lb="Signs" go={{ page: "nota" }}><b>Notation</b><Words label="Notation" items={Object.entries(SYMS).map(([k, v]) => [k, (v as unknown[])[0] as string] as [string, string])} cur={state.nota} on={setNota} /></Row>
    {timed ? blitz : null}
    <Switch lb="A/B" title="A/B markers" note="A and B shown in the text" on={state.showAB} toggle={() => setShow("ab", !state.showAB)} />
    <Row lb="Terms" go={{ page: "defs" }}><b>Definitions</b><Words label="Languages of the definitions" items={[["en", "English"], ["enru", "English + Russian"]]} cur={state.defLang} on={setDefLang} /></Row>
    {stages}
    {voiceShown() ? <VoiceRows /> : null}
    {tutorRow}
    {foot}</>;
}

/** A page's choices: one pressed, each with a word on what it does (the choices on the path, as the lab draws them). */
function Picks<T extends string>({ label, items, cur, on }: { label: string; items: [T, string, string, ComponentChildren?][]; cur: T; on: (k: T) => void }) {
  return <div class="chs" role="group" aria-label={label}>{items.map(([k, name, desc, extra]) =>
    <button type="button" class={"crow" + (cur === k ? " picked" : "")} aria-pressed={cur === k ? "true" : "false"} onClick={() => on(k)}>
      <span class="mc"><D cls={"sub " + (cur === k ? "yours" : "pk")} /></span><span class="ct"><b>{name}</b>{desc ? <small>{desc}</small> : null}{extra || null}</span>
    </button>)}</div>;
}
const sample = (w: { lead?: string; q: unknown[][] }) => (w.lead ? w.lead + " " : "") + w.q[1].map((x) => (x === NOT ? "not" : x)).join("");
/** One Blitz time: the usual ones, and a number of seconds of one's own. */
function Time({ kind, lb, label, note }: { kind: string; lb: string; label: string; note: string }) {
  const now = secs(kind), preset = [5, 10, 15, 30].includes(now);
  return <Row lb={lb}><b>{label}</b><small>{note}</small>
    <span style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
      <Words label={label} items={[[5, "5 s"], [10, "10 s"], [15, "15 s"], [30, "30 s"]]} cur={preset ? now : -1} on={(s) => setTimer(s * 1000, kind)} />
      <input type="number" min="2" max="120" inputMode="numeric" class="pfield" style={{ flex: "none", width: "64px", height: "28px", fontSize: "16px" }} placeholder="sec" {...NOFILL} aria-label={"Custom " + label.toLowerCase() + " in seconds"}
        value={preset ? "" : String(now)} onChange={(e) => { const v = Math.round(+(e.currentTarget as HTMLInputElement).value); if (v >= 2 && v <= 120) setTimer(v * 1000, kind); }}
        onKeyDown={(e) => e.stopPropagation()} />
    </span></Row>;
}
function Page({ id }: { id: string }) {
  if (id === "nota") return <><p class="psub">How the relation between two terms is written, in the statements and in your answers.</p>
    <Picks label="Notation" cur={state.nota} on={setNota} items={Object.entries(SYMS).map(([k, v]) => { const [name, desc, rows] = v as [string, string, [string, string][]];
      return [k, name, desc, <small>{rows.map(([s, t]) => <span style={{ display: "block" }}><b class="mono" style={{ display: "inline", fontSize: "13px", color: "var(--ink)" }}>{s}</b> {t}</span>)}</small>] as [string, string, string, ComponentChildren]; })} /></>;
  if (id === "wording") return <><p class="psub">How the statement of pervasion is worded in Pervasions: the four statements you accept or answer with Why?.</p>
    <Picks label="Wording of the questions" cur={state.wording} on={setWording} items={Object.entries(WORDINGS).map(([k, w]) => [k, (w as { name: string }).name, sample(w as { lead?: string; q: unknown[][] })] as [string, string, string])} /></>;
  if (id === "defs") return <><p class="psub">Shown when you open a term's definition, in the Terms and in the tutor's notes.</p>
    <Picks label="Languages of the definitions" cur={state.defLang} on={setDefLang} items={[["en", "English", "The definition in English."], ["enru", "English + Russian", "Each entry also shows the Russian name of the term and, where there is one, its Russian definition."]]} /></>;
  if (id === "times") return <><p class="psub">{state.tab === "syllogism" ? "A countdown for the reply to each syllogism, switched on and off with the stopwatch in the top bar; hold the stopwatch to come back here." : "A countdown for each step of a pair, switched on and off with the stopwatch in the top bar; hold the stopwatch to come back here."}</p>
    <Switch lb="Blitz" title="Use Blitz" note="Off takes the stopwatch out of the top bar; the times stay for when it is on again." on={state.blitzUse} toggle={() => setBlitzUse(!state.blitzUse)} />
    {!state.blitzUse ? null : state.tab === "syllogism" ? <Time kind="syl" lb="Reply" label="Syllogism time" note="for the reply to each syllogism" />
      : <><Time kind="rel" lb="Pick" label="Relation time" note="for choosing the relation, in Relations and Pervasions" /><Time kind="ex" lb="Write" label="Example time" note="for each example in Relations (three cells get three times this) and each question in Pervasions" /></>}</>;
  if (id === "stages") return <Stages />;
  if (id === "voice") return <VoicePage />;
  if (id === "tutor") return <TutorPage />;
  return null;
}
/** The stages of the ladder: a switch for each, with its name, what it adds and how many things this device has of it; any mix, and the last one on stays on. */
function Stages() {
  const ex = state.EX ? stageCounts(state.EX.items) : {}, items: Record<number, number> = {}, only = state.stages.length === 1;
  for (const it of state.DATA ? state.DATA.items : []) if (!it.nosubject) items[itemStage(it)] = (items[itemStage(it)] || 0) + 1;
  return <>
    <p class="psub">Every exercise asks about the stages that are on, in any mix. A category opens at its stage and stays open above it, and the things come from the stages that are on. About half of the pairs are new at the highest stage, the rest review the ones below. Stage 1 is the start: after five right answers in a row on the newest stage, in any exercise, the next stage comes in.</p>
    {STAGES.map(({ n, name, adds }) => {
      const on = state.stages.includes(n), count = (items[n] || 0) + ((ex as Record<number, number>)[n] || 0);
      return <Row lb={"St " + n}><button type="button" class="two" role="switch" aria-checked={on ? "true" : "false"} aria-disabled={on && only ? "true" : undefined} onClick={() => setStages(toggleStage(state.stages, n))}>
        <span><b>{"Stage " + n + " · " + name}</b><small>{count + (count === 1 ? " thing" : " things")}</small></span><Toggle on={on} /></button><small class="plvn">{adds}</small></Row>;
    })}
    {only ? <p class="pnoteline pnote3">At least one stage stays on.</p> : null}
    <Switch lb="Move" title="Move up by itself" note="After five right answers in a row on the newest stage, the next one comes in, and a station says so first. Off: no stage comes in by itself, and you switch them here." on={movesUp()} toggle={() => setMovesUp(!movesUp())} />
    {negates() ? <>
      <p class="psub">Negations are a step of difficulty like the stages: switch them on when the plain pairs come easily. A negation takes in what does not exist, so nothing may be neither: then the Neither case is empty, and you say that nothing exists there.</p>
      <Row lb="Not"><b>Negations</b><Words label="Negations" items={[["off", "Off"], ["one", "One side"], ["both", "Both sides"]]} cur={state.negation} on={setNegation} />
        <small>Some pairs negate a term: “furniture” and “non-(wooden things)”, which takes in everything that is not a wooden thing. One side: A or B is negated in about a third of the pairs. Both sides: half of those negate both. Relations and Pervasions share this choice; Find a pair takes a negation you name (“non-(wooden things)”) with it off too.</small></Row>
      <Switch lb="Brackets" title="Brackets" note="“non-(wooden things)” says that the “non-” takes in everything that is not a wooden thing, what does not exist included. Without them, “non-wooden things” is also read as the things that are not wooden, which leaves out what does not exist. They help while negations are new, and apply from the next pair." on={state.negBrackets} toggle={() => setNegBrackets(!state.negBrackets)} />
    </> : null}
    <Row lb="Reset"><b>Reset progression</b>
      <small>{state.resetAsk === "done" ? "Done: stage 1, and the course terms come one at a time again." : "Back to stage 1 with no course term met, negations off and every exercise guided again, on every device signed in to your account. Your answers, their statistics and your settings stay."}</small>
      {state.resetAsk === "ask" ? <span class="pvline2"><button type="button" class="pbtn" onClick={() => { state.resetAsk = "done"; resetProgress(); }}>Reset</button><button type="button" class="pbtn quiet" onClick={() => { state.resetAsk = ""; render(); }}>Keep it</button></span>
        : state.resetAsk === "" ? <span class="pvline2"><button type="button" class="pbtn quiet" onClick={() => { state.resetAsk = "ask"; render(); }}>Reset progression</button></span> : null}</Row>
  </>;
}
/** The Voice page: the voice and its speed, how an answer is taken and what happens after it is heard. */
function VoicePage() {
  const v = state.voice, list = canSpeak() ? voiceList() : []; hookVoices();
  return <>
    <p class="psub">{VOICE_LEAD}</p>
    {canSpeak() ? <>
      <Switch lb="Read" title="Read aloud" note={"each question. " + READ_NOTE} on={v.read} toggle={() => setVoice("read", !v.read)} />
      <Row lb="Voice"><b>Voice</b><small>This device’s English voices, by accent.</small>
        <span class="pvline2"><select class="psel" aria-label="Voice" value={v.voiceId || ""} onChange={(e) => setVoice("voiceId", (e.currentTarget as HTMLSelectElement).value)}>
          <option value="">{"Best on this device" + (list[0] ? " (" + list[0].name + ")" : "")}</option>
          {voiceGroups(list).map((g: { accent: string; voices: { id: string; name: string; lang: string; local: boolean }[] }) => <optgroup label={g.accent}>
            {g.voices.map((x) => <option value={x.id}>{x.name + " · " + x.lang + (x.local ? "" : " · online")}</option>)}</optgroup>)}
        </select><button type="button" class="pbtn" onClick={() => speak(SAMPLE, { voice: v.voiceId, rate: v.rate })}>Try</button></span></Row>
      <Row lb="Speed"><b>Speed of reading</b><Words label="Speed of reading" items={RATES as [number, string][]} cur={v.rate} on={(r) => setVoice("rate", r)} /></Row>
    </> : null}
    {canHear() ? <>
      <p class="glab">Answer by voice</p>
      <Picks label="Answer by voice" cur={v.answer} on={(k) => setVoice("answer", k)} items={ANSWER_PICKS as [string, string, string][]} />
      {v.answer !== "off" ? <><p class="glab">After an answer is heard</p>
        <Picks label="After an answer is heard" cur={v.confirm} on={(k) => setVoice("confirm", k)} items={CONFIRM_PICKS as [string, string, string][]} /></> : null}
      <p class="psub">{VOICE_SAY}</p>
      <p class="pnoteline pnote3">{WHERE}</p>
    </> : null}
    <p class="pnoteline pnote3">Voice itself is switched on and off in <button type="button" class="pbtn" style={{ padding: 0 }} onClick={toSettings}>Settings</button>.</p>
  </>;
}

/** The Tutor page: whether it explains every answer by itself, and Quorum (several models), each with what it does. */
function TutorPage() {
  const syl = state.tab === "syllogism";
  return <>
    <p class="psub">The AI tutor explains an answer: why it is right or wrong{syl ? "" : ", and whether your examples fit their cases"}.</p>
    {canAsk() ? <Switch lb="Tutor" title="Check every answer with AI" on={state.autoExplain} toggle={() => setAutoExplain(!state.autoExplain)}
      note={"Right after you check an answer, the tutor explains it" + (syl ? "" : " and checks the examples the page could not") + ". Off, it waits for you to ask."} /> : null}
    {quorumShown() ? <Switch lb="Quorum" title="Several models explain" note={quorumNote()} on={state.quorum} toggle={() => setQuorum(!state.quorum)} /> : null}
    <p class="pnoteline pnote3">The Magic Key{canAsk() && state.learns ? ", sharing your examples" : ""} and your data are in <button type="button" class="pbtn" style={{ padding: 0 }} onClick={toSettings}>Settings</button>.</p>
  </>;
}

const sheetOn = () => state.sessOpen && state.mode === "quiz";
/** The sheet's own page that is open (one of PAGES), or null for the list. */
const sheetPage = () => sheetOn() && state.sessPage && PAGES[state.sessPage as keyof typeof PAGES] && (state.sessPage !== "voice" || voiceShown()) && (state.sessPage !== "tutor" || tutorShown()) ? state.sessPage : null;
/** What the sheet shows, as the heading it gives the screen: the top bar reads it in place of the exercise's name while the sheet is open (null when it is closed). */
export const sheetTitle = (): string | null => sheetOn() ? (sheetPage() ? PAGES[sheetPage() as keyof typeof PAGES] : "Practice options") : null;

/** The sheet of the practice options: from the top, under the top bar (which is its heading, and has its close), over a scrim; the knob at its foot folds it away. */
export function OptionsSheet() {
  const on = sheetOn(), page = sheetPage();
  const box = useRef<HTMLDivElement>(null), body = useRef<HTMLDivElement>(null), was = useRef(on);
  useEffect(() => {
    if (on && !was.current && box.current) box.current.focus({ preventScroll: true });
    was.current = on;
  }, [on]);
  // the body fades out at an edge that has more to scroll to (37-path-panels.css): measured after every draw, and as it scrolls
  useEffect(() => {
    const el = body.current; if (!el) return;
    const fade = () => {
      const up = el.scrollTop > 2, down = el.scrollHeight - el.scrollTop - el.clientHeight > 2;
      el.style.setProperty("--ft", up ? "26px" : "0px"); el.style.setProperty("--fb", down ? "44px" : "0px"); el.toggleAttribute("data-fade", up || down);
    };
    fade(); el.addEventListener("scroll", fade, { passive: true });
    return () => el.removeEventListener("scroll", fade);
  });
  return <>
    <div class={"scrim below" + (on ? " on" : "")} onClick={() => toggleSess(false)} />
    <div ref={box} class={"psheet top" + (on ? " on" : "")} role="dialog" aria-label="Practice options" aria-hidden={on ? "false" : "true"} inert={!on} tabIndex={-1} data-quiet>
      <div class="sbody" ref={body}>
        {page ? <button type="button" class="sback" onClick={sessBack}><Icon n="chev" />back to the options</button> : <p class="glab" style={{ paddingTop: "4px" }}>{exName(state.tab)}</p>}
        {on ? (page ? <Page id={page} /> : <List />) : null}
      </div>
      <Knob up label="Fold the practice options away" onClick={() => toggleSess(false)} />
    </div>
  </>;
}
