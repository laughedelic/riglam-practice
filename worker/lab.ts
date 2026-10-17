// One model call of the check lab: the page's prompt goes to the model it names, and the text comes back. The lab asks three models the same
// question and a fourth to judge (src/app/ai/lab.js), so each call is a separate request. Only the Worker of a Preview answers (LAB=on, config.ts).
// A call has no tools and no earlier turns, and only the lab's models and effort levels are accepted (src/ai/protocol.ts, LAB).

import Anthropic from "@anthropic-ai/sdk";
import { LAB, type ErrorCode, type LabRequest, type LabResponse } from "../src/ai/protocol";
import type { Config } from "./config";
import { addTokens, costOfTokens, noTokens, type Tokens } from "./prices";
import { describeFailure } from "./tutor";

export type ParsedLab = { ok: true; request: LabRequest } | { ok: false; code: ErrorCode; message: string };

/** Checks the body of a lab request. Says what is wrong in words fit for a log, not for the person. */
export function parseLabRequest(body: unknown): ParsedLab {
  const bad = (code: ErrorCode, message: string): ParsedLab => ({ ok: false, code, message });
  if (!body || typeof body !== "object" || Array.isArray(body)) return bad("bad_request", "the body is not an object");
  const { model, effort, prompt } = body as Record<string, unknown>;
  if (typeof model !== "string" || !(LAB.models as readonly string[]).includes(model)) return bad("bad_request", "unknown model");
  if (typeof effort !== "string" || !(LAB.efforts as readonly string[]).includes(effort)) return bad("bad_request", "unknown effort");
  if (typeof prompt !== "string" || prompt.trim() === "") return bad("bad_request", "the prompt must be some text");
  if (prompt.length > LAB.prompt) return bad("prompt_too_large", "the prompt is too long");
  return { ok: true, request: { model, effort, prompt } };
}

export interface LabOutcome {
  tokens: Tokens;
  micro: number;
  outcome: "answered" | "truncated" | "refused" | "error";
  reply?: LabResponse;
  error?: { code: ErrorCode; message: string };
}

/** Runs the call. Never throws: the result says how it ended, and what the call used is counted either way. */
export async function runLab(p: { client: Anthropic; config: Config; request: LabRequest }): Promise<LabOutcome> {
  const { client, config, request } = p;
  const tokens = noTokens();
  const finish = (o: Partial<LabOutcome> & Pick<LabOutcome, "outcome">): LabOutcome => ({ tokens, micro: costOfTokens(request.model, tokens), ...o });
  let message: Anthropic.Message;
  const stream = client.messages.stream({
    model: request.model,
    max_tokens: config.maxTokens,
    messages: [{ role: "user", content: request.prompt }],
    output_config: { effort: request.effort as (typeof LAB.efforts)[number] },
  });
  try {
    message = await stream.finalMessage();
  } catch (e) {
    // what the model had used up to the failure still counts (the input is known at the start)
    addTokens(tokens, stream.currentMessage?.usage);
    return finish({ outcome: "error", error: describeFailure(e) });
  }
  addTokens(tokens, message.usage);
  if (message.stop_reason === "refusal") return finish({ outcome: "refused", error: { code: "refused", message: "The model declined to answer." } });
  if (message.stop_reason === "tool_use" || message.stop_reason === "pause_turn") return finish({ outcome: "error", error: { code: "unavailable", message: "The model could not answer." } });
  const truncated = message.stop_reason === "max_tokens";
  const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  // a dated name of the model that was asked for is that model
  const modelApplied = message.model.startsWith(request.model) ? request.model : message.model;
  return finish({ outcome: truncated ? "truncated" : "answered", reply: { text, truncated, modelApplied } });
}
