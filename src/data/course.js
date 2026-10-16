// The term data has two tiers (docs/DATA.md):
//   open    terms, translations, relations, everyday items: plain JSON (drill-data.json), shipped with the app
//   course  the definitions (`d`, `d_ru`), which follow the course booklet and published translations, and the
//           tutor notes (`note`, top-level `notes`): kept on the server (the D1 table course_data) and, for the
//           data script, the artifact build and the tests, in the git-ignored folder data-private/
// This module is the one implementation of the format: how the full data splits into the tiers and goes back together.
// It is plain JavaScript with no dependencies, so the page, the Worker, the scripts and the tests all use it.

export const LOCKED_TEXT = "Locked: enter the Magic Key to read the definitions.";

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
