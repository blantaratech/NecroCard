import type { Bit } from "./bitmap";

/**
 * The 4×4 Bayer ordered-dither matrix, indexed `BAYER4[y & 3][x & 3]` (design: Dither_Fill).
 * Frozen so no caller can change the pattern at run time.
 */
export const BAYER4: readonly (readonly number[])[] = Object.freeze([
  Object.freeze([0, 8, 2, 10]),
  Object.freeze([12, 4, 14, 6]),
  Object.freeze([3, 11, 1, 9]),
  Object.freeze([15, 7, 13, 5]),
]);

/** Matrix cells below this level are ink: 6 of 16 cells, 37.5 % ink (design: Dither_Fill). */
export const DITHER_LEVEL = 6;

/**
 * Dither_Pattern value at absolute card pixel (x, y) (Req 10.1, 10.4):
 * `BAYER4[y & 3][x & 3] < DITHER_LEVEL ? 1 : 0`.
 *
 * Depends only on (x, y), never on a fill's seed, region or order, so adjacent fills line up.
 * `& 3` equals `mod 4` for every integer, negative ones included. A non-integer coordinate
 * breaks the integer-pixel contract and throws `RangeError` (programmer error, as in `linePixels`).
 */
export function ditherPattern(x: number, y: number): Bit {
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
    throw new RangeError("ditherPattern: x and y must be integers");
  }
  const cell = BAYER4[y & 3]?.[x & 3] ?? DITHER_LEVEL;
  return cell < DITHER_LEVEL ? 1 : 0;
}
