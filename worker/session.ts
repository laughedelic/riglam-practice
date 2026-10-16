// Sessions of the optional accounts (docs/SERVER.md, "Accounts and sync"). Signing in with a passkey gives the browser a
// random token in a cookie; D1 keeps only the token's hash, so a copy of the database cannot be used to sign in.

/** `__Secure-` makes browsers refuse the cookie unless it is set over HTTPS (localhost counts as secure). */
export const COOKIE = "__Secure-riglam-session";
const DAY = 86_400_000;
export const SESSION_MS = 60 * DAY;
/** a session with less than this left is extended when it is used */
const RENEW_BELOW_MS = 30 * DAY;

export function toB64u(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64u(text: string): Uint8Array<ArrayBuffer> {
  const s = text.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "=".repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const randomToken = (bytes = 16): string => toB64u(crypto.getRandomValues(new Uint8Array(bytes)));

export async function hashToken(token: string): Promise<string> {
  return toB64u(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))));
}

export const sessionCookie = (token: string): string => `${COOKIE}=${token}; Path=/api; Max-Age=${SESSION_MS / 1000}; HttpOnly; Secure; SameSite=Strict`;
export const clearedCookie = (): string => `${COOKIE}=; Path=/api; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;

/** The value of the session cookie in a `cookie` request header, if there is one. */
export function tokenFrom(header: string | undefined): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === COOKIE) return part.slice(eq + 1).trim() || null;
  }
  return null;
}

/** A new session: the token for the cookie and the statement that stores it (so that it can join a batch). */
export async function newSession(db: D1Database, userId: string, now: Date): Promise<{ token: string; insert: D1PreparedStatement }> {
  const token = randomToken(32);
  // Only for an account that exists when the statement runs (a deletion may have come in since the caller looked), so that none is left without an owner.
  const insert = db
    .prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) SELECT ?1, ?2, ?3, ?4 WHERE EXISTS (SELECT 1 FROM users WHERE id = ?2)")
    .bind(await hashToken(token), userId, now.toISOString(), new Date(now.getTime() + SESSION_MS).toISOString());
  return { token, insert };
}

export interface Session {
  userId: string;
  name: string;
  tokenHash: string;
  /** the session was extended by this use, so the browser's cookie must be extended too */
  renewed: boolean;
}

/** Who the cookie belongs to, or null when it is missing, unknown or over. A session that is half over is extended. */
export async function readSession(db: D1Database, cookieHeader: string | undefined, now: Date): Promise<Session | null> {
  const token = tokenFrom(cookieHeader);
  if (!token || token.length > 200) return null;
  const tokenHash = await hashToken(token);
  const row = await db
    .prepare("SELECT s.user_id AS userId, s.expires_at AS expires, u.name AS name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?1")
    .bind(tokenHash)
    .first<{ userId: string; expires: string; name: string }>();
  if (!row) return null;
  const left = Date.parse(row.expires) - now.getTime();
  if (!(left > 0)) return null;
  let renewed = false;
  if (left < RENEW_BELOW_MS) {
    renewed = await db
      .prepare("UPDATE sessions SET expires_at = ?2 WHERE token_hash = ?1")
      .bind(tokenHash, new Date(now.getTime() + SESSION_MS).toISOString())
      .run()
      .then((r) => r.meta.changes > 0, () => false);
  }
  return { userId: row.userId, name: row.name, tokenHash, renewed };
}
