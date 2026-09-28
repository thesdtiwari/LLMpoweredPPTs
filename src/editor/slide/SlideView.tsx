'use client';

import { memo } from 'react';
import type { Slide } from '@/domain/schema/deck';
import type { Element } from '@/domain/schema/elements';
import type { Theme } from '@/domain/theme';
import { ElementView } from './ElementView';

interface Props {
  slide: Slide;
  /** Pass deck.elements; only this slide's children are read. */
  elements: Readonly<Record<string, Element>>;
  theme: Theme;
}

/** Read-only rendering of one slide in 1920×1080 space. Shared by canvas, filmstrip, and export. */
export const SlideView = memo(function SlideView({ slide, elements, theme }: Props) {
  return (
    <div
      className="slide-surface"
      style={{
        background: slide.backgroundColor ?? theme.colors.background,
        color: theme.colors.text,
        fontFamily: theme.fontFamily,
      }}
    >
      {slide.elementOrder.map((id) => {
        const el = elements[id];
        return el ? <ElementView key={id} element={el} theme={theme} /> : null;
      })}
      {slide.status === 'pending' && <div className="slide-pending">Generating…</div>}
    </div>
  );
});
