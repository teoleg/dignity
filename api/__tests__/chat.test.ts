import { describe, it, expect } from "vitest";
import { LIMITS, tooLarge } from "../chat.js";
import type { Message } from "../../src/lib/conversation.js";

const say = (n: number, ch = "x"): Message => ({ role: "user", content: ch.repeat(n) });

/**
 * These limits exist for the bill, not for correctness. Every call spends the
 * owner's credit, and cost follows how much text reaches the model — so a
 * single huge request is a cost amplifier for anyone past the passcode.
 */
describe("what one request may carry", () => {
  it("serves an ordinary order", () => {
    expect(tooLarge(Array.from({ length: 24 }, () => say(120)))).toBeNull();
  });

  it("refuses a conversation with too many turns", () => {
    expect(tooLarge(Array.from({ length: LIMITS.messages + 1 }, () => say(1)))).toBe(
      "too many messages",
    );
  });

  it("refuses one enormous message", () => {
    expect(tooLarge([say(LIMITS.perMessage + 1)])).toBe("a message is too long");
  });

  it("refuses many messages that add up", () => {
    const each = LIMITS.perMessage;
    const n = Math.floor(LIMITS.total / each) + 1;
    expect(tooLarge(Array.from({ length: n }, () => say(each)))).toBe(
      "the conversation is too long",
    );
  });

  it("does not trip over a malformed message", () => {
    expect(tooLarge([{ role: "user" } as unknown as Message])).toBeNull();
    expect(tooLarge([null as unknown as Message])).toBeNull();
  });

  it("allows the exact limits, refusing only past them", () => {
    expect(tooLarge(Array.from({ length: LIMITS.messages }, () => say(1)))).toBeNull();
    expect(tooLarge([say(LIMITS.perMessage)])).toBeNull();
  });
});
