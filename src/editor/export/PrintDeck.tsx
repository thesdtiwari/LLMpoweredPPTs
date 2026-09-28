'use client';

import { getTheme } from '@/domain/theme';
import { useDeck } from '@/store/DeckProvider';
import { SlideView } from '../slide/SlideView';

/**
 * Every slide, one per printed page, rendered from the canonical deck with the
 * same SlideView as the canvas — so positions, charts (Recharts SVG), tables and
 * images come out exactly as edited. Hidden on screen; `@media print` in
 * globals.css hides the editor and shows this instead. Works for the Export
 * button, ⌘P, and the browser's "Save as PDF".
 */
export function PrintDeck() {
  const deck = useDeck();
  const theme = getTheme(deck.themeId);

  return (
    <div className="print-deck" aria-hidden>
      {deck.slideOrder.map((slideId) => {
        const slide = deck.slides[slideId];
        if (!slide) return null;
        return (
          <section key={slideId} className="print-slide" data-print-slide-id={slideId}>
            <div className="print-slide__artboard">
              <SlideView slide={slide} elements={deck.elements} theme={theme} />
            </div>
          </section>
        );
      })}
    </div>
  );
}
