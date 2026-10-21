// Artifact build: the Claude artifact frame provides `window.claude` (db, sample). The only thing the page needs from the
// build is its data, which is embedded here because the artifact is published as one file.
import dataText from "virtual:riglam-full-data"; // the full term data, merged at build time (scripts/vite-full-data.mjs)
import examplesText from "virtual:riglam-examples"; // the reference examples (the part a device keeps), or null (scripts/vite-full-data.mjs)
import type { Platform } from "../platform/types";

type Frame = { use(name: string): Promise<unknown> };

/** The capability `name` from the frame, or null when there is no frame or the frame has no such capability. */
async function use<T>(name: string): Promise<T | null> {
  const frame = (window as unknown as { claude?: Frame }).claude;
  return frame ? (((await frame.use(name)) as T | undefined) ?? null) : null;
}

export const artifactPlatform: Platform = {
  target: "artifact",
  loadData: async () => JSON.parse(dataText),
  examples: async () => (examplesText ? JSON.parse(examplesText) : null),
  db: () => use("db"),
  sample: () => use("sample"),
};
