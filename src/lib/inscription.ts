/**
 * Composing the inscription.
 *
 * The four standard lines are generated from the record. A fifth line, if the
 * family wants one, is their own words translated into Hebrew — that does not
 * happen here; this module only places and validates it.
 *
 * See docs/domain/eagle-granite-form.md § 4 and docs/decisions/0005.
 */

import {
  BOXES_PER_LINE,
  LINES_PER_FORM,
  encodeLine,
  fits,
  type Box,
  type EncodeResult,
} from "./form-table.js";
import { canonical } from "./hebrew-text.js";
import type { DateOfDeath } from "./hebrew-date.js";

/**
 * One field, read by every gendered string in the inscription. There is
 * deliberately no per-line gender anywhere — that is how inscriptions end up
 * disagreeing with themselves.
 */
export type Gender = "male" | "female";

/** Both forms are correct; the family chooses. See § 4.1. */
export type ClosingStyle = "classical" | "spaced";

export interface Decedent {
  gender: Gender;
  /** Canonical Hebrew, already confirmed with the family. */
  hebrewGiven: string;
  /** The father's Hebrew given name — the inscription is patronymic. */
  hebrewFather: string;
  /** English, for the back-translation shown to the family. */
  englishGiven: string;
  englishFather: string;
  death: DateOfDeath;
  closing?: ClosingStyle;
}

/** A line the family wrote, already rendered into Hebrew. */
export interface FamilyLine {
  hebrew: string;
  /** What it says back in English. The family checks this, not the Hebrew. */
  english: string;
  /** How to say it aloud — the verification a non-reader can actually do. */
  pronunciation: string;
}

export type LineSource = "standard" | "family";

export interface Line {
  hebrew: string;
  english: string;
  source: LineSource;
  /** Absent where it would be noise, e.g. on `פ״נ`. */
  pronunciation?: string;
  /** Set when this line is not yet safe to engrave. */
  blocked?: string;
  boxes: Box[];
  /** True when the line is longer than the form allows. */
  overflows: boolean;
}

export const OPENING = "פ״נ";
export const DIED = "נ״פ";
const CLOSING_CLASSICAL = "תנצב״ה";
const CLOSING_SPACED = "ת׳נ׳צ׳ב׳ה׳";

/**
 * Build the inscription.
 *
 * Every line is encoded here so that capacity and representability are
 * settled at composition time rather than discovered at render time.
 */
export function compose(d: Decedent, extra?: FamilyLine): Line[] {
  const lines: Line[] = [];
  const bat = d.gender === "female";

  lines.push(
    line(OPENING, "Here lies buried", "standard"),
  );

  lines.push(
    line(
      `${canonical(d.hebrewGiven)} ${bat ? "בת" : "בן"} ${canonical(d.hebrewFather)}`,
      `${d.englishGiven}, ${bat ? "daughter" : "son"} of ${d.englishFather}`,
      "standard",
    ),
  );

  lines.push(dateLine(d.death));

  if (extra) {
    lines.push({
      ...line(extra.hebrew, extra.english, "family"),
      pronunciation: extra.pronunciation,
    });
  }

  lines.push(
    line(
      d.closing === "spaced" ? CLOSING_SPACED : CLOSING_CLASSICAL,
      `May ${bat ? "her" : "his"} soul be bound up in the bond of life`,
      "standard",
    ),
  );

  return lines;
}

function dateLine(death: DateOfDeath): Line {
  if (death.status === "resolved") {
    return line(`${DIED} ${death.hebrew.text}`, `Died ${death.hebrew.english}`, "standard");
  }
  // Show one candidate so the stone renders, but mark it unsafe. The caller
  // must not approve while `blocked` is set.
  const l = line(
    `${DIED} ${death.ifDaytime.text}`,
    `Died ${death.ifDaytime.english}`,
    "standard",
  );
  l.blocked =
    `Time of death unknown. If after sunset the Hebrew date is ` +
    `${death.ifAfterSunset.english}, not ${death.ifDaytime.english}.`;
  return l;
}

function line(hebrew: string, english: string, source: LineSource): Line {
  const enc: EncodeResult = encodeLine(hebrew);
  const boxes = enc.ok ? enc.boxes : [];
  const l: Line = { hebrew, english, source, boxes, overflows: !enc.ok ? false : !fits(boxes) };
  if (!enc.ok) {
    const chars = enc.unrepresentable.map((u) => `${u.char} (${u.codepoint})`).join(", ");
    l.blocked = `The order form has no character for: ${chars}.`;
  } else if (l.overflows) {
    l.blocked = `This line is ${boxes.length} characters; the form holds ${BOXES_PER_LINE}.`;
  }
  return l;
}

export interface Capacity {
  linesUsed: number;
  linesFree: number;
  /** Characters still available — free lines only; boxes do not spill. */
  charactersFree: number;
}

/**
 * Remaining room. Spare boxes on a short line are NOT available: each line is
 * its own row on the form and text cannot flow between rows.
 */
export function capacity(lines: readonly Line[]): Capacity {
  const used = lines.length;
  const free = Math.max(0, LINES_PER_FORM - used);
  return { linesUsed: used, linesFree: free, charactersFree: free * BOXES_PER_LINE };
}

/** Everything standing between this inscription and an engraver. */
export function blockers(lines: readonly Line[]): string[] {
  const out = lines.flatMap((l) => (l.blocked ? [l.blocked] : []));
  if (lines.length > LINES_PER_FORM) {
    out.push(`${lines.length} lines; the form holds ${LINES_PER_FORM}.`);
  }
  return out;
}

export const isApprovable = (lines: readonly Line[]): boolean => blockers(lines).length === 0;
