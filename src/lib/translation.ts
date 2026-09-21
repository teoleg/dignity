/**
 * English → Hebrew for the inscription.
 *
 * This is the riskiest thing the system does. Names and dates can be checked;
 * a translated tribute can only be handed back to a family who cannot read
 * it. So the shape here is deliberate:
 *
 *   **the model proposes, this module vets, the family decides.**
 *
 * Nothing the model returns is trusted. Every candidate is encoded against
 * the form's character table and measured against the line before it is shown
 * as usable, and anything that fails is **rejected, never repaired** — a
 * silently corrected inscription is exactly the failure this project exists
 * to prevent.
 *
 * The model is injected so the vetting can be tested without a network call,
 * and so a different model or a curated phrase book can be substituted.
 */

import {
  BOXES_PER_LINE,
  encodeLine,
  decodeLine,
  type Box,
} from "./form-table.js";
import type { Gender } from "./inscription.js";

export interface TranslationRequest {
  /** What the family said, in their own words. */
  english: string;
  gender: Gender;
  /** Defaults to one line. */
  maxBoxes?: number;
}

/** What a model hands back, before any checking. */
export interface RawCandidate {
  hebrew: string;
  /** English respelling, e.g. "EH-shet CHA-yil". The check a non-reader can do. */
  pronunciation: string;
  /** The model's own gloss of what it wrote. NOT a verification — see below. */
  meaning: string;
  /** Where an established phrase comes from, e.g. "Proverbs 31". */
  tradition?: string;
}

export interface TranslationModel {
  propose(req: TranslationRequest): Promise<RawCandidate[]>;
  /**
   * Translate Hebrew back to English.
   *
   * MUST be called without the original request in context. A gloss produced
   * by the same pass that wrote the Hebrew restates the intent rather than
   * checking it; only a reading of the Hebrew alone can disagree with what
   * was asked for.
   */
  backTranslate(hebrew: string): Promise<string>;
  /** Propose a Hebrew spelling for an English given name. */
  proposeName(english: string, role: NameRole): Promise<RawName[]>;
}

export type NameRole = "decedent" | "father";

export interface RawName {
  hebrew: string;
  pronunciation: string;
  /** Set when this is an established equivalent rather than a transliteration. */
  note?: string;
}

export interface VettedCandidate {
  hebrew: string;
  pronunciation: string;
  /** The model's forward gloss. */
  meaning: string;
  tradition?: string;
  boxes: Box[];
  /**
   * An independent reading of the Hebrew, produced without sight of the
   * request. Show this to the family — it is the check, not `meaning`.
   */
  backTranslation: string;
  /**
   * True when the back-translation shares no meaningful words with what was
   * asked for. A hint that something drifted, not a verdict: only the family
   * can say whether the Hebrew means what they wanted.
   */
  possibleDrift: boolean;
}

export interface Rejection {
  hebrew: string;
  reason: string;
}

export interface TranslationResult {
  accepted: VettedCandidate[];
  rejected: Rejection[];
}

export interface VettedName {
  hebrew: string;
  pronunciation: string;
  note?: string;
  boxes: Box[];
  /**
   * Always true. A Hebrew name is frequently not a translation of the English
   * one, and a patronymic may be a non-Hebrew name in Hebrew letters, so no
   * proposal is ever self-verifying. The family confirms by sound.
   */
  needsConfirmation: true;
}

export interface NameResult {
  accepted: VettedName[];
  rejected: Rejection[];
}

/** Check a single Hebrew string against the form. */
function vetHebrew(hebrew: string, maxBoxes: number): { boxes: Box[] } | { reason: string } {
  const enc = encodeLine(hebrew);
  if (!enc.ok) {
    const chars = enc.unrepresentable.map((u) => `${u.char} (${u.codepoint})`).join(", ");
    return { reason: `the order form has no character for ${chars}` };
  }
  if (enc.boxes.length > maxBoxes) {
    return { reason: `${enc.boxes.length} characters; the line holds ${maxBoxes}` };
  }
  if (decodeLine(enc.boxes) !== hebrew.normalize("NFC")) {
    // Should be unreachable; a mismatch would mean the table is not bijective.
    return { reason: "does not survive a round trip through the form's codes" };
  }
  return { boxes: enc.boxes };
}

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "of", "to", "in", "on", "for", "our", "my",
  "his", "her", "their", "is", "was", "who", "that", "with", "be", "been",
  "she", "he", "we", "us", "him", "them", "it", "its",
]);

function contentWords(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z\s'-]/g, " ")
      .split(/\s+/)
      .map((w) => w.replace(/(?:'s|s)$/, ""))
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

/**
 * Do the request and the independent back-translation share any substance?
 *
 * Crude on purpose. It catches a translation that came back about something
 * else entirely; it cannot judge nuance, and must never be presented as if it
 * could. The family reads both and decides.
 */
export function looksDivergent(request: string, backTranslation: string): boolean {
  const a = contentWords(request);
  const b = contentWords(backTranslation);
  if (a.size === 0 || b.size === 0) return false;
  for (const w of a) if (b.has(w)) return false;
  return true;
}

/**
 * Translate a line the family asked for, and verify it.
 *
 * Candidates the form cannot carry are rejected with a reason the family can
 * act on. Survivors are round-tripped through an independent back-translation
 * so the family sees what the Hebrew actually says, not what we meant it to.
 */
export async function translateLine(
  model: TranslationModel,
  req: TranslationRequest,
): Promise<TranslationResult> {
  const maxBoxes = req.maxBoxes ?? BOXES_PER_LINE;
  const raw = await model.propose(req);

  const accepted: VettedCandidate[] = [];
  const rejected: Rejection[] = [];

  for (const c of raw) {
    const vet = vetHebrew(c.hebrew, maxBoxes);
    if ("reason" in vet) {
      rejected.push({ hebrew: c.hebrew, reason: vet.reason });
      continue;
    }
    const back = await model.backTranslate(c.hebrew);
    const v: VettedCandidate = {
      hebrew: c.hebrew,
      pronunciation: c.pronunciation,
      meaning: c.meaning,
      boxes: vet.boxes,
      backTranslation: back,
      possibleDrift: looksDivergent(req.english, back),
    };
    if (c.tradition !== undefined) v.tradition = c.tradition;
    accepted.push(v);
  }

  return { accepted, rejected };
}

/**
 * Propose Hebrew spellings for a name.
 *
 * No back-translation: a name does not have a meaning that can be checked
 * that way. The verification is the pronunciation, said aloud by someone who
 * heard the name used. Every proposal is marked as needing confirmation,
 * because none of them is self-verifying.
 */
export async function translateName(
  model: TranslationModel,
  english: string,
  role: NameRole,
): Promise<NameResult> {
  const raw = await model.proposeName(english, role);
  const accepted: VettedName[] = [];
  const rejected: Rejection[] = [];

  for (const n of raw) {
    const vet = vetHebrew(n.hebrew, BOXES_PER_LINE);
    if ("reason" in vet) {
      rejected.push({ hebrew: n.hebrew, reason: vet.reason });
      continue;
    }
    const v: VettedName = {
      hebrew: n.hebrew,
      pronunciation: n.pronunciation,
      boxes: vet.boxes,
      needsConfirmation: true,
    };
    if (n.note !== undefined) v.note = n.note;
    accepted.push(v);
  }

  return { accepted, rejected };
}
