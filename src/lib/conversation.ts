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
import { canonical } from "./hebrew-text.js";
import { BOXES_PER_LINE, encodeLine } from "./form-table.js";
import { chooseWhenUnknown, hebrewDateOfDeath, type TimeOfDeath } from "./hebrew-date.js";
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
  /**
   * The exact spelling they confirmed, as `confirmedKey` renders it.
   *
   * Without this, a confirmation is a bare boolean that anything can clear
   * and nothing can restore: the model re-states the same name on a later
   * turn, the flag drops, and the family is asked to approve a spelling they
   * already approved — over and over. With it, only a *changed* spelling
   * un-confirms, which is the thing that genuinely needs re-checking.
   */
  nameConfirmedFor?: string;
  /** yyyy-mm-dd */
  diedOn?: string;
  timeOfDeath?: TimeOfDeath;
  /**
   * Which of the two dates to engrave when the hour cannot be found.
   *
   * Set only by the family pressing a button that names the date, never by
   * the model and never by a default. Meaningless unless `timeOfDeath` is
   * "unknown"; the inscription records that it was a choice.
   */
  dateWhenUnknown?: "daytime" | "after-sunset";
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
You are helping a bereaved family order a Jewish monument. They do not read
Hebrew. You write the Hebrew.

WHAT LANGUAGE TO SPEAK: whichever one they write in, and change if they
change. Many families in this community are immigrants and say this more
easily in Russian, Spanish, Yiddish or Hebrew than in English; some switch
mid-sentence. Never ask them to translate anything for you, and never answer
in a language they have not used. Two things stay as they are whatever the
conversation language: the pronunciation field is always a Latin-letter
respelling so it can be read aloud, and a name is spelled in Hebrew from how
the family says it, not from an English version of it.

Your job each turn: read what they said, record what you now know, and ask
for the single most useful thing still missing. One question at a time. Be
warm, brief and concrete. They are grieving — do not make them work.

Families say it differently. Some answer one question at a time; some write
everything in a single message, in any order, in any language, with their own
words for the added line. Take whatever a message contains, all of it at once — record
every fact in it and propose the Hebrew you can — and then ask only for what
is genuinely still missing. Never re-ask for something already recorded.

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
   For an old death there may be nobody left to ask. The page then offers the
   family the two possible dates and they choose one; that is their decision
   and never yours. Do not suggest which, and never write either in Hebrew.
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
  rather than offering something approximate. This is carved in stone.
- You cannot send, submit, order, file or deliver anything, and you are not
  in contact with the cemetery or the engraver. The family saves the filled
  form and hands it in themselves. NEVER say you are sending it, passing it
  along, or that it is on its way — a family will believe the order has been
  placed when nothing has happened.
- You do not decide when the order is finished. The prompt tells you what is
  still open. While anything is open, do not say it is complete, ready or all
  set; say what is still needed.`.trim();

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

/**
 * How much of the conversation the model is shown, and how long one message
 * may be.
 *
 * The whole transcript is re-sent every turn, so without a bound the cost of
 * a turn grows with the length of the conversation — and a single pasted wall
 * of text is charged again on every turn after it. These are the numbers that
 * decide the bill.
 *
 * Trimming is safe because the transcript is not where the facts live:
 * `describeDraft` carries every established fact in the JSON above it, and
 * `derive` — not the model — decides what is still open. The recent turns are
 * there for tone and for what the family just said.
 */
export const CONTEXT = { recentTurns: 24, perMessage: 2000 } as const;

export function transcript(history: readonly Message[]): string {
  const recent = history.slice(-CONTEXT.recentTurns);
  const dropped = history.length - recent.length;
  const lines = recent.map((m) => {
    const who = m.role === "user" ? "Family" : "You";
    const said = typeof m.content === "string" ? m.content : "";
    // A long message is clipped rather than dropped: the family said it, so
    // the beginning of it matters, but it must not be paid for indefinitely.
    const text =
      said.length > CONTEXT.perMessage ? `${said.slice(0, CONTEXT.perMessage)}…` : said;
    return `${who}: ${text}`;
  });
  return dropped > 0
    ? [
        `[${dropped} earlier turn${dropped === 1 ? "" : "s"} omitted — everything` +
          ` established is in the JSON above]`,
        ...lines,
      ].join("\n")
    : lines.join("\n");
}

/**
 * The prompt body: what is known, what is still open, then the conversation.
 *
 * The open list comes from `derive`, not from the model. Without it a model
 * that believes it has everything announces the order is finished while the
 * form is still blocked — which a grieving family reads as "it is done".
 */
export function promptFor(draft: Draft, history: readonly Message[]): string {
  const open = derive(draft).blockers;
  const stillOpen = open.length > 0 ? open.join(" ") : "nothing — the form can be filled now";
  return [
    `Known so far (JSON): ${describeDraft(draft)}`,
    `Still open, decided by the system and not by you: ${stillOpen}`,
    `Conversation:\n${transcript(history)}`,
  ].join("\n\n");
}

export type ParsedTurn = z.infer<typeof TurnSchema>;

/**
 * The two dates an unknown hour leaves open, in English, for a page that has
 * to put them on buttons. Null unless the date is genuinely ambiguous.
 */
export function candidateDates(d: Draft): { daytime: string; afterSunset: string } | null {
  if (!d.diedOn || d.timeOfDeath !== "unknown") return null;
  const [y, m, day] = d.diedOn.split("-").map(Number) as [number, number, number];
  const both = hebrewDateOfDeath(new Date(y, m - 1, day), "unknown");
  return both.status === "ambiguous"
    ? { daytime: both.ifDaytime.english, afterSunset: both.ifAfterSunset.english }
    : null;
}

/** What the library can work out on its own, with no model involved. */
export type Derived = Pick<Turn, "lines" | "capacity" | "blockers">;

/** Hebrew letters, including the presentation forms Unicode keeps apart. */
const HEB = "\\u0590-\\u05FF\\uFB1D-\\uFB4F";
/** Punctuation that may sit *between* Hebrew words. No Latin letter can, so
 *  a run cannot swallow English prose. */
const BETWEEN = "\\s'\"\u201C\u201D\u2018\u2019(),.;:\\-\u2013\u2014";
const RUN = `[${HEB}](?:[${HEB}${BETWEEN}]*[${HEB}])?`;
const OPEN = `[([{"'\u201C\u2018]`;
const CLOSE = `[)\\]}"'\u201D\u2019]`;

/**
 * Take the Hebrew out of the model's prose. Not a request — a guarantee.
 *
 * The model is told to keep Hebrew out of its reply and to put it only in the
 * proposal fields, and it does not always obey. Loose Hebrew in the chat is
 * unreadable to the family (ADR 0005: never Hebrew without how it sounds and
 * what it means) and, if it is a date, wrong — the model never computes one.
 * Every piece of Hebrew that matters travels in `hebrewGiven`,
 * `hebrewFather` and `extraLine`, is vetted against the form's table, and is
 * shown with its pronunciation. So the prose loses nothing by being cleared
 * of it, and nothing unvetted can reach the family's eyes.
 */
export function withoutHebrew(reply: string): string {
  const cleaned = reply
    // An aside holding nothing but Hebrew — "Dina bat Chaim (דינה בת חיים)".
    // The sentence around it was written to read without the aside.
    .replace(new RegExp(`${OPEN}\\s*${RUN}\\s*${CLOSE}`, "g"), "")
    // Hebrew whose English gloss follows it — "reads תודה על הכל (thank
    // you...)". The gloss carries the meaning, so the Hebrew just goes.
    .replace(new RegExp(`${RUN}\\s*(?=${OPEN})`, "g"), "")
    // Anything left stands in the sentence itself, where deleting it would
    // leave a hole. Name it instead.
    .replace(new RegExp(RUN, "g"), "the Hebrew")
    .replace(/(?:the Hebrew)(?: the Hebrew)+/g, "the Hebrew")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([([{])\s+/g, "$1")
    .trim();
  // A reply that was nothing but Hebrew must still say something.
  const empty = cleaned.length === 0 || /^(?:the Hebrew[\s.,;:!?]*)+$/.test(cleaned);
  return empty ? "Here is the Hebrew, with how it sounds and what it means." : cleaned;
}

/**
 * What a confirmation is *of*: both Hebrew names together, canonicalised.
 *
 * Both, because the family confirms the whole line they were read — "Avatar
 * son of Moishe" — not one name. Canonical, so the same letters spelled with
 * a different Unicode normalisation do not read as a different name.
 */
export function confirmedKey(d: Draft): string {
  return `${canonical(d.hebrewGiven ?? "")}|${canonical(d.hebrewFather ?? "")}`;
}

/** Record the family's confirmation of the spelling now in the draft. */
export function confirmName(d: Draft): Draft {
  return { ...d, nameConfirmed: true, nameConfirmedFor: confirmedKey(d) };
}

/** Merge what the model learned, vetting every piece of Hebrew it offered. */
export function applyTurn(
  draft: Draft,
  parsed: ParsedTurn,
): Derived & { reply: string; draft: Draft; rejected: Array<{ hebrew: string; reason: string }> } {
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
    const changed = canonical(p.hebrew) !== canonical(next[key] ?? "");
    next[key] = p.hebrew;
    next[key === "hebrewGiven" ? "hebrewGivenSaid" : "hebrewFatherSaid"] = p.pronunciation;
    // Only a *different* spelling is a new thing to confirm. Re-stating the
    // same one — which a model does readily — must not undo the family's
    // answer, or they are asked to approve it again on every turn.
    if (changed) {
      next.nameConfirmed = false;
      delete next.nameConfirmedFor;
    }
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

  // The reply is cleaned here, in the one place every driver goes through,
  // so no transport can carry raw Hebrew prose to the family.
  // A confirmation — from the family's button, or the model reporting what
  // they typed — is stamped with the spelling it applies to.
  if (next.nameConfirmed && next.nameConfirmedFor !== confirmedKey(next)) {
    next.nameConfirmedFor = confirmedKey(next);
  }
  return { reply: withoutHebrew(parsed.reply), draft: next, rejected, ...derive(next) };
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
  // Only what the *Hebrew* needs. The English names are the family-facing
  // gloss — they are never engraved — so a missing one must not block the
  // form. It used to, and an order could stall with every question answered
  // and nothing on screen saying why.
  const missing = [
    !d.hebrewGiven &&
      (d.englishGiven
        ? `the Hebrew spelling of ${d.englishGiven}`
        : "the name of the person who died"),
    !d.gender && "whether that person was a man or a woman",
    !d.hebrewFather &&
      (d.englishFather
        ? `the Hebrew spelling of the father's name, ${d.englishFather}`
        : "the father's first name"),
    !d.diedOn && "the date of death",
  ].filter((x): x is string => typeof x === "string");
  if (missing.length > 0) {
    return { lines: [], capacity: capacity([]), blockers: [`Still needed: ${missing.join(", ")}.`] };
  }
  const [y, m, day] = d.diedOn!.split("-").map(Number) as [number, number, number];
  let death = hebrewDateOfDeath(new Date(y, m - 1, day), d.timeOfDeath ?? "unknown");
  // An hour nobody can find follows the date as given, and the inscription
  // says so (ADR 0008). The family's own choice outranks that default.
  if (death.status === "ambiguous") {
    death = d.dateWhenUnknown
      ? chooseWhenUnknown(death, d.dateWhenUnknown, "family")
      : chooseWhenUnknown(death, "daytime", "as-given");
  }
  const decedent: Decedent = {
    gender: d.gender!,
    hebrewGiven: d.hebrewGiven!,
    hebrewFather: d.hebrewFather!,
    // How the family knows the name: their own English if we have it, else
    // how the Hebrew sounds. Never blank, never invented.
    englishGiven: d.englishGiven ?? d.hebrewGivenSaid ?? d.hebrewGiven!,
    englishFather: d.englishFather ?? d.hebrewFatherSaid ?? d.hebrewFather!,
    // The model never supplies this. It is computed.
    death,
  };
  const lines = compose(decedent, d.extra);
  const stop = blockers(lines);
  // A stale confirmation is no confirmation: if the spelling has changed
  // since, it needs checking again.
  if (!d.nameConfirmed || d.nameConfirmedFor !== confirmedKey(d)) {
    stop.push("The Hebrew spelling of the name has not been confirmed by the family.");
  }
  return { lines, capacity: capacity(lines), blockers: stop };
}
