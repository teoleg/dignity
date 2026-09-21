/**
 * The dialogue — everything except the transport.
 *
 * No SDK import, no network: this module is what the browser bundle and the
 * server share. A driver (`conversation-claude.ts` on a server, the artifact
 * page in a browser) obtains a turn from the model and hands it to
 * `applyTurn`. See conversation-claude.ts.
 *
 * A model drives the conversation: it reads what the family wrote in plain
 * English, works out what it now knows, and asks for whatever is still
 * missing. There is no hardcoded question script and no phrase table —
 * understanding what someone meant is what a model is for.
 *
 * What the model is NOT for, and never does here:
 *
 *   - computing the Hebrew date. That is arithmetic; `hebrew-date.ts` does it
 *     from the Gregorian date and the time of death, and the model is told
 *     never to state one.
 *   - having the last word on Hebrew. Everything it proposes is encoded
 *     against the form's character table and measured against the line before
 *     it is used, and rejected if it fails.
 *   - deciding the inscription is finished. `inscription.blockers()` does.
 *
 * Model for language, code for correctness.
 */

import { z } from "zod";
import { BOXES_PER_LINE, encodeLine } from "./form-table.js";
import { hebrewDateOfDeath, type TimeOfDeath } from "./hebrew-date.js";
import {
  compose,
  capacity,
  blockers,
  type Capacity,
  type Decedent,
  type FamilyLine,
  type Gender,
  type Line,
} from "./inscription.js";

/** Everything the conversation has established so far. */
export interface Draft {
  englishGiven?: string;
  englishSurname?: string;
  englishFather?: string;
  gender?: Gender;
  hebrewGiven?: string;
  hebrewGivenSaid?: string;
  hebrewFather?: string;
  hebrewFatherSaid?: string;
  /** The family has confirmed the name sounds right. */
  nameConfirmed?: boolean;
  /** yyyy-mm-dd */
  diedOn?: string;
  timeOfDeath?: TimeOfDeath;
  extra?: FamilyLine;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface Turn {
  /** What to say to the family. */
  reply: string;
  draft: Draft;
  /** The inscription as it stands, or [] when there is not enough yet. */
  lines: Line[];
  capacity: Capacity;
  /** Everything between this and an engraver. Empty means approvable. */
  blockers: string[];
  /** Hebrew the model offered that the form cannot carry. */
  rejected: Array<{ hebrew: string; reason: string }>;
}

const HebrewProposal = z.object({
  hebrew: z.string(),
  /** English respelling, stressed syllable capitalised. */
  pronunciation: z.string(),
  /** For a name: why this spelling. For a line: what it means. */
  note: z.string().nullable(),
});

export const TurnSchema = z.object({
  reply: z.string(),
  updates: z.object({
    englishGiven: z.string().nullable(),
    englishSurname: z.string().nullable(),
    englishFather: z.string().nullable(),
    gender: z.enum(["male", "female"]).nullable(),
    diedOn: z.string().nullable(),
    timeOfDeath: z.enum(["daytime", "after-sunset", "unknown"]).nullable(),
    nameConfirmed: z.boolean().nullable(),
  }),
  hebrewGiven: HebrewProposal.nullable(),
  hebrewFather: HebrewProposal.nullable(),
  extraLine: HebrewProposal.nullable(),
});

const CHARACTERS = `
The engraver's form carries ONLY: the 22 Hebrew letters, the 5 final forms,
the pointed forms בּ and תּ, geresh ׳, gershayim ״, and a space. It has NO
vowel points, NO cantillation, NO shin/sin dot, and NONE of the Yiddish
diacritics (אַ אָ בֿ פֿ ױ ײ). Anything using those cannot be engraved at all.
Each line holds ${BOXES_PER_LINE} characters including spaces.`.trim();

export const SYSTEM = `
You are helping a bereaved family order a Jewish monument. You talk to them
in plain English; they do not read Hebrew. You write the Hebrew.

Your job each turn: read what they said, record what you now know, and ask
for the single most useful thing still missing. One question at a time. Be
warm, brief and concrete. They are grieving — do not make them work.

WHAT YOU NEED, roughly in this order:
1. Who the monument is for (their name in English).
2. Whether that person was a man or a woman. Hebrew inflects throughout, so
   almost nothing is right until you know. Ask early; never guess from a name.
3. The father's first name — a Hebrew inscription is patronymic.
4. The Hebrew spellings of both names, which you propose. A Hebrew name is
   often NOT a translation of the English: Harry is frequently צבי, Bessie
   פסיא. Among Soviet-immigrant families a father's name is frequently a
   Russian given name written in Hebrew letters and belongs to no traditional
   list — transliterate those rather than substituting. Always give a
   pronunciation: the family confirms by ear, since they cannot read it.
   Set nameConfirmed only when they have actually confirmed it.
5. The date of death, as yyyy-mm-dd in diedOn.
6. Whether the death was during the day or in the evening. The Jewish day
   begins at sunset, so an evening death is recorded on the following day.
   Explain that plainly. If nobody knows, record "unknown" — do not guess.
7. Optionally, anything the family wants to add in their own words, which you
   put into Hebrew in extraLine.

${CHARACTERS}

HARD RULES:
- NEVER state a Hebrew date, a Hebrew year, or a day-of-month in Hebrew
  letters. The system computes the date and will show it. If you write one it
  will be wrong.
- Only put Hebrew in the hebrewGiven, hebrewFather and extraLine fields.
  Never put Hebrew in your reply text.
- Set a field in updates only when you actually learned it this turn;
  otherwise null. Never invent a date or a name.
- For an added line, prefer an established inscriptional phrase over a
  literal translation where one fits — אשת חיל for "a woman of valour" — and
  say so in the note. Inscriptions are terse; do not translate a sentence as
  a sentence. It must fit ${BOXES_PER_LINE} characters.
- If you cannot render something honestly within the constraints, say so
  rather than offering something approximate. This is carved in stone.`.trim();

/**
 * Build the user turn both drivers send. Kept here so the browser and the
 * server ask the model exactly the same thing.
 */
export function describeDraft(d: Draft): string {
  const { hebrewGiven, hebrewFather, extra, ...rest } = d;
  return JSON.stringify({
    ...rest,
    hasHebrewName: Boolean(hebrewGiven),
    hasHebrewFather: Boolean(hebrewFather),
    hasExtraLine: Boolean(extra),
  });
}

export function transcript(history: readonly Message[]): string {
  return history.map((m) => `${m.role === "user" ? "Family" : "You"}: ${m.content}`).join("\n");
}

/** The prompt body: what is known, then the conversation. */
export function promptFor(draft: Draft, history: readonly Message[]): string {
  return `Known so far (JSON): ${describeDraft(draft)}\n\nConversation:\n${transcript(history)}`;
}

export type ParsedTurn = z.infer<typeof TurnSchema>;

/** What the library can work out on its own, with no model involved. */
export type Derived = Pick<Turn, "lines" | "capacity" | "blockers">;

/** Merge what the model learned, vetting every piece of Hebrew it offered. */
export function applyTurn(
  draft: Draft,
  parsed: ParsedTurn,
): Derived & { draft: Draft; rejected: Array<{ hebrew: string; reason: string }> } {
  const next: Draft = { ...draft };
  const rejected: Array<{ hebrew: string; reason: string }> = [];

  const u = parsed.updates;
  if (u.englishGiven) next.englishGiven = u.englishGiven;
  if (u.englishSurname) next.englishSurname = u.englishSurname;
  if (u.englishFather) next.englishFather = u.englishFather;
  if (u.gender) next.gender = u.gender;
  if (u.diedOn && /^\d{4}-\d{2}-\d{2}$/.test(u.diedOn)) next.diedOn = u.diedOn;
  if (u.timeOfDeath) next.timeOfDeath = u.timeOfDeath;
  if (u.nameConfirmed !== null) next.nameConfirmed = u.nameConfirmed;

  const takeName = (p: ParsedTurn["hebrewGiven"], key: "hebrewGiven" | "hebrewFather") => {
    if (!p) return;
    const bad = vet(p.hebrew);
    if (bad) {
      rejected.push({ hebrew: p.hebrew, reason: bad });
      return;
    }
    next[key] = p.hebrew;
    next[key === "hebrewGiven" ? "hebrewGivenSaid" : "hebrewFatherSaid"] = p.pronunciation;
    // A new spelling is a new thing to confirm.
    next.nameConfirmed = false;
  };
  takeName(parsed.hebrewGiven, "hebrewGiven");
  takeName(parsed.hebrewFather, "hebrewFather");

  if (parsed.extraLine) {
    const bad = vet(parsed.extraLine.hebrew);
    if (bad) rejected.push({ hebrew: parsed.extraLine.hebrew, reason: bad });
    else
      next.extra = {
        hebrew: parsed.extraLine.hebrew,
        english: parsed.extraLine.note ?? "",
        pronunciation: parsed.extraLine.pronunciation,
      };
  }

  return { draft: next, rejected, ...derive(next) };
}

function vet(hebrew: string): string | null {
  const enc = encodeLine(hebrew);
  if (!enc.ok) {
    const chars = enc.unrepresentable.map((c) => `${c.char} (${c.codepoint})`).join(", ");
    return `the order form has no character for ${chars}`;
  }
  if (enc.boxes.length > BOXES_PER_LINE) {
    return `${enc.boxes.length} characters; the line holds ${BOXES_PER_LINE}`;
  }
  return null;
}

/**
 * Compose the inscription from the draft, using the library for everything
 * that has a right answer. Returns empty lines until there is enough.
 */
export function derive(d: Draft): Derived {
  const ready =
    d.gender && d.hebrewGiven && d.hebrewFather && d.englishGiven && d.englishFather && d.diedOn;
  if (!ready) {
    return { lines: [], capacity: capacity([]), blockers: ["The inscription is not complete yet."] };
  }
  const [y, m, day] = d.diedOn!.split("-").map(Number) as [number, number, number];
  const decedent: Decedent = {
    gender: d.gender!,
    hebrewGiven: d.hebrewGiven!,
    hebrewFather: d.hebrewFather!,
    englishGiven: d.englishGiven!,
    englishFather: d.englishFather!,
    // The model never supplies this. It is computed.
    death: hebrewDateOfDeath(new Date(y, m - 1, day), d.timeOfDeath ?? "unknown"),
  };
  const lines = compose(decedent, d.extra);
  const stop = blockers(lines);
  if (!d.nameConfirmed) {
    stop.push("The Hebrew spelling of the name has not been confirmed by the family.");
  }
  return { lines, capacity: capacity(lines), blockers: stop };
}
