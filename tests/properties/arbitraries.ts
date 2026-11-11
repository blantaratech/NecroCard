import fc from "fast-check";
import { createBitmap, encodeBitmap, setPixel, type Bitmap } from "../../src/domain/bitmap";
import type { Id, IdSource } from "../../src/domain/ids";
import { LIMITS, utf8ByteLength } from "../../src/domain/limits";
import type { Card, DiagnosticCode, Path, StackDocument, Widget } from "../../src/domain/schema";

/*
 * Shared generators for the schema, canonical and editor properties (task 5.4; design:
 * Testing Strategy; Req 6.1–6.3).
 *
 * - `stackDocumentArb`: documents that pass `validateStack`, biased toward small sizes but
 *   reaching the boundaries (1 and 20 cards, 0 and 40 widgets, names of exactly 1 and 64
 *   code points with astral and combining characters, geometry touching each card edge,
 *   all-paper, all-ink and random bitmaps, Button sources of exactly 8,192 bytes).
 * - `counterIdSource`: a deterministic `IdSource`.
 * - `faultArb` / `documentWithFaultArb`: one injected fault on a valid document, with the
 *   path and diagnostic code `validateStack` must report (Property 4).
 *
 * Validity is built in, never filtered: no `fc.pre` and no rejection sampling of whole
 * documents. Names are unique per scope through `fc.uniqueArray`; Stable_IDs are made
 * unique (lowercased) by a deterministic repair pass; record keys equal Card ids.
 *
 * Strings contain whole code points only, never a lone surrogate, so a document survives a
 * UTF-8 export and import unchanged (Property 6 depends on this).
 */

// ---------------------------------------------------------------------------------------
// Deterministic IdSource
// ---------------------------------------------------------------------------------------

const COUNTER_LIMIT = 2 ** 48; // 12 hexadecimal digits

function hex(n: number, width: number): string {
  return n.toString(16).padStart(width, "0");
}

/**
 * Returns an `IdSource` that yields `NNNNNNNN-0000-4000-8000-CCCCCCCCCCCC`, where `N` is the
 * namespace (8 hex digits) and `C` a counter starting at `start` (12 hex digits). Each call of
 * `counterIdSource` starts a fresh, independent sequence, so the same options always produce
 * the same IDs. Different namespaces never collide.
 */
export function counterIdSource(
  options: { readonly namespace?: number; readonly start?: number } = {},
): IdSource {
  const namespace = options.namespace ?? 0;
  let next = options.start ?? 0;
  if (!Number.isInteger(namespace) || namespace < 0 || namespace > 0xffff_ffff) {
    throw new RangeError("counterIdSource: namespace must be an integer from 0 to 0xffffffff");
  }
  if (!Number.isInteger(next) || next < 0 || next >= COUNTER_LIMIT) {
    throw new RangeError("counterIdSource: start must be an integer from 0 to 2^48 - 1");
  }
  return () => {
    if (next >= COUNTER_LIMIT) throw new RangeError("counterIdSource: counter exhausted");
    const id = `${hex(namespace, 8)}-0000-4000-8000-${hex(next, 12)}`;
    next += 1;
    return id;
  };
}

/** Takes IDs from `source` until one is not in `taken` (lowercased); records and returns it. */
function freshId(taken: Set<string>, source: IdSource): Id {
  for (;;) {
    const id = source();
    if (!taken.has(id.toLowerCase())) {
      taken.add(id.toLowerCase());
      return id;
    }
  }
}

// ---------------------------------------------------------------------------------------
// Stable_IDs
// ---------------------------------------------------------------------------------------

const hexGroup = (length: number): fc.Arbitrary<string> =>
  fc.string({ unit: fc.constantFrom(..."0123456789abcdefABCDEF"), minLength: length, maxLength: length });

/** Any 8-4-4-4-12 hexadecimal text in mixed case; RFC 4122 shapes mixed with arbitrary hex. */
export const idArb: fc.Arbitrary<Id> = fc.oneof(
  fc.mixedCase(fc.uuid()),
  fc
    .tuple(hexGroup(8), hexGroup(4), hexGroup(4), hexGroup(4), hexGroup(12))
    .map((groups) => groups.join("-")),
);

// ---------------------------------------------------------------------------------------
// Names and text
// ---------------------------------------------------------------------------------------

/** Code points matched by `\s` that names and text may contain (never only these in a name). */
const WHITESPACE_CODE_POINTS = [0x20, 0x09, 0x0a, 0xa0, 0x2028, 0x3000, 0xfeff] as const;

/** One whole code point: ASCII, whitespace, combining marks, other BMP, emoji, other astral. */
const codePointUnit: fc.Arbitrary<string> = fc
  .oneof(
    { weight: 4, arbitrary: fc.integer({ min: 0x21, max: 0x7e }) },
    { weight: 1, arbitrary: fc.constantFrom(...WHITESPACE_CODE_POINTS) },
    { weight: 1, arbitrary: fc.integer({ min: 0x300, max: 0x36f }) }, // combining diacritics
    { weight: 1, arbitrary: fc.integer({ min: 0xa0, max: 0xd7ff }) }, // BMP below surrogates
    { weight: 1, arbitrary: fc.integer({ min: 0xe000, max: 0xfffd }) }, // BMP above surrogates
    { weight: 2, arbitrary: fc.integer({ min: 0x1f300, max: 0x1f64f }) }, // emoji
    { weight: 1, arbitrary: fc.integer({ min: 0x10000, max: 0x10ffff }) }, // any astral
  )
  .map((cp) => String.fromCodePoint(cp));

/** A code point that is not whitespace; every name contains at least one. */
const anchorUnit: fc.Arbitrary<string> = codePointUnit.filter((ch) => !/^\s$/u.test(ch));

/** Inserts the anchor at a generated position; `rest` holds whole code points only. */
function withAnchor(rest: fc.Arbitrary<string>): fc.Arbitrary<string> {
  return fc.tuple(anchorUnit, rest, fc.nat()).map(([anchor, text, at]) => {
    const cps = [...text];
    cps.splice(at % (cps.length + 1), 0, anchor);
    return cps.join("");
  });
}

/** Hand-picked valid names: astral, combining and exact-length boundaries. */
export const CURATED_NAMES: readonly string[] = [
  "👻", // 1 code point, astral
  "\u0301", // 1 code point, a lone combining mark
  "e\u0301", // decomposed é, 2 code points
  "👻".repeat(64), // 64 astral code points (256 UTF-8 bytes)
  "e\u0301".repeat(32), // 64 code points with combining marks
  "a".repeat(64),
  " Card 1 ", // surrounding spaces are kept, not trimmed
  "🦇 Bat cave",
  "Z\u0351\u0359\u0337a\u0310l\u0352g\u0346o",
];

/**
 * Names passing the name rule: 1–64 code points, not whitespace-only. Mostly 1–12 code
 * points, with exact 1 and 64 code point boundaries and curated astral and combining names.
 */
export const nameArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 6, arbitrary: withAnchor(fc.string({ unit: codePointUnit, maxLength: 11 })) },
  { weight: 1, arbitrary: anchorUnit }, // exactly 1 code point
  {
    weight: 1,
    arbitrary: withAnchor(fc.string({ unit: codePointUnit, minLength: 63, maxLength: 63 })),
  }, // exactly 64 code points
  {
    weight: 1,
    arbitrary: withAnchor(fc.string({ unit: codePointUnit, maxLength: 63, size: "max" })),
  },
  { weight: 1, arbitrary: fc.constantFrom(...CURATED_NAMES) },
);

/** Code points for labels, Field text and short sources, including JSON escapes. */
const textUnit: fc.Arbitrary<string> = fc.oneof(
  { weight: 6, arbitrary: codePointUnit },
  { weight: 1, arbitrary: fc.constantFrom('"', "\\", "\u0000", "\u001f", "\r", "\n", "\u007f") },
);

/** Short free text (0–24 code points): Button labels, Field text and most sources. */
export const shortTextArb: fc.Arbitrary<string> = fc.string({ unit: textUnit, maxLength: 24 });

/** Repeats ASCII `base` and pads with "a" to exactly `bytes` UTF-8 bytes. */
function asciiToBytes(base: string, bytes: number): string {
  const whole = Math.floor(bytes / base.length);
  return base.repeat(whole) + "a".repeat(bytes - whole * base.length);
}

/** Button sources of exactly 8,192 UTF-8 bytes (the accepted maximum, Req 6.4). */
export const MAX_SOURCES: readonly string[] = [
  "a".repeat(LIMITS.sourceBytesMax),
  "👻".repeat(LIMITS.sourceBytesMax / 4), // 4-byte code points
  "é".repeat(LIMITS.sourceBytesMax / 2), // 2-byte code points
  "€".repeat(2730) + "ab", // 3-byte code points: 8,190 + 2
  asciiToBytes("on click: go next\n", LIMITS.sourceBytesMax),
];

/** Sources above this size count toward `BIG_SOURCES_MAX`. */
const BIG_SOURCE_BYTES = 1_024;

const sourceArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 9, arbitrary: shortTextArb },
  { weight: 1, arbitrary: fc.constantFrom(...MAX_SOURCES) },
);

// ---------------------------------------------------------------------------------------
// Geometry and bitmaps
// ---------------------------------------------------------------------------------------

/** Boundary coordinates (byte boundaries 7|8 and card edges) mixed with random ones. */
export const pixelXArb = fc.oneof(fc.constantFrom(0, 7, 8, 255), fc.integer({ min: 0, max: 255 }));
export const pixelYArb = fc.oneof(fc.constantFrom(0, 159), fc.integer({ min: 0, max: 159 }));

type Extent = "min" | "max" | number;
const extentArb: fc.Arbitrary<Extent> = fc.oneof(
  fc.constant<Extent>("min"),
  fc.constant<Extent>("max"),
  fc.integer({ min: 1, max: 256 }),
);
function extent(choice: Extent, room: number): number {
  if (choice === "min") return 1;
  if (choice === "max") return room;
  return 1 + ((choice - 1) % room);
}

export interface Geometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Widget geometry fully inside 256 × 160 (Req 6.3). x = 0 and y = 0 touch the left and top
 * edges; the "max" extent touches the right (x + width = 256) and bottom (y + height = 160).
 */
export const geometryArb: fc.Arbitrary<Geometry> = fc
  .record({ x: pixelXArb, y: pixelYArb, w: extentArb, h: extentArb })
  .map(({ x, y, w, h }) => ({
    x,
    y,
    width: extent(w, LIMITS.cardWidth - x),
    height: extent(h, LIMITS.cardHeight - y),
  }));

/** Encoded all-paper (every byte 0x00) and all-ink (every byte 0xFF) bitmaps. */
export const PAPER_BITMAP_BASE64 = encodeBitmap(createBitmap());
export const INK_BITMAP_BASE64 = encodeBitmap(new Uint8Array(LIMITS.bitmapBytes).fill(0xff));

/** 5,120 pseudo-random bytes from a 32-bit seed (xorshift32): fast and reproducible. */
function xorshiftBitmap(seed: number): Bitmap {
  const bytes = new Uint8Array(LIMITS.bitmapBytes);
  let s = seed >>> 0 || 1;
  for (let i = 0; i < bytes.length; i += 4) {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    bytes[i] = s >>> 24;
    bytes[i + 1] = (s >>> 16) & 0xff;
    bytes[i + 2] = (s >>> 8) & 0xff;
    bytes[i + 3] = s & 0xff;
  }
  return bytes;
}

function sparseBitmap(points: readonly { x: number; y: number }[]): Bitmap {
  let b = createBitmap();
  for (const { x, y } of points) {
    const r = setPixel(b, x, y, 1);
    if (!r.ok) throw new Error(`sparseBitmap: setPixel(${x}, ${y}) rejected: ${r.error}`);
    b = r.value;
  }
  return b;
}

/** Encoded bitmaps: all paper, all ink, random bytes, or a few ink pixels at boundary coordinates. */
export const bitmapBase64Arb: fc.Arbitrary<string> = fc.oneof(
  { weight: 2, arbitrary: fc.constant(PAPER_BITMAP_BASE64) },
  { weight: 1, arbitrary: fc.constant(INK_BITMAP_BASE64) },
  { weight: 3, arbitrary: fc.integer({ min: 1, max: 0xffff_ffff }).map((s) => encodeBitmap(xorshiftBitmap(s))) },
  {
    weight: 2,
    arbitrary: fc
      .array(fc.record({ x: pixelXArb, y: pixelYArb }), { minLength: 1, maxLength: 16 })
      .map((points) => encodeBitmap(sparseBitmap(points))),
  },
);

// ---------------------------------------------------------------------------------------
// Widgets, Cards and documents
// ---------------------------------------------------------------------------------------

/** A Button or Field with schema key order; IDs may repeat until the document repair pass. */
export const widgetArb: fc.Arbitrary<Widget> = fc.oneof(
  fc
    .record({ id: idArb, name: nameArb, geometry: geometryArb, label: shortTextArb, source: sourceArb })
    .map(({ id, name, geometry, label, source }): Widget => ({
      id,
      name,
      kind: "button",
      ...geometry,
      label,
      source,
    })),
  fc
    .record({ id: idArb, name: nameArb, geometry: geometryArb, text: shortTextArb })
    .map(({ id, name, geometry, text }): Widget => ({ id, name, kind: "field", ...geometry, text })),
);

const uniqueWidgets = (constraints: { minLength?: number; maxLength: number; size?: "max" }) =>
  fc.uniqueArray(widgetArb, { selector: (w) => w.name, ...constraints });

/**
 * 0–40 Widgets with unique names. fast-check's default size keeps arrays short, so the
 * "max"-size and exact-40 branches make long arrays occur (as in Property 8).
 */
const widgetsArb: fc.Arbitrary<Widget[]> = fc.oneof(
  { weight: 6, arbitrary: uniqueWidgets({ maxLength: LIMITS.widgetsPerCardMax }) },
  { weight: 1, arbitrary: fc.constant<Widget[]>([]) },
  {
    weight: 1,
    arbitrary: uniqueWidgets({
      minLength: LIMITS.widgetsPerCardMax,
      maxLength: LIMITS.widgetsPerCardMax,
    }),
  },
  { weight: 1, arbitrary: uniqueWidgets({ maxLength: LIMITS.widgetsPerCardMax, size: "max" }) },
);

/** A Card before the document pass assigns unique IDs. */
export const cardArb: fc.Arbitrary<Card> = fc
  .record({ id: idArb, name: nameArb, bitmapBase64: bitmapBase64Arb, widgets: widgetsArb })
  .map(({ id, name, bitmapBase64, widgets }): Card => ({
    id,
    name,
    width: LIMITS.cardWidth,
    height: LIMITS.cardHeight,
    bitmapBase64,
    widgets,
  }));

const uniqueCards = (constraints: { minLength: number; maxLength: number; size?: "max" }) =>
  fc.uniqueArray(cardArb, { selector: (c) => c.name, ...constraints });

/** 1–20 Cards with unique names, mostly few, with exact 1 and 20 branches. */
const cardsArb: fc.Arbitrary<Card[]> = fc.oneof(
  { weight: 6, arbitrary: uniqueCards({ minLength: LIMITS.cardsMin, maxLength: LIMITS.cardsMax }) },
  { weight: 1, arbitrary: uniqueCards({ minLength: 1, maxLength: 1 }) },
  {
    weight: 1,
    arbitrary: uniqueCards({ minLength: LIMITS.cardsMax, maxLength: LIMITS.cardsMax }),
  },
  {
    weight: 1,
    arbitrary: uniqueCards({ minLength: LIMITS.cardsMin, maxLength: LIMITS.cardsMax, size: "max" }),
  },
);

/*
 * Size budget (Canonical_Form ≤ 1,048,576 bytes, Req 6.4). Worst-case JSON-escaped sizes:
 * a name is ≤ 64 code points × 4 bytes; short text ≤ 24 × 6 bytes (`\u0000` escapes); a
 * Widget with short source ≤ about 830 bytes including indentation; a big source ≤ about
 * 9,000 bytes; a Card without widgets ≤ about 7,350 bytes (6,828-character bitmap). With at
 * most 400 Widgets and 8 big sources per document:
 *   20 × 7,350 + 400 × 830 + 8 × 9,000 ≈ 551,000 bytes,
 * which leaves room for the largest injected fault (5 extra Cards or 44 extra Widgets or one
 * 10,000-byte source). Widgets beyond the total cap are dropped from later Cards; big sources
 * beyond the cap become "". Exact 20-cards × 40-widgets documents belong to unit test 5.8.
 */
export const WIDGETS_TOTAL_MAX = 400;
export const BIG_SOURCES_MAX = 8;

/** Namespace of the IDs that replace repeated generated IDs. */
const REPAIR_NAMESPACE = 0x9e9e_0000;

function assembleDocument(input: {
  id: Id;
  title: string;
  cards: readonly Card[];
  ranks: readonly number[];
}): StackDocument {
  const taken = new Set<string>();
  const repair = counterIdSource({ namespace: REPAIR_NAMESPACE });
  const unique = (id: Id): Id => {
    if (!taken.has(id.toLowerCase())) {
      taken.add(id.toLowerCase());
      return id;
    }
    return freshId(taken, repair);
  };

  let widgetBudget = WIDGETS_TOTAL_MAX;
  let bigSources = 0;
  const cards: Card[] = input.cards.map((card) => {
    const id = unique(card.id);
    const kept = card.widgets.slice(0, Math.max(0, widgetBudget));
    widgetBudget -= kept.length;
    const widgets = kept.map((w): Widget => {
      const withId: Widget = { ...w, id: unique(w.id) };
      if (withId.kind === "button" && utf8ByteLength(withId.source) > BIG_SOURCE_BYTES) {
        if (bigSources < BIG_SOURCES_MAX) bigSources += 1;
        else return { ...withId, source: "" };
      }
      return withId;
    });
    return { ...card, id, widgets };
  });

  // `cardOrder` follows generation order; `cards` keys are inserted in a different order.
  const insertion = cards
    .map((card, index) => ({ card, index, rank: input.ranks[index] ?? 0 }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index);
  const record: Record<Id, Card> = {};
  for (const { card } of insertion) record[card.id] = card;

  return {
    format: "necrocard",
    schemaVersion: 1,
    id: input.id,
    title: input.title,
    cardOrder: cards.map((c) => c.id),
    cards: record,
  };
}

/**
 * Valid Stack_Documents (Req 6.1–6.3): unique names per scope, Stable_IDs unique when
 * lowercased across Cards and Widgets, `cardOrder` a permutation of the keys, each Card `id`
 * equal to its key, geometry inside the card, sources ≤ 8,192 bytes and Canonical_Form
 * well under 1,048,576 bytes. The document `id` may equal a Card or Widget id (allowed).
 */
export const stackDocumentArb: fc.Arbitrary<StackDocument> = fc
  .record({
    id: idArb,
    title: nameArb,
    cards: cardsArb,
    ranks: fc.array(fc.nat(), { minLength: LIMITS.cardsMax, maxLength: LIMITS.cardsMax }),
  })
  .map(assembleDocument);

// ---------------------------------------------------------------------------------------
// Fault injector (Property 4)
// ---------------------------------------------------------------------------------------

export const FAULT_KINDS = [
  "card-limit",
  "widget-limit",
  "source-too-large",
  "non-finite-number",
  "forbidden-key",
  "unknown-property",
  "missing-property",
  "wrong-type",
  "schema-version",
  "duplicate-name",
  "duplicate-id",
  "name-rule",
] as const;
export type FaultKind = (typeof FAULT_KINDS)[number];

/**
 * One fault injected into a copy of a valid document. `validateStack(candidate)` must reject
 * it with some diagnostic whose `code` is `expectedCode` and whose `path` equals `path`;
 * for duplicates that diagnostic's `otherPath` equals `otherPath`; for limits its `measured`
 * and `max` equal the recorded values.
 */
export interface InjectedFault {
  readonly kind: FaultKind;
  readonly candidate: unknown;
  readonly path: Path;
  readonly expectedCode: DiagnosticCode;
  readonly otherPath?: Path;
  readonly measured?: number;
  readonly max?: number;
}

/*
 * Schema key lists written here as an independent oracle (not read from the zod schemas).
 */
const ROOT_KEYS = ["format", "schemaVersion", "id", "title", "cardOrder", "cards"] as const;
const CARD_KEYS = ["id", "name", "width", "height", "bitmapBase64", "widgets"] as const;
const BUTTON_KEYS = ["id", "name", "kind", "x", "y", "width", "height", "label", "source"] as const;
const FIELD_KEYS = ["id", "name", "kind", "x", "y", "width", "height", "text"] as const;
const GEOMETRY_KEYS = ["x", "y", "width", "height"] as const;
const FORBIDDEN_KEYS = ["__proto__", "constructor", "prototype"] as const;
const SESSION_KEYS = ["theme", "zoom", "selection", "history", "playState", "cursor"] as const;

/** Namespace of the IDs the fault injector adds. */
const FAULT_NAMESPACE = 0xfa01_7000;

type Container = Record<string | number, unknown>;

function containerAt(root: unknown, path: Path): Container {
  let node: unknown = root;
  for (const segment of path) node = (node as Container)[segment];
  if (typeof node !== "object" || node === null) {
    throw new Error(`fault injector: no object at ${JSON.stringify(path)}`);
  }
  return node as Container;
}

function splitPath(path: Path): { parent: Path; key: string | number } {
  const key = path[path.length - 1];
  if (key === undefined) throw new Error("fault injector: empty path");
  return { parent: path.slice(0, -1), key };
}

function setAt(root: unknown, path: Path, value: unknown): void {
  const { parent, key } = splitPath(path);
  containerAt(root, parent)[key] = value;
}

function deleteAt(root: unknown, path: Path): void {
  const { parent, key } = splitPath(path);
  delete containerAt(root, parent)[key];
}

/** Adds an own enumerable property, so `__proto__` becomes a real key (as `JSON.parse` makes it). */
function defineOwn(root: unknown, path: Path, value: unknown): void {
  const { parent, key } = splitPath(path);
  Object.defineProperty(containerAt(root, parent), key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

interface ObjectTarget {
  readonly path: Path;
  readonly keys: readonly string[];
}

function cardKeysOf(doc: StackDocument): string[] {
  return Object.keys(doc.cards);
}

function cardAt(doc: StackDocument, key: string): Card {
  const card = doc.cards[key];
  if (card === undefined) throw new Error(`fault injector: no card ${key}`);
  return card;
}

/** Root, every Card and every Widget object with its schema keys. */
function schemaObjects(doc: StackDocument): ObjectTarget[] {
  const out: ObjectTarget[] = [{ path: [], keys: ROOT_KEYS }];
  for (const key of cardKeysOf(doc)) {
    out.push({ path: ["cards", key], keys: CARD_KEYS });
    cardAt(doc, key).widgets.forEach((w, i) => {
      out.push({ path: ["cards", key, "widgets", i], keys: w.kind === "button" ? BUTTON_KEYS : FIELD_KEYS });
    });
  }
  return out;
}

type ValueType = "string" | "integer" | "array" | "object";

/** Every non-literal property with its schema type (literals are covered by other faults). */
function typedFields(doc: StackDocument): { path: Path; type: ValueType }[] {
  const out: { path: Path; type: ValueType }[] = [
    { path: ["id"], type: "string" },
    { path: ["title"], type: "string" },
    { path: ["cardOrder"], type: "array" },
    { path: ["cards"], type: "object" },
  ];
  doc.cardOrder.forEach((_, i) => out.push({ path: ["cardOrder", i], type: "string" }));
  for (const key of cardKeysOf(doc)) {
    const base: Path = ["cards", key];
    out.push({ path: base, type: "object" });
    for (const k of ["id", "name", "bitmapBase64"]) out.push({ path: [...base, k], type: "string" });
    out.push({ path: [...base, "widgets"], type: "array" });
    cardAt(doc, key).widgets.forEach((w, i) => {
      const wp: Path = [...base, "widgets", i];
      for (const k of ["id", "name"]) out.push({ path: [...wp, k], type: "string" });
      for (const k of GEOMETRY_KEYS) out.push({ path: [...wp, k], type: "integer" });
      for (const k of w.kind === "button" ? ["label", "source"] : ["text"]) {
        out.push({ path: [...wp, k], type: "string" });
      }
    });
  }
  return out;
}

/** Values whose JSON type differs from each schema type. */
const WRONG_VALUES: Readonly<Record<ValueType, readonly unknown[]>> = {
  string: [0, true, null, [], {}],
  integer: ["1", true, null, [], {}],
  array: ["x", 0, null, {}],
  object: ["x", 0, null, []],
};

/** Paths of every number in the document: `schemaVersion`, Card sizes and Widget geometry. */
function numberPaths(doc: StackDocument): Path[] {
  const out: Path[] = [["schemaVersion"]];
  for (const key of cardKeysOf(doc)) {
    out.push(["cards", key, "width"], ["cards", key, "height"]);
    cardAt(doc, key).widgets.forEach((_, i) => {
      for (const k of GEOMETRY_KEYS) out.push(["cards", key, "widgets", i, k]);
    });
  }
  return out;
}

/** All Stable_ID paths in validator traversal order: per Card key, the Card id, then its Widgets. */
function idPaths(doc: StackDocument): { path: Path; id: Id; widget: boolean }[] {
  const out: { path: Path; id: Id; widget: boolean }[] = [];
  for (const key of cardKeysOf(doc)) {
    const card = cardAt(doc, key);
    out.push({ path: ["cards", key, "id"], id: card.id, widget: false });
    card.widgets.forEach((w, i) => out.push({ path: ["cards", key, "widgets", i, "id"], id: w.id, widget: true }));
  }
  return out;
}

function takenIds(doc: StackDocument): Set<string> {
  return new Set(idPaths(doc).map((p) => p.id.toLowerCase()));
}

function freshName(taken: ReadonlySet<string>, prefix: string): string {
  for (let n = 1; ; n += 1) {
    const name = `${prefix}${n}`;
    if (!taken.has(name)) return name;
  }
}

function newField(id: Id, name: string): Widget {
  return { id, name, kind: "field", x: 0, y: 0, width: 1, height: 1, text: "" };
}

function newCard(id: Id, name: string): Card {
  return {
    id,
    name,
    width: LIMITS.cardWidth,
    height: LIMITS.cardHeight,
    bitmapBase64: PAPER_BITMAP_BASE64,
    widgets: [],
  };
}

/** Appends a Card to a cloned document (last in key order and in `cardOrder`). */
function appendCard(c: StackDocument, card: Card): void {
  c.cards[card.id] = card;
  c.cardOrder.push(card.id);
}

/** A string of exactly `bytes` UTF-8 bytes in the given code point width. */
function stringOfBytes(bytes: number, width: 1 | 2 | 4): string {
  const unit = width === 1 ? "a" : width === 2 ? "é" : "👻";
  const whole = Math.floor(bytes / width);
  return unit.repeat(whole) + "a".repeat(bytes - whole * width);
}

const pick = <T>(items: readonly T[]): fc.Arbitrary<T> => {
  if (items.length === 0) throw new Error("fault injector: no target");
  return fc.constantFrom(...items);
};

const clone = (doc: StackDocument): StackDocument => structuredClone(doc);

type FaultBuilder = (doc: StackDocument) => fc.Arbitrary<InjectedFault>;

const FAULT_BUILDERS: Readonly<Record<FaultKind, FaultBuilder>> = {
  // Req 6.4: 21–25 Cards; the added Cards are otherwise valid.
  "card-limit": (doc) =>
    fc.integer({ min: 1, max: 5 }).map((over) => {
      const c = clone(doc);
      const ids = takenIds(doc);
      const names = new Set(Object.values(doc.cards).map((card) => card.name));
      const source = counterIdSource({ namespace: FAULT_NAMESPACE });
      const total = LIMITS.cardsMax + over;
      for (let n = cardKeysOf(doc).length; n < total; n += 1) {
        const name = freshName(names, "Extra card ");
        names.add(name);
        appendCard(c, newCard(freshId(ids, source), name));
      }
      return {
        kind: "card-limit",
        candidate: c,
        path: ["cards"],
        expectedCode: "card-limit",
        measured: total,
        max: LIMITS.cardsMax,
      };
    }),

  // Req 6.4: 41–44 Widgets on one Card; the added Fields are otherwise valid.
  "widget-limit": (doc) =>
    fc.tuple(pick(cardKeysOf(doc)), fc.integer({ min: 1, max: 4 })).map(([key, over]) => {
      const c = clone(doc);
      const card = cardAt(c, key);
      const ids = takenIds(doc);
      const names = new Set(card.widgets.map((w) => w.name));
      const source = counterIdSource({ namespace: FAULT_NAMESPACE });
      const total = LIMITS.widgetsPerCardMax + over;
      while (card.widgets.length < total) {
        const name = freshName(names, "Extra field ");
        names.add(name);
        card.widgets.push(newField(freshId(ids, source), name));
      }
      return {
        kind: "widget-limit",
        candidate: c,
        path: ["cards", key, "widgets"],
        expectedCode: "widget-limit",
        measured: total,
        max: LIMITS.widgetsPerCardMax,
      };
    }),

  // Req 6.4: a Button source of 8,193 bytes or more; a Field may become a Button with its id,
  // name and geometry; a Card without Widgets gets a new Button.
  "source-too-large": (doc) =>
    fc
      .tuple(
        pick(cardKeysOf(doc)),
        fc.nat(),
        fc.constantFrom(LIMITS.sourceBytesMax + 1, LIMITS.sourceBytesMax + 2, LIMITS.sourceBytesMax + 3, 10_000),
        fc.constantFrom<1 | 2 | 4>(1, 2, 4),
      )
      .map(([key, at, bytes, width]) => {
        const c = clone(doc);
        const card = cardAt(c, key);
        const source = stringOfBytes(bytes, width);
        const index = card.widgets.length > 0 ? at % card.widgets.length : 0;
        const old = card.widgets[index];
        if (old !== undefined) {
          const { id, name, x, y, width: w, height: h } = old;
          const label = old.kind === "button" ? old.label : "";
          card.widgets[index] = { id, name, kind: "button", x, y, width: w, height: h, label, source };
        } else {
          const id = freshId(takenIds(doc), counterIdSource({ namespace: FAULT_NAMESPACE }));
          card.widgets.push({ id, name: "Big rule", kind: "button", x: 0, y: 0, width: 1, height: 1, label: "", source });
        }
        return {
          kind: "source-too-large",
          candidate: c,
          path: ["cards", key, "widgets", index, "source"],
          expectedCode: "source-too-large",
          measured: bytes,
          max: LIMITS.sourceBytesMax,
        };
      }),

  // Req 6.5: NaN or ±Infinity in place of any number.
  "non-finite-number": (doc) =>
    fc.tuple(pick(numberPaths(doc)), fc.constantFrom(Number.NaN, Infinity, -Infinity)).map(([path, value]) => {
      const c = clone(doc);
      setAt(c, path, value);
      return { kind: "non-finite-number", candidate: c, path, expectedCode: "non-finite-number" };
    }),

  // Req 6.5: an own `__proto__`, `constructor` or `prototype` key on any object, including `cards`.
  "forbidden-key": (doc) =>
    fc
      .tuple(
        pick<Path>([...schemaObjects(doc).map((t) => t.path), ["cards"]]),
        fc.constantFrom(...FORBIDDEN_KEYS),
        fc.constantFrom<unknown>({}, 1, "x", null),
      )
      .map(([objectPath, key, value]) => {
        const c = clone(doc);
        const path: Path = [...objectPath, key];
        defineOwn(c, path, structuredClone(value));
        return { kind: "forbidden-key", candidate: c, path, expectedCode: "forbidden-key" };
      }),

  // Req 6.5, 6.10: a session-state key (theme, zoom, …) or another unknown key on a schema object.
  "unknown-property": (doc) =>
    fc
      .tuple(
        pick(schemaObjects(doc)),
        fc.oneof(fc.constantFrom(...SESSION_KEYS), fc.stringMatching(/^[a-z][A-Za-z0-9]{0,11}$/)),
        fc.constantFrom<unknown>("dark", 2, true, null, {}, []),
      )
      .map(([target, rawKey, value]) => {
        const c = clone(doc);
        const key = target.keys.includes(rawKey) ? `extra_${rawKey}` : rawKey;
        const path: Path = [...target.path, key];
        setAt(c, path, structuredClone(value));
        return { kind: "unknown-property", candidate: c, path, expectedCode: "unknown-property" };
      }),

  // Req 6.5: a required key removed from the root, a Card or a Widget, literal-typed keys
  // (`format`, `schemaVersion`, Card `width` and `height`) included.
  "missing-property": (doc) =>
    pick(schemaObjects(doc).flatMap((t) => t.keys.map((k): Path => [...t.path, k]))).map((path) => {
      const c = clone(doc);
      deleteAt(c, path);
      return { kind: "missing-property", candidate: c, path, expectedCode: "missing-property" };
    }),

  // Req 6.5: a value of another JSON type in place of a string, integer, array or object.
  "wrong-type": (doc) =>
    pick(typedFields(doc))
      .chain((field) => fc.tuple(fc.constant(field), pick(WRONG_VALUES[field.type])))
      .map(([field, value]) => {
        const c = clone(doc);
        setAt(c, field.path, structuredClone(value));
        return { kind: "wrong-type", candidate: c, path: field.path, expectedCode: "wrong-type" };
      }),

  // Req 6.5: `schemaVersion` other than the integer 1 (a literal mismatch, code invalid-value).
  "schema-version": (doc) =>
    fc.constantFrom<unknown>(0, 2, -1, 1.5, 2026, "1").map((value) => {
      const c = clone(doc);
      setAt(c, ["schemaVersion"], value);
      return { kind: "schema-version", candidate: c, path: ["schemaVersion"], expectedCode: "invalid-value" };
    }),

  // Req 6.6: two Cards, or two Widgets on one Card, with the same name. The later occurrence
  // in validator order is `path`, the earlier is `otherPath`.
  "duplicate-name": (doc) => {
    const keys = cardKeysOf(doc);
    const scopes: { base: Path; size: number; namePath: (i: number) => Path }[] = [];
    if (keys.length >= 2) {
      scopes.push({ base: ["cards"], size: keys.length, namePath: (i) => ["cards", keys[i] ?? "", "name"] });
    }
    for (const key of keys) {
      const n = cardAt(doc, key).widgets.length;
      if (n >= 2) {
        scopes.push({ base: ["cards", key], size: n, namePath: (i) => ["cards", key, "widgets", i, "name"] });
      }
    }
    if (scopes.length === 0) {
      // One Card and no Card with two Widgets: add a second Card with the first Card's name.
      return fc.constant(null).map(() => {
        const c = clone(doc);
        const first = keys[0] ?? "";
        const id = freshId(takenIds(doc), counterIdSource({ namespace: FAULT_NAMESPACE }));
        appendCard(c, newCard(id, cardAt(doc, first).name));
        return {
          kind: "duplicate-name",
          candidate: c,
          path: ["cards", id, "name"],
          expectedCode: "name-duplicate",
          otherPath: ["cards", first, "name"],
        } satisfies InjectedFault;
      });
    }
    return fc.tuple(pick(scopes), fc.nat(), fc.nat()).map(([scope, a, b]) => {
      const i = a % (scope.size - 1);
      const j = i + 1 + (b % (scope.size - 1 - i));
      const c = clone(doc);
      const earlier = scope.namePath(i);
      const later = scope.namePath(j);
      setAt(c, later, containerAt(c, earlier.slice(0, -1))["name"]);
      return {
        kind: "duplicate-name",
        candidate: c,
        path: later,
        expectedCode: "name-duplicate",
        otherPath: earlier,
      } satisfies InjectedFault;
    });
  },

  // Req 6.6: a Widget id set to an earlier Card or Widget id, possibly in another letter case.
  "duplicate-id": (doc) => {
    const paths = idPaths(doc);
    const recase = fc.constantFrom<(s: string) => string>(
      (s) => s,
      (s) => s.toUpperCase(),
      (s) => s.toLowerCase(),
    );
    const widgetPositions = paths.flatMap((p, index) => (p.widget ? [index] : []));
    if (widgetPositions.length === 0) {
      // No Widgets anywhere: add a Field whose id repeats its Card's id.
      return fc.tuple(pick(cardKeysOf(doc)), recase).map(([key, change]) => {
        const c = clone(doc);
        const card = cardAt(c, key);
        card.widgets.push(newField(change(card.id), "Twin"));
        return {
          kind: "duplicate-id",
          candidate: c,
          path: ["cards", key, "widgets", 0, "id"],
          expectedCode: "id-duplicate",
          otherPath: ["cards", key, "id"],
        } satisfies InjectedFault;
      });
    }
    return fc.tuple(pick(widgetPositions), fc.nat(), recase).map(([j, a, change]) => {
      const later = paths[j];
      const earlier = paths[a % j];
      if (later === undefined || earlier === undefined) throw new Error("fault injector: bad id index");
      const c = clone(doc);
      setAt(c, later.path, change(earlier.id));
      return {
        kind: "duplicate-id",
        candidate: c,
        path: later.path,
        expectedCode: "id-duplicate",
        otherPath: earlier.path,
      } satisfies InjectedFault;
    });
  },

  // Req 6.7: the title, a Card name or a Widget name empty, over 64 code points or whitespace-only.
  "name-rule": (doc) => {
    const targets: Path[] = [["title"]];
    for (const key of cardKeysOf(doc)) {
      targets.push(["cards", key, "name"]);
      cardAt(doc, key).widgets.forEach((_, i) => targets.push(["cards", key, "widgets", i, "name"]));
    }
    const bad: fc.Arbitrary<{ value: string; code: DiagnosticCode }> = fc.oneof(
      fc.constant({ value: "", code: "name-empty" as const }),
      fc
        .oneof(
          fc.constantFrom("a".repeat(65), "👻".repeat(65), "e\u0301".repeat(33)),
          fc.string({ unit: codePointUnit, minLength: 65, maxLength: 80 }),
        )
        .map((value) => ({ value, code: "name-too-long" as const })),
      fc
        .string({
          unit: fc.constantFrom(...WHITESPACE_CODE_POINTS).map((cp) => String.fromCodePoint(cp)),
          minLength: 1,
          maxLength: 64,
        })
        .map((value) => ({ value, code: "name-whitespace-only" as const })),
    );
    return fc.tuple(pick(targets), bad).map(([path, { value, code }]) => {
      const c = clone(doc);
      setAt(c, path, value);
      return { kind: "name-rule", candidate: c, path, expectedCode: code } satisfies InjectedFault;
    });
  },
};

/** One fault of the given kinds (default: all) injected into a copy of `doc`; `doc` is never modified. */
export function faultArb(
  doc: StackDocument,
  kinds: readonly FaultKind[] = FAULT_KINDS,
): fc.Arbitrary<InjectedFault> {
  return fc.oneof(...kinds.map((kind) => FAULT_BUILDERS[kind](doc)));
}

/** A valid document paired with one injected fault. */
export const documentWithFaultArb: fc.Arbitrary<{ doc: StackDocument; fault: InjectedFault }> =
  stackDocumentArb.chain((doc) => faultArb(doc).map((fault) => ({ doc, fault })));
