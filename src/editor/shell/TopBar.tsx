'use client';

import { useDeckActions, useDeckView } from '@/store/DeckProvider';
import { downloadDeckJson } from '../export/downloadDeckJson';

export function TopBar() {
  const { deck, canUndo, canRedo, aiBusy } = useDeckView();
  const { undo, redo } = useDeckActions();
  const empty = deck.slideOrder.length === 0;

  return (
    <header className="topbar">
      <div className="topbar__title" title={deck.title}>
        {deck.title}
      </div>
      <div className="topbar__actions">
        {aiBusy && <span className="badge">AI is editing…</span>}
        <button type="button" onClick={undo} disabled={!canUndo} title="Undo (⌘Z)">
          Undo
        </button>
        <button type="button" onClick={redo} disabled={!canRedo} title="Redo (⇧⌘Z)">
          Redo
        </button>
        <span className="topbar__sep" />
        <button type="button" onClick={() => downloadDeckJson(deck)} disabled={empty} title="Download the deck as JSON">
          JSON
        </button>
        <button
          type="button"
          className="button--primary"
          onClick={() => window.print()}
          disabled={empty}
          title="Print or save as PDF (⌘P) — one slide per page"
        >
          Export PDF
        </button>
      </div>
    </header>
  );
}
