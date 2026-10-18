// The PWA's `reports` capability: a learner's flag, with the stored answer it was made on, sent to the app's own server
// (docs/SERVER.md, "Flag reports"). Only a device that has the Magic Key gets it; the request proves that without sending the
// key (src/ai/proof.ts), as the tutor's does. A flag the learner removes is taken back; where that cannot be done at once
// the id is kept on the device and tried again.
import { HEADER } from "../ai/protocol";
import { makeProof } from "../ai/proof";
import { REPORT_API, REPORT_LIMITS, autoFlagOf, type FlagReport, type ReportRequest, type ReportResponse } from "../report/protocol";
import type { Reports } from "../platform/types";
import { deviceId } from "./device";
import { serverSays } from "./tutor";

const PENDING = "riglam.flagsToWithdraw";
/** most ids kept for a later try; the oldest go first */
const KEPT_MAX = 200;

declare const __APP_VERSION__: string | undefined;
const appVersion = (): string | undefined => (typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : undefined);

/** Whether the server says it takes reports. Anything else (off, unreachable, slow, a server from before them) is "no". The platform asks /api/health once for all of it (serverSays). */
export const reportsAreOn = async (doFetch: typeof fetch = (...a) => fetch(...a), waitMs = 4000): Promise<boolean> => (await serverSays(doFetch, waitMs)).reports;

/**
 * The ids of flags removed on this device that the server has not yet been told about. Without usable storage they last for the
 * visit; so do the ids written after storage refused a write (full), which it would otherwise still show without them.
 */
function pendingStore() {
  let memory: string[] = [];
  let refused = false;
  return {
    read(): string[] {
      if (refused) return memory;
      try {
        const v = JSON.parse(localStorage.getItem(PENDING) ?? "[]");
        memory = Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
      } catch { /* the visit's own copy */ }
      return memory;
    },
    write(ids: string[]) {
      memory = ids.slice(-KEPT_MAX);
      try {
        if (memory.length) localStorage.setItem(PENDING, JSON.stringify(memory));
        else localStorage.removeItem(PENDING);
      } catch {
        refused = true;
      }
    },
  };
}

/** Keeps the id of a report removed while this device has no `reports` capability (offline at the start, no key), so that the next start that has it takes the report back. */
export function withdrawLater(id: string) {
  const pending = pendingStore();
  const left = pending.read();
  if (!left.includes(id)) pending.write([...left, id]);
}

/** The reports for a device that has `key` (already known to be the study group's). */
export function createReports(key: string, doFetch: typeof fetch = (...a) => fetch(...a), device: () => string = deviceId): Reports {
  const pending = pendingStore();

  /** The server's answer, or its status when there is none: 0 when the request did not get through, else an error's (a wrong key 403; 429 for the day's limit or for a wait after too many wrong keys; an invalid report 400). */
  async function post(request: ReportRequest): Promise<ReportResponse | number> {
    try {
      const id = device();
      const res = await doFetch(REPORT_API.reports, {
        method: "POST",
        headers: { "content-type": "application/json", [HEADER.device]: id, [HEADER.proof]: await makeProof(key, id) },
        body: JSON.stringify({ ...request, app: appVersion() }),
      });
      if (!res.ok) return res.status;
      const body = (await res.json()) as Partial<ReportResponse>;
      return { stored: Array.isArray(body.stored) ? body.stored : [], withdrawn: Array.isArray(body.withdrawn) ? body.withdrawn : [] };
    } catch {
      return 0;
    }
  }

  async function flush() {
    const ids = pending.read();
    for (let at = 0; at < ids.length; at += REPORT_LIMITS.withdraw) {
      const part = ids.slice(at, at + REPORT_LIMITS.withdraw);
      const done = await post({ withdraw: part });
      if (typeof done === "number") return; // the next try takes all that is left
      const gone = new Set(done.withdrawn);
      pending.write(pending.read().filter((id) => !gone.has(id)));
    }
  }

  return {
    async send(reports) {
      // a flag made again after it was removed is a new report: the earlier removal must not take it back
      const sending = new Set(reports.map((r: FlagReport) => r.id));
      const left = pending.read();
      if (left.some((id) => sending.has(id))) pending.write(left.filter((id) => !sending.has(id)));
      const stored: string[] = [];
      // Hand-made flags and automatic ones are counted apart by the server, so they go in requests of their own, hand-made first: a full
      // allowance of one kind must not refuse the other.
      for (const group of [reports.filter((r) => !autoFlagOf(r.flag)), reports.filter((r) => autoFlagOf(r.flag))]) {
        for (let at = 0; at < group.length; at += REPORT_LIMITS.send) {
          const part = group.slice(at, at + REPORT_LIMITS.send);
          const done = await post({ send: part });
          if (typeof done !== "number") {
            stored.push(...done.stored);
          } else if (done === 400 || done === 413) {
            // the server refused the request as invalid: one report at a time, so that a bad one does not hold the others back
            for (const one of part) {
              const alone = await post({ send: [one] });
              if (typeof alone !== "number") stored.push(...alone.stored);
            }
          } else break; // the rest of this kind waits for the next try; the other kind is still tried
        }
      }
      return stored;
    },
    async withdraw(id) {
      const left = pending.read();
      if (!left.includes(id)) pending.write([...left, id]);
      await flush();
    },
    flush,
  };
}
