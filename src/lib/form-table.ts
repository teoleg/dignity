/**
 * The Eagle Granite "Hebrew Characters" form: character ⇄ code.
 *
 * Transcribed from the vendor's sheet — see docs/domain/eagle-granite-form.md
 * § 2. This is a glyph index into their engraving font, NOT gematria: code 1
 * is תּ, not א. Never extend it by inference. If a character is absent, the
 * form cannot express it, and that is a fact to surface rather than a gap to
 * fill.
 */

import { canonical, DAGESH } from "./hebrew-text.js";

export const GERESH = "׳";
export const GERSHAYIM = "״";

/** Boxes per line, and lines per form. Measured; see § 3. */
export const BOXES_PER_LINE = 28;
export const LINES_PER_FORM = 5;

const CHAR_TO_CODE: ReadonlyMap<string, number> = new Map([
  [`ת${DAGESH}`, 1], // תּ — tav with dagesh
  [`ב${DAGESH}`, 2], // בּ — bet with dagesh
  ["א", 3], ["ב", 4], ["ג", 5], ["ד", 6], ["ה", 7], ["ו", 8], ["ז", 9],
  ["ח", 10], ["ט", 11], ["י", 12], ["כ", 13], ["ך", 14], ["ל", 15],
  ["מ", 16], ["ם", 17], ["נ", 18], ["ן", 19], ["ס", 20], ["ע", 21],
  ["פ", 22], ["ף", 23], ["צ", 24], ["ץ", 25], ["ק", 26], ["ר", 27],
  ["ש", 28], ["ת", 29],
  [GERESH, 30],
  [GERSHAYIM, 31],
]);

const CODE_TO_CHAR: ReadonlyMap<number, string> = new Map(
  [...CHAR_TO_CODE].map(([ch, code]) => [code, ch]),
);

/** A space has no code. It is an empty box — confirmed. */
export type Box = number | null;

export type EncodeResult =
  | { ok: true; boxes: Box[] }
  | { ok: false; unrepresentable: UnrepresentableChar[] };

export interface UnrepresentableChar {
  char: string;
  /** Index into the canonicalised input. */
  at: number;
  /** "U+05B7" — useful in a bug report, and in telling a family what failed. */
  codepoint: string;
}

/**
 * Hebrew → box codes, in logical order (first character first).
 *
 * The caller decides where the boxes land: the form is filled right to left,
 * so box index `BOXES_PER_LINE - 1 - i` holds `boxes[i]`. Keeping that
 * transform out of here means the encoder has no opinion about direction and
 * cannot silently reverse anything.
 *
 * Returns every unrepresentable character rather than throwing on the first,
 * so the family can be told about all of them at once.
 */
export function encodeLine(input: string): EncodeResult {
  const s = canonical(input);
  const boxes: Box[] = [];
  const bad: UnrepresentableChar[] = [];

  let i = 0;
  while (i < s.length) {
    // A dagesh pair is two codepoints that map to one code — check it first,
    // or the base letter matches alone and the dagesh is reported as junk.
    const pair = s.slice(i, i + 2);
    if (pair.length === 2 && pair[1] === DAGESH) {
      const code = CHAR_TO_CODE.get(pair);
      if (code !== undefined) {
        boxes.push(code);
        i += 2;
        continue;
      }
      // A dagesh on a letter the form has no pointed form for (e.g. פּ).
      bad.push(describe(pair, i));
      i += 2;
      continue;
    }

    const ch = s[i] as string;
    if (ch === " ") {
      boxes.push(null);
    } else {
      const code = CHAR_TO_CODE.get(ch);
      if (code === undefined) bad.push(describe(ch, i));
      else boxes.push(code);
    }
    i += 1;
  }

  return bad.length > 0 ? { ok: false, unrepresentable: bad } : { ok: true, boxes };
}

function describe(char: string, at: number): UnrepresentableChar {
  const cp = [...char]
    .map((c) => `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`)
    .join(" ");
  return { char, at, codepoint: cp };
}

/**
 * Box codes → Hebrew.
 *
 * Not a test helper. `פ״נ` ("here lies buried") and `נ״פ` ("died") are the
 * same two characters reversed and both are correct, so a transposition
 * produces valid Hebrew that no check on the text can catch. Rendering the
 * boxes back and showing them is the only way a person sees it — which is why
 * this belongs in the UI, not just the test suite. See § 4.2.
 */
export function decodeLine(boxes: readonly Box[]): string {
  return boxes
    .map((b) => {
      if (b === null) return " ";
      const ch = CODE_TO_CHAR.get(b);
      if (ch === undefined) throw new RangeError(`no character for box code ${b}`);
      return ch;
    })
    .join("");
}

/** Does this line fit on the form? */
export function fits(boxes: readonly Box[]): boolean {
  return boxes.length <= BOXES_PER_LINE;
}

/**
 * Lay boxes out as the form is actually filled: right to left, left-padded
 * with empties. Index 0 of the result is the leftmost printed box.
 */
export function layOutRightToLeft(boxes: readonly Box[]): Box[] {
  if (boxes.length > BOXES_PER_LINE) {
    throw new RangeError(`${boxes.length} boxes will not fit in ${BOXES_PER_LINE}`);
  }
  const row: Box[] = new Array(BOXES_PER_LINE).fill(null);
  boxes.forEach((b, i) => {
    row[BOXES_PER_LINE - 1 - i] = b;
  });
  return row;
}
