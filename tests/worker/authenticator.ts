// A software passkey authenticator for the tests: it makes the same bytes a phone or a laptop would (a "none" attestation
// with an ES256 key, and signed assertions), so that the real verification of @simplewebauthn/server runs on them.
import { toB64u } from "../../worker/session";

/* ---------- CBOR, just enough for a COSE key and an attestation object ---------- */

function head(major: number, n: number): number[] {
  if (n < 24) return [(major << 5) | n];
  if (n < 256) return [(major << 5) | 24, n];
  return [(major << 5) | 25, n >> 8, n & 255];
}
type Cbor = number | string | Uint8Array | Map<Cbor, Cbor>;
function cbor(v: Cbor): number[] {
  if (typeof v === "number") return v >= 0 ? head(0, v) : head(1, -1 - v);
  if (typeof v === "string") {
    const b = new TextEncoder().encode(v);
    return [...head(3, b.length), ...b];
  }
  if (v instanceof Uint8Array) return [...head(2, v.length), ...v];
  return [...head(5, v.size), ...[...v].flatMap(([k, x]) => [...cbor(k), ...cbor(x)])];
}

const concat = (...parts: Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};
const sha256 = async (b: Uint8Array) => new Uint8Array(await crypto.subtle.digest("SHA-256", b));
const utf8 = (s: string) => new TextEncoder().encode(s);

/** An ECDSA signature as WebCrypto makes it (r and s side by side) in the DER form WebAuthn carries. */
function der(raw: Uint8Array): Uint8Array {
  const int = (b: Uint8Array) => {
    let i = 0;
    while (i < b.length - 1 && b[i] === 0) i++;
    let v = b.slice(i);
    if (v[0] & 0x80) v = concat(new Uint8Array([0]), v);
    return concat(new Uint8Array([0x02, v.length]), v);
  };
  const body = concat(int(raw.slice(0, 32)), int(raw.slice(32)));
  return concat(new Uint8Array([0x30, body.length]), body);
}

export interface Passkey {
  /** the credential id, base64url */
  id: string;
  /** what the server must hand back as the user handle after signing in with this passkey (set when it is made) */
  userHandle: string | null;
  /** how often it has been used */
  counter: number;
  register(options: Record<string, any>, where: { origin: string; rpID: string }, over?: { origin?: string; type?: string; challenge?: string }): Promise<Record<string, unknown>>;
  sign(options: Record<string, any>, where: { origin: string; rpID: string }, over?: { origin?: string; challenge?: string; userHandle?: string | null }): Promise<Record<string, unknown>>;
}

/** A new passkey (its own key pair and credential id). */
export async function passkey(): Promise<Passkey> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as JsonWebKey;
  const fromB64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
  const cose = new Map<Cbor, Cbor>([[1, 2], [3, -7], [-1, 1], [-2, fromB64(jwk.x!)], [-3, fromB64(jwk.y!)]]);
  const credentialId = crypto.getRandomValues(new Uint8Array(32));
  const me: Passkey = {
    id: toB64u(credentialId),
    userHandle: null,
    counter: 0,
    async register(options, where, over = {}) {
      me.userHandle = options.user.id;
      const flags = 0x01 | 0x04 | 0x40 | 0x08 | 0x10; // present, verified, has credential data, backup eligible and backed up (a synced passkey)
      const authData = concat(
        await sha256(utf8(where.rpID)),
        new Uint8Array([flags, 0, 0, 0, 0]),
        new Uint8Array(16),
        new Uint8Array([credentialId.length >> 8, credentialId.length & 255]),
        credentialId,
        new Uint8Array(cbor(cose)),
      );
      const attestation = new Uint8Array(cbor(new Map<Cbor, Cbor>([["fmt", "none"], ["attStmt", new Map()], ["authData", authData]])));
      const clientData = utf8(JSON.stringify({ type: over.type ?? "webauthn.create", challenge: over.challenge ?? options.challenge, origin: over.origin ?? where.origin, crossOrigin: false }));
      return {
        id: me.id,
        rawId: me.id,
        type: "public-key",
        response: { clientDataJSON: toB64u(clientData), attestationObject: toB64u(attestation), transports: ["internal", "hybrid"] },
        clientExtensionResults: {},
        authenticatorAttachment: "platform",
      };
    },
    async sign(options, where, over = {}) {
      me.counter += 1;
      const authData = concat(await sha256(utf8(where.rpID)), new Uint8Array([0x01 | 0x04 | 0x08 | 0x10, 0, 0, (me.counter >> 8) & 255, me.counter & 255]));
      const clientData = utf8(JSON.stringify({ type: "webauthn.get", challenge: over.challenge ?? options.challenge, origin: over.origin ?? where.origin, crossOrigin: false }));
      const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, concat(authData, await sha256(clientData))));
      return {
        id: me.id,
        rawId: me.id,
        type: "public-key",
        response: {
          clientDataJSON: toB64u(clientData),
          authenticatorData: toB64u(authData),
          signature: toB64u(der(signature)),
          userHandle: over.userHandle === undefined ? me.userHandle : over.userHandle,
        },
        clientExtensionResults: {},
        authenticatorAttachment: "platform",
      };
    },
  };
  return me;
}
