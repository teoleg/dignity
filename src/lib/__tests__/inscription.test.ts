import { describe, it, expect } from "vitest";
import {
  compose,
  capacity,
  blockers,
  isApprovable,
  type Decedent,
  type FamilyLine,
} from "../inscription.js";
import { hebrewDateOfDeath } from "../hebrew-date.js";
import { decodeLine, LINES_PER_FORM, BOXES_PER_LINE } from "../form-table.js";

/** Synthetic. Invented names, house example date. Never a real order. */
const JAN_25 = new Date(2024, 0, 25);

const sarah = (over: Partial<Decedent> = {}): Decedent => ({
  gender: "female",
  hebrewGiven: "שרה",
  hebrewFather: "אברהם",
  englishGiven: "Sarah",
  englishFather: "Abraham",
  death: hebrewDateOfDeath(JAN_25, "daytime"),
  ...over,
});

const eshetChayil: FamilyLine = {
  hebrew: "אשת חיל ואם יקרה",
  english: "a woman of valour and a dear mother",
  pronunciation: "EH-shet CHA-yil v'EM ye-ka-RAH",
};

describe("the standard inscription", () => {
  it("is four lines and fits the form with one to spare", () => {
    const lines = compose(sarah());
    expect(lines.map((l) => l.hebrew)).toEqual([
      "פ״נ",
      "שרה בת אברהם",
      "נ״פ ט״ו שבט תשפ״ד",
      "תנצב״ה",
    ]);
    const c = capacity(lines);
    expect(c.linesUsed).toBe(4);
    expect(c.linesFree).toBe(1);
    expect(c.charactersFree).toBe(BOXES_PER_LINE);
  });

  it("encodes every line, and every line round-trips", () => {
    for (const l of compose(sarah())) {
      expect(l.boxes.length).toBeGreaterThan(0);
      expect(decodeLine(l.boxes)).toBe(l.hebrew);
    }
  });

  it("is approvable", () => {
    expect(isApprovable(compose(sarah()))).toBe(true);
  });
});

describe("gender drives every gendered string", () => {
  it("uses bat and her for a woman", () => {
    const lines = compose(sarah({ gender: "female" }));
    expect(lines[1]?.hebrew).toContain("בת");
    expect(lines[1]?.hebrew).not.toContain("בן");
    expect(lines[3]?.english).toContain("her");
    expect(lines[1]?.english).toContain("daughter");
  });

  it("uses ben and his for a man", () => {
    const lines = compose(sarah({ gender: "male", hebrewGiven: "דוד", englishGiven: "David" }));
    expect(lines[1]?.hebrew).toContain("בן");
    expect(lines[1]?.hebrew).not.toContain("בת");
    expect(lines[3]?.english).toContain("his");
    expect(lines[1]?.english).toContain("son");
  });

  it("changes nothing else between the two", () => {
    const f = compose(sarah({ gender: "female" }));
    const m = compose(sarah({ gender: "male" }));
    expect(f[0]?.hebrew).toBe(m[0]?.hebrew); // פ״נ is the same for both
    expect(f[2]?.hebrew).toBe(m[2]?.hebrew); // so is the date line
  });
});

describe("the closing formula", () => {
  it("defaults to the classical form", () => {
    expect(compose(sarah()).at(-1)?.hebrew).toBe("תנצב״ה");
  });

  it("can be the spaced variant, and it still encodes", () => {
    const last = compose(sarah({ closing: "spaced" })).at(-1)!;
    expect(last.hebrew).toBe("ת׳נ׳צ׳ב׳ה׳");
    expect(decodeLine(last.boxes)).toBe("ת׳נ׳צ׳ב׳ה׳");
    expect(last.boxes.length).toBe(10);
  });
});

describe("a family line", () => {
  it("is placed before the closing and marked as theirs", () => {
    const lines = compose(sarah(), eshetChayil);
    expect(lines.length).toBe(5);
    expect(lines[3]?.source).toBe("family");
    expect(lines[3]?.hebrew).toBe(eshetChayil.hebrew);
    expect(lines.at(-1)?.hebrew).toBe("תנצב״ה");
  });

  it("carries a pronunciation, because that is how a non-reader checks it", () => {
    expect(compose(sarah(), eshetChayil)[3]?.pronunciation).toBe(eshetChayil.pronunciation);
  });

  it("fills the form", () => {
    const c = capacity(compose(sarah(), eshetChayil));
    expect(c.linesUsed).toBe(LINES_PER_FORM);
    expect(c.linesFree).toBe(0);
    expect(c.charactersFree).toBe(0);
  });

  it("blocks when longer than one line", () => {
    const tooLong = { ...eshetChayil, hebrew: "א".repeat(BOXES_PER_LINE + 1) };
    const lines = compose(sarah(), tooLong);
    expect(lines[3]?.overflows).toBe(true);
    expect(isApprovable(lines)).toBe(false);
    expect(blockers(lines)[0]).toContain(String(BOXES_PER_LINE));
  });

  it("blocks when it uses a character the form has no code for", () => {
    const lines = compose(sarah(), { ...eshetChayil, hebrew: "אַבא" });
    expect(isApprovable(lines)).toBe(false);
    expect(blockers(lines)[0]).toContain("U+05B7");
  });
});

describe("unknown time of death", () => {
  const lines = () => compose(sarah({ death: hebrewDateOfDeath(JAN_25, "unknown") }));

  it("blocks approval", () => {
    expect(isApprovable(lines())).toBe(false);
  });

  it("names both candidate dates so the family can go and ask", () => {
    const b = blockers(lines())[0]!;
    expect(b).toContain("15 Sh'vat 5784");
    expect(b).toContain("16 Sh'vat 5784");
  });

  it("still renders a line, so the stone is visible while blocked", () => {
    expect(lines()[2]?.hebrew).toContain("נ״פ");
  });
});

describe("spare boxes do not spill between lines", () => {
  it("counts free capacity in whole lines only", () => {
    const lines = compose(sarah());
    const used = lines.reduce((n, l) => n + l.boxes.length, 0);
    // Four short lines leave plenty of empty boxes...
    expect(used).toBeLessThan(LINES_PER_FORM * BOXES_PER_LINE - BOXES_PER_LINE);
    // ...but only one line is actually available.
    expect(capacity(lines).charactersFree).toBe(BOXES_PER_LINE);
  });
});

describe("opening and death abbreviations are reversals of each other", () => {
  it("appear on the same inscription, in fixed positions", () => {
    const lines = compose(sarah());
    expect(lines[0]?.hebrew).toBe("פ״נ");
    expect(lines[2]?.hebrew.startsWith("נ״פ")).toBe(true);
    // Position is the only thing distinguishing them; both are valid Hebrew.
    expect([...lines[0]!.boxes].reverse()).toEqual(
      lines[2]!.boxes.slice(0, 3),
    );
  });
});
