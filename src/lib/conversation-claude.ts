/**
 * Server-side driver for the dialogue: the Anthropic SDK.
 *
 * All the logic lives in `conversation.ts`, which has no SDK import so it can
 * also run in a browser. This file only moves a turn across the wire.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  SYSTEM,
  TurnSchema,
  applyTurn,
  derive,
  promptFor,
  type Draft,
  type Message,
  type Turn,
} from "./conversation.js";

const MODEL = "claude-opus-5";

export interface ConversationOptions {
  client?: Anthropic;
  model?: string;
}

export class Conversation {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(opts: ConversationOptions = {}) {
    this.client = opts.client ?? new Anthropic();
    this.model = opts.model ?? MODEL;
  }

  /**
   * Advance the dialogue by one exchange.
   *
   * Returns the reply to show, the updated draft, and the inscription as the
   * deterministic library sees it — which is the only version that counts.
   */
  async advance(history: readonly Message[], draft: Draft): Promise<Turn> {
    const res = await this.client.messages.parse({
      model: this.model,
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: promptFor(draft, history),
        },
      ],
      output_config: { format: zodOutputFormat(TurnSchema) },
    });

    const parsed = res.parsed_output;
    if (!parsed) {
      return { reply: "Sorry — could you say that again?", draft, rejected: [], ...derive(draft) };
    }
    // applyTurn supplies the reply: it is the only path that strips Hebrew.
    return applyTurn(draft, parsed);
  }
}

