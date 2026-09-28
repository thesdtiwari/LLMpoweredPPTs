'use client';

import { memo } from 'react';
import type { Element } from '@/domain/schema/elements';
import type { Theme } from '@/domain/theme';
import { ErrorBoundary } from '../ErrorBoundary';
import { ChartElementView } from './renderers/ChartElementView';
import { ImageElementView } from './renderers/ImageElementView';
import { ShapeElementView } from './renderers/ShapeElementView';
import { TableElementView } from './renderers/TableElementView';
import { TextElementView } from './renderers/TextElementView';

interface Props {
  element: Element;
  theme: Theme;
  /** Keeps layout but hides the content, e.g. while the in-place text editor covers it. */
  hidden?: boolean;
  /** Faded, e.g. while being dragged onto another slide. */
  dimmed?: boolean;
}

/**
 * Positions one element by its bounding box. Memoized on the element object:
 * because deck updates are structurally shared, only changed elements re-render.
 */
export const ElementView = memo(function ElementView({ element, theme, hidden = false, dimmed = false }: Props) {
  const { x, y, w, h, rotation } = element.bbox;
  return (
    <div
      className="element"
      data-element-id={element.id}
      style={{
        left: x,
        top: y,
        width: w,
        height: h,
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
        visibility: hidden ? 'hidden' : undefined,
        opacity: dimmed ? 0.35 : undefined,
      }}
    >
      {/* Reset when the element changes, so a fixed element (e.g. after undo) renders again. */}
      <ErrorBoundary
        resetKey={element}
        fallback={<div className="element-error">Can’t display this {element.kind}</div>}
      >
        {renderContent(element, theme)}
      </ErrorBoundary>
    </div>
  );
});

function renderContent(element: Element, theme: Theme) {
  switch (element.kind) {
    case 'text':
      return <TextElementView element={element} theme={theme} />;
    case 'image':
      return <ImageElementView element={element} />;
    case 'shape':
      return <ShapeElementView element={element} theme={theme} />;
    case 'chart':
      return <ChartElementView element={element} theme={theme} />;
    case 'table':
      return <TableElementView element={element} theme={theme} />;
  }
}
