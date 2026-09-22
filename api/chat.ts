/**
 * The one server endpoint: advance the dialogue by a turn.
 *
 * The API key lives here and nowhere else — the browser never sees it. The
 * response is the same `Turn` the library produces, so the page renders
 * exactly what the tested code decided, not what the model said.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Conversation } from "../src/lib/conversation-claude.js";
import type { Draft, Message } from "../src/lib/conversation.js";

/** A shared passcode, so a stray link cannot spend the owner's credit. */
const PASSCODE = process.env.DIGNITY_PASSCODE ?? "";
/** Sonnet by default: this is a feedback build, not the final quality bar. */
const MODEL = process.env.DIGNITY_MODEL ?? "claude-sonnet-5";

/**
 * Limits on what one request may carry.
 *
 * Not about correctness — about the bill. The endpoint spends the owner's
 * credit on every call, and cost is driven by how much text goes to the
 * model. Without a cap, anyone past the passcode can send a megabyte of
 * history per request and multiply the spend by a thousand. A real order is
 * a few dozen short turns.
 */
export const LIMITS = { messages: 80, perMessage: 4000, total: 60_000 } as const;

/** Is this request small enough to serve? Reason to refuse it, or null. */
export function tooLarge(history: readonly Message[]): string | null {
  if (history.length > LIMITS.messages) return "too many messages";
  let total = 0;
  for (const m of history) {
    const n = typeof m?.content === "string" ? m.content.length : 0;
    if (n > LIMITS.perMessage) return "a message is too long";
    total += n;
  }
  return total > LIMITS.total ? "the conversation is too long" : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ code: "method_not_allowed", message: "POST only" });
    return;
  }
  // Fail closed. A deployment with no passcode set is an open endpoint
  // spending someone's credit, and the person who forgot to set it is
  // exactly the person who would not notice.
  if (!PASSCODE) {
    console.error("DIGNITY_PASSCODE is not set; refusing every request");
    res.status(503).json({
      code: "upstream_error",
      message: "This deployment is not configured.",
    });
    return;
  }
  if (req.headers["x-dignity-pass"] !== PASSCODE) {
    res.status(401).json({ code: "not_granted", message: "wrong passcode" });
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({
      code: "upstream_error",
      message: "ANTHROPIC_API_KEY is not set on this deployment",
    });
    return;
  }

  const body = (req.body ?? {}) as { history?: Message[]; draft?: Draft };
  const history = Array.isArray(body.history) ? body.history : [];
  const draft = (body.draft ?? {}) as Draft;

  const oversized = tooLarge(history);
  if (oversized) {
    res.status(413).json({ code: "too_large", message: oversized });
    return;
  }

  try {
    const turn = await new Conversation({ model: MODEL }).advance(history, draft);
    res.status(200).json(turn);
  } catch (e) {
    const err = e as { status?: number; message?: string };
    // Never echo the provider's error verbatim: it can carry request detail.
    const code =
      err.status === 429 ? "rate_limited" : err.status === 401 ? "upstream_error" : "upstream_error";
    console.error("chat turn failed:", err.message);
    res.status(502).json({ code, message: "Could not reach Claude." });
  }
}
