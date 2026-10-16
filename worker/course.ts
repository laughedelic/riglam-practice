// The course data as the Worker reads it: two rows of the `course_data` table (worker/migrations/0003_course_data.sql).
// The definitions go to a device that has the Magic Key (GET /api/course); the notes are only for the tutor's kit.

export interface CourseRows {
  /** JSON text: { [term]: { d?, d_ru? } } */
  definitions: string;
  /** JSON text: { terms?: { [term]: note }, groups?: { [group]: notes[] } } */
  notes: string;
  /** when the definitions were loaded: the version a device compares with what it kept */
  version: string;
  /** when either row last changed: what the tutor's kit is remade for (a change of the notes alone does not move `version`) */
  revision: string;
}

let looked: { key: string; usable: boolean } | null = null;

/**
 * Whether the definitions row is a JSON object, so that it can be sent as it is. `npm run data:publish` only writes such text; this is for
 * a row written some other way. It is looked at once per version (the parse is not repeated for every request).
 */
export function usableDefinitions(rows: CourseRows): boolean {
  const key = `${rows.version}|${rows.definitions.length}`;
  if (looked?.key !== key) {
    let usable = false;
    try {
      const parsed: unknown = JSON.parse(rows.definitions);
      usable = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
    } catch { /* not JSON */ }
    looked = { key, usable };
  }
  return looked.usable;
}

/** Both rows, or null when either is missing or the database cannot be read (the tutor and /api/course are then off). */
export async function readCourseRows(db: D1Database | undefined): Promise<CourseRows | null> {
  if (!db) return null;
  try {
    const rows = (await db.prepare("SELECT kind, body, updated_at AS at FROM course_data WHERE kind IN ('definitions', 'notes')").all<{ kind: string; body: string; at: string }>()).results;
    const definitions = rows.find((r) => r.kind === "definitions");
    const notes = rows.find((r) => r.kind === "notes");
    return definitions && notes ? { definitions: definitions.body, notes: notes.body, version: definitions.at, revision: `${definitions.at}|${notes.at}` } : null;
  } catch {
    return null;
  }
}
