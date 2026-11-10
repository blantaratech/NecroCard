import type { Card, StackDocument, Widget } from "./schema";

/*
 * Canonical_Form (design: Algorithms, Canonical_Form; D5; Req 20.1, 20.7).
 *
 * Invariant: the output depends only on document meaning. Every object is rebuilt from an
 * explicit key order (the schema order), so the key insertion order of the input never
 * changes the bytes. `cards` keys are sorted by UTF-16 code units (default `sort` with no
 * comparator, not `localeCompare`), independent of `cardOrder`. `cardOrder` and `widgets`
 * keep their array order. The input is never mutated.
 *
 * Output: `JSON.stringify` with a 2-space indent (LF line breaks), one trailing `\n`, no BOM.
 * Exporter bytes are exactly the UTF-8 encoding of this string (Req 20.1, 20.8).
 */
export function canonicalize(doc: StackDocument): string {
  // Card IDs are 8-4-4-4-12 hex text with hyphens, so they are never integer-like keys and
  // JavaScript keeps their insertion (sorted) order. A null prototype means a key can never
  // reach `Object.prototype` through assignment.
  const cards: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const id of Object.keys(doc.cards).sort()) {
    const card = doc.cards[id];
    if (card !== undefined) cards[id] = orderCard(card);
  }

  const out = {
    format: doc.format,
    schemaVersion: doc.schemaVersion,
    id: doc.id,
    title: doc.title,
    cardOrder: [...doc.cardOrder],
    cards,
  };
  return JSON.stringify(out, null, 2) + "\n";
}

function orderCard(card: Card): Record<string, unknown> {
  return {
    id: card.id,
    name: card.name,
    width: card.width,
    height: card.height,
    bitmapBase64: card.bitmapBase64,
    widgets: card.widgets.map(orderWidget),
  };
}

function orderWidget(widget: Widget): Record<string, unknown> {
  if (widget.kind === "button") {
    return {
      id: widget.id,
      name: widget.name,
      kind: widget.kind,
      x: widget.x,
      y: widget.y,
      width: widget.width,
      height: widget.height,
      label: widget.label,
      source: widget.source,
    };
  }
  return {
    id: widget.id,
    name: widget.name,
    kind: widget.kind,
    x: widget.x,
    y: widget.y,
    width: widget.width,
    height: widget.height,
    text: widget.text,
  };
}
