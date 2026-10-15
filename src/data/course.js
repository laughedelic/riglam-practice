// The term data has two tiers (docs/DATA.md):
//   open    terms, translations, relations, everyday items: plain JSON (drill-data.json), shipped with the app
//   course  the definitions (`d`, `d_ru`), which follow the course booklet and published translations, and the
//           tutor notes (`note`, top-level `notes`): kept encrypted (course-definitions.enc, course-notes.enc)
// This module is the one implementation of the format. It uses only Web Crypto, so the same code runs in the browser
// (decrypting with the key from the shared link), in Node (the data script, the artifact build) and in the tests.

const text = new TextEncoder();
const MAGIC = text.encode("RGL1");
const IV_BYTES = 12;
// Each kind is bound to its file as additional authenticated data, so one file cannot be passed off as the other.
const AAD = { definitions: "riglam/definitions/1", notes: "riglam/notes/1" };

export const KEY_BYTES = 32;
export const LOCKED_TEXT = "Locked: enter the Magic Key to read the definitions.";

const toBase64Url = (bytes) => btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
function fromBase64Url(s) {
  const bin = atob(s.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** A new random key as the text that goes into the link and the secrets (43 characters, base64url). */
export const generateKey = () => toBase64Url(crypto.getRandomValues(new Uint8Array(KEY_BYTES)));

/** The key in `input`, which may be the bare key, a `k=...` fragment or a whole link; null when there is none. */
export function parseKey(input) {
  const s = String(input ?? "").trim();
  const m = /(?:^|[#&?])k=([A-Za-z0-9_-]{43})(?![A-Za-z0-9_-])/.exec(s) ?? /^([A-Za-z0-9_-]{43})$/.exec(s);
  if (!m) return null;
  try {
    return fromBase64Url(m[1]).length === KEY_BYTES ? m[1] : null;
  } catch {
    return null;
  }
}

const aesKey = (key, usage) => crypto.subtle.importKey("raw", fromBase64Url(key), "AES-GCM", false, [usage]);
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) (out.set(p, at), (at += p.length));
  return out;
};

/** Encrypts `plain` (a string) for `kind` ("definitions" or "notes"); returns the bytes of the .enc file. */
export async function seal(key, kind, plain) {
  if (!AAD[kind]) throw new Error(`unknown kind: ${kind}`);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const body = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: text.encode(AAD[kind]) }, await aesKey(key, "encrypt"), text.encode(plain));
  return concat(MAGIC, iv, new Uint8Array(body));
}

/** Decrypts the bytes of a .enc file; throws when the key is wrong, the kind differs or the data was changed. */
export async function open(key, kind, bytes) {
  if (!AAD[kind]) throw new Error(`unknown kind: ${kind}`);
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length < MAGIC.length + IV_BYTES + 16 || MAGIC.some((v, i) => b[i] !== v)) throw new Error("not a course data file");
  const iv = b.slice(MAGIC.length, MAGIC.length + IV_BYTES);
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: text.encode(AAD[kind]) }, await aesKey(key, "decrypt"), b.slice(MAGIC.length + IV_BYTES));
    return new TextDecoder().decode(plain);
  } catch {
    throw new Error("the key does not open this data");
  }
}

const DEFINITION_FIELDS = ["d", "d_ru"];

/**
 * Splits the full term data (what the knowledge base exports) into the open data and the two course parts.
 * The open data keeps every term, with its definitions, note and the group notes taken out.
 */
export function split(full) {
  const open = structuredClone(full);
  const definitions = {};
  const notes = { terms: {}, groups: open.notes ?? {} };
  for (const [key, term] of Object.entries(open.terms)) {
    for (const f of DEFINITION_FIELDS) {
      if (term[f] === undefined) continue;
      (definitions[key] ??= {})[f] = term[f];
      delete term[f];
    }
    if (term.note !== undefined) {
      notes.terms[key] = term.note;
      delete term.note;
    }
  }
  delete open.notes;
  return { open, definitions, notes };
}

/** The reverse of split. `notes` may be left out (the app does not use them); `definitions` null leaves the terms without. */
export function merge(open, definitions, notes) {
  const full = structuredClone(open);
  for (const [key, fields] of Object.entries(definitions ?? {})) if (full.terms[key]) Object.assign(full.terms[key], fields);
  if (notes) {
    for (const [key, note] of Object.entries(notes.terms ?? {})) if (full.terms[key]) full.terms[key].note = note;
    full.notes = notes.groups ?? {};
  }
  return full;
}

/** The open data with every definition replaced by a notice, for a reader who has no key. */
export function lock(open, message = LOCKED_TEXT) {
  const locked = structuredClone(open);
  for (const term of Object.values(locked.terms)) term.d = message;
  return locked;
}
