import { describe, it, expect } from "vitest";
import {
  encodeLine,
  decodeLine,
  layOutRightToLeft,
  fits,
  BOXES_PER_LINE,
  GERESH,
  GERSHAYIM,
} from "../form-table.js";
import { DAGESH } from "../hebrew-text.js";

const boxesOf = (s: string) => {
  const r = encodeLine(s);
  if (!r.ok) throw new Error(`unexpected refusal: ${JSON.stringify(r.unrepresentable)}`);
  return r.boxes;
};

describe("the table is a glyph index, not gematria", () => {
  it("starts at tav-with-dagesh, not alef", () => {
    expect(boxesOf(`ת${DAGESH}`)).toEqual([1]);
    expect(boxesOf("א")).toEqual([3]);
  });

  it("distinguishes the pointed and unpointed forms of bet and tav", () => {
    expect(boxesOf(`ב${DAGESH}`)).toEqual([2]); // בּ
    expect(boxesOf("ב")).toEqual([4]); // ב
    expect(boxesOf(`ת${DAGESH}`)).toEqual([1]); // תּ
    expect(boxesOf("ת")).toEqual([29]); // ת
  });

  it("treats a dagesh pair as one box, not two", () => {
    // A per-codepoint loop emits a code for ב then chokes on the dagesh.
    expect(boxesOf(`ב${DAGESH}ן`)).toEqual([2, 19]);
  });

  it("gives sofit forms their own codes", () => {
    expect(boxesOf("כךמםנןפףצץ")).toEqual([13, 14, 16, 17, 18, 19, 22, 23, 24, 25]);
  });

  it("codes geresh and gershayim", () => {
    expect(boxesOf(GERESH)).toEqual([30]);
    expect(boxesOf(GERSHAYIM)).toEqual([31]);
  });
});

describe("spaces", () => {
  it("are empty boxes, not a code", () => {
    expect(boxesOf("א ב")).toEqual([3, null, 4]);
  });
});

describe("characters the form cannot express", () => {
  it("refuses niqqud rather than dropping it", () => {
    const r = encodeLine("שׁלום"); // shin with a sin/shin dot
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.unrepresentable[0]?.codepoint).toBe("U+05C1");
  });

  it("refuses Yiddish diacritics", () => {
    const r = encodeLine("אַ"); // pasekh alef
    expect(r.ok).toBe(false);
  });

  it("refuses a dagesh on a letter with no pointed form on the sheet", () => {
    const r = encodeLine(`פ${DAGESH}`); // פּ — bet and tav only
    expect(r.ok).toBe(false);
  });

  it("reports every bad character, not just the first", () => {
    const r = encodeLine("אַבּ---"); // two unrepresentable, plus a valid pair
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.unrepresentable.length).toBeGreaterThan(1);
  });

  it("refuses Latin text", () => {
    expect(encodeLine("Sarah").ok).toBe(false);
  });
});

describe("round trip", () => {
  const corpus = [
    "פ״נ",
    "נ״פ",
    "שרה בת אברהם",
    "נ״פ ט״ו שבט תשפ״ד",
    "תנצב״ה",
    "ת׳נ׳צ׳ב׳ה׳",
    "אשת חיל ואם יקרה",
    `ב${DAGESH}ת${DAGESH}`,
    "ךםןףץ",
  ];

  it.each(corpus)("decode(encode(%s)) is the identity", (s) => {
    expect(decodeLine(boxesOf(s))).toBe(s);
  });
});

describe("right-to-left layout", () => {
  it("puts the first character in the rightmost box", () => {
    const row = layOutRightToLeft(boxesOf("פ״נ")); // 22 31 18
    expect(row[BOXES_PER_LINE - 1]).toBe(22); // פ, rightmost
    expect(row[BOXES_PER_LINE - 2]).toBe(31); // ״
    expect(row[BOXES_PER_LINE - 3]).toBe(18); // נ
    expect(row[0]).toBeNull();
  });

  it("reading the row back right-to-left reproduces the text", () => {
    // Read the printed row from its rightmost box leftwards — the order a
    // person fills it in — and the original text comes back.
    const text = "שרה בת אברהם";
    const row = layOutRightToLeft(boxesOf(text));
    const asRead = [...row].reverse().slice(0, boxesOf(text).length);
    expect(decodeLine(asRead)).toBe(text);
  });

  it("refuses to lay out a line that does not fit", () => {
    const tooLong = boxesOf("א".repeat(BOXES_PER_LINE + 1));
    expect(fits(tooLong)).toBe(false);
    expect(() => layOutRightToLeft(tooLong)).toThrow(RangeError);
  });
});

describe("a transposition is not detectable from the text", () => {
  it("po nikbar and niftar are the same boxes reversed, and both decode", () => {
    // This is why the decoded Hebrew must be shown to a person: neither
    // string is invalid, so no check on the text can tell them apart.
    const opening = boxesOf("פ״נ");
    const died = boxesOf("נ״פ");
    expect([...opening].reverse()).toEqual(died);
    expect(decodeLine(died)).toBe("נ״פ");
  });
});
