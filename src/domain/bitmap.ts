import { LIMITS } from "./limits";

/**
 * Outcome of a domain operation on invalid-able input (design: Domain components).
 * Domain functions return an error instead of throwing for invalid input.
 */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * One-bit card raster (Req 8.1): 256 × 160 pixels packed row-major into 5,120 bytes.
 * Pixel (x, y) has index `i = y·256 + x` and lives at bit `7 − (i & 7)` of byte `i >> 3`
 * (bit 7 is the most significant bit). 1 = ink, 0 = paper.
 */
export type Bitmap = Uint8Array;

/** A pixel value: 0 (paper) or 1 (ink). */
export type Bit = 0 | 1;

const WIDTH = LIMITS.cardWidth;
const HEIGHT = LIMITS.cardHeight;
const BYTES = LIMITS.bitmapBytes;
const CHARS = LIMITS.bitmapBase64Chars;

/** Full 3-byte groups (1,706) before the final 2-byte group. */
const FULL_GROUPS = Math.floor(BYTES / 3);

/** Standard base64 alphabet (RFC 4648 §4), index → character. */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Character code (0–127) → alphabet index, or −1 outside the alphabet. */
const DECODE_TABLE: Int8Array = (() => {
  const table = new Int8Array(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i += 1) table[ALPHABET.charCodeAt(i)] = i;
  return table;
})();

/** Exactly 6,827 alphabet characters followed by one `=` (design: Bitmap packing and base64). */
const BITMAP_BASE64 = new RegExp(`^[A-Za-z0-9+/]{${CHARS - 1}}=$`);

/** Returns an all-0 (paper) Bitmap. */
export function createBitmap(): Bitmap {
  return new Uint8Array(BYTES);
}

function isBitmap(b: unknown): b is Bitmap {
  return b instanceof Uint8Array && b.length === BYTES;
}

/** Error text for a coordinate outside the integer range 0–255 × 0–159, or `null` when valid. */
function coordinateError(x: unknown, y: unknown): string | null {
  if (!Number.isInteger(x) || (x as number) < 0 || (x as number) >= WIDTH) {
    return `x must be an integer from 0 to ${WIDTH - 1}`;
  }
  if (!Number.isInteger(y) || (y as number) < 0 || (y as number) >= HEIGHT) {
    return `y must be an integer from 0 to ${HEIGHT - 1}`;
  }
  return null;
}

/** Reads pixel (x, y) (Req 8.7). Never modifies `b`. */
export function getPixel(b: Bitmap, x: number, y: number): Result<Bit> {
  if (!isBitmap(b)) return { ok: false, error: `bitmap must be ${BYTES} bytes` };
  const coordError = coordinateError(x, y);
  if (coordError !== null) return { ok: false, error: coordError };
  const i = y * WIDTH + x;
  const byte = b[i >> 3] ?? 0;
  return { ok: true, value: ((byte >> (7 - (i & 7))) & 1) as Bit };
}

/**
 * Returns a copy of `b` with pixel (x, y) set to `v` (Req 8.6). `b` is never modified;
 * an invalid coordinate or value returns an error and no copy.
 */
export function setPixel(b: Bitmap, x: number, y: number, v: Bit): Result<Bitmap> {
  if (!isBitmap(b)) return { ok: false, error: `bitmap must be ${BYTES} bytes` };
  const coordError = coordinateError(x, y);
  if (coordError !== null) return { ok: false, error: coordError };
  if (v !== 0 && v !== 1) return { ok: false, error: "pixel value must be 0 or 1" };
  const i = y * WIDTH + x;
  const byteIndex = i >> 3;
  const mask = 1 << (7 - (i & 7));
  const out = b.slice();
  const byte = out[byteIndex] ?? 0;
  out[byteIndex] = v === 1 ? byte | mask : byte & ~mask;
  return { ok: true, value: out };
}

/**
 * Encodes a Bitmap as 6,828 characters of standard padded base64 ending in one `=` (Req 8.2).
 * Equal pixels give identical text. A Bitmap that is not 5,120 bytes breaks the `Bitmap`
 * type contract and throws (programmer error).
 */
export function encodeBitmap(b: Bitmap): string {
  if (!isBitmap(b)) throw new RangeError(`encodeBitmap: bitmap must be ${BYTES} bytes`);
  const parts: string[] = new Array<string>(FULL_GROUPS + 1);
  for (let g = 0; g < FULL_GROUPS; g += 1) {
    const p = g * 3;
    const n = ((b[p] ?? 0) << 16) | ((b[p + 1] ?? 0) << 8) | (b[p + 2] ?? 0);
    parts[g] =
      ALPHABET.charAt((n >> 18) & 63) +
      ALPHABET.charAt((n >> 12) & 63) +
      ALPHABET.charAt((n >> 6) & 63) +
      ALPHABET.charAt(n & 63);
  }
  // Final group: 2 bytes → 3 data characters (last one with 2 zero bits) and one `=`.
  const p = FULL_GROUPS * 3;
  const n = ((b[p] ?? 0) << 8) | (b[p + 1] ?? 0);
  parts[FULL_GROUPS] =
    ALPHABET.charAt((n >> 10) & 63) +
    ALPHABET.charAt((n >> 4) & 63) +
    ALPHABET.charAt((n << 2) & 63) +
    "=";
  return parts.join("");
}

/** Alphabet index of the character at `pos`; only called after the alphabet check passed. */
function indexAt(text: string, pos: number): number {
  return DECODE_TABLE[text.charCodeAt(pos)] ?? 0;
}

/**
 * Decodes `bitmapBase64` text (Req 6.2, 8.5). Accepts only a string of exactly 6,828
 * characters: 6,827 standard-alphabet characters, then one `=`, with the 2 unused bits of
 * the last data character equal to 0. Every check runs before the output is allocated, so a
 * rejection returns no Bitmap and no partial pixels.
 */
export function decodeBitmap(text: unknown): Result<Bitmap> {
  if (typeof text !== "string") return { ok: false, error: "bitmapBase64 must be a string" };
  if (text.length !== CHARS) {
    return { ok: false, error: `bitmapBase64 must be exactly ${CHARS} characters` };
  }
  if (!BITMAP_BASE64.test(text)) {
    return {
      ok: false,
      error: "bitmapBase64 must use only A–Z, a–z, 0–9, + and / with one final = padding character",
    };
  }
  if ((indexAt(text, CHARS - 2) & 0b11) !== 0) {
    return { ok: false, error: "bitmapBase64 has non-zero unused bits in its last data character" };
  }
  // 1,706 full groups × 3 + 2 bytes = 5,120: the decoded length follows from the checks above.
  // Kept as an explicit guard (Req 8.5) in case LIMITS and the group layout ever disagree.
  const decodedLength = FULL_GROUPS * 3 + 2;
  if (decodedLength !== BYTES) {
    return { ok: false, error: `bitmapBase64 must decode to ${BYTES} bytes` };
  }

  const out = new Uint8Array(BYTES);
  for (let g = 0; g < FULL_GROUPS; g += 1) {
    const c = g * 4;
    const n =
      (indexAt(text, c) << 18) |
      (indexAt(text, c + 1) << 12) |
      (indexAt(text, c + 2) << 6) |
      indexAt(text, c + 3);
    const p = g * 3;
    out[p] = (n >> 16) & 0xff;
    out[p + 1] = (n >> 8) & 0xff;
    out[p + 2] = n & 0xff;
  }
  const c = FULL_GROUPS * 4;
  const n = (indexAt(text, c) << 10) | (indexAt(text, c + 1) << 4) | (indexAt(text, c + 2) >> 2);
  const p = FULL_GROUPS * 3;
  out[p] = (n >> 8) & 0xff;
  out[p + 1] = n & 0xff;
  return { ok: true, value: out };
}
