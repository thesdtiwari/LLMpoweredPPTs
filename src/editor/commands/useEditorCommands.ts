'use client';

import { useMemo } from 'react';
import { bbox, defaultElementInput } from '@/domain/factories';
import type { ApplyResult } from '@/domain/operations/apply';
import type { Operation, OperationOf } from '@/domain/operations/schema';
import { describeElement, describeElements } from '@/domain/queries';
import type { Deck } from '@/domain/schema/deck';
import type { ElementInput, ElementKind } from '@/domain/schema/elements';
import { type BBox, SLIDE_HEIGHT, SLIDE_WIDTH } from '@/domain/schema/geometry';
import { useDeckActions } from '@/store/DeckProvider';
import { useEditorUi } from '@/store/EditorUiProvider';

export type ZDirection = 'forward' | 'backward' | 'front' | 'back';
export type SlidePatch = OperationOf<'slide.update'>['patch'];

const IMAGE_MAX = { w: 900, h: 600 };

/** Shifts a new element diagonally until it no longer sits exactly on another one. */
function freeSpot(deck: Deck, slideId: string, box: BBox): BBox {
  const taken = (deck.slides[slideId]?.elementOrder ?? []).flatMap((id) => deck.elements[id]?.bbox ?? []);
  let next = box;
  for (let i = 0; i < 12 && taken.some((b) => b.x === next.x && b.y === next.y); i++) {
    next = { ...next, x: next.x + 40, y: next.y + 40 };
  }
  return next;
}

const slideNumber = (deck: Deck, slideId: string) => deck.slideOrder.indexOf(slideId) + 1;

/**
 * User intents → domain operations. Toolbar buttons and keyboard shortcuts call
 * these; components never assemble operations themselves.
 */
export function useEditorCommands() {
  const { dispatch, undo, redo, getDeck } = useDeckActions();
  const { currentSlideId, selectedElementIds, select, goToSlide, notify } = useEditorUi();

  return useMemo(() => {
    const run = (ops: Operation[], label: string): ApplyResult => {
      const result = dispatch(ops, { source: 'user', label });
      if (!result.ok) notify(result.error);
      return result;
    };

    /** Selected elements sorted by z-index (back to front). */
    const selectionInZOrder = (): string[] => {
      const slide = currentSlideId ? getDeck().slides[currentSlideId] : undefined;
      if (!slide) return [];
      return slide.elementOrder.filter((id) => selectedElementIds.includes(id));
    };

    const stepSlide = (delta: number) => {
      const order = getDeck().slideOrder;
      const index = currentSlideId ? order.indexOf(currentSlideId) : -1;
      const target = order[Math.min(Math.max(index + delta, 0), order.length - 1)];
      if (target && target !== currentSlideId) goToSlide(target);
    };

    return {
      hasSelection: selectedElementIds.length > 0,
      undo,
      redo,

      deleteSelection() {
        if (selectedElementIds.length === 0) return;
        const label = `Deleted ${describeElements(getDeck(), selectedElementIds)}`;
        if (run([{ type: 'element.delete', elementIds: [...selectedElementIds] }], label).ok) select([]);
      },

      duplicateSelection() {
        const ids = selectionInZOrder();
        if (ids.length === 0) return;
        const result = run(
          [{ type: 'element.duplicate', elementIds: ids }],
          `Duplicated ${describeElements(getDeck(), ids)}`,
        );
        if (result.ok) select(result.createdIds);
      },

      reorder(direction: ZDirection) {
        const ids = selectionInZOrder();
        if (ids.length === 0) return;
        // Move the front-most first when going up (and back-most first going down)
        // so selected elements don't leapfrog each other.
        const ordered = direction === 'forward' || direction === 'back' ? [...ids].reverse() : ids;
        const labels = {
          forward: 'Bring forward',
          backward: 'Send backward',
          front: 'Bring to front',
          back: 'Send to back',
        };
        run(
          ordered.map((elementId) => ({ type: 'element.reorderZ', elementId, direction })),
          labels[direction],
        );
      },

      nudge(dx: number, dy: number) {
        const deck = getDeck();
        const ops: Operation[] = selectedElementIds.flatMap((elementId) => {
          const el = deck.elements[elementId];
          if (!el || el.locked) return [];
          return [{ type: 'element.setBBox', elementId, bbox: { x: el.bbox.x + dx, y: el.bbox.y + dy } }];
        });
        if (ops.length > 0) run(ops, 'Nudge');
      },

      selectAll() {
        const slide = currentSlideId ? getDeck().slides[currentSlideId] : undefined;
        if (slide) select(slide.elementOrder);
      },

      clearSelection() {
        select([]);
      },

      previousSlide: () => stepSlide(-1),
      nextSlide: () => stepSlide(1),

      /** Inserts a default element on the current slide, selected and ready to drag. */
      insertElement(kind: ElementKind) {
        const deck = getDeck();
        if (!currentSlideId) return;
        const input = defaultElementInput(kind);
        const element = { ...input, bbox: freeSpot(deck, currentSlideId, input.bbox) } as ElementInput;
        const result = run([{ type: 'element.add', slideId: currentSlideId, element }], `Inserted ${kind}`);
        if (result.ok) select(result.createdIds);
      },

      /** Inserts an uploaded image at its natural aspect ratio, centered. */
      insertImage(image: { src: string; name: string; width: number; height: number }) {
        if (!currentSlideId) return;
        const scale = Math.min(1, IMAGE_MAX.w / image.width, IMAGE_MAX.h / image.height);
        const w = Math.round(image.width * scale);
        const h = Math.round(image.height * scale);
        const box = freeSpot(getDeck(), currentSlideId, bbox((SLIDE_WIDTH - w) / 2, (SLIDE_HEIGHT - h) / 2, w, h));
        const element: ElementInput = {
          kind: 'image',
          bbox: box,
          locked: false,
          src: image.src,
          alt: image.name,
          fit: 'contain',
        };
        const result = run(
          [{ type: 'element.add', slideId: currentSlideId, element }],
          `Inserted image "${image.name}"`,
        );
        if (result.ok) select(result.createdIds);
      },

      /** Field edits from the inspector; the domain re-validates the merged element. */
      updateElement(elementId: string, patch: Record<string, unknown>, label: string) {
        run([{ type: 'element.update', elementId, patch }], label);
      },

      setBBox(elementId: string, box: Partial<BBox>) {
        const el = getDeck().elements[elementId];
        run([{ type: 'element.setBBox', elementId, bbox: box }], `Positioned ${el ? describeElement(el) : 'element'}`);
      },

      addSlide(where: 'after' | 'end') {
        const deck = getDeck();
        const index =
          where === 'after' && currentSlideId ? deck.slideOrder.indexOf(currentSlideId) + 1 : deck.slideOrder.length;
        const result = run([{ type: 'slide.add', index }], `Added slide at position ${index + 1}`);
        if (result.ok && result.createdIds[0]) goToSlide(result.createdIds[0]);
      },

      duplicateSlide(slideId: string) {
        const deck = getDeck();
        const result = run(
          [{ type: 'slide.duplicate', slideId }],
          `Duplicated slide ${slideNumber(deck, slideId)} "${deck.slides[slideId]?.title ?? ''}"`,
        );
        if (result.ok && result.createdIds[0]) goToSlide(result.createdIds[0]);
      },

      deleteSlide(slideId: string) {
        const deck = getDeck();
        const index = deck.slideOrder.indexOf(slideId);
        const title = deck.slides[slideId]?.title ?? '';
        const result = run([{ type: 'slide.delete', slideId }], `Deleted slide ${index + 1} "${title}"`);
        if (!result.ok) return;
        const neighbour = result.deck.slideOrder[Math.min(index, result.deck.slideOrder.length - 1)];
        if (neighbour) goToSlide(neighbour);
        notify(`Deleted slide ${index + 1}. Press ⌘Z to undo.`);
      },

      updateSlide(slideId: string, patch: SlidePatch, label: string) {
        run([{ type: 'slide.update', slideId, patch }], label);
      },

      editText(elementId: string, text: string) {
        const el = getDeck().elements[elementId];
        run([{ type: 'element.update', elementId, patch: { text } }], `Edited ${el ? describeElement(el) : 'text'}`);
      },
    };
  }, [dispatch, undo, redo, getDeck, currentSlideId, selectedElementIds, select, goToSlide, notify]);
}

export type EditorCommands = ReturnType<typeof useEditorCommands>;
