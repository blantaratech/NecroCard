import type { Bit, Bitmap } from "./bitmap";
import { LIMITS } from "./limits";

/** An integer logical pixel coordinate. It may lie outside the card (design: Line rasterizer). */
export interface Point {
  x: number;
  y: number;
}

const WIDTH = LIMITS.cardWidth;
const HEIGHT = LIMITS.cardHeight;

/** Throws when a point breaks the integer-coordinate contract (programmer error, as in `encodeBitmap`). */
function assertIntegerPoint(p: Point, name: string): void {
  if (!Number.isSafeInteger(p.x) || !Number.isSafeInteger(p.y)) {
    throw new RangeError(`${name} must have integer coordinates`);
  }
}

/**
 * Pixels of the 8-connected line from `a` to `b`, in order from `a` (Req 9.1, 9.2).
 *
 * Integer Bresenham (design: Line rasterizer). With `n = max(|dx|, |dy|)` and `m` the absolute
 * minor delta, step `t` (0…n) advances the major axis by `t` and the minor axis by
 * `floor((2·t·m + n) / (2·n))`. The result has exactly `n + 1` pixels and contains both
 * endpoints. Tie rule: when `t·m/n` is exactly k + ½ the minor offset rounds up, toward `b`,
 * so the pixels of a reversed segment can differ on tie steps.
 *
 * Coordinates may lie outside the card; clipping is the caller's job (`applyPolyline`).
 */
export function linePixels(a: Point, b: Point): Point[] {
  assertIntegerPoint(a, "a");
  assertIntegerPoint(b, "b");
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  const n = Math.max(adx, ady);
  if (n === 0) return [{ x: a.x, y: a.y }];

  const xMajor = adx >= ady;
  const m = xMajor ? ady : adx;
  const majorSign = Math.sign(xMajor ? dx : dy);
  const minorSign = Math.sign(xMajor ? dy : dx);

  const out: Point[] = new Array<Point>(n + 1);
  let acc = n;
  let minor = 0;
  for (let t = 0; t <= n; t += 1) {
    const majorStep = majorSign * t;
    const minorStep = minorSign * minor;
    out[t] = xMajor
      ? { x: a.x + majorStep, y: a.y + minorStep }
      : { x: a.x + minorStep, y: a.y + majorStep };
    acc += 2 * m;
    if (acc >= 2 * n) {
      minor += 1;
      acc -= 2 * n;
    }
  }
  return out;
}

/** Writes `v` at (x, y) in place; a coordinate outside 0–255 × 0–159 is skipped (Req 9.4). */
function writePixel(b: Bitmap, x: number, y: number, v: Bit): void {
  if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return;
  const i = y * WIDTH + x;
  const byteIndex = i >> 3;
  const mask = 1 << (7 - (i & 7));
  const byte = b[byteIndex] ?? 0;
  b[byteIndex] = v === 1 ? byte | mask : byte & ~mask;
}

/**
 * Writes `v` to the first sample's pixel, then to every pixel of each consecutive segment
 * `samples[k−1] → samples[k]` in arrival order (Req 9.1, 9.2, 9.8).
 *
 * Mutates and returns `b`, which must be a working copy (design: raster.ts signature); callers
 * that need the original keep their own reference. Pixels outside 0–255 × 0–159 are skipped
 * while in-range pixels of the same segment are still written (Req 9.4). An empty `samples`
 * list writes nothing.
 */
export function applyPolyline(b: Bitmap, samples: readonly Point[], v: Bit): Bitmap {
  const first = samples[0];
  if (first === undefined) return b;
  assertIntegerPoint(first, "samples[0]");
  writePixel(b, first.x, first.y, v);
  for (let k = 1; k < samples.length; k += 1) {
    const from = samples[k - 1];
    const to = samples[k];
    if (from === undefined || to === undefined) continue;
    for (const p of linePixels(from, to)) writePixel(b, p.x, p.y, v);
  }
  return b;
}

/** Pixels per card (40,960): the bound on the fill stack and on any region. */
const PIXELS = WIDTH * HEIGHT;

/** Reads the pixel with row-major index `i` (0 ≤ i < 40,960) as 0 or 1. */
function readIndex(b: Bitmap, i: number): number {
  return ((b[i >> 3] ?? 0) >> (7 - (i & 7))) & 1;
}

/**
 * Pixel indices `i = y·256 + x` of the Dither_Fill region of `seed` (Req 10.1): the seed plus
 * every pixel reachable from it through up, down, left and right steps across pixels with the
 * seed's value. Diagonal steps are never taken, so a one-pixel diagonal wall stops the fill.
 *
 * Iterative flood fill (design: Dither_Fill): a pixel is marked in `visited` when it is pushed,
 * so each pixel enters the `Int32Array` stack at most once and the stack never exceeds 40,960
 * entries. No recursion and no per-pixel object allocation.
 *
 * The region is read from `b` before any write; `b` is never modified. Indices are returned in
 * ascending order (row-major), independent of the traversal order. A seed outside
 * 0–255 × 0–159 has an empty region (the editor's `fill/apply` turns that into a noop,
 * Req 10.7). A non-integer seed or a bitmap that is not 5,120 bytes breaks the type contract
 * and throws `RangeError` (programmer error, as in `linePixels` and `encodeBitmap`).
 */
export function fillRegion(b: Bitmap, seed: Point): Uint32Array {
  if (!(b instanceof Uint8Array) || b.length !== LIMITS.bitmapBytes) {
    throw new RangeError(`fillRegion: bitmap must be ${LIMITS.bitmapBytes} bytes`);
  }
  assertIntegerPoint(seed, "seed");
  if (seed.x < 0 || seed.x >= WIDTH || seed.y < 0 || seed.y >= HEIGHT) return new Uint32Array(0);

  const visited = new Uint8Array(PIXELS);
  const stack = new Int32Array(PIXELS);
  const seedIndex = seed.y * WIDTH + seed.x;
  const target = readIndex(b, seedIndex);
  let top = 0;
  let count = 1;
  visited[seedIndex] = 1;
  stack[top++] = seedIndex;

  while (top > 0) {
    const i = stack[--top] ?? 0;
    const x = i % WIDTH;
    // Left, right, up, down; each neighbour is pushed once, when first found.
    if (x > 0 && visited[i - 1] === 0 && readIndex(b, i - 1) === target) {
      visited[i - 1] = 1;
      stack[top++] = i - 1;
      count += 1;
    }
    if (x < WIDTH - 1 && visited[i + 1] === 0 && readIndex(b, i + 1) === target) {
      visited[i + 1] = 1;
      stack[top++] = i + 1;
      count += 1;
    }
    if (i >= WIDTH && visited[i - WIDTH] === 0 && readIndex(b, i - WIDTH) === target) {
      visited[i - WIDTH] = 1;
      stack[top++] = i - WIDTH;
      count += 1;
    }
    if (i < PIXELS - WIDTH && visited[i + WIDTH] === 0 && readIndex(b, i + WIDTH) === target) {
      visited[i + WIDTH] = 1;
      stack[top++] = i + WIDTH;
      count += 1;
    }
  }

  // `visited` marks exactly the region, so one scan yields it in ascending index order.
  const region = new Uint32Array(count);
  let k = 0;
  for (let i = 0; i < PIXELS; i += 1) {
    if (visited[i] === 1) region[k++] = i;
  }
  return region;
}
