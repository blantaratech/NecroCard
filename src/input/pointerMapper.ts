import type { Result } from "../domain/bitmap";
import { LIMITS } from "../domain/limits";
import type { Point } from "../domain/raster";

/** The canvas element's current bounding rectangle in CSS pixels (`getBoundingClientRect()`). */
export interface PointerRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Prefix of every `logicalPoint` error (Req 14.2). The Canvas_View drops a sample whose
 * mapping fails with this error (Req 14.14); the text after the prefix says which input failed.
 */
export const INVALID_GEOMETRY = "invalid-geometry";

function invalid(detail: string): Result<Point> {
  return { ok: false, error: `${INVALID_GEOMETRY}: ${detail}` };
}

/** `v` clamped to the integer range 0…max. */
function clamp(v: number, max: number): number {
  return Math.max(0, Math.min(max, v));
}

/**
 * Maps a pointer position to a logical card pixel (blueprint §2.7, Req 14.1).
 *
 * `x = floor((clientX − left) × width / rect.width)` and
 * `y = floor((clientY − top) × height / rect.height)`, each clamped to 0…width − 1 and
 * 0…height − 1, so a pointer at or beyond an edge maps to the edge pixel. The operation
 * order matches the blueprint; with integer inputs the quotient is correctly rounded, which
 * makes the result scale-invariant (Req 14.3).
 *
 * Unlike the blueprint, invalid input returns an error instead of throwing (Req 14.2): any
 * non-finite argument, a rectangle width or height ≤ 0, or a logical size that is not a
 * positive integer. The function is pure and reads no DOM state; the caller passes the
 * rectangle it read for this sample.
 */
export function logicalPoint(
  clientX: number,
  clientY: number,
  rect: PointerRect,
  width: number = LIMITS.cardWidth,
  height: number = LIMITS.cardHeight,
): Result<Point> {
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
    return invalid("pointer coordinates must be finite numbers");
  }
  if (!Number.isFinite(rect.left) || !Number.isFinite(rect.top)) {
    return invalid("canvas left and top must be finite numbers");
  }
  if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height)) {
    return invalid("canvas width and height must be finite numbers");
  }
  if (rect.width <= 0 || rect.height <= 0) {
    return invalid("canvas width and height must be greater than 0");
  }
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    return invalid("logical width and height must be positive integers");
  }

  // Finite inputs can overflow to ±Infinity here, which the clamp maps to an edge pixel.
  // NaN cannot arise from finite inputs; the guard keeps that a checked fact, not an assumption.
  const x = clamp(Math.floor(((clientX - rect.left) * width) / rect.width), width - 1);
  const y = clamp(Math.floor(((clientY - rect.top) * height) / rect.height), height - 1);
  if (Number.isNaN(x) || Number.isNaN(y)) return invalid("pointer mapping produced no number");
  return { ok: true, value: { x, y } };
}
