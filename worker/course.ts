// The course data as the Worker reads it: rows of the `course_data` table (worker/migrations/0003_course_data.sql).
// The definitions go to a device that has the Magic Key (GET /api/course); the notes are only for the tutor's kit. The reference
// examples are optional rows: `examples` for the tutor's kit, `examples_device` for a device with the key (GET /api/course/examples).

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

/** One row: its JSON text and when it was loaded, its version. */
export interface CourseRow {
  body: string;
  at: string;
}

const looked = new Map<string, { key: string; usable: boolean }>();

/**
 * Whether the row's text is a JSON object, so that it can be sent as it is. `npm run data:publish` only writes such text; this is for
 * a row written some other way. It is looked at once per kind and version (the parse is not repeated for every request).
 */
function usableObject(kind: string, body: string, version: string): boolean {
  const key = `${version}|${body.length}`;
  const seen = looked.get(kind);
  if (seen?.key === key) return seen.usable;
  let usable = false;
  try {
    const parsed: unknown = JSON.parse(body);
    usable = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
  } catch { /* not JSON */ }
  looked.set(kind, { key, usable });
  return usable;
}

/** Whether the definitions row is a JSON object (usableObject). */
export const usableDefinitions = (rows: CourseRows): boolean => usableObject("definitions", rows.definitions, rows.version);

/** Whether an optional row is a JSON object (usableObject). */
export const usableRow = (kind: string, row: CourseRow): boolean => usableObject(kind, row.body, row.at);

/** One optional row (the examples), or null when it is missing or the database cannot be read: the feature it carries is then off. */
export async function readCourseRow(db: D1Database | undefined, kind: "examples" | "examples_device"): Promise<CourseRow | null> {
  if (!db) return null;
  try {
    return (await db.prepare("SELECT body, updated_at AS at FROM course_data WHERE kind = ?1").bind(kind).first<CourseRow>()) ?? null;
  } catch {
    return null;
  }
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
