// The proof that a request comes from someone who has the study group's key (docs/DATA.md), without sending the key.
// proof = HMAC-SHA256 over a fixed label and the device id, keyed with the data key, as base64url. The server holds the
// same key (a secret) and recomputes it. The device id is a random value the app makes once per device; it is how the
// server keeps one device's budget apart from another's. It proves nothing by itself: anyone can invent an id, so the
// per-device limit stops accidents and one heavy user, and the global budget is the real limit.
// Only Web Crypto is used, so the same code runs in the browser and in the Worker.

const label = new TextEncoder().encode("riglam/tutor-proof/1:");

const fromBase64Url = (s: string): Uint8Array<ArrayBuffer> => {
  const bin = atob(s.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
const toBase64Url = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");

const message = (device: string): Uint8Array<ArrayBuffer> => {
  const d = new TextEncoder().encode(device);
  const out = new Uint8Array(label.length + d.length);
  out.set(label);
  out.set(d, label.length);
  return out;
};

const hmacKey = (key: string, usage: "sign" | "verify") => crypto.subtle.importKey("raw", fromBase64Url(key), { name: "HMAC", hash: "SHA-256" }, false, [usage]);

/** The id the app gives a device: 22 base64url characters of randomness. */
export const DEVICE_ID = /^[A-Za-z0-9_-]{16,64}$/;
export const newDeviceId = (): string => toBase64Url(crypto.getRandomValues(new Uint8Array(16)));

/** The proof for `device`, made with the data key `key` (43 base64url characters). */
export async function makeProof(key: string, device: string): Promise<string> {
  return toBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(key, "sign"), message(device))));
}

/** True when `proof` is the proof for `device` under `key`. The comparison is Web Crypto's `verify`, which does not leak where a mismatch is. */
export async function checkProof(key: string, device: string, proof: string): Promise<boolean> {
  if (!DEVICE_ID.test(device) || !/^[A-Za-z0-9_-]{43}$/.test(proof)) return false;
  try {
    return await crypto.subtle.verify("HMAC", await hmacKey(key, "verify"), fromBase64Url(proof), message(device));
  } catch {
    return false;
  }
}
