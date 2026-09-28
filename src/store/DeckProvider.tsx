'use client';

import { createContext, type ReactNode, useContext, useMemo, useRef, useState } from 'react';
import { type ApplyResult, applyOperations } from '@/domain/operations/apply';
import type { Operation } from '@/domain/operations/schema';
import type { Deck } from '@/domain/schema/deck';
import {
  type ChangeSource,
  commit,
  type DeckStoreState,
  initialStoreState,
  redo,
  undo,
  userChangesSince,
} from './history';
import { checkPolicy } from './policy';

export interface DispatchMeta {
  source: ChangeSource;
  /** Shown in history / undo tooltips, e.g. "Move chart". */
  label: string;
  groupId?: string;
}

export interface DeckActions {
  /** The only way to change the deck. Applies synchronously; the result is readable immediately via getDeck(). */
  dispatch(ops: readonly Operation[], meta: DispatchMeta): ApplyResult;
  undo(): void;
  redo(): void;
  /** Latest deck, safe to call from async code (e.g. the AI tool loop) without stale closures. */
  getDeck(): Deck;
  setAiBusy(busy: boolean): void;
  /** Current history sequence number; pass it to userChangesSince later. */
  getSeq(): number;
  /** Labels of manual edits made after `seq` that are still in effect. */
  userChangesSince(seq: number): string[];
}

export interface DeckView {
  deck: Deck;
  canUndo: boolean;
  canRedo: boolean;
  aiBusy: boolean;
}

const DeckViewContext = createContext<DeckView | null>(null);
const DeckActionsContext = createContext<DeckActions | null>(null);

export function DeckProvider({ initialDeck, children }: { initialDeck: () => Deck; children: ReactNode }) {
  const [state, setState] = useState<DeckStoreState>(() => initialStoreState(initialDeck()));
  // Mirror of the latest state so sequential dispatches (and async callers) never read a stale deck.
  const stateRef = useRef(state);

  const actions = useMemo<DeckActions>(() => {
    const set = (next: DeckStoreState) => {
      if (next === stateRef.current) return;
      stateRef.current = next;
      setState(next);
    };

    return {
      dispatch(ops, meta) {
        const current = stateRef.current;
        const blocked = checkPolicy(ops, meta.source, current.aiBusy);
        if (blocked) return { ok: false, error: blocked, failedIndex: -1 };

        const result = applyOperations(current.deck, ops);
        if (result.ok) set(commit(current, result.deck, meta));
        return result;
      },
      undo() {
        if (!stateRef.current.aiBusy) set(undo(stateRef.current));
      },
      redo() {
        if (!stateRef.current.aiBusy) set(redo(stateRef.current));
      },
      getDeck: () => stateRef.current.deck,
      getSeq: () => stateRef.current.seq,
      userChangesSince: (seq) => userChangesSince(stateRef.current, seq),
      setAiBusy(busy) {
        if (stateRef.current.aiBusy !== busy) set({ ...stateRef.current, aiBusy: busy });
      },
    };
  }, []);

  const view = useMemo<DeckView>(
    () => ({
      deck: state.deck,
      canUndo: state.past.length > 0 && !state.aiBusy,
      canRedo: state.future.length > 0 && !state.aiBusy,
      aiBusy: state.aiBusy,
    }),
    [state],
  );

  return (
    <DeckActionsContext.Provider value={actions}>
      <DeckViewContext.Provider value={view}>{children}</DeckViewContext.Provider>
    </DeckActionsContext.Provider>
  );
}

export function useDeckView(): DeckView {
  const ctx = useContext(DeckViewContext);
  if (!ctx) throw new Error('useDeckView must be used inside <DeckProvider>');
  return ctx;
}

export function useDeck(): Deck {
  return useDeckView().deck;
}

/** Stable across renders; components that only dispatch do not re-render on deck changes. */
export function useDeckActions(): DeckActions {
  const ctx = useContext(DeckActionsContext);
  if (!ctx) throw new Error('useDeckActions must be used inside <DeckProvider>');
  return ctx;
}
