// Artifact build: the Claude artifact frame provides window.claude (db, sample). The only thing the page
// needs from the build is its data, which is embedded here because the artifact is published as one file.
import dataText from "virtual:riglam-full-data"; // the full term data, merged at build time (scripts/vite-full-data.mjs)

window.__riglam = {
  target: "artifact",
  fetchData: () => Promise.resolve(new Response(dataText, { headers: { "content-type": "application/json" } })),
};
