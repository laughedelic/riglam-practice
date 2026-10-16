// The made-up course data that CI uses instead of the real definitions (docs/DATA.md).
import { expect, test } from "vitest";
import { readOpen } from "../../scripts/lib/course-files.mjs";
import { madeUpCourse } from "../../scripts/lib/made-up-course.mjs";
import { merge, split } from "../../src/data/course.js";

const open = readOpen();

test("it has a definition for every term, short and long, and a Russian one for most", () => {
  const definitions = madeUpCourse(open).definitions as Record<string, { d: string; d_ru?: string }>;
  const keys = Object.keys(open.terms);
  expect(Object.keys(definitions)).toEqual(keys);
  const lengths = keys.map((k) => definitions[k].d.length);
  expect(Math.min(...lengths)).toBeGreaterThanOrEqual(12);
  expect(Math.max(...lengths)).toBeGreaterThan(300);
  expect(Math.max(...lengths)).toBeLessThanOrEqual(417);
  const russian = keys.filter((k) => definitions[k].d_ru);
  expect(russian.length).toBeGreaterThan(keys.length * 0.7);
  expect(russian.length).toBeLessThan(keys.length);
  expect(russian.every((k) => /[а-я]/.test(definitions[k].d_ru!) && !/[a-z]/i.test(definitions[k].d_ru!))).toBe(true);
});

test("it has notes for some terms and some categories, keyed by what exists in the open data", () => {
  const { notes } = madeUpCourse(open);
  expect(Object.keys(notes.terms).length).toBeGreaterThan(20);
  expect(Object.keys(notes.terms).length).toBeLessThan(Object.keys(open.terms).length);
  expect(Object.keys(notes.terms).every((k) => open.terms[k])).toBe(true);
  const cats = new Set<string>(open.cats.map((c: { id: string }) => c.id));
  expect(Object.keys(notes.groups).length).toBeGreaterThan(5);
  expect(Object.keys(notes.groups).every((id) => cats.has(id))).toBe(true);
  expect(Object.values<string[]>(notes.groups).every((v) => v.length === 1 && v[0].length > 100)).toBe(true);
});

test("it is the same every time, and it splits and merges like the real data", () => {
  const a = madeUpCourse(open);
  expect(madeUpCourse(open)).toEqual(a);
  const full = merge(open, a.definitions, a.notes);
  expect(split(full)).toEqual({ open, definitions: a.definitions, notes: a.notes });
});
