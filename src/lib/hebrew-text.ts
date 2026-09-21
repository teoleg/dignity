/**
 * Canonical handling of Hebrew text at the boundaries of the system.
 *
 * Two jobs, both of which exist because the vendor's form is narrower than
 * Unicode: normalise to one representation, and strip marks the form has no
 * code for. See docs/domain/eagle-granite-form.md § 2.1.
 */

/** Combining marks: niqqud (U+0591–U+05BD, U+05BF–U+05C7) minus the dagesh. */
const NIKUD = /[֑-ֻֽֿ-ׇ]/g;

/** U+05BC. The form carries בּ and תּ as their own codes, so this one survives. */
export const DAGESH = "ּ";

/**
 * Canonical form for storage and comparison.
 *
 * NFC is deliberate: it composes what Unicode has precomposed forms for and
 * leaves `base + U+05BC` as two codepoints, which is exactly how the encoder
 * expects to see בּ and תּ. Never store or compare Hebrew that has not been
 * through here.
 */
export function canonical(s: string): string {
  return s.normalize("NFC");
}

/**
 * Remove vowel points and cantillation, keeping the dagesh.
 *
 * For text that is already unpointed apart from a meaningful בּ or תּ. It is
 * NOT enough for `@hebcal/core` output — see `stripPointing`.
 */
export function stripNikud(s: string): string {
  return canonical(s).replace(NIKUD, "");
}

/**
 * Remove every mark, the dagesh included. For library output only.
 *
 * `@hebcal/core` renders month names fully pointed — `כִּסְלֵו`, `תִּשְׁרֵי`,
 * `תַּמּוּז` — and there the dagesh is pointing, not spelling: the engraved
 * spellings are כסלו, תשרי, תמוז with plain letters. Keeping it was wrong in
 * two ways at once. Kislev, Iyyar, Tamuz and Elul came out carrying כּ, יּ,
 * מּ, וּ, which the form has no code for, so the order could not be filled at
 * all for anyone who died in those months. Tishrei and Tamuz were worse: the
 * leading תּ encodes as code 1 instead of ת's code 29, so the form filled
 * silently with the wrong character.
 *
 * This is for hebcal's output and nothing else. Text a *person* supplied
 * keeps its marks and is refused by the encoder instead, so a family is told
 * their spelling cannot be engraved rather than having it silently altered.
 */
export function stripPointing(s: string): string {
  return canonical(s).replace(NIKUD, "").replaceAll(DAGESH, "");
}

/** True if the string carries marks the form cannot represent. */
export function hasNikud(s: string): boolean {
  NIKUD.lastIndex = 0;
  return NIKUD.test(canonical(s));
}
