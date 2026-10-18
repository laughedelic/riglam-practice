// The Worker's entry (wrangler.jsonc, `main`). Only /api/* reaches `fetch` (`assets.run_worker_first`); the static site is served by the platform.
// `scheduled` runs on the cron trigger (wrangler.jsonc, `triggers`): the review of flag reports (worker/review.ts).
import { createApp } from "./app";
import { bundled } from "./bundled";
import type { Env } from "./env";
import { loadKit } from "./kit";
import { reviewPass } from "./review";

const kit = (env: Env) => loadKit(env, bundled);

export default {
  fetch: createApp({ kit }).fetch,
  scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(reviewPass(env, { kit }).then((r) => (r.stopped === "error" ? console.error("review pass stopped:", r.stopped) : undefined)));
  },
};
