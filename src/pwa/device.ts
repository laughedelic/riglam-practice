// The random id of this device, made once and kept. The tutor and the account send it so that the server can tell devices apart.
import { newDeviceId, DEVICE_ID } from "../ai/proof";

const DEVICE = "riglam.deviceId";
let session: string | null = null;

/** The random id of this device, made once and kept. Without usable storage it lasts for the visit. */
export function deviceId(): string {
  try {
    const kept = localStorage.getItem(DEVICE);
    if (kept && DEVICE_ID.test(kept)) return kept;
    const made = newDeviceId();
    localStorage.setItem(DEVICE, made);
    return made;
  } catch {
    return (session ??= newDeviceId());
  }
}
