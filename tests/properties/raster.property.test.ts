import { Buffer } from "node:buffer";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  createBitmap,
  decodeBitmap,
  encodeBitmap,
  getPixel,
  setPixel,
  type Bit,
  type Bitmap,
} from "../../src/domain/bitmap";
import { fcOptions } from "./fc-options";

// Independent oracle constants: written here, not read from LIMITS or the codec.
const WIDTH = 256;
const HEIGHT = 160;
const PIXELS = WIDTH * HEIGHT; // 40,960
const BYTES = PIXELS / 8; // 5,120
const BASE64_CHARS = 6_828;

/** One in-bounds pixel assignment. */
type Assignment = { x: number; y: number; v: Bit };

// Boundary coordinates (byte boundaries 7|8 and the card edges) mixed with random ones.
const xArb = fc.oneof(fc.constantFrom(0, 7, 8, 255), fc.integer({ min: 0, max: WIDTH - 1 }));
const yArb = fc.oneof(fc.constantFrom(0, 159), fc.integer({ min: 0, max: HEIGHT - 1 }));
const bitArb = fc.constantFrom<Bit>(0, 1);
const assignmentArb: fc.Arbitrary<Assignment> = fc.record({ x: xArb, y: yArb, v: bitArb });
// 0–300 assignments; the 8 boundary pixels make repeated writes to one pixel common.
// fast-check's default size keeps arrays short (about 10), so half the runs use size "max"
// to reach long sequences up to 300.
const assignmentsArb = fc.oneof(
  fc.array(assignmentArb, { minLength: 0, maxLength: 300 }),
  fc.array(assignmentArb, { minLength: 0, maxLength: 300, size: "max" }),
);

/** Applies assignments to a blank bitmap through `setPixel`; fails on any rejected write. */
function applyWithCodec(assignments: readonly Assignment[]): Bitmap {
  let b = createBitmap();
  for (const { x, y, v } of assignments) {
    const r = setPixel(b, x, y, v);
    if (!r.ok) throw new Error(`setPixel(${x}, ${y}, ${v}) rejected: ${r.error}`);
    b = r.value;
  }
  return b;
}

/** Plain one-pixel-per-entry oracle: index y·256 + x holds 0 or 1. */
function applyToOracle(assignments: readonly Assignment[]): Uint8Array {
  const pixels = new Uint8Array(PIXELS);
  for (const { x, y, v } of assignments) pixels[y * WIDTH + x] = v;
  return pixels;
}

/** Packs oracle pixels MSB-first: pixel i at bit 7 − (i mod 8) of byte floor(i / 8). */
function packOracle(pixels: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(BYTES);
  for (let i = 0; i < PIXELS; i += 1) {
    if (pixels[i] === 1) {
      const byteIndex = Math.floor(i / 8);
      bytes[byteIndex] = (bytes[byteIndex] ?? 0) | (1 << (7 - (i % 8)));
    }
  }
  return bytes;
}

/** Coordinates where `getPixel(b)` differs from the oracle (first 5), or a read error. */
function pixelMismatches(b: Bitmap, pixels: Uint8Array): string[] {
  const out: string[] = [];
  for (let y = 0; y < HEIGHT && out.length < 5; y += 1) {
    for (let x = 0; x < WIDTH && out.length < 5; x += 1) {
      const r = getPixel(b, x, y);
      const expected = pixels[y * WIDTH + x];
      if (!r.ok) out.push(`(${x}, ${y}): getPixel error ${r.error}`);
      else if (r.value !== expected) out.push(`(${x}, ${y}): got ${r.value}, oracle ${expected}`);
    }
  }
  return out;
}

describe("bitmap codec (raster.property)", () => {
  it("Property 8: matches an independent pixel array", () => {
    // Feature: 01-responsive-authoring, Property 8: The bitmap codec matches an independent pixel array
    fc.assert(
      fc.property(assignmentsArb, (assignments) => {
        const pixels = applyToOracle(assignments);
        const expectedBytes = packOracle(pixels);
        const b = applyWithCodec(assignments);

        // Req 8.1: 5,120 bytes, pixel (x, y) at bit 7 − (i mod 8) of byte floor(i / 8).
        expect(b).toBeInstanceOf(Uint8Array);
        expect(b.length).toBe(BYTES);
        expect(Buffer.from(b).equals(Buffer.from(expectedBytes))).toBe(true);
        expect(pixelMismatches(b, pixels)).toEqual([]);

        // Req 8.2: standard padded base64, 6,828 characters, one final `=`, no whitespace.
        const text = encodeBitmap(b);
        expect(text).toBe(Buffer.from(expectedBytes).toString("base64"));
        expect(text.length).toBe(BASE64_CHARS);
        expect(text).toMatch(/^[A-Za-z0-9+/]{6827}=$/);

        // Req 8.2: equal pixels give identical text, whatever the write history.
        // Rebuild the same pixel array by writing only its ink pixels, in index order.
        const sameInk: Assignment[] = [];
        for (let i = 0; i < PIXELS; i += 1) {
          if (pixels[i] === 1) sameInk.push({ x: i % WIDTH, y: Math.floor(i / WIDTH), v: 1 });
        }
        expect(encodeBitmap(applyWithCodec(sameInk))).toBe(text);

        // Req 8.3, 8.4: encode → decode gives the oracle's value at all 40,960 coordinates.
        const decoded = decodeBitmap(text);
        expect(decoded.ok).toBe(true);
        if (!decoded.ok) return;
        expect(decoded.value.length).toBe(BYTES);
        expect(Buffer.from(decoded.value).equals(Buffer.from(expectedBytes))).toBe(true);
        expect(pixelMismatches(decoded.value, pixels)).toEqual([]);
      }),
      fcOptions,
    );
  });

  // Property 9 (codec rejection, optional task 4.5) belongs in this describe block.
});
