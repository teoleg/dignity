import { describe, it, expect } from "vitest";
import { applyTurn, derive, type Draft, type ParsedTurn } from "../conversation.js";

/**
 * The model drives the conversation; these tests cover what happens to what
 * it says afterwards. Everything here runs without a network call, which is
 * the point of keeping the vetting outside the model.
 */

const EMPTY: ParsedTurn = {
  reply: "",
  updates: {
    englishGiven: null, englishSurname: null, englishFather: null,
    gender: null, diedOn: null, timeOfDeath: null, nameConfirmed: null,
  },
  hebrewGiven: null,
  hebrewFather: null,
  extraLine: null,
};

const turn = (
  over: Partial<Omit<ParsedTurn, "updates">> & { updates?: Partial<ParsedTurn["updates"]> } = {},
): ParsedTurn => ({
  ...EMPTY,
  ...over,
  updates: { ...EMPTY.updates, ...(over.updates ?? {}) },
});

const complete: Draft = {
  englishGiven: "Sarah", englishFather: "Abraham", gender: "female",
  hebrewGiven: "שרה", hebrewFather: "אברהם",
  diedOn: "2024-01-25", timeOfDeath: "daytime", nameConfirmed: true,
};

describe("what the model learns", () => {
  it("is merged into the draft", () => {
    const { draft } = applyTurn({}, turn({ updates: { englishGiven: "Sarah", gender: "female" } }));
    expect(draft.englishGiven).toBe("Sarah");
    expect(draft.gender).toBe("female");
  });

  it("leaves untouched fields alone", () => {
    const { draft } = applyTurn({ englishGiven: "Sarah" }, turn({ updates: { gender: "female" } }));
    expect(draft.englishGiven).toBe("Sarah");
  });

  it("ignores a date that is not a real yyyy-mm-dd", () => {
    const { draft } = applyTurn({}, turn({ updates: { diedOn: "last winter" } }));
    expect(draft.diedOn).toBeUndefined();
  });
});

describe("Hebrew the model proposes is vetted, not trusted", () => {
  it("accepts a spelling the form can carry", () => {
    const { draft, rejected } = applyTurn(
      {},
      turn({ hebrewGiven: { hebrew: "שרה", pronunciation: "SA-ra", note: null } }),
    );
    expect(draft.hebrewGiven).toBe("שרה");
    expect(draft.hebrewGivenSaid).toBe("SA-ra");
    expect(rejected).toHaveLength(0);
  });

  it("rejects niqqud rather than storing it", () => {
    const { draft, rejected } = applyTurn(
      {},
      turn({ hebrewGiven: { hebrew: "שָׂרָה", pronunciation: "SA-ra", note: null } }),
    );
    expect(draft.hebrewGiven).toBeUndefined();
    expect(rejected[0]?.reason).toContain("no character for");
  });

  it("rejects an added line that will not fit", () => {
    const { draft, rejected } = applyTurn(
      {},
      turn({ extraLine: { hebrew: "א".repeat(40), pronunciation: "x", note: "y" } }),
    );
    expect(draft.extra).toBeUndefined();
    expect(rejected[0]?.reason).toContain("the line holds 28");
  });

  it("makes a new spelling need confirming again", () => {
    const { draft } = applyTurn(
      { ...complete },
      turn({ hebrewGiven: { hebrew: "שרי", pronunciation: "sa-RAI", note: null } }),
    );
    expect(draft.nameConfirmed).toBe(false);
  });
});

describe("the date is computed, never taken from the model", () => {
  it("renders the Hebrew date the library produces", () => {
    const { lines } = derive(complete);
    expect(lines[2]?.hebrew).toBe("נ״פ ט״ו שבט תשפ״ד");
  });

  it("moves to the next Hebrew day for an evening death", () => {
    const { lines } = derive({ ...complete, timeOfDeath: "after-sunset" });
    expect(lines[2]?.hebrew).toBe("נ״פ ט״ז שבט תשפ״ד");
  });

  it("blocks while the time of death is unknown", () => {
    const { blockers } = derive({ ...complete, timeOfDeath: "unknown" });
    expect(blockers.join(" ")).toContain("Time of death unknown");
  });

  it("treats a missing time as unknown rather than assuming daytime", () => {
    const d = { ...complete };
    delete d.timeOfDeath;
    expect(derive(d).blockers.join(" ")).toContain("Time of death unknown");
  });
});

describe("when the inscription is finished", () => {
  it("is approvable once everything is settled", () => {
    expect(derive(complete).blockers).toHaveLength(0);
  });

  it("is blocked until the family confirms the name", () => {
    const { blockers } = derive({ ...complete, nameConfirmed: false });
    expect(blockers.join(" ")).toContain("not been confirmed");
  });

  it("is not composed at all while something essential is missing", () => {
    const d = { ...complete };
    delete d.gender;
    const { lines, blockers } = derive(d);
    expect(lines).toHaveLength(0);
    expect(blockers).toHaveLength(1);
  });

  it("says which piece is missing, not just that something is", () => {
    const d = { ...complete };
    delete d.hebrewFather;
    expect(derive(d).blockers[0]).toContain("father's first name");
  });

  // The English names are the family's gloss and are never engraved. An
  // order once stalled with every question answered because the model had
  // recorded the Hebrew for the father but not the English.
  it("still composes when only the English names are missing", () => {
    const d: Draft = { ...complete };
    delete d.englishGiven;
    delete d.englishFather;
    const { lines, blockers } = derive(d);
    expect(blockers).toHaveLength(0);
    expect(lines[1]?.hebrew).toBe("שרה בת אברהם");
  });

  it("glosses a missing English name with how the Hebrew sounds", () => {
    const d: Draft = {
      ...complete,
      hebrewGivenSaid: "sa-RAH",
      hebrewFatherSaid: "av-ra-HAM",
    };
    delete d.englishGiven;
    delete d.englishFather;
    expect(derive(d).lines[1]?.english).toBe("sa-RAH, daughter of av-ra-HAM");
  });

  it("reports the one free line, and none once it is used", () => {
    expect(derive(complete).capacity.linesFree).toBe(1);
    const withExtra = derive({
      ...complete,
      extra: { hebrew: "אשת חיל", english: "a woman of valour", pronunciation: "EH-shet CHA-yil" },
    });
    expect(withExtra.capacity.linesFree).toBe(0);
    expect(withExtra.lines).toHaveLength(5);
  });
});
