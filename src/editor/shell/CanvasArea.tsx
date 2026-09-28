'use client';

import { sampleDeckOperations } from '@/domain/sampleDeck';
import { getTheme } from '@/domain/theme';
import { useDeck, useDeckActions } from '@/store/DeckProvider';
import { useEditorUi } from '@/store/EditorUiProvider';
import { CanvasToolbar } from '../canvas/CanvasToolbar';
import { EditableSlide } from '../canvas/EditableSlide';
import { Inspector } from '../inspector/Inspector';
import { ScaledArtboard } from '../slide/ScaledArtboard';

export function CanvasArea() {
  const deck = useDeck();
  const { dispatch } = useDeckActions();
  const { currentSlideId, select, notice } = useEditorUi();
  const slide = currentSlideId ? deck.slides[currentSlideId] : undefined;

  if (!slide) {
    return (
      <main className="canvas-area canvas-area--empty">
        <div className="empty-state">
          <h2>No slides yet</h2>
          <p>Describe your presentation in the chat, or add a blank slide from the filmstrip.</p>
          <button
            type="button"
            className="empty-state__action"
            onClick={() => dispatch(sampleDeckOperations(), { source: 'user', label: 'Load sample deck' })}
          >
            Start from a sample deck
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="canvas-area">
      <CanvasToolbar />
      <div className="canvas-area__body">
        <div
          className="canvas-area__stage-wrap"
          onPointerDown={(e) => {
            // Clicking the grey area around the slide clears the selection.
            if (e.target instanceof Element && !e.target.closest('.slide-editor') && !e.shiftKey) select([]);
          }}
        >
          <ScaledArtboard fit="contain" clip={false} className="canvas-area__stage">
            {(scale) => (
              <EditableSlide slide={slide} elements={deck.elements} theme={getTheme(deck.themeId)} scale={scale} />
            )}
          </ScaledArtboard>
        </div>
        <Inspector />
      </div>
      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
    </main>
  );
}
