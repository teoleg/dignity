/**
 * Browser driver for the dialogue: the artifact `sample` capability.
 *
 * Same prompt and same vetting as the server driver — only the transport
 * differs. Two things `sample` does not have, handled here:
 *
 *   - no system prompt. Standing instructions go in a leading user turn,
 *     which we always keep.
 *   - no schema enforcement. `sample.json` parses whatever comes back, so
 *     the reply is validated against the same zod schema the server uses
 *     before anything reaches `applyTurn`. An unparseable turn is a failed
 *     turn, never a partially-applied one.
 */

import {
  SYSTEM,
  TurnSchema,
  applyTurn,
  derive,
  promptFor,
  type Draft,
  type Message,
  type Turn,
} from "../lib/conversation.js";

/** The subset of the capability surface this page uses. */
export interface SampleFn {
  json<T = unknown>(input: unknown, opts?: Record<string, unknown>): Promise<T>;
}

const SHAPE = `
Reply with ONLY a JSON object of exactly this shape, no prose around it:

{"reply": string,
 "updates": {"englishGiven": string|null, "englishSurname": string|null,
             "englishFather": string|null, "gender": "male"|"female"|null,
             "diedOn": "YYYY-MM-DD"|null,
             "timeOfDeath": "daytime"|"after-sunset"|"unknown"|null,
             "nameConfirmed": boolean|null},
 "hebrewGiven":  {"hebrew": string, "pronunciation": string, "note": string|null} | null,
 "hebrewFather": {"hebrew": string, "pronunciation": string, "note": string|null} | null,
 "extraLine":    {"hebrew": string, "pronunciation": string, "note": string|null} | null}

Every key must be present. Use null for anything you did not learn this turn.`.trim();

export class BrowserConversation {
  constructor(private readonly sample: SampleFn) {}

  async advance(history: readonly Message[], draft: Draft): Promise<Turn> {
    const raw = await this.sample.json<unknown>(
      [
        { role: "user", content: `${SYSTEM}\n\n${SHAPE}` },
        { role: "user", content: promptFor(draft, history) },
      ],
      // Every turn must produce a fresh answer; a replayed one would repeat
      // the previous question.
      { cache: false, modelTier: "default" },
    );

    const parsed = TurnSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        reply:
          "Sorry — something went wrong on my side. Could you say that again?",
        draft,
        rejected: [],
        ...derive(draft),
      };
    }
    return { reply: parsed.data.reply, ...applyTurn(draft, parsed.data) };
  }
}
