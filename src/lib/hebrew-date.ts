/**
 * Gregorian date of death → the Hebrew date that goes on the stone.
 *
 * The calendar itself is `@hebcal/core`. Nothing here reimplements it. What
 * this module owns is the part hebcal cannot know: the sunset rule, and what
 * to do when nobody can tell us the time of death.
 *
 * See docs/domain/hebrew-inscriptions.md § 2.
 */

import { HDate } from "@hebcal/core";
import { stripPointing } from "./hebrew-text.js";

/**
 * When the death occurred relative to sunset.
 *
 * `unknown` is a first-class value, not a missing one. The Hebrew day begins
 * at sunset, so an evening death falls on the next Hebrew day; without the
 * time the date is genuinely ambiguous and the system must say so rather than
 * assume daytime. This is the most common real-world case.
 */
export type TimeOfDeath = "daytime" | "after-sunset" | "unknown";

export interface HebrewDate {
  day: number;
  /** Unpointed: `שבט`, never `שְׁבָט`. */
  monthHebrew: string;
  monthEnglish: string;
  year: number;
  /** Ready for the stone: `ט״ו שבט תשפ״ד`. */
  text: string;
  /** For the family: `15 Shevat 5784`. */
  english: string;
}

export type DateOfDeath =
  | { status: "resolved"; hebrew: HebrewDate }
  /**
   * Time of death unknown. Both candidates are returned; the caller must
   * block on this rather than pick one. Consuming code that treats
   * `ambiguous` as "use the first" has reintroduced the bug.
   */
  | { status: "ambiguous"; ifDaytime: HebrewDate; ifAfterSunset: HebrewDate }
  /**
   * The hour could not be found, and a date is being used anyway.
   *
   * Never the same as `resolved`: nobody learned the hour. `by` says who
   * settled it — the family pressing a button, or the default, which follows
   * the civil date as given (ADR 0008). Either way the date that was *not*
   * used is carried along, so the state is visible everywhere the
   * inscription is read back and can be swapped in one tap.
   */
  | { status: "chosen"; hebrew: HebrewDate; instead: HebrewDate; by: "family" | "as-given" };

function render(h: HDate): HebrewDate {
  // renderGematriya() returns the month pointed — `שְׁבָט`, `כִּסְלֵו`. The form has no
  // code for niqqud, so strip it here rather than let the encoder reject a
  // string the family never typed. See hebrew-text.stripPointing — the
  // dagesh goes too, or Kislev cannot be engraved and Tishrei is engraved
  // with the wrong character.
  const text = stripPointing(h.renderGematriya());
  return {
    day: h.getDate(),
    monthHebrew: stripPointing(h.render("he").split(" ")[1]?.replace(/,$/, "") ?? ""),
    monthEnglish: h.getMonthName(),
    year: h.getFullYear(),
    text,
    english: `${h.getDate()} ${h.getMonthName()} ${h.getFullYear()}`,
  };
}

/** The Hebrew date for a civil date, before any sunset adjustment. */
function onCivilDay(d: Date): HDate {
  return new HDate(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
}

/**
 * Resolve the Hebrew date of death.
 *
 * A death after sunset belongs to the following Hebrew day. When the time is
 * unknown this returns both candidates and resolves nothing — deliberately.
 */
export function hebrewDateOfDeath(civil: Date, when: TimeOfDeath): DateOfDeath {
  const sameDay = onCivilDay(civil);
  const nextDay = sameDay.next();

  switch (when) {
    case "daytime":
      return { status: "resolved", hebrew: render(sameDay) };
    case "after-sunset":
      return { status: "resolved", hebrew: render(nextDay) };
    case "unknown":
      return {
        status: "ambiguous",
        ifDaytime: render(sameDay),
        ifAfterSunset: render(nextDay),
      };
  }
}

/**
 * Settle an unknown hour — by the family's decision, or by the default.
 *
 * Only an ambiguous date can be settled this way, and the caller must name
 * which date and who is naming it. Nothing here guesses; `derive` applies the
 * default and says in the inscription that it did (ADR 0008).
 */
export function chooseWhenUnknown(
  d: DateOfDeath,
  which: "daytime" | "after-sunset",
  by: "family" | "as-given" = "family",
): DateOfDeath {
  if (d.status !== "ambiguous") return d;
  return which === "daytime"
    ? { status: "chosen", hebrew: d.ifDaytime, instead: d.ifAfterSunset, by }
    : { status: "chosen", hebrew: d.ifAfterSunset, instead: d.ifDaytime, by };
}

/**
 * True when the two candidates differ — which is always, since they are
 * consecutive days. Kept explicit so the UI reads as intent rather than
 * relying on a fact about the calendar.
 */
export function isBlocking(d: DateOfDeath): boolean {
  return d.status === "ambiguous";
}
