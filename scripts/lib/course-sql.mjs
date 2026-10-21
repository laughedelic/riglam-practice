// The SQL that puts one part into the course_data table (docs/DATA.md). D1 refuses a statement longer than about 100 KB
// (SQLITE_TOOBIG), and a part such as the examples is several times that, so a long part is written piece by piece into a scratch
// row and moved into place with one short statement. A failed run can leave the scratch row but never a half-written part.

const q = (text) => `'${text.replaceAll("'", "''")}'`;

/** The most UTF-8 bytes of one quoted piece: well under D1's 100 KB, with room for the rest of the statement. */
export const PIECE = 80_000;

/** `text` cut into pieces whose quoted form is at most `max` bytes, never inside a character. */
export function pieces(text, max = PIECE) {
  const out = [];
  let piece = "";
  let bytes = 0;
  for (const ch of text) {
    const n = Buffer.byteLength(ch === "'" ? "''" : ch);
    if (bytes + n > max) { out.push(piece); piece = ""; bytes = 0; }
    piece += ch;
    bytes += n;
  }
  if (piece || !out.length) out.push(piece);
  return out;
}

/** What it takes to make the row `kind` hold `body`; a body that did not change keeps its version (`updated_at`). */
export function rowStatements(kind, body, now) {
  const keep = "updated_at = CASE WHEN course_data.body = excluded.body THEN course_data.updated_at ELSE excluded.updated_at END, body = excluded.body";
  const parts = pieces(body);
  if (parts.length === 1) return [`INSERT INTO course_data (kind, body, updated_at) VALUES (${q(kind)}, ${q(body)}, ${q(now)}) ON CONFLICT (kind) DO UPDATE SET ${keep};`];
  const scratch = `${kind}~part`;
  return [
    `INSERT INTO course_data (kind, body, updated_at) VALUES (${q(scratch)}, ${q(parts[0])}, ${q(now)}) ON CONFLICT (kind) DO UPDATE SET body = excluded.body;`,
    ...parts.slice(1).map((p) => `UPDATE course_data SET body = body || ${q(p)} WHERE kind = ${q(scratch)};`),
    `INSERT INTO course_data (kind, body, updated_at) SELECT ${q(kind)}, body, ${q(now)} FROM course_data WHERE kind = ${q(scratch)} ON CONFLICT (kind) DO UPDATE SET ${keep};`,
    `DELETE FROM course_data WHERE kind = ${q(scratch)};`,
  ];
}
