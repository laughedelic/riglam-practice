// The "Your data" row of the Options screen: export everything the page keeps to a file, and import such a file.
// The logic is in ../store/transfer.ts; this file is the buttons, the preview of what an import would do, and the messages.
// The Options screen is rebuilt on every render, so the state of an import in progress lives here, outside the nodes.

import type { Db } from "../platform/types";
import { applyImport, exportData, fileName, MAX_FILE_BYTES, parseDataFile, planImport, serialize, TransferError, type Counts, type ImportPlan } from "../store/transfer";

type El = (tag: string, props?: Record<string, any> | null, ...kids: any[]) => HTMLElement;

type State =
  | { kind: "idle"; note?: string; bad?: boolean; reload?: boolean }
  | { kind: "busy"; note: string }
  | { kind: "preview"; plan: ImportPlan };

let state: State = { kind: "idle" };

const WORDS: Record<string, [string, string]> = {
  answers: ["answer", "answers"],
  debates: ["debate", "debates"],
  favorites: ["favorite", "favorites"],
  skips: ["skipped pair", "skipped pairs"],
  batches: ["batch", "batches"],
  labruns: ["check-lab run", "check-lab runs"],
  flags: ["flag", "flags"],
};
const noun = (collection: string, n: number) => `${n} ${WORDS[collection]?.[n === 1 ? 0 : 1] ?? collection}`;
const list = (counts: Record<string, Counts>, key: keyof Counts) =>
  Object.entries(counts).filter(([, c]) => c[key] > 0).map(([name, c]) => noun(name, c[key])).join(", ");

/** What an import of this plan would do, as short sentences. */
export function describe(plan: ImportPlan): string[] {
  const lines: string[] = [];
  if (plan.exportedAt) lines.push(`File saved ${plan.exportedAt.slice(0, 16).replace("T", " ")} UTC.`);
  const add = list(plan.counts, "add");
  const update = list(plan.counts, "update");
  if (add) lines.push(`Adds ${add}.`);
  if (update) lines.push(`Replaces with the newer copy: ${update}.`);
  const there = plan.totals.same + plan.totals.keep;
  if (there) lines.push(`${there} already here and not changed.`);
  const prefs = Object.keys(plan.preferences).length;
  if (prefs) lines.push(`Restores ${prefs} setting${prefs === 1 ? "" : "s"} you have not set on this device.`);
  if (plan.invalid) lines.push(`${plan.invalid} entr${plan.invalid === 1 ? "y is" : "ies are"} not valid and will be left out.`);
  if (plan.ignored.length) lines.push(`Not used by this app and left out: ${plan.ignored.join(", ")}.`);
  return lines;
}

const nothingToDo = (plan: ImportPlan) => plan.writes.length === 0 && Object.keys(plan.preferences).length === 0;

async function save(text: string, name: string): Promise<void> {
  const file = new File([text], name, { type: "application/json" });
  // On a phone the share sheet is the way to put a file somewhere (a download can end up where nobody looks, and an installed app has no download bar).
  if (matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; }
    catch (e) { if ((e as Error)?.name === "AbortError") return; /* anything else: download it */ }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function pickFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.hidden = true;
    const done = (f: File | null) => { input.remove(); resolve(f); };
    input.addEventListener("change", () => done(input.files?.[0] ?? null));
    input.addEventListener("cancel", () => done(null));
    document.body.append(input);
    input.click();
  });
}

export function dataTransferControls(db: Db, el: El, rerender: () => void): HTMLElement {
  const set = (s: State) => { state = s; rerender(); };
  const fail = (e: unknown) => set({ kind: "idle", bad: true, note: e instanceof TransferError ? e.message : "That did not work. Nothing was changed." });

  async function doExport() {
    set({ kind: "busy", note: "Preparing the file ..." });
    try {
      const file = await exportData(db);
      const n = Object.values(file.collections).reduce((sum, docs) => sum + Object.keys(docs).length, 0);
      await save(serialize(file), fileName());
      const s = Object.keys(file.preferences).length;
      set({ kind: "idle", note: `${n} document${n === 1 ? "" : "s"} and ${s} setting${s === 1 ? "" : "s"} saved to the file.` });
    } catch (e) { fail(e); }
  }

  async function doChoose() {
    const file = await pickFile();
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) return fail(new TransferError("That file is too large to be a data file from this app."));
    set({ kind: "busy", note: "Reading the file ..." });
    try {
      const plan = await planImport(db, parseDataFile(await file.text()));
      set(nothingToDo(plan)
        ? { kind: "idle", note: "Nothing new in that file: everything in it is already here." + (plan.invalid ? ` ${plan.invalid} entries were not valid.` : "") }
        : { kind: "preview", plan });
    } catch (e) { fail(e); }
  }

  async function doApply(plan: ImportPlan) {
    set({ kind: "busy", note: "Importing ..." });
    try {
      const r = await applyImport(db, plan);
      const prefs = r.preferencesRestored ? ` and ${r.preferencesRestored} setting${r.preferencesRestored === 1 ? "" : "s"}` : "";
      const docs = `${r.written} document${r.written === 1 ? "" : "s"}`;
      set(r.failed.length
        ? { kind: "idle", bad: true, note: `Imported ${docs}${prefs}, but ${r.failed.length} could not be saved: ${r.failed.slice(0, 3).join(", ")}${r.failed.length > 3 ? " ..." : ""}. Import the file again to retry those.`, reload: r.preferencesRestored > 0 }
        : { kind: "idle", note: `Imported ${docs}${prefs}.` + (r.preferencesRestored ? " Reload to apply the settings." : ""), reload: r.preferencesRestored > 0 });
    } catch (e) { fail(e); }
  }

  const busy = state.kind === "busy";
  const buttons = el("div", { class: "xfer" },
    el("button", { type: "button", class: "btn ghost", disabled: busy || state.kind === "preview", "aria-label": "Export your data to a file", onclick: doExport }, "Export"),
    el("button", { type: "button", class: "btn ghost", disabled: busy || state.kind === "preview", "aria-label": "Import data from a file", onclick: doChoose }, "Import"));
  const box = el("div", { class: "xferbox" }, buttons);
  if (state.kind === "preview") {
    const plan = state.plan;
    box.append(
      el("div", { class: "xsum", role: "group", "aria-label": "What the import would do" }, describe(plan).map((t) => el("p", { class: "onote", text: t }))),
      el("div", { class: "xfer" },
        el("button", { type: "button", class: "btn", onclick: () => doApply(plan) }, "Import"),
        el("button", { type: "button", class: "btn ghost", onclick: () => set({ kind: "idle" }) }, "Cancel")));
  } else {
    const note = state.note;
    if (note) box.append(el("p", { class: "onote" + (state.kind === "idle" && state.bad ? " bad" : ""), role: "status", text: note }));
    if (state.kind === "idle" && state.reload) box.append(el("div", { class: "xfer" }, el("button", { type: "button", class: "btn ghost", onclick: () => location.reload() }, "Reload")));
  }
  return box;
}
