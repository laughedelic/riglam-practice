// The device's storage that does not answer, said in the Path's own way (it was a white bar over the top of the page, from before the Path). While the browser's storage
// for the app is stuck, the app goes on without it (src/pwa/local-db.ts): the saved answers are not shown and what is done now is not kept. One line is pinned above the
// bottom, where the line of a version that waits stands (path/pin.tsx): nothing is covered, the thread stays. Its Reload tries again; its words open Settings' Your data page,
// which has a note at its head saying what is known (a test database tells a stuck store of this app from a browser whose storage as a whole does not answer). A reload
// or a restart is what mostly helps; a new, empty store is kept as a last resort under a fold there. When the storage answers after all, the line goes and the note says
// it is back, and that what was done meanwhile has been saved.
import { state } from "../state.js";
import { render } from "../shell/render.js";
import { toggleOpts } from "../shell/options.js";
import { Group, Intro } from "./lines.tsx";
import { PinLine } from "./pin.tsx";

/** Whether the storage did not answer and still does not. */
export const storageStuck = (): boolean => !!state.storage && !state.storage.answering();
/** Whether the storage did not answer at some point in this visit (Settings keeps its line, saying it is back). */
export const storageTroubled = (): boolean => !!state.storage && state.storage.troubled();

const reload = () => location.reload();

/**
 * Opens Settings' Your data page, where the storage's note is. `direct`: from the pinned line, so its way back goes where it was opened from, not to the Settings list.
 */
export function openStorage(direct: boolean): void {
  state.newsDirect = direct;
  state.newsArrive = false;
  if (direct) { state.fromRoad = state.menuOpen; state.menuOpen = false; state.sessOpen = false; state.sessPage = null; state.skipAsk = false; }
  state.optsPage = "xfer";
  if (state.optsOpen) render(); else toggleOpts(true);
}

/** The pinned line: what is wrong, in a few words, and the way on (Reload); on the thread in an exercise a red mark stands over the station's thread. */
export function StoragePin({ cls }: { cls: string }) {
  return <PinLine cls={cls + " store"} mark="!" shine={false} label="Reload" act={reload} words={() => openStorage(true)}
    text="This device's storage is not answering, so nothing you do now is saved." />;
}

/** What the Your data line of Settings says under its name. */
export const dataLine = () => storageStuck() ? <span class="bad">storage not answering</span> : "everything this device keeps, in one file";

/**
 * The note at the head of Your data while the storage is stuck, or after it was and came back; null otherwise. While it is stuck what the page reads is only what memory holds,
 * so Export and import wait (`stuck`: the page leaves them out).
 */
export function StorageNote() {
  const s = state.storage;
  if (!s || !s.troubled()) return null;
  if (s.answering()) return <Group name="Storage">
    <Intro>The storage did not answer for a while in this visit, and it does now. What you did meanwhile has been saved on this device, and your saved answers are shown again.</Intro>
  </Group>;
  const said = s.probe();
  return <Group name="Storage">
    <Intro>This device's storage did not answer in time, so the app goes on without it: your saved answers are not shown, and what you do now is not saved. Export and import are back once it answers.</Intro>
    <div class="ol"><span class="olsw" /><span class="oltx"><span class="olbody">
      <p class="pnoteline" role="status">{said ?? "Testing the browser's storage…"}</p>
      <span class="olctl"><button type="button" class="pbtn" onClick={reload}>Reload</button></span>
      <details class="pkeyfun"><summary>Reload did not help?</summary><span class="pkeynote">
        <p>Closing the app completely and opening it again often does. If it still does not answer, a new, empty store lets you practice while this one stays stuck.</p>
        <p>A new store starts empty on this device. If you are signed in, your account's documents come back; the old store is left as it is.</p>
        <button type="button" class="pbtn quiet" onClick={() => s.useNewStore()}>Use a new store</button>
      </span></details>
    </span></span><span /></div>
  </Group>;
}
