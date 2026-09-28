'use client';

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useDeck } from './DeckProvider';

/** A filmstrip thumbnail an element is currently being dragged over. */
export interface DropTarget {
  slideId: string;
  mode: 'move' | 'copy';
}

/** Ephemeral editor state. Not part of the deck: not undoable, not sent to the AI. */
interface EditorUi {
  /** Always a slide that exists, or null when the deck is empty. */
  currentSlideId: string | null;
  selectedElementIds: readonly string[];
  goToSlide(slideId: string): void;
  select(elementIds: readonly string[]): void;
  /** Short-lived message, e.g. why an action was rejected. */
  notice: string | null;
  notify(message: string): void;
  /** Set by the canvas while an element drag hovers a thumbnail; the filmstrip highlights it. */
  dropTarget: DropTarget | null;
  setDropTarget(target: DropTarget | null): void;
}

const NOTICE_MS = 3500;

const EditorUiContext = createContext<EditorUi | null>(null);

const NO_SELECTION: readonly string[] = [];

export function EditorUiProvider({ children }: { children: ReactNode }) {
  const deck = useDeck();
  const [requestedSlideId, setRequestedSlideId] = useState<string | null>(null);
  const [selection, setSelection] = useState<readonly string[]>(NO_SELECTION);
  const [notice, setNotice] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const notify = useCallback((message: string) => {
    clearTimeout(noticeTimer.current);
    setNotice(message);
    noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS);
  }, []);
  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  // Fall back gracefully when the current slide is deleted (by the user, AI, or undo).
  const currentSlideId =
    requestedSlideId && deck.slides[requestedSlideId] ? requestedSlideId : (deck.slideOrder[0] ?? null);

  const selectedElementIds = useMemo(() => {
    const live = selection.filter((id) => deck.elements[id]?.slideId === currentSlideId);
    return live.length === selection.length ? selection : live;
  }, [selection, deck.elements, currentSlideId]);

  const value = useMemo<EditorUi>(
    () => ({
      currentSlideId,
      selectedElementIds,
      goToSlide: (slideId) => {
        setRequestedSlideId(slideId);
        setSelection(NO_SELECTION);
      },
      select: setSelection,
      notice,
      notify,
      dropTarget,
      setDropTarget,
    }),
    [currentSlideId, selectedElementIds, notice, notify, dropTarget],
  );

  return <EditorUiContext.Provider value={value}>{children}</EditorUiContext.Provider>;
}

export function useEditorUi(): EditorUi {
  const ctx = useContext(EditorUiContext);
  if (!ctx) throw new Error('useEditorUi must be used inside <EditorUiProvider>');
  return ctx;
}
