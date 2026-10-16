// The "Account" row of the Options screen: sign-in with a passkey and the status of the server copy of the documents.
// The logic is in ../account/account.ts; this file is the controls and the sentences. The Options screen is rebuilt on every
// render, so what the person has typed and which confirmation is open live here, outside the nodes.

import type { Account, AccountView } from "../account/account";

type El = (tag: string, props?: Record<string, any> | null, ...kids: any[]) => HTMLElement;

/** What the row remembers between renders: the page keeps one on its shared state (`state.acct`), so that no module holds state of its own. */
export interface AccountSlot {
  /** the name typed so far */
  draft?: string;
  /** the delete confirmation is open */
  confirming?: boolean;
  /** rebuilding the screen drops the focused control, so after an action the focus goes to its message */
  wantStatus?: boolean;
  lastBusy?: AccountView["busy"];
  /** the id of the control to focus once the row has been rebuilt (the delete confirmation, or the button that opened it) */
  focus?: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** One sentence on where the server copy stands. */
export function syncLine(v: AccountView): string {
  const { busy, pending, last, error } = v.sync;
  const waiting = pending ? ` ${plural(pending, "change is", "changes are")} waiting to be sent.` : "";
  if (busy || v.busy === "sync") return "Syncing ...";
  if (error === "offline") return `No connection.${waiting || " Changes made now will be sent when it returns."}`;
  if (error === "quota") return `This account has reached its limit of changes for today.${waiting} They are sent tomorrow.`;
  if (error) return `The server could not be reached right now.${waiting} Trying again soon.`;
  if (pending) return waiting.trim();
  return last ? `Up to date. Last synced ${clock(last)}.` : "Not synced yet.";
}

/** The part of the view that decides whether the row looks different; the Options screen is rebuilt only when it changes. */
export function signature(v: AccountView): string {
  return [v.available, v.supported, v.person?.id, v.person?.name, v.person?.passkeys, v.person?.hasKey, v.busy, v.message?.text, v.sync.pending, v.sync.busy, v.sync.error, v.sync.last].join("|");
}

export function accountControls(account: Account, el: El, rerender: () => void, slot: AccountSlot = {}): HTMLElement {
  const v = account.view();
  if (slot.lastBusy && !v.busy && v.message) slot.wantStatus = true;
  slot.lastBusy = v.busy;
  const box = el("div", { class: "acct" });
  const run = (fn: () => Promise<void>) => () => { slot.confirming = false; void fn(); };
  const off = !!v.busy;

  if (!v.person) {
    slot.confirming = false;
    const input = el("input", {
      type: "text",
      maxlength: "40",
      autocomplete: "off",
      placeholder: "Practice",
      "aria-label": "A name for the account",
      value: slot.draft ?? "",
      oninput: (e: Event) => { slot.draft = (e.target as HTMLInputElement).value; },
      onkeydown: (e: KeyboardEvent) => { e.stopPropagation(); },
    }) as HTMLInputElement;
    box.append(
      el("p", { class: "onote", text: "Optional. An account keeps a copy of your documents on the server, so that your phone and your computer stay the same. You sign in with a passkey (your fingerprint, face or screen lock): no email and no password." }),
      el("label", { class: "acname" }, el("span", { class: "onote", text: "Name, shown by your passkey manager" }), input),
      el("div", { class: "xfer" },
        el("button", { type: "button", class: "btn", disabled: off || !v.supported, onclick: run(() => account.signUp(slot.draft ?? "")) }, v.busy === "create" ? "Creating ..." : "Create account"),
        el("button", { type: "button", class: "btn ghost", disabled: off || !v.supported, onclick: run(() => account.signIn()) }, v.busy === "signin" ? "Signing in ..." : "Sign in")),
    );
    if (!v.supported) box.append(el("p", { class: "onote bad", text: "This browser cannot make or use passkeys." }));
  } else {
    box.append(
      el("p", { class: "acwho" }, "Signed in as ", el("b", { text: v.person.name }), ` · ${plural(v.person.passkeys, "passkey", "passkeys")}`),
      el("p", { class: "onote", role: "status", text: syncLine(v) }),
      el("div", { class: "xfer" },
        el("button", { type: "button", class: "btn ghost", disabled: off, onclick: run(() => account.syncNow()) }, "Sync now"),
        el("button", { type: "button", class: "btn ghost", disabled: off || !v.supported, onclick: run(() => account.addPasskey()) }, v.busy === "passkey" ? "Adding ..." : "Add a passkey"),
        el("button", { type: "button", class: "btn ghost", disabled: off, onclick: run(() => account.signOut()) }, v.busy === "signout" ? "Signing out ..." : "Sign out"),
        el("button", { type: "button", id: "acct-delete", class: "btn ghost", disabled: off, onclick: () => { slot.confirming = true; slot.focus = "acct-delete-no"; rerender(); } }, "Delete account ...")),
    );
    if (slot.confirming) {
      box.append(
        el("p", { class: "onote", role: "alert", text: "This deletes the account and its copy of your documents on the server, and its passkeys. The documents on your devices stay." }),
        el("div", { class: "xfer" },
          el("button", { type: "button", class: "btn", disabled: off, onclick: run(() => account.deleteAccount()) }, v.busy === "delete" ? "Deleting ..." : "Delete account"),
          el("button", { type: "button", id: "acct-delete-no", class: "btn ghost", onclick: () => { slot.confirming = false; slot.focus = "acct-delete"; rerender(); } }, "Cancel")));
    }
  }

  if (v.message) {
    const p = el("p", { class: "onote" + (v.message.bad ? " bad" : ""), role: "status", tabindex: "-1", text: v.message.text });
    box.append(p);
    if (slot.wantStatus) queueMicrotask(() => { if (p.isConnected) p.focus({ preventScroll: false }); });
  }
  slot.wantStatus = false;
  if (v.person?.hasKey) box.append(el("p", { class: "onote", text: "This account carries the Magic Key: a device that signs in to it unlocks the definitions and the tutor, also after the key is changed." }));
  if (slot.focus) {
    const id = slot.focus;
    slot.focus = undefined;
    queueMicrotask(() => document.getElementById(id)?.focus({ preventScroll: true }));
  }
  box.append(el("p", { class: "onote", text: "Copied: answers, debates, favorites, skipped pairs, flags and check-lab runs. Not copied: these settings (Export saves them). The Magic Key is not among the documents; only an account that carries it shares it." }));
  return box;
}
