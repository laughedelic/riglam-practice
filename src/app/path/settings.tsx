// Settings on the Path: how the app looks on this device (the design, light or dark, the lab's settings), then the classic rows of Settings
// (the Magic Key, sharing, the account, voice, your data, the version), hosted as they are for now.
import { useState } from "preact/hooks";
import { state } from "../state.js";
import { exName } from "../shell/exercises.js";
import { optionsInto, toggleOpts } from "../shell/options.js";
import { render } from "../shell/render.js";
import { DEFAULT_LOOK, currentLook, lookLine, pastedLook, setLook, storedLook } from "./look.ts";
import { setDesign } from "./index.tsx";
import { Foot, Station, TopBar, pathNote } from "./shell.tsx";
import { Bridge, Words } from "./ui.tsx";

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
    <div class="srow wide"><span /><span class="ct"><b>The lab's settings</b>
      <small>{own ? "This device uses its own: colors, fonts and switches as set in the Path Lab." : "The defaults: the picks made in the Path Lab."}</small>
      <div class="below" style={{ padding: "6px 0 0", display: "flex", flexWrap: "wrap", gap: "0 18px" }}>
        <button type="button" class="pbtn" aria-expanded={open ? "true" : "false"} onClick={() => setOpen(!open)}>Paste from the lab</button>
        {own ? <button type="button" class="pbtn" onClick={() => { setLook(keepMode(), true); render(); pathNote("Back to the defaults"); }}>Back to the defaults</button> : null}
        {own ? <button type="button" class="pbtn" onClick={copy}>Copy this device's</button> : null}
      </div>
      {open ? <div class="below" style={{ padding: "6px 0 0" }}>
        <textarea class="ptext" aria-label="The line from the lab's Copy settings" placeholder="Paste the line from Copy settings in the Path Lab" value={text} onInput={(e) => { setText((e.currentTarget as HTMLTextAreaElement).value); setBad(false); }} />
        {bad ? <p class="pnoteline bad">That is not a line from the lab's Copy settings.</p> : null}
        <button type="button" class="pbtn" onClick={use}>Use these</button>
      </div> : null}
    </span></div>
  </>;
}
/** The classic rows of Settings, without the Design row (the Path has its own, above). */
function classicRows() {
  const tmp = document.createElement("div"); optionsInto(tmp);
  const box = tmp.querySelector(".opts"); if (!box) return [];
  box.querySelector(".orow.design")?.remove();
  return [...box.childNodes];
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
      <p class="glab">The app</p>
      <Bridge cls="opts" fill={classicRows} />
      <div style={{ height: "30px" }} />
    </div>
    <Foot><Station name="Back to the exercise" hint={exName(state.own)} act={() => toggleOpts(false)} /></Foot>
  </>;
}
