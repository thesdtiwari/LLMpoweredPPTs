'use client';

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { memo, useState } from 'react';
import type { Slide } from '@/domain/schema/deck';
import type { Element } from '@/domain/schema/elements';
import { getTheme, type Theme } from '@/domain/theme';
import { useDeck, useDeckActions } from '@/store/DeckProvider';
import { type DropTarget, useEditorUi } from '@/store/EditorUiProvider';
import { DROP_SLIDE_ATTR } from '../canvas/useCanvasDrag';
import { ScaledArtboard } from '../slide/ScaledArtboard';
import { SlideView } from '../slide/SlideView';

interface ThumbProps {
  slide: Slide;
  index: number;
  elements: Readonly<Record<string, Element>>;
  theme: Theme;
  active: boolean;
  /** Set while a canvas element is dragged over this thumbnail. */
  drop: DropTarget['mode'] | null;
  onSelect(slideId: string): void;
}

const ThumbContent = memo(function ThumbContent({
  slide,
  elements,
  theme,
}: Pick<ThumbProps, 'slide' | 'elements' | 'theme'>) {
  return (
    <ScaledArtboard fit="width" className="thumb__artboard">
      {() => <SlideView slide={slide} elements={elements} theme={theme} />}
    </ScaledArtboard>
  );
});

/**
 * One filmstrip entry. It is both a sortable item (drag to reorder slides) and a
 * drop target for elements dragged off the canvas (DROP_SLIDE_ATTR).
 */
function SortableThumb({ slide, index, elements, theme, active, drop, onSelect }: ThumbProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: slide.id });
  const dropProps = { [DROP_SLIDE_ATTR]: slide.id };

  return (
    <li
      ref={setNodeRef}
      className="filmstrip__item"
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        {...dropProps}
        className={[
          'thumb',
          active && 'thumb--active',
          isDragging && 'thumb--placeholder',
          drop && 'thumb--drop-target',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={() => onSelect(slide.id)}
        aria-current={active ? 'true' : undefined}
        aria-label={`Slide ${index + 1}: ${slide.title}`}
      >
        <span className="thumb__index">{index + 1}</span>
        <div className="thumb__frame">
          <ThumbContent slide={slide} elements={elements} theme={theme} />
          {drop && <span className="thumb__drop-label">{drop === 'copy' ? 'Copy here' : 'Move here'}</span>}
        </div>
      </button>
    </li>
  );
}

export function Filmstrip() {
  const deck = useDeck();
  const { dispatch } = useDeckActions();
  const { currentSlideId, goToSlide, dropTarget, notify } = useEditorUi();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const theme = getTheme(deck.themeId);

  // A small activation distance keeps plain clicks working as "go to slide".
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const addSlide = () => {
    const index = currentSlideId ? deck.slideOrder.indexOf(currentSlideId) + 1 : deck.slideOrder.length;
    const result = dispatch([{ type: 'slide.add', index }], { source: 'user', label: 'Add slide' });
    if (result.ok && result.createdIds[0]) goToSlide(result.createdIds[0]);
  };

  const onDragStart = (e: DragStartEvent) => setDraggingId(String(e.active.id));

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDraggingId(null);
    if (!over || active.id === over.id) return;
    const slideId = String(active.id);
    const toIndex = deck.slideOrder.indexOf(String(over.id));
    const result = dispatch([{ type: 'slide.move', slideId, toIndex }], {
      source: 'user',
      label: `Moved slide "${deck.slides[slideId]?.title ?? ''}" from position ${deck.slideOrder.indexOf(slideId) + 1} to ${toIndex + 1}`,
    });
    if (!result.ok) notify(result.error);
  };

  const draggingSlide = draggingId ? deck.slides[draggingId] : undefined;

  return (
    <nav className="filmstrip" aria-label="Slides">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDraggingId(null)}
      >
        <SortableContext items={deck.slideOrder} strategy={verticalListSortingStrategy}>
          <ol className="filmstrip__list">
            {deck.slideOrder.map((slideId, index) => {
              const slide = deck.slides[slideId];
              if (!slide) return null;
              return (
                <SortableThumb
                  key={slideId}
                  slide={slide}
                  index={index}
                  elements={deck.elements}
                  theme={theme}
                  active={slideId === currentSlideId}
                  drop={dropTarget?.slideId === slideId ? dropTarget.mode : null}
                  onSelect={goToSlide}
                />
              );
            })}
          </ol>
        </SortableContext>

        {/* The dragged thumbnail follows the pointer; its original slot shows where it will land. */}
        <DragOverlay>
          {draggingSlide ? (
            <div className="thumb thumb--overlay">
              <div className="thumb__frame">
                <ThumbContent slide={draggingSlide} elements={deck.elements} theme={theme} />
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <button type="button" className="filmstrip__add" onClick={addSlide}>
        + Add slide
      </button>
    </nav>
  );
}
