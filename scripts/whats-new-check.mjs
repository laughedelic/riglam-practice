// Runs the What's new rule on a pull request (scripts/lib/whats-new-check.mjs). The workflow gives it the title and body in the environment and the two commits to compare.
import { execFileSync } from "node:child_process";
import { checkWhatsNew } from "./lib/whats-new-check.mjs";

const { PR_TITLE = "", PR_BODY = "", BASE_SHA, HEAD_SHA } = process.env;
if (!BASE_SHA || !HEAD_SHA) { console.error("BASE_SHA and HEAD_SHA are needed"); process.exit(2); }
const files = execFileSync("git", ["diff", "--name-only", `${BASE_SHA}...${HEAD_SHA}`], { encoding: "utf8" }).split("\n").filter(Boolean);
const problem = checkWhatsNew({ title: PR_TITLE, body: PR_BODY, files });
if (problem) { console.error(`::error title=What's new::${problem}`); process.exit(1); }
console.log("What's new: in order.");
