import type { Deck } from '@/domain/schema/deck';

export type ChangeSource = 'user' | 'ai';

export interface HistoryEntry {
  before: Deck;
  after: Deck;
  label: string;
  source: ChangeSource;
  /** Consecutive commits with the same groupId collapse into one undo step (e.g. one AI turn). */
  groupId?: string;
  /** Monotonic commit number. Unlike deck.version it never goes backwards on undo. */
  seq: number;
}

export interface DeckStoreState {
  deck: Deck;
  past: HistoryEntry[];
  future: HistoryEntry[];
  /** True while an AI turn is applying changes. */
  aiBusy: boolean;
  /** Last assigned HistoryEntry.seq. */
  seq: number;
}

export const HISTORY_LIMIT = 200;

export function initialStoreState(deck: Deck): DeckStoreState {
  return { deck, past: [], future: [], aiBusy: false, seq: 0 };
}

/**
 * Snapshot history. Because the deck is immutable and structurally shared,
 * keeping the previous deck object per step is cheap. Every change goes through
 * commit(), so the top entry's `after` is always the current deck.
 */
export function commit(
  state: DeckStoreState,
  nextDeck: Deck,
  meta: { label: string; source: ChangeSource; groupId?: string },
): DeckStoreState {
  if (nextDeck === state.deck) return state;

  const seq = state.seq + 1;
  const last = state.past.at(-1);
  if (last && meta.groupId !== undefined && last.groupId === meta.groupId) {
    const merged: HistoryEntry = { ...last, after: nextDeck, seq };
    return { ...state, deck: nextDeck, seq, past: [...state.past.slice(0, -1), merged], future: [] };
  }

  const entry: HistoryEntry = { before: state.deck, after: nextDeck, ...meta, seq };
  return { ...state, deck: nextDeck, seq, past: [...state.past, entry].slice(-HISTORY_LIMIT), future: [] };
}

export function undo(state: DeckStoreState): DeckStoreState {
  const entry = state.past.at(-1);
  if (!entry) return state;
  return { ...state, deck: entry.before, past: state.past.slice(0, -1), future: [...state.future, entry] };
}

export function redo(state: DeckStoreState): DeckStoreState {
  const entry = state.future.at(-1);
  if (!entry) return state;
  return { ...state, deck: entry.after, past: [...state.past, entry], future: state.future.slice(0, -1) };
}

/**
 * Labels of the user's own changes committed after `sinceSeq` that are still
 * in effect (undone changes drop out of `past`). Sent to the AI so it knows
 * what the user did by hand since its last turn.
 */
export function userChangesSince(state: DeckStoreState, sinceSeq: number): string[] {
  return state.past.filter((e) => e.source === 'user' && e.seq > sinceSeq).map((e) => e.label);
}
