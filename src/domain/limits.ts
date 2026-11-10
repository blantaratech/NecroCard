/** Document_Limits and related constants (Req 6.2, 6.4, 6.7, 11.5). Equality with a maximum is accepted. */
export const LIMITS = {
  cardsMin: 1,
  cardsMax: 20,
  widgetsPerCardMax: 40,
  documentBytesMax: 1_048_576,
  sourceBytesMax: 8_192,
  nameCodePointsMin: 1, // proposed
  nameCodePointsMax: 64, // proposed
  cardWidth: 256,
  cardHeight: 160,
  bitmapBytes: 5_120,
  bitmapBase64Chars: 6_828,
  historyDepth: 50, // proposed
} as const;

/**
 * UTF-8 byte length of `s`, counted per code point: 1 byte up to U+007F, 2 up to U+07FF,
 * 3 up to U+FFFF and 4 above. A lone surrogate counts 3, the size of the U+FFFD that a
 * UTF-8 encoder writes in its place, so the result equals `Buffer.byteLength(s, "utf8")`.
 */
export function utf8ByteLength(s: string): number {
  let bytes = 0;
  for (const ch of s) {
    // `for...of` yields whole code points; a lone surrogate arrives as one code unit.
    const cp = ch.codePointAt(0) ?? 0;
    if (cp < 0x80) bytes += 1;
    else if (cp < 0x800) bytes += 2;
    else if (cp < 0x10000) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

/** Number of Unicode code points in `s`, equal to `[...s].length` (a lone surrogate counts 1). */
export function codePointLength(s: string): number {
  let n = 0;
  for (const _ of s) n += 1;
  return n;
}

/** Whitespace-only test from the design (`/^\s*$/u`); also true for the empty string. */
const WHITESPACE_ONLY = /^\s*$/u;

/** The name rule a title or name fails (Req 6.7, 12.8). `schema.ts` maps it to a `DiagnosticCode`. */
export type NameRuleFailure = "empty" | "too-long" | "whitespace-only";

/**
 * Checks a Stack_Document `title`, Card `name` or Widget `name` against the name rule:
 * 1 to 64 code points and not whitespace-only. Returns `null` when the value passes,
 * otherwise the first failed rule in the order empty, too long, whitespace-only.
 */
export function checkName(s: string): NameRuleFailure | null {
  const length = codePointLength(s);
  if (length < LIMITS.nameCodePointsMin) return "empty";
  if (length > LIMITS.nameCodePointsMax) return "too-long";
  if (WHITESPACE_ONLY.test(s)) return "whitespace-only";
  return null;
}

/** True when `s` passes the name rule of `checkName`. */
export function isValidName(s: string): boolean {
  return checkName(s) === null;
}
