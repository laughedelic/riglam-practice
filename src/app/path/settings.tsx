// Settings on the Path: how the app looks on this device (the design, light or dark, the lab's settings), then the rows of the app: the Magic
// Key, sharing the examples, the account, voice, your data and the version. What each does is the classic page's (shell/options.js and the
// shared rows of src/ui, which the Path builds in its own classes).
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { state } from "../state.js";
import { accountControls } from "../../ui/account";
import { dataTransferControls } from "../../ui/data-transfer";
import { MAGIC_KEY_NOTE } from "../../ui/magic-key-note.ts";
import { setShare } from "../ai/share-notice.js";
import { canAsk } from "../core/ask.js";
import { el } from "../core/dom.js";
import { exName } from "../shell/exercises.js";
import { aboutInfo, keyNote, shareNote, toggleOpts } from "../shell/options.js";
import { render } from "../shell/render.js";
import { setLang } from "../shell/session.js";
import { LANGS } from "../../domain/languages.ts";
import { languagesOn } from "./terms.tsx";
import { setOn as setVoiceOn, voiceAvailable, voiceNote, voiceOn } from "../shell/voice.js";
import { DEFAULT_LOOK, currentLook, lookLine, pastedLook, setLook, storedLook } from "./look.ts";
import { setDesign } from "./index.tsx";
import { Foot, Station, TopBar, pathNote } from "./shell.tsx";
import { Sub } from "./subjects.tsx";
import { Bridge, Toggle, Words, NOFILL } from "./ui.tsx";

const keepMode = () => { const m = storedLook().mode; return { mode: m === undefined ? null : m }; };
function LookRows() {
  const look = currentLook(), [open, setOpen] = useState(false), [text, setText] = useState(""), [bad, setBad] = useState(false);
  const line = lookLine(look), own = line !== "{}" && line !== JSON.stringify({ mode: look.mode });
  const use = () => {
    const ch = pastedLook(text); if (!ch) { setBad(true); return; }
    setLook({ ...ch, ...keepMode() }, true); setBad(false); setText(""); setOpen(false); render(); pathNote("The lab's settings are in use");
  };
  const copy = () => { try { void navigator.clipboard.writeText(line).then(() => pathNote("Copied"), () => pathNote("Could not copy")); } catch { pathNote("Could not copy"); } };
  return <>
    <div class="srow wide"><span /><span class="ct"><b>Light or dark</b><small>The Path's own; the classic page follows the device.</small>
      <div class="below" style={{ padding: "8px 0 0" }}><Words label="Light or dark" items={[["system", "System"], ["light", "Light"], ["dark", "Dark"]]} cur={look.mode} on={(v) => { setLook({ mode: v === DEFAULT_LOOK.mode ? null : v }); render(); }} /></div></span></div>
    <div class="srow wide"><span /><span class="ct"><b>A and B in the text</b><small>How the pair's two terms stand out where a question or a note names them. The practice options switch them off.</small>
      <p class="psamp">Name something that is <b class="conn">both</b> <Sub k="a">a thing that is heard</Sub> <b class="conn">and</b> <Sub k="b">a sound</Sub>.</p>
      <div class="below" style={{ padding: "6px 0 0" }}><Words label="A and B in the text" items={[["none", "Plain"], ["italic", "Italic"], ["letters", "Letters"], ["diamonds", "Diamonds"], ["lettered", "Lettered diamonds"], ["inks", "Inks"]]} cur={look.subj}
        on={(v) => { setLook({ subj: v === DEFAULT_LOOK.subj ? null : v }); render(); }} /></div></span></div>
    <div class="srow wide"><span /><span class="ct"><b>The lab's settings</b>
      <small>{own ? "This device uses its own: colors, fonts and switches as set in the Path Lab." : "The defaults: the picks made in the Path Lab."}</small>
      <div class="below" style={{ padding: "6px 0 0", display: "flex", flexWrap: "wrap", gap: "0 18px" }}>
        <button type="button" class="pbtn" aria-expanded={open ? "true" : "false"} onClick={() => setOpen(!open)}>Paste from the lab</button>
        {own ? <button type="button" class="pbtn" onClick={() => { setLook(keepMode(), true); render(); pathNote("Back to the defaults"); }}>Back to the defaults</button> : null}
        {own ? <button type="button" class="pbtn" onClick={copy}>Copy this device's</button> : null}
      </div>
      {open ? <div class="below" style={{ padding: "6px 0 0" }}>
        <textarea class="ptext" aria-label="The line from the lab's Copy settings" placeholder="Paste the line from Copy settings in the Path Lab" {...NOFILL} value={text} onInput={(e) => { setText((e.currentTarget as HTMLTextAreaElement).value); setBad(false); }} />
        {bad ? <p class="pnoteline bad">That is not a line from the lab's Copy settings.</p> : null}
        <button type="button" class="pbtn" onClick={use}>Use these</button>
      </div> : null}
    </span></div>
  </>;
}
/** A row of Settings: its name and what it does, and its controls under them. */
const Row = ({ title, note, children }: { title: ComponentChildren; note?: ComponentChildren; children?: ComponentChildren }) =>
  <div class="srow wide"><span /><span class="ct">{title}{note ? <small>{note}</small> : null}{children ? <div class="sctl">{children}</div> : null}</span></div>;
/** A row that is a switch: the name and the toggle on one line, what it does under them. */
const SwitchRow = ({ title, note, on, toggle, tag }: { title: string; note: string; on: boolean; toggle: () => void; tag?: string }) =>
  <div class="srow wide"><span /><span class="ct"><button type="button" class="two" role="switch" aria-checked={on ? "true" : "false"} onClick={toggle}>
    <span><b>{title}{tag ? <span class="ptag">{tag}</span> : null}</b></span><Toggle on={on} /></button><small>{note}</small></span></div>;

// the shared rows of src/ui (the account, your data) build their nodes with the classic page's classes; the Path's are put in their place
const PCLS: Record<string, string> = { btn: "pbtn", "btn ghost": "pbtn", onote: "pnoteline", "onote bad": "pnoteline bad", xfer: "pxfer", xferbox: "pxbox", xsum: "pxsum", acct: "pacct", acwho: "pacwho", acname: "pacname" };
const pel = (tag: string, props?: Record<string, any> | null, ...kids: any[]) => {
  const p = props ? { ...props } : props;
  if (p && typeof p.class === "string") p.class = PCLS[p.class] ?? p.class;
  if (p && tag === "input" && (p.type === "text" || !p.type)) p.class = "pfield";
  return el(tag, p, ...kids);
};

/** The Magic Key: its name opens a note on the name; the device has none yet (enter it), or has it (another key, or forget it after a question). */
function KeyRow() {
  const held = !!state.keyHeld, k = state.keyHeld!;
  if (!state.unlock && !held) return null;
  const title = <b><button type="button" class="pkname" aria-expanded={state.mkNote ? "true" : "false"} onClick={() => { state.mkNote = !state.mkNote; render(); }}>Magic Key</button></b>;
  return <Row title={title} note={keyNote(held)}>
    {state.mkNote ? <div class="pkeynote">{MAGIC_KEY_NOTE.map((t: string) => <p>{t}</p>)}<button type="button" class="pbtn quiet" onClick={() => { state.mkNote = false; render(); }}>Hide</button></div> : null}
    {!held ? <button type="button" class="pbtn" onClick={() => { toggleOpts(false); state.unlock!.open(); }}>Enter the Magic Key</button>
      : state.keyAsk ? <><button type="button" class="pbtn" onClick={() => k.forget()}>Forget the key</button><button type="button" class="pbtn quiet" onClick={() => { state.keyAsk = false; render(); }}>Keep it</button></>
      : <><button type="button" class="pbtn" onClick={() => { toggleOpts(false); k.change(); }}>Enter another key</button><button type="button" class="pbtn quiet" onClick={() => { state.keyAsk = true; render(); }}>Forget the key</button></>}
  </Row>;
}
/** Version and updates: which build this is, where the update stands, and its one step. */
function VersionRow() {
  const a = state.about; if (!a) return null;
  const i = aboutInfo(a), u = state.updates!;
  return <Row title={<b>Version and updates</b>} note={i.line}>
    <div class="pver">{i.from ? <p class="pnoteline">{i.from}</p> : null}<p class={"pnoteline" + (i.bad ? " bad" : "")} role="status">{i.status}</p></div>
    {i.act === "update" ? <button type="button" class="pbtn" onClick={() => u.apply()}>Update now</button> : i.act === "check" ? <button type="button" class="pbtn" onClick={() => u.check()}>Check for updates</button> : null}
  </Row>;
}
/** The languages a term is shown in beside English: a switch for each. English is always shown; Russian also gives the definitions in Russian, where there are some. */
function LanguageRows() {
  const on = languagesOn();
  return <>
    <div class="srow wide"><span /><span class="ct"><b>English</b><small>The terms and their definitions. Always shown.</small></span></div>
    {LANGS.map(({ id, name, note }) => <SwitchRow title={name} note={note[0]!.toUpperCase() + note.slice(1) + "."} on={on.includes(id)} toggle={() => setLang(id, !on.includes(id))} />)}
  </>;
}
function AppRows() {
  const acct = state.account && state.db && state.account.view().available;
  return <>
    <KeyRow />
    {canAsk() && state.learns ? <SwitchRow title="Share my examples" note={shareNote()} on={state.shareExamples} toggle={() => { setShare(!state.shareExamples); render(); }} /> : null}
    {acct ? <Row title={<b>Account</b>}><Bridge own cls="phost" fill={() => accountControls(state.account!, pel, render, state.acct)} /></Row> : null}
    {voiceAvailable() ? <SwitchRow title="Voice" tag="Experimental" note={voiceNote()} on={voiceOn()} toggle={() => setVoiceOn(!voiceOn())} /> : null}
    {state.db ? <Row title={<b>Your data</b>} note="Saves everything this device keeps (answers, debates, favorites, skipped pairs and these settings) in one file, as a backup or to move to another device. Importing adds what is missing and never deletes anything.">
      <Bridge own cls="phost" fill={() => dataTransferControls(state.db!, pel, render, state.xfer)} /></Row> : null}
    <VersionRow />
  </>;
}
export function SettingsPage() {
  return <>
    <TopBar title="Settings" />
    <div class="ppage">
      <p class="ptitle">Settings</p><p class="psub">For the app, on this device. How an exercise looks and ticks is in its practice options.</p>
      <p class="glab">Look</p>
      <div class="srow wide"><span /><span class="ct"><b>Design</b><small>The Path is the redesign, still being made. Classic is the page as it was.</small>
        <div class="below" style={{ padding: "8px 0 0" }}><Words label="Design" items={[["path", "Path"], ["classic", "Classic"]]} cur={state.design} on={setDesign} /></div></span></div>
      <LookRows />
      <p class="glab">Languages</p>
      <p class="pnoteline" style={{ padding: "0 18px 6px calc(var(--m) + 22px)" }}>Shown beside a term when you meet it and in its definition. The course has definitions in English and Russian only.</p>
      <LanguageRows />
      <p class="glab">The app</p>
      <AppRows />
      <div style={{ height: "30px" }} />
    </div>
    <Foot><Station back name="Back to the exercise" hint={exName(state.own)} act={() => toggleOpts(false)} /></Foot>
  </>;
}
