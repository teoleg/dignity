import { describe, it, expect } from "vitest";
import {
  applyTurn,
  candidateDates,
  confirmName,
  confirmedKey,
  derive,
  withoutHebrew,
  type Draft,
  type ParsedTurn,
} from "../conversation.js";

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

// confirmName rather than `nameConfirmed: true`: a confirmation is of a
// particular spelling, and a bare flag is not one.
const complete: Draft = confirmName({
  englishGiven: "Sarah", englishFather: "Abraham", gender: "female",
  hebrewGiven: "שרה", hebrewFather: "אברהם",
  diedOn: "2024-01-25", timeOfDeath: "daytime",
});

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

  // ADR 0008: an hour nobody can find follows the date as given rather than
  // stopping the order. It must never read as a date somebody knew.
  it("uses the date as given when the time of death is unknown", () => {
    const { lines, blockers } = derive({ ...complete, timeOfDeath: "unknown" });
    expect(blockers).toHaveLength(0);
    expect(lines[2]?.hebrew).toBe("נ״פ ט״ו שבט תשפ״ד");
  });

  it("says in the gloss that the hour was unknown, and what the other date is", () => {
    const { lines } = derive({ ...complete, timeOfDeath: "unknown" });
    expect(lines[2]?.english).toContain("hour of death is unknown");
    expect(lines[2]?.english).toContain("date as given");
    expect(lines[2]?.english).toContain("16 Sh'vat 5784");
  });

  it("treats a missing time the same way, never as a known daytime death", () => {
    const d = { ...complete };
    delete d.timeOfDeath;
    expect(derive(d).lines[2]?.english).toContain("hour of death is unknown");
  });

  it("says nothing of the sort when the hour is actually known", () => {
    expect(derive(complete).lines[2]?.english).toBe("Died 15 Sh'vat 5784");
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

  it("asks for the Hebrew spelling by the English name the family gave", () => {
    const d: Draft = { englishGiven: "Fyodor", englishFather: "Abraham" };
    const said = derive(d).blockers[0] ?? "";
    expect(said).toContain("the Hebrew spelling of Fyodor");
    expect(said).toContain("Abraham");
  });

  it("says which piece is missing, not just that something is", () => {
    const d = { ...complete };
    delete d.hebrewFather;
    delete d.englishFather;
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

/**
 * The model is told to keep Hebrew out of its prose and does not always obey.
 * It has written names, a family's line, and a Hebrew date into the chat —
 * unreadable to a family who does not read Hebrew, and in the date's case
 * wrong, since the model never computes one. So the prose is cleaned in code.
 */
describe("Hebrew never reaches the family through the prose", () => {
  const hasHebrew = (s: string) => /[\u0590-\u05FF\uFB1D-\uFB4F]/.test(s);

  it("drops an aside that held nothing but Hebrew", () => {
    const out = withoutHebrew("Here is the inscription: Dina bat Chaim (דינה בת חיים), who died in 2025.");
    expect(out).toBe("Here is the inscription: Dina bat Chaim, who died in 2025.");
  });

  it("drops a quoted line and keeps the English gloss beside it", () => {
    const out = withoutHebrew("The added line reads 'תודה על הכל' (thank you for everything).");
    expect(hasHebrew(out)).toBe(false);
    expect(out).toContain("thank you for everything");
  });

  it("drops Hebrew whose English gloss follows it", () => {
    const out = withoutHebrew("The name is written \u05d3\u05d9\u05e0\u05d4 (Dina), and that is it.");
    expect(out).toBe("The name is written (Dina), and that is it.");
  });

  it("names Hebrew standing in the sentence rather than leaving a hole", () => {
    const out = withoutHebrew("I wrote it as פיודור and his father as אברהם.");
    expect(out).toBe("I wrote it as the Hebrew and his father as the Hebrew.");
  });

  it("removes a Hebrew date, which the model must never write at all", () => {
    expect(hasHebrew(withoutHebrew("The Hebrew date is כ״ב כסלו תשפ״ו."))).toBe(false);
  });

  it("still says something when the whole reply was Hebrew", () => {
    const out = withoutHebrew("דינה בת חיים");
    expect(hasHebrew(out)).toBe(false);
    expect(out.length).toBeGreaterThan(20);
  });

  it("leaves a reply with no Hebrew exactly as written", () => {
    const plain = "Was it during the day, or in the evening?";
    expect(withoutHebrew(plain)).toBe(plain);
  });

  it("cleans the reply on the one path every driver goes through", () => {
    const { reply } = applyTurn({}, turn({ reply: "Her name is שרה in Hebrew." }));
    expect(hasHebrew(reply)).toBe(false);
  });
});

describe("choosing a date when the hour is lost", () => {
  const unknown: Draft = { ...complete, timeOfDeath: "unknown" };

  it("offers both dates in English while nothing is chosen", () => {
    expect(candidateDates(unknown)).toEqual({
      daytime: "15 Sh'vat 5784",
      afterSunset: "16 Sh'vat 5784",
    });
  });

  it("keeps offering both, so a choice can be changed after it is made", () => {
    expect(candidateDates({ ...unknown, dateWhenUnknown: "daytime" })).toEqual({
      daytime: "15 Sh'vat 5784",
      afterSunset: "16 Sh'vat 5784",
    });
  });

  it("offers nothing when the hour is known", () => {
    expect(candidateDates(complete)).toBeNull();
  });

  it("marks the family's own choice as theirs, not as the default", () => {
    expect(derive(unknown).lines[2]?.english).toContain("date as given");
    expect(derive({ ...unknown, dateWhenUnknown: "daytime" }).lines[2]?.english).toContain(
      "chosen by the family",
    );
  });

  it("engraves the date chosen, not the other one", () => {
    const { lines } = derive({ ...unknown, dateWhenUnknown: "after-sunset" });
    expect(lines[2]?.hebrew).toBe("נ״פ ט״ז שבט תשפ״ד");
  });

  it("says in the gloss that the hour was unknown and this was a choice", () => {
    const { lines } = derive({ ...unknown, dateWhenUnknown: "daytime" });
    expect(lines[2]?.english).toContain("hour of death is unknown");
    expect(lines[2]?.english).toContain("chosen by the family");
    // The date not taken stays visible, so the choice can be checked.
    expect(lines[2]?.english).toContain("16 Sh'vat 5784");
  });
});

/**
 * A confirmation must survive the conversation carrying on.
 *
 * Found in the field: after the family approved the spelling, asking one more
 * question made the model re-state the same name, which cleared the flag, and
 * the page asked for approval again — every turn, forever, while the form
 * itself was correct. A confirmation is of a *spelling*, so only a changed
 * spelling may undo it.
 */
describe("confirming the spelling", () => {
  const unconfirmed: Draft = {
    englishGiven: "Avatar", englishFather: "Moishe", gender: "male",
    hebrewGiven: "אבטר", hebrewFather: "מוישה",
    diedOn: "1988-12-20", timeOfDeath: "daytime",
  };
  const blocked = (d: Draft) =>
    derive(d).blockers.some((b) => b.includes("not been confirmed"));

  it("blocks until the family confirms", () => {
    expect(blocked(unconfirmed)).toBe(true);
  });

  it("stops blocking once they do", () => {
    expect(blocked(confirmName(unconfirmed))).toBe(false);
  });

  it("survives the model re-stating the same name", () => {
    const { draft } = applyTurn(
      confirmName(unconfirmed),
      turn({
        reply: "Anything else to add?",
        hebrewGiven: { hebrew: "אבטר", pronunciation: "avatar", note: null },
        hebrewFather: { hebrew: "מוישה", pronunciation: "moishe", note: null },
      }),
    );
    expect(draft.nameConfirmed).toBe(true);
    expect(blocked(draft)).toBe(false);
  });

  it("survives a re-statement that differs only in Unicode normalisation", () => {
    const confirmed = confirmName({ ...unconfirmed, hebrewGiven: "שרה" });
    const { draft } = applyTurn(
      confirmed,
      turn({ hebrewGiven: { hebrew: "שרה".normalize("NFD"), pronunciation: "sa-RAH", note: null } }),
    );
    expect(blocked(draft)).toBe(false);
  });

  it("asks again when the spelling actually changes", () => {
    const { draft } = applyTurn(
      confirmName(unconfirmed),
      turn({ hebrewGiven: { hebrew: "אביתר", pronunciation: "ev-ya-TAR", note: null } }),
    );
    expect(draft.nameConfirmed).toBe(false);
    expect(blocked(draft)).toBe(true);
  });

  it("asks again when the father's spelling changes, not just the name's", () => {
    const { draft } = applyTurn(
      confirmName(unconfirmed),
      turn({ hebrewFather: { hebrew: "משה", pronunciation: "mo-SHE", note: null } }),
    );
    expect(blocked(draft)).toBe(true);
  });

  // The family may simply type "yes, that is right" instead of pressing the
  // button. The model reports it, and that has to stick just as hard.
  it("accepts a confirmation the model reports, and it sticks", () => {
    const first = applyTurn(unconfirmed, turn({ updates: { nameConfirmed: true } }));
    expect(blocked(first.draft)).toBe(false);
    const second = applyTurn(
      first.draft,
      turn({ hebrewGiven: { hebrew: "אבטר", pronunciation: "avatar", note: null } }),
    );
    expect(blocked(second.draft)).toBe(false);
  });

  it("will not let a flag with no spelling behind it count", () => {
    expect(blocked({ ...unconfirmed, nameConfirmed: true })).toBe(true);
  });

  it("keys a confirmation to both names together", () => {
    expect(confirmedKey(unconfirmed)).toBe("אבטר|מוישה");
  });
});
