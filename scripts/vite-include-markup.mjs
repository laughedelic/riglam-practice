// Vite plugin: replaces the <!--@markup--> placeholder in index.html with the page markup
// (src/app/markup.html), which is kept as its own file so the artifact build can use it unchanged.
import { readFileSync } from "node:fs";

export function includeMarkup(file) {
  return {
    name: "riglam-include-markup",
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        if (!html.includes("<!--@markup-->")) return html;
        ctx.server?.watcher.add(file);
        return html.replace("<!--@markup-->", readFileSync(file, "utf8").trim());
      },
    },
    handleHotUpdate({ file: f, server }) {
      if (f === file) server.ws.send({ type: "full-reload" });
    },
  };
}
