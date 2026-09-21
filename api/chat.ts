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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ code: "method_not_allowed", message: "POST only" });
    return;
  }
  if (PASSCODE && req.headers["x-dignity-pass"] !== PASSCODE) {
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
