import { Buffer } from "node:buffer";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  applyAction,
  currentCardAfterDelete,
  type EditAction,
  type EditorContext,
  type EditResult,
  type ReferenceIndex,
} from "../../src/domain/editor";
import type { Id } from "../../src/domain/ids";
import type { Card, Diagnostic, StackDocument } from "../../src/domain/schema";
import { counterIdSource, nameArb, stackDocumentArb } from "./arbitraries";
import { fcOptions } from "./fc-options";

/*
 * Property 1 (blueprint P1): card authoring invariants (Req 7.1–7.8, 7.10–7.12).
 *
 * Oracle: an array/record model of the stack (`order`, expected Card objects, current
 * Card) written here. Each generated step runs `applyAction` on the session document and
 * the model predicts the result kind, the diagnostic and the next document. The session
 * keeps its document on `noop` and `rejected`, as the reducer does.
 *
 * Constants are written here as an independent oracle, not read from LIMITS.
 */
const CARDS_MIN = 1;
const CARDS_MAX = 20;
const NAME_CODE_POINTS_MAX = 64;
const CARD_WIDTH = 256;
const CARD_HEIGHT = 160;
/** All-0 Bitmap: 5,120 zero bytes in standard padded base64 (Node's encoder, not the codec). */
const PAPER_BASE64 = Buffer.alloc(5_120).toString("base64");

/** Namespaces for the editor's new IDs, synthetic references and the unknown Card ID. */
const NEW_ID_NAMESPACE = 0x0c0f_fee0;
const REF_NAMESPACE = 0x0bad_f00d;
const UNKNOWN_NAMESPACE = 0xdead_0001;

/** The first IDs the editor's `newId` will return, so the index can reference new Cards. */
const PREDICTED_NEW_IDS: readonly Id[] = (() => {
  const source = counterIdSource({ namespace: NEW_ID_NAMESPACE });
  return Array.from({ length: 6 }, () => source());
})();

/** Button pairs used when the document has no Button (the stub may report any pair). */
const SYNTHETIC_REFS: readonly { cardId: Id; widgetId: Id }[] = (() => {
  const source = counterIdSource({ namespace: REF_NAMESPACE });
  return Array.from({ length: 3 }, () => ({ cardId: source(), widgetId: source() }));
})();

const UNKNOWN_ID: Id = counterIdSource({ namespace: UNKNOWN_NAMESPACE })();

// ---------------------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------------------

/** Keeps the first `keep` Cards of `cardOrder` and their `cards` entries (still valid). */
function keepFirstCards(doc: StackDocument, keep: number): StackDocument {
  if (keep >= doc.cardOrder.length) return doc;
  const cardOrder = doc.cardOrder.slice(0, keep);
  const kept = new Set(cardOrder);
  const cards = Object.fromEntries(Object.entries(doc.cards).filter(([key]) => kept.has(key)));
  return { ...doc, cardOrder, cards };
}

/*
 * Speed: every applied action re-validates the whole document (task 7.1 measured 7.8 s for
 * 60 documents). Three in four documents are cut to their first 1–3 Cards; the rest are
 * full `stackDocumentArb` documents, which include exactly 1 and exactly 20 Cards.
 */
const docArb: fc.Arbitrary<StackDocument> = fc.oneof(
  {
    weight: 3,
    arbitrary: fc
      .tuple(stackDocumentArb, fc.integer({ min: 1, max: 3 }))
      .map(([doc, keep]) => keepFirstCards(doc, keep)),
  },
  { weight: 1, arbitrary: stackDocumentArb },
);

// ---------------------------------------------------------------------------------------
// Reference_Index stub
// ---------------------------------------------------------------------------------------

type TargetPick =
  | { kind: "card"; n: number } // a Card of the initial document
  | { kind: "widget"; n: number; m: number } // one of its Widgets (the Card if it has none)
  | { kind: "new"; k: number }; // the k-th Card the editor will add

/** One reported target and the Buttons (picked from a pool) that reference it. */
interface IndexEntry {
  target: TargetPick;
  refs: number[];
}

const targetArb: fc.Arbitrary<TargetPick> = fc.oneof(
  fc.record({ kind: fc.constant("card" as const), n: fc.nat({ max: 63 }) }),
  fc.record({ kind: fc.constant("widget" as const), n: fc.nat({ max: 63 }), m: fc.nat({ max: 63 }) }),
  fc.record({ kind: fc.constant("new" as const), k: fc.nat({ max: PREDICTED_NEW_IDS.length - 1 }) }),
);

/** Mostly a few entries, often empty; small ref picks make repeated pairs common. */
const indexArb: fc.Arbitrary<IndexEntry[]> = fc.oneof(
  { weight: 1, arbitrary: fc.constant<IndexEntry[]>([]) },
  {
    weight: 3,
    arbitrary: fc.array(
      fc.record({ target: targetArb, refs: fc.array(fc.nat({ max: 7 }), { minLength: 1, maxLength: 3 }) }),
      { maxLength: 6 },
    ),
  },
);

type RefTable = ReadonlyMap<string, readonly { cardId: Id; widgetId: Id }[]>;

function targetKey(cardId: Id, widgetId?: Id): string {
  return `${cardId}\u0000${widgetId ?? ""}`;
}

/**
 * Resolves the entries against the initial document into a deterministic table. Entries
 * with the same target are concatenated, so one query can report a pair twice.
 */
function buildRefTable(doc: StackDocument, entries: readonly IndexEntry[]): RefTable {
  const order = doc.cardOrder;
  const buttons: { cardId: Id; widgetId: Id }[] = [];
  for (const id of order) {
    for (const w of doc.cards[id]?.widgets ?? []) {
      if (w.kind === "button") buttons.push({ cardId: id, widgetId: w.id });
    }
  }
  const pool = buttons.length > 0 ? buttons : SYNTHETIC_REFS;
  const table = new Map<string, { cardId: Id; widgetId: Id }[]>();
  for (const { target, refs } of entries) {
    let key: string;
    if (target.kind === "new") {
      key = targetKey(PREDICTED_NEW_IDS[target.k] as Id);
    } else {
      const cardId = order[target.n % order.length] as Id;
      const widgets = doc.cards[cardId]?.widgets ?? [];
      const widget = target.kind === "widget" && widgets.length > 0 ? widgets[target.m % widgets.length] : undefined;
      key = targetKey(cardId, widget?.id);
    }
    const list = table.get(key) ?? [];
    for (const r of refs) list.push(pool[r % pool.length] as { cardId: Id; widgetId: Id });
    table.set(key, list);
  }
  return table;
}

/** Card query first, then each Widget query in array order; each pair once (decision D-C). */
function expectedReferences(table: RefTable, card: Card): { cardId: Id; widgetId: Id }[] {
  const out: { cardId: Id; widgetId: Id }[] = [];
  const seen = new Set<string>();
  const keys = [targetKey(card.id), ...card.widgets.map((w) => targetKey(card.id, w.id))];
  for (const key of keys) {
    for (const ref of table.get(key) ?? []) {
      const pair = `${ref.cardId}\u0000${ref.widgetId}`;
      if (seen.has(pair)) continue;
      seen.add(pair);
      out.push({ cardId: ref.cardId, widgetId: ref.widgetId });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------------------

/** Which Card a step targets, resolved against the model when the step runs. */
interface CardPick {
  at: "first" | "last" | "current" | "any";
  n: number;
}

type NameChoice =
  | { kind: "valid"; name: string } // 1–64 code points, includes both boundaries
  | { kind: "default"; n: number } // "Card n", which interacts with add's naming
  | { kind: "other"; n: number } // another Card's name (duplicate when 2+ Cards)
  | { kind: "own" } // the Card's current name (noop)
  | { kind: "raw"; name: string }; // empty, 65 code points or whitespace-only

type Step =
  | { t: "select"; card: CardPick } // session only: change the current Card
  | { t: "add" } // after the current Card
  | { t: "rename"; card: CardPick; name: NameChoice }
  | { t: "move"; card: CardPick; direction: "earlier" | "later" }
  | { t: "delete"; card: CardPick }
  | { t: "unknown"; type: "card/add" | "card/rename" | "card/move" | "card/delete" };

const cardPickArb: fc.Arbitrary<CardPick> = fc.record({
  at: fc.constantFrom("first", "last", "current", "any"),
  n: fc.nat({ max: 63 }),
});

/** Exactly 65 code points (one over the limit), or longer. */
const tooLongArb: fc.Arbitrary<string> = fc.oneof(
  fc
    .tuple(nameArb, fc.constantFrom("a", "👻", "\u0301", " "))
    .map(([name, pad]) => name + pad.repeat(Math.max(1, NAME_CODE_POINTS_MAX + 1 - [...name].length))),
  fc.constantFrom("a".repeat(65), "👻".repeat(65), " ".repeat(65), "x".repeat(200)),
);

/** 1–64 whitespace code points. */
const whitespaceOnlyArb: fc.Arbitrary<string> = fc.oneof(
  fc.string({
    unit: fc.constantFrom(" ", "\t", "\n", "\r", "\u00a0", "\u2028", "\u3000", "\ufeff"),
    minLength: 1,
    maxLength: NAME_CODE_POINTS_MAX,
  }),
  fc.constant(" ".repeat(NAME_CODE_POINTS_MAX)),
);

const nameChoiceArb: fc.Arbitrary<NameChoice> = fc.oneof(
  { weight: 3, arbitrary: nameArb.map((name): NameChoice => ({ kind: "valid", name })) },
  { weight: 2, arbitrary: fc.integer({ min: 1, max: 21 }).map((n): NameChoice => ({ kind: "default", n })) },
  { weight: 2, arbitrary: fc.nat({ max: 63 }).map((n): NameChoice => ({ kind: "other", n })) },
  { weight: 1, arbitrary: fc.constant<NameChoice>({ kind: "own" }) },
  {
    weight: 3,
    arbitrary: fc
      .oneof(fc.constant(""), tooLongArb, whitespaceOnlyArb)
      .map((name): NameChoice => ({ kind: "raw", name })),
  },
);

const stepArb: fc.Arbitrary<Step> = fc.oneof(
  { weight: 1, arbitrary: fc.record({ t: fc.constant("select" as const), card: cardPickArb }) },
  { weight: 3, arbitrary: fc.constant<Step>({ t: "add" }) },
  {
    weight: 3,
    arbitrary: fc.record({ t: fc.constant("rename" as const), card: cardPickArb, name: nameChoiceArb }),
  },
  {
    weight: 3,
    arbitrary: fc.record({
      t: fc.constant("move" as const),
      card: cardPickArb,
      direction: fc.constantFrom("earlier" as const, "later" as const),
    }),
  },
  { weight: 3, arbitrary: fc.record({ t: fc.constant("delete" as const), card: cardPickArb }) },
  {
    weight: 1,
    arbitrary: fc.record({
      t: fc.constant("unknown" as const),
      type: fc.constantFrom("card/add" as const, "card/rename" as const, "card/move" as const, "card/delete" as const),
    }),
  },
);

/** Mostly mixed sequences; one in five starts with a burst of adds that reaches 20 Cards. */
const stepsArb: fc.Arbitrary<Step[]> = fc.oneof(
  { weight: 4, arbitrary: fc.array(stepArb, { maxLength: 30 }) },
  {
    weight: 1,
    arbitrary: fc
      .tuple(fc.integer({ min: 1, max: CARDS_MAX + 1 }), fc.array(stepArb, { maxLength: 10 }))
      .map(([n, rest]) => [...Array.from({ length: n }, (): Step => ({ t: "add" })), ...rest]),
  },
);

// ---------------------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------------------

interface Model {
  order: Id[];
  cards: Map<Id, Card>;
  current: Id;
}

function resolveCard(pick: CardPick, m: Model): Id {
  switch (pick.at) {
    case "first":
      return m.order[0] as Id;
    case "last":
      return m.order[m.order.length - 1] as Id;
    case "current":
      return m.current;
    case "any":
      return m.order[pick.n % m.order.length] as Id;
  }
}

function modelCard(m: Model, id: Id): Card {
  const card = m.cards.get(id);
  if (card === undefined) throw new Error(`model has no card ${id}`);
  return card;
}

function resolveName(choice: NameChoice, m: Model, id: Id): string {
  switch (choice.kind) {
    case "valid":
    case "raw":
      return choice.name;
    case "default":
      return `Card ${choice.n}`;
    case "own":
      return modelCard(m, id).name;
    case "other": {
      const others = m.order.filter((other) => other !== id);
      const other = others.length > 0 ? (others[choice.n % others.length] as Id) : id;
      return modelCard(m, other).name;
    }
  }
}

/** The name rule written independently: code points, then whitespace-only (`/^\s*$/u`). */
function nameRuleCode(name: string): string | null {
  const length = [...name].length;
  if (length === 0) return "name-empty";
  if (length > NAME_CODE_POINTS_MAX) return "name-too-long";
  if (/^\s*$/u.test(name)) return "name-whitespace-only";
  return null;
}

function smallestFreeDefaultName(m: Model): string {
  const taken = new Set([...m.cards.values()].map((c) => c.name));
  for (let n = 1; ; n += 1) if (!taken.has(`Card ${n}`)) return `Card ${n}`;
}

/** Every Card and Widget Stable_ID in the document, lowercased. */
function allIds(doc: StackDocument): Set<string> {
  const ids = new Set<string>();
  for (const card of Object.values(doc.cards)) {
    ids.add(card.id.toLowerCase());
    for (const w of card.widgets) ids.add(w.id.toLowerCase());
  }
  return ids;
}

function expectApplied(r: EditResult, where: string): StackDocument {
  expect(r.kind, where).toBe("applied");
  if (r.kind !== "applied") throw new Error(where);
  return r.doc;
}

function expectRejected(r: EditResult, where: string, expected: Partial<Diagnostic>): void {
  expect(r.kind, where).toBe("rejected");
  if (r.kind !== "rejected") throw new Error(where);
  expect(r.diagnostics, where).toEqual([expect.objectContaining(expected)]);
}

/** Req 7.8 invariants plus equality with the model. */
function checkInvariants(doc: StackDocument, m: Model, where: string): void {
  const keys = Object.keys(doc.cards);
  expect(keys.length, where).toBeGreaterThanOrEqual(CARDS_MIN);
  expect(keys.length, where).toBeLessThanOrEqual(CARDS_MAX);
  // `cardOrder` is a permutation of the keys of `cards`.
  expect(new Set(doc.cardOrder).size, where).toBe(doc.cardOrder.length);
  expect([...doc.cardOrder].sort(), where).toEqual([...keys].sort());
  // Card Stable_IDs are unique (case-insensitive) and equal their keys; names are unique.
  const cards = keys.map((key) => doc.cards[key] as Card);
  expect(cards.map((c) => c.id), where).toEqual(keys);
  expect(new Set(cards.map((c) => c.id.toLowerCase())).size, where).toBe(cards.length);
  expect(new Set(cards.map((c) => c.name)).size, where).toBe(cards.length);
  // Model: same order, same Card set and each Card equal to its expected value, so every
  // surviving Card keeps its Stable_ID and only the predicted fields changed.
  expect(doc.cardOrder, where).toEqual(m.order);
  expect(keys.length, where).toBe(m.cards.size);
  for (const [id, card] of m.cards) expect(doc.cards[id], where).toStrictEqual(card);
}

// ---------------------------------------------------------------------------------------
// Property
// ---------------------------------------------------------------------------------------

describe("card authoring (cards.property)", () => {
  // Explicit timeout: each applied action re-validates the whole document. The 500-run
  // default took about 3 s (2026-11-11), close to Vitest's 5 s default, and release runs
  // use 5,000 cases (FC_RUNS), so the limit is raised rather than the documents shrunk further.
  it("Property 1: card authoring invariants", { timeout: 300_000 }, () => {
    // Feature: 01-responsive-authoring, Property 1: Card authoring invariants
    fc.assert(
      fc.property(docArb, cardPickArb, indexArb, stepsArb, (initial, start, entries, steps) => {
        const table = buildRefTable(initial, entries);
        const references: ReferenceIndex = (_doc, target) =>
          table.get(targetKey(target.cardId, target.widgetId)) ?? [];
        const source = counterIdSource({ namespace: NEW_ID_NAMESPACE });
        const drawn: Id[] = [];
        const ctx: EditorContext = {
          newId: () => {
            const id = source();
            drawn.push(id);
            return id;
          },
          references,
        };

        const m: Model = {
          order: [...initial.cardOrder],
          cards: new Map(initial.cardOrder.map((id) => [id, initial.cards[id] as Card])),
          current: initial.cardOrder[0] as Id,
        };
        m.current = resolveCard(start, m);
        let doc = initial;
        checkInvariants(doc, m, "initial");

        steps.forEach((step, i) => {
          const where = `step ${i}: ${JSON.stringify(step)}`;
          const count = m.order.length;
          switch (step.t) {
            case "select": {
              m.current = resolveCard(step.card, m);
              break;
            }
            case "add": {
              // Req 7.1, 7.7.
              const action: EditAction = { type: "card/add", afterCardId: m.current };
              const before = drawn.length;
              const r = applyAction(doc, action, ctx);
              if (count >= CARDS_MAX) {
                expectRejected(r, where, { code: "card-limit", path: ["cards"], measured: count + 1, max: CARDS_MAX });
                break;
              }
              const next = expectApplied(r, where);
              expect(drawn.length - before, where).toBe(1);
              const id = drawn[drawn.length - 1] as Id;
              expect(allIds(doc).has(id.toLowerCase()), where).toBe(false);
              m.cards.set(id, {
                id,
                name: smallestFreeDefaultName(m),
                width: CARD_WIDTH,
                height: CARD_HEIGHT,
                bitmapBase64: PAPER_BASE64,
                widgets: [],
              });
              m.order.splice(m.order.indexOf(m.current) + 1, 0, id);
              m.current = id;
              doc = next;
              break;
            }
            case "rename": {
              // Req 7.2, 7.10.
              const id = resolveCard(step.card, m);
              const name = resolveName(step.name, m, id);
              const r = applyAction(doc, { type: "card/rename", cardId: id, name }, ctx);
              const path = ["cards", id, "name"];
              const rule = nameRuleCode(name);
              const other = m.order.find((o) => o !== id && modelCard(m, o).name === name);
              if (rule !== null) {
                expectRejected(r, where, { code: rule as Diagnostic["code"], path });
              } else if (other !== undefined) {
                expectRejected(r, where, { code: "name-duplicate", path, otherPath: ["cards", other, "name"] });
              } else if (name === modelCard(m, id).name) {
                expect(r.kind, where).toBe("noop");
              } else {
                doc = expectApplied(r, where);
                m.cards.set(id, { ...modelCard(m, id), name });
              }
              break;
            }
            case "move": {
              // Req 7.3, 7.11.
              const id = resolveCard(step.card, m);
              const r = applyAction(doc, { type: "card/move", cardId: id, direction: step.direction }, ctx);
              const index = m.order.indexOf(id);
              const target = step.direction === "earlier" ? index - 1 : index + 1;
              if (target < 0 || target >= count) {
                expect(r.kind, where).toBe("noop");
                break;
              }
              doc = expectApplied(r, where);
              m.order[index] = m.order[target] as Id;
              m.order[target] = id;
              break;
            }
            case "delete": {
              // Req 7.4, 7.5, 7.6, 7.12.
              const id = resolveCard(step.card, m);
              const r = applyAction(doc, { type: "card/delete", cardId: id }, ctx);
              const refs = expectedReferences(table, modelCard(m, id));
              if (count === CARDS_MIN) {
                expectRejected(r, where, { code: "last-card", path: ["cards", id] });
              } else if (refs.length > 0) {
                expectRejected(r, where, { code: "referenced", path: ["cards", id], references: refs });
              } else {
                doc = expectApplied(r, where);
                const orderBefore = [...m.order];
                const index = orderBefore.indexOf(id);
                const nextCurrent =
                  m.current === id ? ((orderBefore[index + 1] ?? orderBefore[index - 1]) as Id) : m.current;
                expect(currentCardAfterDelete(orderBefore, id, m.current), where).toBe(nextCurrent);
                m.order.splice(index, 1);
                m.cards.delete(id);
                m.current = nextCurrent;
              }
              break;
            }
            case "unknown": {
              const action: EditAction =
                step.type === "card/add"
                  ? { type: "card/add", afterCardId: UNKNOWN_ID }
                  : step.type === "card/rename"
                    ? { type: "card/rename", cardId: UNKNOWN_ID, name: "Ghost" }
                    : step.type === "card/move"
                      ? { type: "card/move", cardId: UNKNOWN_ID, direction: "earlier" }
                      : { type: "card/delete", cardId: UNKNOWN_ID };
              expectRejected(applyAction(doc, action, ctx), where, {
                code: "card-not-found",
                path: ["cards", UNKNOWN_ID],
              });
              break;
            }
          }
          expect(m.order.includes(m.current), where).toBe(true);
          checkInvariants(doc, m, where);
        });
      }),
      fcOptions,
    );
  });
});
