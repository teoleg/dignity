/**
 * The Claude-backed implementation of `TranslationModel`.
 *
 * A thin adapter. Every safety property lives in `translation.ts`, which vets
 * whatever this returns — so this file can be swapped for a curated phrase
 * book, or a different model, without weakening anything.
 *
 * Two prompts, deliberately separate. The back-translation call is given the
 * Hebrew and nothing else: a gloss written by the pass that produced the
 * Hebrew restates the intent instead of checking it.
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { BOXES_PER_LINE } from "./form-table.js";
import type {
  NameRole,
  RawCandidate,
  RawName,
  TranslationModel,
  TranslationRequest,
} from "./translation.js";

const MODEL = "claude-opus-5";

/**
 * What the form can carry, stated to the model. It is vetted mechanically
 * afterwards regardless — this only reduces the number of rejections.
 */
const CHARACTER_RULES = `
The engraver's form carries ONLY these characters:
  - the 22 Hebrew letters and the 5 final forms
  - the pointed forms בּ and תּ, and no other pointed letter
  - geresh ׳ and gershayim ״
  - a space
It has NO vowel points (niqqud), NO cantillation, NO shin/sin dot, and NONE
of the Yiddish diacritics (אַ אָ בֿ פֿ ױ ײ). Text using any of those cannot be
engraved at all.`.trim();

const PROPOSE_SYSTEM = `
You write Hebrew for Jewish monument inscriptions (matzevot). A family has
said in English what they want on a headstone. Render it into Hebrew.

${CHARACTER_RULES}

Constraints:
- Each option must fit ${BOXES_PER_LINE} characters INCLUDING spaces. Count them.
- Match the deceased's gender in every word that inflects.
- Prefer an established inscriptional phrase over a literal translation where
  one fits the sentiment — אשת חיל for "a woman of valour", for instance. A
  traditional phrase is both more recognisable on a stone and more compact.
  Name its source when you use one.
- Inscriptions are terse. Do not translate a sentence as a sentence.

Give 2-3 distinct options where the sentiment allows, plainest first.
For each: the Hebrew, an English respelling of how it is said aloud with the
stressed syllable capitalised (the family cannot read Hebrew and will check
it by ear), and what it means.

This will be carved in stone and cannot be corrected afterwards. If the
request cannot be rendered honestly within the constraints, return no options
rather than something approximate.`.trim();

const BACK_SYSTEM = `
Translate the Hebrew monument inscription text into plain English.

Say what the Hebrew actually says. Do not improve it, do not guess at intent,
and do not smooth over anything odd — if the wording is strange or the
grammar disagrees, your translation should show that. Someone who cannot read
Hebrew is relying on this to catch a mistake before it is carved.

Reply with the translation alone.`.trim();

const NAME_SYSTEM = `
Give the Hebrew spelling of a person's name for a monument inscription.

${CHARACTER_RULES}

A Hebrew name is often NOT a translation of the English one — Harry is
frequently צבי, Bessie frequently פסיא. Where an established equivalent
exists, offer it and say so. Also offer a direct transliteration when that is
plausible.

Among Soviet-immigrant families a father's name is frequently a Russian given
name written in Hebrew letters, and belongs to no traditional name list.
Transliterate such names rather than substituting a Hebrew name for them.

For each option give the Hebrew and an English respelling of how it is said,
stressed syllable capitalised. The family will confirm by sound, so the
respelling matters as much as the spelling.

Offer at most 3, most likely first.`.trim();

const CandidateSchema = z.object({
  options: z.array(
    z.object({
      hebrew: z.string(),
      pronunciation: z.string(),
      meaning: z.string(),
      tradition: z.string().nullable(),
    }),
  ),
});

const NameSchema = z.object({
  options: z.array(
    z.object({
      hebrew: z.string(),
      pronunciation: z.string(),
      note: z.string().nullable(),
    }),
  ),
});

export interface ClaudeTranslationOptions {
  client?: Anthropic;
  model?: string;
}

export class ClaudeTranslationModel implements TranslationModel {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(opts: ClaudeTranslationOptions = {}) {
    this.client = opts.client ?? new Anthropic();
    this.model = opts.model ?? MODEL;
  }

  async propose(req: TranslationRequest): Promise<RawCandidate[]> {
    const max = req.maxBoxes ?? BOXES_PER_LINE;
    const res = await this.client.messages.parse({
      model: this.model,
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      system: PROPOSE_SYSTEM,
      messages: [
        {
          role: "user",
          content:
            `The deceased is ${req.gender === "female" ? "a woman" : "a man"}.\n` +
            `The line holds ${max} characters.\n` +
            `The family asked for: ${req.english}`,
        },
      ],
      output_config: { format: zodOutputFormat(CandidateSchema) },
    });
    const parsed = res.parsed_output;
    if (!parsed) return [];
    return parsed.options.map((o) => {
      const c: RawCandidate = {
        hebrew: o.hebrew,
        pronunciation: o.pronunciation,
        meaning: o.meaning,
      };
      if (o.tradition) c.tradition = o.tradition;
      return c;
    });
  }

  /** Given the Hebrew alone. Never pass the original request in here. */
  async backTranslate(hebrew: string): Promise<string> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: 1000,
      system: BACK_SYSTEM,
      messages: [{ role: "user", content: hebrew }],
    });
    return res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
  }

  async proposeName(english: string, role: NameRole): Promise<RawName[]> {
    const res = await this.client.messages.parse({
      model: this.model,
      max_tokens: 2000,
      thinking: { type: "adaptive" },
      system: NAME_SYSTEM,
      messages: [
        {
          role: "user",
          content:
            role === "father"
              ? `The deceased's father's given name, in English: ${english}`
              : `The deceased's given name, in English: ${english}`,
        },
      ],
      output_config: { format: zodOutputFormat(NameSchema) },
    });
    const parsed = res.parsed_output;
    if (!parsed) return [];
    return parsed.options.map((o) => {
      const n: RawName = { hebrew: o.hebrew, pronunciation: o.pronunciation };
      if (o.note) n.note = o.note;
      return n;
    });
  }
}
