// One tutor question: the model call, its lookup tools, and the events that go back to the page.
// The model calls go through the official SDK. The conversation is the page's turns; the standing instructions are the kit's,
// and the fine points that belong to the pair are added to the first turn (as the page does itself in the artifact build).
// Prompt caching is automatic (a top-level cache_control), so a follow-up question re-reads the earlier turns at the cache price.

import Anthropic from "@anthropic-ai/sdk";
import { LIMITS, type ErrorCode, type Turn, type TutorEvent, type TutorKind, type TutorRequest } from "../src/ai/protocol";
import type { Config } from "./config";
import type { Kit } from "./kit";
import { addTokens, costOfTokens, noTokens, type Tokens } from "./prices";

export type Parsed = { ok: true; request: TutorRequest } | { ok: false; code: ErrorCode; message: string };

const MAX_TURN_CHARS = 20_000;

/** Checks the body of a tutor request. Says what is wrong in words fit for a log, not for the person. */
export function parseRequest(body: unknown): Parsed {
  const bad = (code: ErrorCode, message: string): Parsed => ({ ok: false, code, message });
  if (!body || typeof body !== "object" || Array.isArray(body)) return bad("bad_request", "the body is not an object");
  const { kind, cats, turns } = body as Record<string, unknown>;
  if (kind !== "chat" && kind !== "explain") return bad("bad_request", "unknown kind");
  if (!Array.isArray(cats) || cats.length > LIMITS.cats || cats.some((c) => typeof c !== "string" || c.length > 100)) return bad("bad_request", "cats must be at most two short strings");
  if (!Array.isArray(turns) || turns.length < 1) return bad("bad_request", "turns must be a list");
  if (turns.length > LIMITS.turns) return bad("prompt_too_large", "too many turns");
  let chars = 0;
  for (const t of turns) {
    if (!t || typeof t !== "object") return bad("bad_request", "a turn is not an object");
    const { role, content } = t as Record<string, unknown>;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string" || content.trim() === "") return bad("bad_request", "a turn needs a role and some text");
    if (content.length > MAX_TURN_CHARS) return bad("prompt_too_large", "a turn is too long");
    chars += content.length;
  }
  if (chars > LIMITS.chars) return bad("prompt_too_large", "the conversation is too long");
  const list = turns as Turn[];
  if (list[0].role !== "user" || list[list.length - 1].role !== "user") return bad("bad_request", "the conversation must start and end with the learner");
  return { ok: true, request: { kind: kind as TutorKind, cats: cats as string[], turns: list.map((t) => ({ role: t.role, content: t.content })) } };
}

/** The first turn with the fine points added, in the wording the page uses. */
export function withFinePoints(turns: Turn[], points: string[]): Turn[] {
  if (!points.length) return turns;
  const [first, ...rest] = turns;
  return [{ ...first, content: first.content + "\nFine points (from the sources; apply them):\n" + points.map((n) => "- " + n).join("\n") }, ...rest];
}

export interface Outcome {
  tokens: Tokens;
  micro: number;
  rounds: number;
  /** how it ended: "answered", "truncated", "refused", "aborted", or "error" */
  outcome: "answered" | "truncated" | "refused" | "aborted" | "error";
  error?: { code: ErrorCode; message: string };
}

type Emit = (e: TutorEvent) => Promise<void>;

const TOOL_RESULT_CHARS = 8_000;

function toolResult(kit: Kit, block: Anthropic.ToolUseBlock): Anthropic.ToolResultBlockParam {
  try {
    const text = JSON.stringify(kit.run(block.name, block.input)) ?? "null";
    return { type: "tool_result", tool_use_id: block.id, content: text.length > TOOL_RESULT_CHARS ? text.slice(0, TOOL_RESULT_CHARS) + " ...(cut)" : text };
  } catch (e) {
    return { type: "tool_result", tool_use_id: block.id, is_error: true, content: e instanceof Error ? e.message.slice(0, 300) : "the tool failed" };
  }
}

/** How a failed call is told to the page. The details go to the log, never to the page. */
export function describeFailure(e: unknown): { code: ErrorCode; message: string } {
  if (e instanceof Anthropic.APIError) {
    console.error("anthropic error", e.status, e.name);
    if (e.status === 429 || e.status === 529) return { code: "rate_limited", message: "The model is busy." };
    if (e.status === 413) return { code: "prompt_too_large", message: "The conversation is too long." };
  } else console.error("tutor error", e instanceof Error ? e.name : typeof e);
  return { code: "unavailable", message: "The tutor could not answer." };
}

/** Runs the question. Never throws: the result says how it ended, and `emit` has been told. */
export async function runTutor(p: { client: Anthropic; kit: Kit; config: Config; request: TutorRequest; emit: Emit; signal: AbortSignal }): Promise<Outcome> {
  const { client, kit, config, emit, signal } = p;
  const tokens = noTokens();
  let rounds = 0;
  const messages: Anthropic.MessageParam[] = withFinePoints(p.request.turns, kit.finePoints(p.request.cats)).map((t) => ({ role: t.role, content: t.content }));
  const system = [{ type: "text" as const, text: kit.guide }];
  const finish = (o: Partial<Outcome> & Pick<Outcome, "outcome">): Outcome => ({ tokens, micro: costOfTokens(config.model, tokens), rounds, ...o });

  while (rounds < config.maxRounds) {
    rounds += 1;
    const lastRound = rounds === config.maxRounds;
    let sent = Promise.resolve();
    let chars = 0;
    const stream = client.messages.stream(
      {
        model: config.model,
        max_tokens: config.maxTokens,
        system,
        messages,
        tools: kit.tools,
        // on the last round the model must answer with what it has
        ...(lastRound ? { tool_choice: { type: "none" as const } } : {}),
        output_config: { effort: config.effort },
        cache_control: { type: "ephemeral" },
      },
      { signal },
    );
    stream.on("text", (delta) => {
      chars += delta.length;
      sent = sent.then(() => emit({ type: "delta", text: delta }));
    });
    let message: Anthropic.Message;
    try {
      message = await stream.finalMessage();
      await sent;
    } catch (e) {
      // what the model had used up to the failure still counts: the input is known at the start, the output is estimated from the text sent
      const seen = stream.currentMessage?.usage;
      addTokens(tokens, seen);
      tokens.output = Math.max(tokens.output, Math.ceil(chars / 3));
      if (signal.aborted) return finish({ outcome: "aborted" });
      return finish({ outcome: "error", error: describeFailure(e) });
    }
    addTokens(tokens, message.usage);

    if (message.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: message.content });
      messages.push({ role: "user", content: message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use").map((b) => toolResult(kit, b)) });
      continue;
    }
    if (message.stop_reason === "refusal") return finish({ outcome: "refused", error: { code: "refused", message: "The model declined to answer." } });
    if (message.stop_reason === "pause_turn") return finish({ outcome: "error", error: { code: "unavailable", message: "The tutor could not answer." } });
    const truncated = message.stop_reason === "max_tokens";
    await emit({ type: "done", truncated });
    return finish({ outcome: truncated ? "truncated" : "answered" });
  }
  return finish({ outcome: "error", error: { code: "unavailable", message: "The tutor could not answer." } });
}
