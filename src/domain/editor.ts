import { createBitmap, decodeBitmap, encodeBitmap } from "./bitmap";
import type { Bitmap } from "./bitmap";
import { ditherPattern } from "./dither";
import type { Id, IdSource } from "./ids";
import { LIMITS, checkName, utf8ByteLength } from "./limits";
import { applyPolyline, fillRegion } from "./raster";
import type { Point } from "./raster";
import { NAME_RULE_CODE, NAME_RULE_MESSAGE, validateStack } from "./schema";
import type { Card, Diagnostic, Path, StackDocument, Widget } from "./schema";

/*
 * Stack_Editor (design: Components and Interfaces → Domain, Data Models → Editor actions).
 *
 * `applyAction` is pure: it never writes to the input document or anything reachable from
 * it, it draws Stable_IDs only from `ctx.newId`, and it calls only the injected ports.
 * The result is exactly one of:
 *   - `noop`: the action changes nothing; the caller keeps its document reference.
 *   - `applied`: a candidate that passes `validateStack` (Req 6.9). Unchanged Cards are
 *     shared with the input by reference (copy-on-write), so documents must be treated as
 *     immutable values.
 *   - `rejected`: diagnostics only; the caller keeps its document and history (Req 6.8).
 */

/**
 * Reference_Index port (decision D9). Reports which Buttons' `source` references the
 * target: the Card itself when `widgetId` is absent, otherwise that Widget. Spec 01 injects
 * `noReferences` from `src/app/ports.ts`; spec 02 supplies the real index.
 */
export type ReferenceIndex = (
  doc: StackDocument,
  target: { cardId: Id; widgetId?: Id },
) => readonly { cardId: Id; widgetId: Id }[];

/** Ports the editor needs. Tests inject a counter `newId` and a stub index. */
export interface EditorContext {
  newId: IdSource;
  references: ReferenceIndex;
}

export type EditAction =
  | { type: "card/add"; afterCardId: Id }
  | { type: "card/rename"; cardId: Id; name: string }
  | { type: "card/move"; cardId: Id; direction: "earlier" | "later" }
  | { type: "card/delete"; cardId: Id }
  | { type: "widget/add"; cardId: Id; kind: "button" | "field" }
  | {
      type: "widget/update";
      cardId: Id;
      widgetId: Id;
      patch: { name?: string; label?: string; text?: string; source?: string };
    }
  | { type: "widget/move"; cardId: Id; widgetId: Id; dx: number; dy: number } // drag total or ±1 nudge; clamped
  | { type: "widget/resize"; cardId: Id; widgetId: Id; dw: number; dh: number } // handle drag or Shift+arrow; clamped
  | {
      type: "widget/setGeometry";
      cardId: Id;
      widgetId: Id;
      field: "x" | "y" | "width" | "height";
      value: number;
    } // numeric; rejected if out of range
  | { type: "widget/delete"; cardId: Id; widgetId: Id }
  | { type: "stroke/commit"; cardId: Id; tool: "pencil" | "eraser"; samples: Point[] }
  | { type: "fill/apply"; cardId: Id; x: number; y: number };

export type EditResult =
  | { kind: "applied"; doc: StackDocument; label: string }
  | { kind: "noop" }
  | { kind: "rejected"; diagnostics: Diagnostic[] };

/** Default stack title (design: Data Models, Defaults). */
export const DEFAULT_TITLE = "Untitled stack";

/** An all-0 Bitmap encoded once; strings are immutable, so every new Card can share it. */
const BLANK_BITMAP_BASE64: string = encodeBitmap(createBitmap());

/** What an action handler produces before the shared noop check and validation. */
type Step =
  | { kind: "candidate"; doc: StackDocument; label: string }
  | { kind: "noop" }
  | { kind: "rejected"; diagnostics: Diagnostic[] };

type Rejected = Extract<Step, { kind: "rejected" }>;

/**
 * Applies one authoring action (design: `applyAction` contract):
 *   1. compute the candidate (new objects only along the changed path);
 *   2. `noop` when the candidate is structurally identical to the input;
 *   3. `rejected` with the diagnostics when `validateStack(candidate)` fails;
 *   4. otherwise `applied` with the candidate.
 * Editor-specific rules (`last-card`, `referenced`, `card-limit`, `widget-limit`, name rules,
 * `source-too-large`, `geometry-range`, non-integer deltas, Stroke samples and fill points,
 * unknown IDs) are checked before a
 * candidate is built, so a rejected action calls `ctx.newId` never. `document-too-large`
 * comes from step 3.
 */
export function applyAction(doc: StackDocument, a: EditAction, ctx: EditorContext): EditResult {
  const step = buildStep(doc, a, ctx);
  if (step.kind !== "candidate") return step;
  if (documentsEqual(doc, step.doc)) return { kind: "noop" };
  const validation = validateStack(step.doc);
  if (!validation.ok) return { kind: "rejected", diagnostics: validation.diagnostics };
  // Return the candidate, not zod's copy, so unchanged Cards stay shared with the input.
  return { kind: "applied", doc: step.doc, label: step.label };
}

function buildStep(doc: StackDocument, a: EditAction, ctx: EditorContext): Step {
  switch (a.type) {
    case "card/add":
      return addCard(doc, a.afterCardId, ctx);
    case "card/rename":
      return renameCard(doc, a.cardId, a.name);
    case "card/move":
      return moveCard(doc, a.cardId, a.direction);
    case "card/delete":
      return deleteCard(doc, a.cardId, ctx);
    case "widget/add":
      return addWidget(doc, a.cardId, a.kind, ctx);
    case "widget/update":
      return updateWidget(doc, a.cardId, a.widgetId, a.patch);
    case "widget/move":
      return moveWidget(doc, a.cardId, a.widgetId, a.dx, a.dy);
    case "widget/resize":
      return resizeWidget(doc, a.cardId, a.widgetId, a.dw, a.dh);
    case "widget/setGeometry":
      return setWidgetGeometry(doc, a.cardId, a.widgetId, a.field, a.value);
    case "widget/delete":
      return deleteWidget(doc, a.cardId, a.widgetId, ctx);
    case "stroke/commit":
      return commitStroke(doc, a.cardId, a.tool, a.samples);
    case "fill/apply":
      return applyFill(doc, a.cardId, a.x, a.y);
    default:
      return unknownAction(a);
  }
}

/**
 * Exhaustiveness guard: a new `EditAction` member without a case fails typecheck here. At
 * run time an untyped caller can still pass an unknown `type`; it is rejected as
 * `invalid-value` at the action path `["type"]` instead of throwing (D-B).
 */
function unknownAction(a: never): Step {
  const type: unknown = (a as { type?: unknown } | null)?.type;
  const shown = typeof type === "string" ? JSON.stringify(type) : String(type);
  return reject({ code: "invalid-value", path: ["type"], message: `Unknown edit action ${shown}.` });
}

function reject(d: Diagnostic): Rejected {
  return { kind: "rejected", diagnostics: [d] };
}

// ---------------------------------------------------------------------------------------
// Card actions (Req 7.1–7.8, 7.10–7.12)
// ---------------------------------------------------------------------------------------

/** Position of a Card that is both an own key of `cards` and listed in `cardOrder`. */
function findCard(doc: StackDocument, cardId: Id): { card: Card; index: number } | null {
  if (!Object.hasOwn(doc.cards, cardId)) return null;
  const card = doc.cards[cardId];
  const index = doc.cardOrder.indexOf(cardId);
  if (card === undefined || index < 0) return null;
  return { card, index };
}

function cardNotFound(cardId: Id): Rejected {
  return reject({
    code: "card-not-found",
    path: ["cards", cardId],
    message: "That card is not in this stack.",
  });
}

/** "Card N" with the smallest positive N that no Card in the stack is named (Req 7.1). */
export function defaultCardName(doc: StackDocument): string {
  const taken = new Set<string>();
  for (const key of Object.keys(doc.cards)) {
    const card = doc.cards[key];
    if (card !== undefined) taken.add(card.name);
  }
  // At most `taken.size` names are taken, so N ≤ taken.size + 1 ends the loop.
  for (let n = 1; ; n += 1) {
    const name = `Card ${n}`;
    if (!taken.has(name)) return name;
  }
}

function blankCard(id: Id, name: string): Card {
  return {
    id,
    name,
    width: LIMITS.cardWidth,
    height: LIMITS.cardHeight,
    bitmapBase64: BLANK_BITMAP_BASE64,
    widgets: [],
  };
}

/** Req 7.1, 7.7: inserts a blank "Card N" right after `afterCardId`. */
function addCard(doc: StackDocument, afterCardId: Id, ctx: EditorContext): Step {
  const after = findCard(doc, afterCardId);
  if (after === null) return cardNotFound(afterCardId);

  const count = Object.keys(doc.cards).length;
  if (count >= LIMITS.cardsMax) {
    return reject({
      code: "card-limit",
      path: ["cards"],
      message: `A stack can have at most ${LIMITS.cardsMax} cards.`,
      measured: count + 1,
      max: LIMITS.cardsMax,
    });
  }

  const id = ctx.newId();
  const card = blankCard(id, defaultCardName(doc));
  const cardOrder = [...doc.cardOrder];
  cardOrder.splice(after.index + 1, 0, id);
  // Spread defines own data properties, so no key is ever treated as a prototype setter.
  // A colliding `id` replaces nothing silently: validateStack then reports the duplicate.
  const cards = { ...doc.cards, [id]: card };
  return { kind: "candidate", doc: { ...doc, cardOrder, cards }, label: "Add card" };
}

/** Req 7.2, 7.10: changes only the Card's name; the name is stored exactly as given. */
function renameCard(doc: StackDocument, cardId: Id, name: string): Step {
  const found = findCard(doc, cardId);
  if (found === null) return cardNotFound(cardId);
  const path = ["cards", cardId, "name"];

  const failure = checkName(name);
  if (failure !== null) {
    return reject({
      code: NAME_RULE_CODE[failure],
      path,
      message: `A card name ${NAME_RULE_MESSAGE[failure]}`,
    });
  }
  for (const key of Object.keys(doc.cards)) {
    if (key === cardId) continue;
    if (doc.cards[key]?.name === name) {
      return reject({
        code: "name-duplicate",
        path,
        message: `Another card is already named ${JSON.stringify(name)}.`,
        otherPath: ["cards", key, "name"],
      });
    }
  }

  const cards = { ...doc.cards, [cardId]: { ...found.card, name } };
  return { kind: "candidate", doc: { ...doc, cards }, label: "Rename card" };
}

/** Req 7.3, 7.11: swaps with the neighbour; the first Card earlier or the last later is a noop. */
function moveCard(doc: StackDocument, cardId: Id, direction: "earlier" | "later"): Step {
  const found = findCard(doc, cardId);
  if (found === null) return cardNotFound(cardId);

  const target = direction === "earlier" ? found.index - 1 : found.index + 1;
  const neighbour = doc.cardOrder[target];
  if (target < 0 || neighbour === undefined) return { kind: "noop" };

  const cardOrder = [...doc.cardOrder];
  cardOrder[target] = cardId;
  cardOrder[found.index] = neighbour;
  const label = direction === "earlier" ? "Move card earlier" : "Move card later";
  return { kind: "candidate", doc: { ...doc, cardOrder }, label };
}

/**
 * Req 7.4–7.6: removes the Card and its Widgets unless it is the only Card or the
 * Reference_Index reports a reference to the Card or to any Widget on it.
 */
function deleteCard(doc: StackDocument, cardId: Id, ctx: EditorContext): Step {
  const found = findCard(doc, cardId);
  if (found === null) return cardNotFound(cardId);

  if (Object.keys(doc.cards).length <= LIMITS.cardsMin) {
    return reject({
      code: "last-card",
      path: ["cards", cardId],
      message: "A stack needs at least one card.",
    });
  }

  const references = cardReferences(doc, found.card, ctx.references);
  if (references.length > 0) {
    return reject({
      code: "referenced",
      path: ["cards", cardId],
      message:
        references.length === 1
          ? "This card can't be deleted: 1 button refers to it or to its widgets."
          : `This card can't be deleted: ${references.length} buttons refer to it or to its widgets.`,
      references,
    });
  }

  const cardOrder = doc.cardOrder.filter((id) => id !== cardId);
  const cards = Object.fromEntries(Object.entries(doc.cards).filter(([key]) => key !== cardId));
  return { kind: "candidate", doc: { ...doc, cardOrder, cards }, label: "Delete card" };
}

/**
 * Every Button that references the Card or one of its Widgets (Req 7.6, decision D-C):
 * the Card query first, then one query per Widget in array order. Each pair is listed once,
 * at its first position, so the list keeps Reference_Index order. Fresh objects are
 * returned, so the diagnostic never aliases the port's output.
 */
function cardReferences(
  doc: StackDocument,
  card: Card,
  index: ReferenceIndex,
): { cardId: Id; widgetId: Id }[] {
  const out: { cardId: Id; widgetId: Id }[] = [];
  const seen = new Set<string>();
  const collect = (found: readonly { cardId: Id; widgetId: Id }[]): void => {
    for (const ref of found) {
      const key = `${ref.cardId}\u0000${ref.widgetId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ cardId: ref.cardId, widgetId: ref.widgetId });
    }
  };
  collect(index(doc, { cardId: card.id }));
  for (const widget of card.widgets) collect(index(doc, { cardId: card.id, widgetId: widget.id }));
  return out;
}

/**
 * The current Card after `deletedId` is removed (Req 7.12): unchanged when another Card was
 * current; otherwise the Card that followed it in `cardOrderBefore`, else the one before
 * it. Returns `currentId` when `deletedId` is not listed or no other Card exists.
 */
export function currentCardAfterDelete(
  cardOrderBefore: readonly Id[],
  deletedId: Id,
  currentId: Id,
): Id {
  if (currentId !== deletedId) return currentId;
  const index = cardOrderBefore.indexOf(deletedId);
  if (index < 0) return currentId;
  return cardOrderBefore[index + 1] ?? cardOrderBefore[index - 1] ?? currentId;
}

// ---------------------------------------------------------------------------------------
// Widget actions (Req 6.8, 12.1–12.9, 13.1–13.5, 13.8, 13.9)
// ---------------------------------------------------------------------------------------

/** Defaults for a new Widget (design: Data Models, Defaults table). `name` is "Button N" / "Field N". */
export const WIDGET_DEFAULTS = {
  button: { label: "Button", source: "", x: 8, y: 8, width: 64, height: 16 },
  field: { text: "", x: 8, y: 32, width: 120, height: 24 },
} as const;

type GeometryField = "x" | "y" | "width" | "height";

interface FoundWidget {
  kind: "found";
  card: Card;
  widget: Widget;
  index: number;
}

/**
 * The Card (as `findCard`) and the Widget whose `id` equals `widgetId` exactly, or the
 * rejection: `card-not-found`, else `widget-not-found` at the Card's `widgets`.
 */
function findWidget(doc: StackDocument, cardId: Id, widgetId: Id): FoundWidget | Rejected {
  const found = findCard(doc, cardId);
  if (found === null) return cardNotFound(cardId);
  const index = found.card.widgets.findIndex((w) => w.id === widgetId);
  const widget = found.card.widgets[index];
  if (index < 0 || widget === undefined) {
    return reject({
      code: "widget-not-found",
      path: ["cards", cardId, "widgets"],
      message: "That widget is not on this card.",
    });
  }
  return { kind: "found", card: found.card, widget, index };
}

function widgetPath(cardId: Id, index: number): Path {
  return ["cards", cardId, "widgets", index];
}

/** Copy-on-write along `cards → card → widgets`: every other Card and Widget is shared. */
function withWidgets(doc: StackDocument, cardId: Id, card: Card, widgets: Widget[], label: string): Step {
  const cards = { ...doc.cards, [cardId]: { ...card, widgets } };
  return { kind: "candidate", doc: { ...doc, cards }, label };
}

function withWidget(doc: StackDocument, cardId: Id, found: FoundWidget, next: Widget, label: string): Step {
  const widgets = [...found.card.widgets];
  widgets[found.index] = next;
  return withWidgets(doc, cardId, found.card, widgets, label);
}

/** "Button N" or "Field N" with the smallest positive N no Widget on `card` is named (Req 12.1). */
export function defaultWidgetName(card: Card, kind: "button" | "field"): string {
  const prefix = kind === "button" ? "Button" : "Field";
  const taken = new Set(card.widgets.map((w) => w.name));
  // At most `taken.size` names are taken, so N ≤ taken.size + 1 ends the loop.
  for (let n = 1; ; n += 1) {
    const name = `${prefix} ${n}`;
    if (!taken.has(name)) return name;
  }
}

/** Req 12.1, 12.2, 12.6: appends a default Button or Field (last in paint and Tab order). */
function addWidget(doc: StackDocument, cardId: Id, kind: "button" | "field", ctx: EditorContext): Step {
  const found = findCard(doc, cardId);
  if (found === null) return cardNotFound(cardId);

  const count = found.card.widgets.length;
  if (count >= LIMITS.widgetsPerCardMax) {
    return reject({
      code: "widget-limit",
      path: ["cards", cardId, "widgets"],
      message: `A card can have at most ${LIMITS.widgetsPerCardMax} widgets.`,
      measured: count + 1,
      max: LIMITS.widgetsPerCardMax,
    });
  }

  const id = ctx.newId();
  const name = defaultWidgetName(found.card, kind);
  let widget: Widget;
  if (kind === "button") {
    const d = WIDGET_DEFAULTS.button;
    widget = { id, name, kind, x: d.x, y: d.y, width: d.width, height: d.height, label: d.label, source: d.source };
  } else {
    const d = WIDGET_DEFAULTS.field;
    widget = { id, name, kind, x: d.x, y: d.y, width: d.width, height: d.height, text: d.text };
  }
  const label = kind === "button" ? "Add button" : "Add field";
  return withWidgets(doc, cardId, found.card, [...found.card.widgets, widget], label);
}

/**
 * Req 12.3–12.5, 12.7–12.9: sets the patched values exactly as given (no trimming, escaping
 * or normalisation). Absent (`undefined`) patch entries keep the stored value. A `label` or
 * `source` on a Field, or `text` on a Button, is rejected as `unknown-property`. Every editor
 * rule failure is reported, in schema key order; `document-too-large` comes from
 * `validateStack`.
 */
function updateWidget(
  doc: StackDocument,
  cardId: Id,
  widgetId: Id,
  patch: { name?: string; label?: string; text?: string; source?: string },
): Step {
  const found = findWidget(doc, cardId, widgetId);
  if (found.kind === "rejected") return found;
  const { card, widget, index } = found;
  const base = widgetPath(cardId, index);
  const diagnostics: Diagnostic[] = [];

  if (patch.name !== undefined) {
    const name = patch.name;
    const failure = checkName(name);
    if (failure !== null) {
      diagnostics.push({
        code: NAME_RULE_CODE[failure],
        path: [...base, "name"],
        message: `A widget name ${NAME_RULE_MESSAGE[failure]}`,
      });
    } else {
      const other = card.widgets.findIndex((w, i) => i !== index && w.name === name);
      if (other >= 0) {
        diagnostics.push({
          code: "name-duplicate",
          path: [...base, "name"],
          message: `Another widget on this card is already named ${JSON.stringify(name)}.`,
          otherPath: [...widgetPath(cardId, other), "name"],
        });
      }
    }
  }

  const notApplicable = (property: string, message: string): void => {
    diagnostics.push({ code: "unknown-property", path: [...base, property], message });
  };
  if (widget.kind === "button") {
    if (patch.text !== undefined) notApplicable("text", "A button has no text; edit its label instead.");
    if (patch.source !== undefined) {
      const bytes = utf8ByteLength(patch.source);
      if (bytes > LIMITS.sourceBytesMax) {
        diagnostics.push({
          code: "source-too-large",
          path: [...base, "source"],
          message: `A button rule can be at most ${LIMITS.sourceBytesMax} bytes; this one is ${bytes}.`,
          measured: bytes,
          max: LIMITS.sourceBytesMax,
        });
      }
    }
  } else {
    if (patch.label !== undefined) notApplicable("label", "A field has no label; edit its text instead.");
    if (patch.source !== undefined) notApplicable("source", "A field has no rule; only buttons do.");
  }
  if (diagnostics.length > 0) return { kind: "rejected", diagnostics };

  const name = patch.name ?? widget.name;
  const next: Widget =
    widget.kind === "button"
      ? { ...widget, name, label: patch.label ?? widget.label, source: patch.source ?? widget.source }
      : { ...widget, name, text: patch.text ?? widget.text };
  return withWidget(doc, cardId, found, next, updateLabel(patch));
}

function updateLabel(patch: { name?: string; label?: string; text?: string; source?: string }): string {
  const set = (["name", "label", "text", "source"] as const).filter((k) => patch[k] !== undefined);
  if (set.length !== 1) return "Edit widget";
  switch (set[0]) {
    case "name":
      return "Rename widget";
    case "label":
      return "Edit button label";
    case "text":
      return "Edit field text";
    default:
      return "Edit button rule";
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Deltas come from the Pointer_Mapper or a ±1 key press, so they are integers. A non-integer
 * or non-finite delta is rejected as `invalid-value` at the geometry property it would change
 * (D-B: an expected failure returns a diagnostic, never a throw).
 */
function checkDeltas(
  base: Path,
  deltas: readonly { property: GeometryField; value: number; what: string }[],
): Rejected | null {
  const diagnostics: Diagnostic[] = [];
  for (const { property, value, what } of deltas) {
    if (!Number.isInteger(value)) {
      diagnostics.push({
        code: "invalid-value",
        path: [...base, property],
        message: `The ${what} must be a whole number of pixels.`,
      });
    }
  }
  return diagnostics.length > 0 ? { kind: "rejected", diagnostics } : null;
}

/** Req 13.1, 13.2, 13.5: moves by (dx, dy) clamped inside the Card; size unchanged; zero change is a noop. */
function moveWidget(doc: StackDocument, cardId: Id, widgetId: Id, dx: number, dy: number): Step {
  const found = findWidget(doc, cardId, widgetId);
  if (found.kind === "rejected") return found;
  const { widget } = found;
  const invalid = checkDeltas(widgetPath(cardId, found.index), [
    { property: "x", value: dx, what: "horizontal move" },
    { property: "y", value: dy, what: "vertical move" },
  ]);
  if (invalid !== null) return invalid;

  const x = clamp(widget.x + dx, 0, LIMITS.cardWidth - widget.width);
  const y = clamp(widget.y + dy, 0, LIMITS.cardHeight - widget.height);
  if (x === widget.x && y === widget.y) return { kind: "noop" };
  return withWidget(doc, cardId, found, { ...widget, x, y }, "Move widget");
}

/** Req 13.5, 13.8, 13.9: resizes by (dw, dh) clamped to 1…256 − x and 1…160 − y; position unchanged. */
function resizeWidget(doc: StackDocument, cardId: Id, widgetId: Id, dw: number, dh: number): Step {
  const found = findWidget(doc, cardId, widgetId);
  if (found.kind === "rejected") return found;
  const { widget } = found;
  const invalid = checkDeltas(widgetPath(cardId, found.index), [
    { property: "width", value: dw, what: "width change" },
    { property: "height", value: dh, what: "height change" },
  ]);
  if (invalid !== null) return invalid;

  const width = clamp(widget.width + dw, 1, LIMITS.cardWidth - widget.x);
  const height = clamp(widget.height + dh, 1, LIMITS.cardHeight - widget.y);
  if (width === widget.width && height === widget.height) return { kind: "noop" };
  return withWidget(doc, cardId, found, { ...widget, width, height }, "Resize widget");
}

/** Valid range of one geometry value given the Widget's other current values (Req 13.4). */
function geometryRange(widget: Widget, field: GeometryField): { min: number; max: number } {
  switch (field) {
    case "x":
      return { min: 0, max: LIMITS.cardWidth - widget.width };
    case "y":
      return { min: 0, max: LIMITS.cardHeight - widget.height };
    case "width":
      return { min: 1, max: LIMITS.cardWidth - widget.x };
    case "height":
      return { min: 1, max: LIMITS.cardHeight - widget.y };
  }
}

/**
 * Req 13.3–13.5: sets one geometry value exactly, without clamping. A non-integer,
 * non-finite or out-of-range value is rejected with `geometry-range` at that property; the
 * message names the field and its range. Setting the current value is a noop.
 */
function setWidgetGeometry(
  doc: StackDocument,
  cardId: Id,
  widgetId: Id,
  field: GeometryField,
  value: number,
): Step {
  const found = findWidget(doc, cardId, widgetId);
  if (found.kind === "rejected") return found;
  const { widget } = found;
  const { min, max } = geometryRange(widget, field);
  if (!Number.isInteger(value) || value < min || value > max) {
    return reject({
      code: "geometry-range",
      path: [...widgetPath(cardId, found.index), field],
      message: `${field} must be a whole number from ${min} to ${max}.`,
    });
  }
  // -0 passes the checks above; store +0 so the document holds no negative zero.
  const exact = value === 0 ? 0 : value;
  return withWidget(doc, cardId, found, { ...widget, [field]: exact }, `Set widget ${field}`);
}

/**
 * Req 6.8 with D9 and D-C: removes the Widget unless the Reference_Index reports a Button
 * whose source references it. One `referenced` diagnostic lists each reference once, in
 * index order, as fresh objects.
 */
function deleteWidget(doc: StackDocument, cardId: Id, widgetId: Id, ctx: EditorContext): Step {
  const found = findWidget(doc, cardId, widgetId);
  if (found.kind === "rejected") return found;

  const references: { cardId: Id; widgetId: Id }[] = [];
  const seen = new Set<string>();
  for (const ref of ctx.references(doc, { cardId, widgetId })) {
    const key = `${ref.cardId}\u0000${ref.widgetId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    references.push({ cardId: ref.cardId, widgetId: ref.widgetId });
  }
  if (references.length > 0) {
    return reject({
      code: "referenced",
      path: widgetPath(cardId, found.index),
      message:
        references.length === 1
          ? "This widget can't be deleted: 1 button refers to it."
          : `This widget can't be deleted: ${references.length} buttons refer to it.`,
      references,
    });
  }

  const widgets = found.card.widgets.filter((_, i) => i !== found.index);
  return withWidgets(doc, cardId, found.card, widgets, "Delete widget");
}

// ---------------------------------------------------------------------------------------
// Bitmap actions (Req 9.1–9.5, 9.8, 9.10, 10.1–10.3, 10.5, 10.7)
// ---------------------------------------------------------------------------------------

/** Largest |coordinate| a Stroke sample may have (design: Line rasterizer, D-B). ±4,096 is accepted. */
export const STROKE_COORD_MAX = 4_096;

/**
 * The Card's bitmap decoded into a fresh array the caller owns (D-A), or `bitmap-invalid`.
 * A document that passed `validateStack` always decodes; the guard keeps the editor
 * throw-free for any other input (D-B).
 */
function decodeCardBitmap(cardId: Id, card: Card): Bitmap | Rejected {
  const decoded = decodeBitmap(card.bitmapBase64);
  if (decoded.ok) return decoded.value;
  return reject({
    code: "bitmap-invalid",
    path: ["cards", cardId, "bitmapBase64"],
    message: `This card's picture can't be read: ${decoded.error}.`,
  });
}

function withBitmap(doc: StackDocument, cardId: Id, card: Card, bitmapBase64: string, label: string): Step {
  const cards = { ...doc.cards, [cardId]: { ...card, bitmapBase64 } };
  return { kind: "candidate", doc: { ...doc, cards }, label };
}

/**
 * D-B: the first sample coordinate that is not an integer within ±4,096 (NaN and ±Infinity
 * included), as one `invalid-value` diagnostic at the action path `["samples", k, "x" | "y"]`.
 * An empty or non-array list is rejected at `["samples"]`: a Stroke always has a first sample
 * (Req 9.8, Property 10). Only the first bad coordinate is reported, so a long Stroke gives
 * one diagnostic.
 */
function checkSamples(samples: unknown): Rejected | null {
  if (!Array.isArray(samples) || samples.length === 0) {
    return reject({ code: "invalid-value", path: ["samples"], message: "A stroke needs at least one point." });
  }
  for (let k = 0; k < samples.length; k += 1) {
    const s: unknown = samples[k];
    if (typeof s !== "object" || s === null) {
      return reject({ code: "invalid-value", path: ["samples", k], message: "Each stroke point needs an x and a y." });
    }
    const p = s as { x?: unknown; y?: unknown };
    for (const axis of ["x", "y"] as const) {
      const v = p[axis];
      if (typeof v !== "number" || !Number.isInteger(v) || Math.abs(v) > STROKE_COORD_MAX) {
        return reject({
          code: "invalid-value",
          path: ["samples", k, axis],
          message: `Stroke point ${axis} must be a whole number from -${STROKE_COORD_MAX} to ${STROKE_COORD_MAX}.`,
        });
      }
    }
  }
  return null;
}

/**
 * Req 9.1–9.4, 9.8, 9.10: rasterises the samples onto the Card's decoded bitmap with 1
 * (Pencil) or 0 (Eraser). Samples are validated before any raster call (D-B), and only the
 * fresh decoded array is written in place (D-A). The bitmap text is canonical, so equal
 * encoded text means no pixel changed: `noop`. Labels "Draw" / "Erase".
 */
function commitStroke(
  doc: StackDocument,
  cardId: Id,
  tool: "pencil" | "eraser",
  samples: readonly Point[],
): Step {
  const found = findCard(doc, cardId);
  if (found === null) return cardNotFound(cardId);
  const invalid = checkSamples(samples);
  if (invalid !== null) return invalid;
  const bitmap = decodeCardBitmap(cardId, found.card);
  if (!(bitmap instanceof Uint8Array)) return bitmap;

  const bitmapBase64 = encodeBitmap(applyPolyline(bitmap, samples, tool === "pencil" ? 1 : 0));
  if (bitmapBase64 === found.card.bitmapBase64) return { kind: "noop" };
  return withBitmap(doc, cardId, found.card, bitmapBase64, tool === "pencil" ? "Draw" : "Erase");
}

/**
 * Req 10.1–10.3, 10.5, 10.7: sets every pixel of the 4-connected region of (x, y), computed
 * on the current bitmap, to `ditherPattern(px, py)`; pixels outside the region are not
 * touched. A non-integer or non-finite x or y is rejected as `invalid-value` at the action
 * path `["x"]` or `["y"]` (D-B). A tap outside 0–255 × 0–159 (any integer, so `fillRegion`
 * never sees an unsafe one) or a region already equal to the pattern is a `noop`.
 * Writes go into the one decoded array; no per-pixel objects. Label "Dither fill".
 */
function applyFill(doc: StackDocument, cardId: Id, x: number, y: number): Step {
  const found = findCard(doc, cardId);
  if (found === null) return cardNotFound(cardId);
  for (const [axis, v] of [["x", x], ["y", y]] as const) {
    if (typeof v !== "number" || !Number.isInteger(v)) {
      return reject({
        code: "invalid-value",
        path: [axis],
        message: `The fill point ${axis} must be a whole number of pixels.`,
      });
    }
  }
  if (x < 0 || x >= LIMITS.cardWidth || y < 0 || y >= LIMITS.cardHeight) return { kind: "noop" };
  const bitmap = decodeCardBitmap(cardId, found.card);
  if (!(bitmap instanceof Uint8Array)) return bitmap;

  // The whole region is read before the first write, so writes cannot change it.
  const region = fillRegion(bitmap, { x, y });
  const width = LIMITS.cardWidth;
  let changed = false;
  for (let k = 0; k < region.length; k += 1) {
    const i = region[k] ?? 0;
    const byteIndex = i >> 3;
    const shift = 7 - (i & 7);
    const byte = bitmap[byteIndex] ?? 0;
    const want = ditherPattern(i % width, Math.floor(i / width));
    if (((byte >> shift) & 1) === want) continue;
    bitmap[byteIndex] = byte ^ (1 << shift);
    changed = true;
  }
  if (!changed) return { kind: "noop" };
  return withBitmap(doc, cardId, found.card, encodeBitmap(bitmap), "Dither fill");
}

// ---------------------------------------------------------------------------------------
// Factories (Req 5.5, 5.6, 22.3)
// ---------------------------------------------------------------------------------------

/**
 * A new stack (Req 5.5, 5.6): schemaVersion 1, title "Untitled stack", one blank "Card 1"
 * with no Widgets. Draws the stack ID first, then the Card ID.
 */
export function createBlankStack(ctx: EditorContext): StackDocument {
  const id = ctx.newId();
  const cardId = ctx.newId();
  return {
    format: "necrocard",
    schemaVersion: 1,
    id,
    title: DEFAULT_TITLE,
    cardOrder: [cardId],
    cards: { [cardId]: blankCard(cardId, "Card 1") },
  };
}

/**
 * A Fork (Property 24): a copy with a fresh stack ID that keeps every Card and Widget ID.
 * Every object and array is new (strings are shared, being immutable), so no later change
 * to either document can reach the other.
 */
export function forkStack(doc: StackDocument, ctx: EditorContext): StackDocument {
  const cards = Object.fromEntries(
    Object.entries(doc.cards).map(([key, card]) => [
      key,
      { ...card, widgets: card.widgets.map((w) => ({ ...w })) },
    ]),
  );
  return { ...doc, id: ctx.newId(), cardOrder: [...doc.cardOrder], cards };
}

// ---------------------------------------------------------------------------------------
// Structural equality for the noop check
// ---------------------------------------------------------------------------------------

/**
 * True when two documents have the same meaning: same values, same array order, same set of
 * object keys in any order (the `cards` key order is not part of Canonical_Form). Shared
 * subtrees are skipped by reference.
 */
export function documentsEqual(a: StackDocument, b: StackDocument): boolean {
  return jsonEqual(a, b);
}

function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) if (!jsonEqual(a[i], b[i])) return false;
    return true;
  }
  if (Array.isArray(b)) return false;
  const ra = a as Readonly<Record<string, unknown>>;
  const rb = b as Readonly<Record<string, unknown>>;
  const keys = Object.keys(ra);
  if (keys.length !== Object.keys(rb).length) return false;
  for (const key of keys) {
    if (!Object.hasOwn(rb, key) || !jsonEqual(ra[key], rb[key])) return false;
  }
  return true;
}
