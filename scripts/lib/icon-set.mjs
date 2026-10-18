// Which icon set a build carries: "main" (public/icons, the real app) or "preview" (public/icons/preview, staging and pull request
// builds). RIGLAM_ICON_SET says it outright. Without it, a build on Cloudflare Workers Builds of any branch but the production branch
// (`main`, docs/DEPLOY.md) is a Preview: Workers Builds names the branch in WORKERS_CI_BRANCH. Everything else (a local build, CI) is main.
export const PRODUCTION_BRANCH = "main";

export function iconSet(env = process.env) {
  if (env.RIGLAM_ICON_SET === "preview" || env.RIGLAM_ICON_SET === "main") return env.RIGLAM_ICON_SET;
  return env.WORKERS_CI_BRANCH && env.WORKERS_CI_BRANCH !== PRODUCTION_BRANCH ? "preview" : "main";
}
