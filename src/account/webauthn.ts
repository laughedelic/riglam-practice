// The browser side of a passkey ceremony: turns the options the server sends (WebAuthn's JSON form, binary values as base64url) into
// what `navigator.credentials` takes, and what it returns into the JSON form the server verifies. No library: the format is
// small and fixed. The server decides what is accepted; this file only moves bytes.

import { PasskeyError, type Passkeys } from "./passkeys";

export { PasskeyError, type Passkeys };

export function toBase64Url(buffer: ArrayBuffer | ArrayBufferView): string {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const bin = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

type Json = Record<string, any>;

const descriptor = (d: Json) => ({ ...d, id: fromBase64Url(d.id) });

/** The options for `credentials.create`, from the server's JSON. */
export function creationOptions(o: Json): PublicKeyCredentialCreationOptions {
  return {
    ...o,
    challenge: fromBase64Url(o.challenge),
    user: { ...o.user, id: fromBase64Url(o.user.id) },
    excludeCredentials: (o.excludeCredentials ?? []).map(descriptor),
  } as unknown as PublicKeyCredentialCreationOptions;
}

/** The options for `credentials.get`, from the server's JSON. */
export function requestOptions(o: Json): PublicKeyCredentialRequestOptions {
  return {
    ...o,
    challenge: fromBase64Url(o.challenge),
    allowCredentials: (o.allowCredentials ?? []).map(descriptor),
  } as unknown as PublicKeyCredentialRequestOptions;
}

function failure(e: unknown, creating: boolean): PasskeyError {
  const name = (e as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "AbortError") return new PasskeyError("cancelled");
  if (creating && name === "InvalidStateError") return new PasskeyError("exists");
  if (name === "NotSupportedError") return new PasskeyError("unsupported");
  return new PasskeyError("failed", String((e as { message?: string })?.message ?? e));
}

export const browserPasskeys: Passkeys = {
  supported: () => typeof PublicKeyCredential !== "undefined" && !!navigator.credentials?.create && !!navigator.credentials?.get,

  async create(options) {
    if (!browserPasskeys.supported()) throw new PasskeyError("unsupported");
    let cred: Credential | null;
    try {
      cred = await navigator.credentials.create({ publicKey: creationOptions(options) });
    } catch (e) {
      throw failure(e, true);
    }
    if (!cred || !("response" in cred)) throw new PasskeyError("failed");
    const c = cred as PublicKeyCredential;
    const r = c.response as AuthenticatorAttestationResponse;
    return {
      id: c.id,
      rawId: toBase64Url(c.rawId),
      type: c.type,
      response: {
        clientDataJSON: toBase64Url(r.clientDataJSON),
        attestationObject: toBase64Url(r.attestationObject),
        transports: r.getTransports?.() ?? [],
      },
      clientExtensionResults: c.getClientExtensionResults(),
      authenticatorAttachment: c.authenticatorAttachment ?? undefined,
    };
  },

  async get(options) {
    if (!browserPasskeys.supported()) throw new PasskeyError("unsupported");
    let cred: Credential | null;
    try {
      cred = await navigator.credentials.get({ publicKey: requestOptions(options) });
    } catch (e) {
      throw failure(e, false);
    }
    if (!cred || !("response" in cred)) throw new PasskeyError("failed");
    const c = cred as PublicKeyCredential;
    const r = c.response as AuthenticatorAssertionResponse;
    return {
      id: c.id,
      rawId: toBase64Url(c.rawId),
      type: c.type,
      response: {
        clientDataJSON: toBase64Url(r.clientDataJSON),
        authenticatorData: toBase64Url(r.authenticatorData),
        signature: toBase64Url(r.signature),
        userHandle: r.userHandle ? toBase64Url(r.userHandle) : undefined,
      },
      clientExtensionResults: c.getClientExtensionResults(),
      authenticatorAttachment: c.authenticatorAttachment ?? undefined,
    };
  },
};
