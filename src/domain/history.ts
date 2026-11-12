import { LIMITS } from "./limits";
import type { StackDocument } from "./schema";

/*
 * Solo Edit_History (Req 11.1-11.5, 11.9, 11.10; design "Edit history").
 *
 * Snapshot history: each entry holds the document before and after one applied
 * authoring action. Documents are immutable values that share unchanged cards, so
 * entries store references and never copy. Every function here is pure: it returns a
 * new EditHistory and never mutates the input history or its arrays.
 *
 * One applied action is one entry, so one Stroke or one Dither_Fill is one undo step
 * (Req 9.5, 10.5, 10.6). The caller commits only `applied` editor results; `noop` and
 * `rejected` results never reach `commit` (Req 6.8, 11.10).
 */

/** One committed authoring action: the document before and after it, and its label. */
export interface HistoryEntry {
  before: StackDocument;
  after: StackDocument;
  label: string;
}

/** Undo and redo stacks. The top of each stack is its last element; `undo` is oldest first. */
export interface EditHistory {
  undo: readonly HistoryEntry[];
  redo: readonly HistoryEntry[];
}

/** The result of a successful undo or redo: the new history and the document to show. */
export interface HistoryStep {
  history: EditHistory;
  doc: StackDocument;
}

/** A history with zero Undo and zero Redo entries (Req 11.11: opening any document). */
export function emptyHistory(): EditHistory {
  return { undo: [], redo: [] };
}

/**
 * Appends `e` to the Undo entries, drops the oldest entries so at most
 * `LIMITS.historyDepth` (50) remain, and discards every Redo entry (Req 11.4, 11.5).
 */
export function commit(h: EditHistory, e: HistoryEntry): EditHistory {
  const appended = [...h.undo, e];
  const overflow = appended.length - LIMITS.historyDepth;
  return {
    undo: overflow > 0 ? appended.slice(overflow) : appended,
    redo: [],
  };
}

/**
 * Moves the most recent Undo entry to the top of the Redo entries and returns its
 * `before` document (Req 11.1). Returns `null` when there is no Undo entry, so the
 * caller keeps its document and history unchanged (Req 11.9).
 */
export function undo(h: EditHistory): HistoryStep | null {
  const entry = h.undo[h.undo.length - 1];
  if (entry === undefined) return null;
  return {
    history: { undo: h.undo.slice(0, -1), redo: [...h.redo, entry] },
    doc: entry.before,
  };
}

/**
 * Moves the top Redo entry back to the top of the Undo entries and returns its
 * `after` document (Req 11.2). Returns `null` when there is no Redo entry (Req 11.9).
 */
export function redo(h: EditHistory): HistoryStep | null {
  const entry = h.redo[h.redo.length - 1];
  if (entry === undefined) return null;
  return {
    history: { undo: [...h.undo, entry], redo: h.redo.slice(0, -1) },
    doc: entry.after,
  };
}
