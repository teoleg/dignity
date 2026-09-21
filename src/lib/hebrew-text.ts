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
 * Needed because `@hebcal/core` renders month names pointed — `שְׁבָט`, not
 * `שבט` — and the form has no code for any of those marks. Stripping is
 * correct here rather than an error: the marks are the library's presentation
 * choice, not something a family typed. Input that a *person* supplied keeps
 * its marks and is rejected by the encoder instead, so the family is told
 * their spelling cannot be engraved rather than having it silently altered.
 */
export function stripNikud(s: string): string {
  return canonical(s).replace(NIKUD, "");
}

/** True if the string carries marks the form cannot represent. */
export function hasNikud(s: string): boolean {
  NIKUD.lastIndex = 0;
  return NIKUD.test(canonical(s));
}
