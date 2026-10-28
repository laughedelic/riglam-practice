// Vite plugin: replaces the <!--@markup--> placeholder in index.html with the page markup
// (src/app/markup.html), which is kept as its own file so the artifact build can use it unchanged. `tag` names another placeholder
// (<!--@cover--> with src/pwa/cover.html, the cover of the installed app).
import { readFileSync } from "node:fs";

export function includeMarkup(file, tag = "markup") {
  const mark = `<!--@${tag}-->`;
  return {
    name: "riglam-include-" + tag,
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        if (!html.includes(mark)) return html;
        ctx.server?.watcher.add(file);
        return html.replace(mark, readFileSync(file, "utf8").trim());
      },
    },
    handleHotUpdate({ file: f, server }) {
      if (f === file) server.ws.send({ type: "full-reload" });
    },
  };
}
