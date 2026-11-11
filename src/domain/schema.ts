import { z } from "zod";
import { decodeBitmap } from "./bitmap";
import { canonicalize } from "./canonical";
import type { Id } from "./ids";
import { UUID_TEXT } from "./ids";
import { LIMITS, checkName, utf8ByteLength } from "./limits";
import type { NameRuleFailure } from "./limits";

/*
 * Stack_Document schema (blueprint §2.3, Req 6.1–6.3, 6.5, 6.10).
 *
 * The zod schemas check shape and types only. Counts (1–20 cards, ≤ 40 widgets), geometry
 * bounds, bitmap decoding, name rules, uniqueness, source bytes and document size are the
 * semantic pass of `validateStack` (task 5.3), so that their diagnostics can carry
 * `measured`, `max` and `otherPath`.
 *
 * Every object is a `z.strictObject`, so an unknown key such as a theme, zoom, selection,
 * history or play-state property is rejected (Req 6.5, 6.10). Shapes list their keys in
 * Canonical_Form order (design: Algorithms, Canonical_Form).
 */

/** Stable_ID: any 8-4-4-4-12 hexadecimal text (Req 6.1), not `z.uuid()`, which demands RFC 4122 variants. */
export const idSchema = z.string().regex(UUID_TEXT);

/** Widget geometry is integer-only here; the in-card bounds of Req 6.3 are a semantic check. */
const geometry = z.number().int();

export const buttonSchema = z.strictObject({
  id: idSchema,
  name: z.string(),
  kind: z.literal("button"),
  x: geometry,
  y: geometry,
  width: geometry,
  height: geometry,
  label: z.string(),
  source: z.string(),
});

export const fieldSchema = z.strictObject({
  id: idSchema,
  name: z.string(),
  kind: z.literal("field"),
  x: geometry,
  y: geometry,
  width: geometry,
  height: geometry,
  text: z.string(),
});

export const widgetSchema = z.discriminatedUnion("kind", [buttonSchema, fieldSchema]);

export const cardSchema = z.strictObject({
  id: idSchema,
  name: z.string(),
  width: z.literal(LIMITS.cardWidth),
  height: z.literal(LIMITS.cardHeight),
  bitmapBase64: z.string(),
  widgets: z.array(widgetSchema),
});

export const stackDocumentSchema = z.strictObject({
  format: z.literal("necrocard"),
  schemaVersion: z.literal(1),
  id: idSchema,
  title: z.string(),
  cardOrder: z.array(idSchema),
  cards: z.record(idSchema, cardSchema),
});

/** The persisted stack value (blueprint §2.3). No session or presentation state (Req 6.10). */
export interface StackDocument {
  format: "necrocard";
  schemaVersion: 1;
  id: Id;
  title: string;
  cardOrder: Id[];
  cards: Record<Id, Card>;
}

export interface Card {
  id: Id;
  name: string;
  width: 256;
  height: 160;
  /** 6,828 characters of standard padded base64 encoding a 5,120-byte Bitmap. */
  bitmapBase64: string;
  /** Array order is overlay paint order and Tab order. */
  widgets: Widget[];
}

export type Widget = {
  id: Id;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
} & ({ kind: "button"; label: string; source: string } | { kind: "field"; text: string });

/*
 * Compile-time guard: the hand-written types above and the zod output types must stay
 * mutually assignable, so a schema edit that drifts from the design types fails typecheck.
 */
type MutuallyAssignable<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const widgetTypesAgree: MutuallyAssignable<Widget, z.output<typeof widgetSchema>> = true;
const cardTypesAgree: MutuallyAssignable<Card, z.output<typeof cardSchema>> = true;
const stackTypesAgree: MutuallyAssignable<StackDocument, z.output<typeof stackDocumentSchema>> =
  true;
void widgetTypesAgree;
void cardTypesAgree;
void stackTypesAgree;

/** Property path from the document root: object keys and array indexes (Req 6.5, 20.5). */
export type Path = readonly (string | number)[];

/**
 * Every diagnostic code the domain reports. The design lists examples only
 * ("such as ..."); this union is the full set, recorded in `docs/decisions.md`.
 */
export type DiagnosticCode =
  // Structural pre-pass (Req 6.5)
  | "non-finite-number"
  | "forbidden-key" // `__proto__`, `constructor`, `prototype`
  | "too-deep" // nesting deeper than 8 levels
  // zod shape pass (Req 6.1, 6.2, 6.3, 6.5, 6.10)
  | "unknown-property"
  | "missing-property"
  | "wrong-type"
  | "invalid-value" // literal or discriminator mismatch, e.g. `schemaVersion` 2 or `kind` "image"; also editor input: a non-integer widget move/resize delta (task 7.3), a bad Stroke sample or fill point, an unknown action type (task 7.6)
  | "invalid-id" // a Stable_ID or `cards` key that is not 8-4-4-4-12 hexadecimal text
  // Semantic pass (Req 6.1–6.4, 6.6, 6.7)
  | "card-order" // `cardOrder` is not a permutation of the keys of `cards`
  | "card-id-mismatch" // a Card `id` differs from its key in `cards`
  | "cards-empty" // fewer than 1 Card
  | "card-limit" // more than 20 Cards
  | "widget-limit" // more than 40 Widgets on one Card
  | "geometry-range"
  | "bitmap-invalid"
  | "name-empty"
  | "name-too-long"
  | "name-whitespace-only"
  | "name-duplicate"
  | "id-duplicate"
  | "source-too-large"
  | "document-too-large"
  // Editor rejections (Req 7.5, 7.6)
  | "last-card"
  | "referenced"
  | "card-not-found" // an action names a Card ID that is not in the document (task 7.1)
  | "widget-not-found"; // an action names a Widget ID that is not on the named Card (task 7.3)

/** Maps a `checkName` failure to its diagnostic code (title, Card name and Widget name alike). */
export const NAME_RULE_CODE: Readonly<Record<NameRuleFailure, DiagnosticCode>> = {
  empty: "name-empty",
  "too-long": "name-too-long",
  "whitespace-only": "name-whitespace-only",
};

export interface Diagnostic {
  code: DiagnosticCode;
  path: Path;
  message: string;
  /** Measured value of an exceeded Document_Limit (Req 6.4). */
  measured?: number;
  /** The Document_Limit maximum; equality with it is accepted (Req 6.4). */
  max?: number;
  /** The other occurrence of a duplicated name or Stable_ID (Req 6.6): `path` is the later one. */
  otherPath?: Path;
  /**
   * Buttons that block a delete (decision D-C). Present only when `code === "referenced"`,
   * then non-empty and in Reference_Index order. Holds Stable_IDs; the UI resolves names.
   * `validateStack` never emits it.
   */
  references?: readonly { cardId: Id; widgetId: Id }[];
}

export type Validation<T> = { ok: true; value: T } | { ok: false; diagnostics: Diagnostic[] };

/*
 * Schema_Validator (design: Data Models, Stack document; Req 6.1–6.7, 6.10, 6.11).
 *
 * Three passes, each run only when the one before it found nothing:
 *   1. Structural pre-pass over the raw value (iterative, explicit stack, no recursion).
 *   2. zod shape parse, its issues mapped to diagnostics in zod's issue order.
 *   3. Semantic checks on the parsed document, in the fixed order listed at `semanticPass`.
 * So hostile values (non-finite numbers, `__proto__` keys, deep nesting) never reach zod,
 * and the semantic checks only see a well-typed document.
 *
 * Invariants: the candidate is only read, never written; every step is deterministic, so an
 * identical candidate always gives the same result and the same diagnostics in the same
 * order (Req 6.11). The first diagnostic is the "first failing path" (Req 20.5, 20.9).
 */

/** Object keys that are rejected anywhere in a candidate (Req 6.5). */
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Deepest allowed container nesting. The root container is level 1, so a container whose
 * path has 8 or more segments is at level 9 and is rejected. Valid documents reach level 5
 * (a Widget object at `cards.<id>.widgets.<i>`).
 */
const MAX_NESTING_LEVELS = 8;

export function validateStack(candidate: unknown): Validation<StackDocument> {
  const structural = structuralPrePass(candidate);
  if (structural.length > 0) return { ok: false, diagnostics: structural };

  const parsed = stackDocumentSchema.safeParse(candidate);
  if (!parsed.success) {
    const diagnostics = parsed.error.issues.flatMap((issue) => mapZodIssue(issue, candidate));
    return { ok: false, diagnostics };
  }

  const semantic = semanticPass(parsed.data);
  if (semantic.length > 0) return { ok: false, diagnostics: semantic };
  // zod builds new objects, so the returned value never aliases the candidate.
  return { ok: true, value: parsed.data };
}

// ---------------------------------------------------------------------------------------
// Pass 1: structural pre-pass
// ---------------------------------------------------------------------------------------

interface PrePassFrame {
  value: unknown;
  path: Path;
  /** The key of this frame is forbidden; report it and do not read or descend into its value. */
  forbidden: boolean;
}

/**
 * Visits the raw value in pre-order (object keys in `Object.keys` order, array elements by
 * index) with an explicit stack. `Object.keys` lists an own `__proto__` key created by
 * `JSON.parse`. A forbidden key's value is never read; a too-deep container is not entered,
 * which also cuts any reference cycle.
 */
function structuralPrePass(root: unknown): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const stack: PrePassFrame[] = [{ value: root, path: [], forbidden: false }];

  for (let frame = stack.pop(); frame !== undefined; frame = stack.pop()) {
    const { value, path } = frame;

    if (frame.forbidden) {
      const key = String(path[path.length - 1]);
      diagnostics.push({
        code: "forbidden-key",
        path,
        message: `The property name "${key}" is not allowed.`,
      });
      continue;
    }

    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        diagnostics.push({
          code: "non-finite-number",
          path,
          message: `${String(value)} is not a finite number.`,
        });
      }
      continue;
    }

    if (typeof value !== "object" || value === null) continue;

    if (path.length >= MAX_NESTING_LEVELS) {
      diagnostics.push({
        code: "too-deep",
        path,
        message: `Values are nested deeper than ${MAX_NESTING_LEVELS} levels.`,
      });
      continue;
    }

    const children: PrePassFrame[] = [];
    if (Array.isArray(value)) {
      const items: readonly unknown[] = value;
      for (let i = 0; i < items.length; i += 1) {
        children.push({ value: items[i], path: [...path, i], forbidden: false });
      }
    } else {
      const record = value as Readonly<Record<string, unknown>>;
      for (const key of Object.keys(record)) {
        const forbidden = FORBIDDEN_KEYS.has(key);
        children.push({ value: forbidden ? undefined : record[key], path: [...path, key], forbidden });
      }
    }
    // Push in reverse so the first child is popped first (pre-order, document order).
    for (let i = children.length - 1; i >= 0; i -= 1) {
      const child = children[i];
      if (child !== undefined) stack.push(child);
    }
  }
  return diagnostics;
}

// ---------------------------------------------------------------------------------------
// Pass 2: zod issues to diagnostics
// ---------------------------------------------------------------------------------------

function toPath(segments: readonly PropertyKey[]): (string | number)[] {
  return segments.map((s) => (typeof s === "symbol" ? String(s) : s));
}

/** True when the parent at `path` is an object or array that has no own property for the last key. */
function isMissingProperty(candidate: unknown, path: readonly PropertyKey[]): boolean {
  if (path.length === 0) return false;
  let parent: unknown = candidate;
  for (let i = 0; i < path.length - 1; i += 1) {
    if (typeof parent !== "object" || parent === null) return false;
    const segment = path[i] as PropertyKey;
    if (!Object.hasOwn(parent, segment)) return false;
    parent = (parent as Readonly<Record<PropertyKey, unknown>>)[segment];
  }
  if (typeof parent !== "object" || parent === null) return false;
  return !Object.hasOwn(parent, path[path.length - 1] as PropertyKey);
}

function describeValues(values: readonly unknown[]): string {
  return values.map((v) => (typeof v === "string" ? JSON.stringify(v) : String(v))).join(" or ");
}

/**
 * Maps one zod 4 issue to diagnostics. `unrecognized_keys` is reported by zod at the parent
 * path, so the key is appended to name the offending property; it gives one diagnostic per key.
 */
function mapZodIssue(issue: z.core.$ZodIssue, candidate: unknown): Diagnostic[] {
  const path = toPath(issue.path);
  const last = path[path.length - 1];
  const missing = (): Diagnostic => ({
    code: "missing-property",
    path,
    message: `The required property "${String(last)}" is missing.`,
  });

  switch (issue.code) {
    case "unrecognized_keys":
      return issue.keys.map((key) => ({
        code: "unknown-property",
        path: [...path, key],
        message: `"${key}" is not a property of this schema.`,
      }));
    case "invalid_type":
      if (isMissingProperty(candidate, issue.path)) return [missing()];
      return [{ code: "wrong-type", path, message: `Expected a value of type ${issue.expected}.` }];
    case "invalid_union":
      // The widget discriminator: zod reports a missing, non-string or unknown `kind` here.
      if (issue.discriminator !== undefined && isMissingProperty(candidate, issue.path)) {
        return [missing()];
      }
      return [
        {
          code: "invalid-value",
          path,
          message:
            issue.discriminator !== undefined && "options" in issue && issue.options !== undefined
              ? `Expected ${describeValues(issue.options)}.`
              : "The value matches no allowed form.",
        },
      ];
    case "invalid_value":
      // zod 4 reports an absent literal-typed key (`format`, `schemaVersion`, Card `width`
      // and `height`) as `invalid_value`, not `invalid_type`.
      if (isMissingProperty(candidate, issue.path)) return [missing()];
      return [{ code: "invalid-value", path, message: `Expected ${describeValues(issue.values)}.` }];
    case "invalid_format":
      // The only string format in the schema is the Stable_ID pattern.
      return [
        { code: "invalid-id", path, message: "Expected a Stable_ID (8-4-4-4-12 hexadecimal text)." },
      ];
    case "invalid_key":
      return [
        {
          code: "invalid-id",
          path,
          message: "Card keys must be Stable_IDs (8-4-4-4-12 hexadecimal text).",
        },
      ];
    case "too_big":
    case "too_small":
      // `z.number().int()` limits integers to the safe range.
      return [{ code: "invalid-value", path, message: "Expected a safe integer." }];
    default:
      return [{ code: "invalid-value", path, message: issue.message }];
  }
}

// ---------------------------------------------------------------------------------------
// Pass 3: semantic checks
// ---------------------------------------------------------------------------------------

/** Message tail per name rule; the subject ("A card name", ...) is prefixed by the caller. */
export const NAME_RULE_MESSAGE: Readonly<Record<NameRuleFailure, string>> = {
  empty: "must not be empty.",
  "too-long": `must have at most ${LIMITS.nameCodePointsMax} characters.`,
  "whitespace-only": "must not be only spaces.",
};

/**
 * Semantic checks on a shape-valid document, emitted in this fixed order:
 *   1. `title` name rule.
 *   2. `cardOrder`: each entry that is not a `cards` key or repeats an earlier entry (at the
 *      entry), then each `cards` key the order does not list (at `cardOrder`).
 *   3. Card count at `cards` (1 to 20).
 *   4. Each Card in `cards` key order: `id` equals key; `id` unique; `name` rule; `name`
 *      unique; `bitmapBase64` decodes; Widget count (≤ 40); then each Widget in array order:
 *      `id` unique; `name` rule; `name` unique on the Card; `x ≥ 0`; `y ≥ 0`; `width ≥ 1`;
 *      `x + width ≤ 256`; `height ≥ 1`; `y + height ≤ 160`; Button `source` ≤ 8,192 bytes.
 *   5. Canonical_Form size at the root path.
 * Duplicates are reported at the later occurrence with `otherPath` set to the first one.
 * Names are compared exactly (case-sensitive) and only when they pass the name rule; IDs are
 * compared lowercased across all Cards and Widgets (Req 6.6).
 */
function semanticPass(doc: StackDocument): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const push = (d: Diagnostic): void => {
    diagnostics.push(d);
  };

  checkNameRule(doc.title, ["title"], "The stack title", push);

  // 2. cardOrder must be a permutation of the keys of `cards`.
  const cardKeys = Object.keys(doc.cards);
  const keySet = new Set(cardKeys);
  const firstOrderIndex = new Map<string, number>();
  doc.cardOrder.forEach((id, index) => {
    const earlier = firstOrderIndex.get(id);
    if (earlier !== undefined) {
      push({
        code: "card-order",
        path: ["cardOrder", index],
        message: `cardOrder lists the card ${id} more than once.`,
        otherPath: ["cardOrder", earlier],
      });
      return;
    }
    firstOrderIndex.set(id, index);
    if (!keySet.has(id)) {
      push({
        code: "card-order",
        path: ["cardOrder", index],
        message: `cardOrder lists ${id}, which is not a card in this stack.`,
      });
    }
  });
  for (const key of cardKeys) {
    if (!firstOrderIndex.has(key)) {
      push({
        code: "card-order",
        path: ["cardOrder"],
        message: `cardOrder does not list the card ${key}.`,
      });
    }
  }

  // 3. Card count.
  if (cardKeys.length < LIMITS.cardsMin) {
    push({
      code: "cards-empty",
      path: ["cards"],
      message: "A stack needs at least one card.",
      measured: cardKeys.length,
    });
  } else if (cardKeys.length > LIMITS.cardsMax) {
    push({
      code: "card-limit",
      path: ["cards"],
      message: `A stack can have at most ${LIMITS.cardsMax} cards; this one has ${cardKeys.length}.`,
      measured: cardKeys.length,
      max: LIMITS.cardsMax,
    });
  }

  // 4. Cards and Widgets.
  const firstIdPath = new Map<string, Path>();
  const checkUniqueId = (id: string, path: Path): void => {
    const lower = id.toLowerCase();
    const other = firstIdPath.get(lower);
    if (other !== undefined) {
      push({
        code: "id-duplicate",
        path,
        message: `The Stable_ID ${id} is used more than once.`,
        otherPath: other,
      });
    } else {
      firstIdPath.set(lower, path);
    }
  };
  const firstCardNamePath = new Map<string, Path>();

  for (const key of cardKeys) {
    const card = doc.cards[key];
    if (card === undefined) continue;
    const cardPath: Path = ["cards", key];

    if (card.id !== key) {
      push({
        code: "card-id-mismatch",
        path: [...cardPath, "id"],
        message: `The card id ${card.id} differs from its key ${key}.`,
      });
    }
    checkUniqueId(card.id, [...cardPath, "id"]);

    if (checkNameRule(card.name, [...cardPath, "name"], "A card name", push)) {
      checkUniqueName(card.name, [...cardPath, "name"], firstCardNamePath, "card name", push);
    }

    const bitmap = decodeBitmap(card.bitmapBase64);
    if (!bitmap.ok) {
      push({
        code: "bitmap-invalid",
        path: [...cardPath, "bitmapBase64"],
        message: `The card image is invalid: ${bitmap.error}`,
      });
    }

    if (card.widgets.length > LIMITS.widgetsPerCardMax) {
      push({
        code: "widget-limit",
        path: [...cardPath, "widgets"],
        message: `A card can have at most ${LIMITS.widgetsPerCardMax} widgets; this one has ${card.widgets.length}.`,
        measured: card.widgets.length,
        max: LIMITS.widgetsPerCardMax,
      });
    }

    const firstWidgetNamePath = new Map<string, Path>();
    card.widgets.forEach((widget, index) => {
      const widgetPath: Path = [...cardPath, "widgets", index];
      checkUniqueId(widget.id, [...widgetPath, "id"]);
      if (checkNameRule(widget.name, [...widgetPath, "name"], "A widget name", push)) {
        const namePath: Path = [...widgetPath, "name"];
        checkUniqueName(widget.name, namePath, firstWidgetNamePath, "widget name on this card", push);
      }
      checkGeometry(widget, widgetPath, push);
      if (widget.kind === "button") {
        const bytes = utf8ByteLength(widget.source);
        if (bytes > LIMITS.sourceBytesMax) {
          push({
            code: "source-too-large",
            path: [...widgetPath, "source"],
            message: `A button rule can be at most ${LIMITS.sourceBytesMax} bytes; this one is ${bytes}.`,
            measured: bytes,
            max: LIMITS.sourceBytesMax,
          });
        }
      }
    });
  }

  // 5. Canonical_Form size.
  const size = utf8ByteLength(canonicalize(doc));
  if (size > LIMITS.documentBytesMax) {
    push({
      code: "document-too-large",
      path: [],
      message: `A stack can be at most ${LIMITS.documentBytesMax} bytes; this one is ${size}.`,
      measured: size,
      max: LIMITS.documentBytesMax,
    });
  }

  return diagnostics;
}

/** Applies the name rule; returns true when the value passes. */
function checkNameRule(
  value: string,
  path: Path,
  subject: string,
  push: (d: Diagnostic) => void,
): boolean {
  const failure = checkName(value);
  if (failure === null) return true;
  push({ code: NAME_RULE_CODE[failure], path, message: `${subject} ${NAME_RULE_MESSAGE[failure]}` });
  return false;
}

function checkUniqueName(
  name: string,
  path: Path,
  seen: Map<string, Path>,
  subject: string,
  push: (d: Diagnostic) => void,
): void {
  const other = seen.get(name);
  if (other !== undefined) {
    push({
      code: "name-duplicate",
      path,
      message: `The ${subject} ${JSON.stringify(name)} is used more than once.`,
      otherPath: other,
    });
  } else {
    seen.set(name, path);
  }
}

/** Req 6.3 bounds, in schema key order (x, y, width, height). */
function checkGeometry(widget: Widget, widgetPath: Path, push: (d: Diagnostic) => void): void {
  const out = (property: string, message: string): void => {
    push({ code: "geometry-range", path: [...widgetPath, property], message });
  };
  if (widget.x < 0) out("x", "x must be 0 or more.");
  if (widget.y < 0) out("y", "y must be 0 or more.");
  if (widget.width < 1) out("width", "width must be 1 or more.");
  if (widget.x + widget.width > LIMITS.cardWidth) {
    out("width", `x + width must be at most ${LIMITS.cardWidth}; it is ${widget.x + widget.width}.`);
  }
  if (widget.height < 1) out("height", "height must be 1 or more.");
  if (widget.y + widget.height > LIMITS.cardHeight) {
    out("height", `y + height must be at most ${LIMITS.cardHeight}; it is ${widget.y + widget.height}.`);
  }
}
