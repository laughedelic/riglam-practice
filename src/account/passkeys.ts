// What the account code needs from the browser's passkeys, and the failures it understands. The browser version is in ./webauthn.ts;
// tests give a software authenticator with the same functions.

export type PasskeyFailure = "cancelled" | "exists" | "unsupported" | "failed";

export class PasskeyError extends Error {
  constructor(public code: PasskeyFailure, message: string = code) {
    super(message);
  }
}

/** What the account code needs from the browser. Tests give a software authenticator with the same two functions. */
export interface Passkeys {
  supported(): boolean;
  /** makes a passkey; resolves to the JSON form of the result */
  create(options: Record<string, unknown>): Promise<Record<string, unknown>>;
  /** signs a challenge with a passkey the person picks */
  get(options: Record<string, unknown>): Promise<Record<string, unknown>>;
}
