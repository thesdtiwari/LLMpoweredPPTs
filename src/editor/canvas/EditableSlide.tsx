'use client';

import { type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, useMemo, useState } from 'react';
import type { Operation } from '@/domain/operations/schema';
import type { Slide } from '@/domain/schema/deck';
import type { Element } from '@/domain/schema/elements';
import type { BBox } from '@/domain/schema/geometry';
import type { Theme } from '@/domain/theme';
import { describeElements } from '@/domain/queries';
import { useDeckActions } from '@/store/DeckProvider';
import { type DropTarget, useEditorUi } from '@/store/EditorUiProvider';
import { useEditorCommands } from '../commands/useEditorCommands';
import { ElementView } from '../slide/ElementView';
import type { Handle } from './geometry';
import { SelectionOverlay } from './SelectionOverlay';
import { TextEditor } from './TextEditor';
import { type CanvasDragCallbacks, useCanvasDrag } from './useCanvasDrag';

interface Props {
  slide: Slide;
  elements: Readonly<Record<string, Element>>;
  theme: Theme;
  scale: number;
}

function elementIdAt(target: EventTarget): string | null {
  // Element, not HTMLElement: clicks on charts and shapes land on SVG nodes.
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLElement>('[data-element-id]')?.dataset.elementId ?? null;
}

/**
 * The interactive slide: selection, move, resize and in-place text editing.
 * Pointer handling is delegated at the slide level so ElementView stays a pure,
 * memoized renderer shared with the filmstrip.
 */
export function EditableSlide({ slide, elements, theme, scale }: Props) {
  const { dispatch, getDeck } = useDeckActions();
  const { selectedElementIds, select, notify, setDropTarget } = useEditorUi();
  const commands = useEditorCommands();
  const [editingId, setEditingId] = useState<string | null>(null);

  const dragCallbacks = useMemo<CanvasDragCallbacks>(
    () => ({
      onCommit(kind, changed) {
        const ops: Operation[] = [...changed].map(([elementId, bbox]) => ({
          type: 'element.setBBox',
          elementId,
          bbox,
        }));
        const deck = getDeck();
        const what = describeElements(deck, [...changed.keys()]);
        const where = `slide ${deck.slideOrder.indexOf(slide.id) + 1}`;
        const result = dispatch(ops, {
          source: 'user',
          label: `${kind === 'move' ? 'Moved' : 'Resized'} ${what} on ${where}`,
        });
        if (!result.ok) notify(result.error);
      },
      onTransfer(elementIds: string[], target: DropTarget) {
        const deck = getDeck();
        const from = deck.slideOrder.indexOf(slide.id) + 1;
        const to = deck.slideOrder.indexOf(target.slideId) + 1;
        const what = describeElements(deck, elementIds);
        const verb = target.mode === 'copy' ? 'Copied' : 'Moved';
        const result = dispatch(
          [{ type: 'element.transfer', elementIds, toSlideId: target.slideId, mode: target.mode }],
          { source: 'user', label: `${verb} ${what} from slide ${from} to slide ${to}` },
        );
        if (!result.ok) {
          notify(result.error);
          return;
        }
        if (target.mode === 'move') select([]);
        notify(`${verb} ${elementIds.length > 1 ? `${elementIds.length} elements` : 'element'} to slide ${to}`);
      },
      onDropTargetChange: setDropTarget,
    }),
    [dispatch, getDeck, notify, select, setDropTarget, slide.id],
  );

  const { preview, transferring, beginMove, beginResize } = useCanvasDrag(scale, dragCallbacks);

  const boxOf = (el: Element): BBox => preview?.get(el.id) ?? el.bbox;

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    const id = elementIdAt(e.target);
    if (!id || !elements[id]) {
      if (!e.shiftKey) select([]);
      return;
    }

    // Shift toggles membership; a plain click keeps an existing multi-selection so it can be dragged as a group.
    const alreadySelected = selectedElementIds.includes(id);
    let next: readonly string[];
    if (e.shiftKey) {
      if (alreadySelected) {
        select(selectedElementIds.filter((s) => s !== id));
        return;
      }
      next = [...selectedElementIds, id];
    } else {
      next = alreadySelected ? selectedElementIds : [id];
    }
    select(next);

    const origins = new Map<string, BBox>();
    for (const sid of next) {
      const el = elements[sid];
      if (el && !el.locked) origins.set(sid, el.bbox);
    }
    if (origins.size > 0) beginMove(origins, e.clientX, e.clientY, slide.id);
  };

  const onDoubleClick = (e: ReactMouseEvent) => {
    const id = elementIdAt(e.target);
    const el = id ? elements[id] : undefined;
    if (!el || el.kind !== 'text') return;
    if (el.locked) {
      notify('This text box is locked.');
      return;
    }
    select([el.id]);
    setEditingId(el.id);
  };

  const onHandlePointerDown = (handle: Handle, e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const id = selectedElementIds[0];
    const el = id ? elements[id] : undefined;
    if (el) beginResize(el.id, handle, el.bbox, e.clientX, e.clientY);
  };

  const editing = editingId ? elements[editingId] : undefined;
  const selectedBoxes = selectedElementIds.flatMap((id) => {
    const el = elements[id];
    return el && id !== editingId ? [{ id, bbox: boxOf(el), locked: el.locked }] : [];
  });

  return (
    // Elements are clipped to the artboard; outlines, handles and the text editor sit
    // on an unclipped layer above so handles at the slide edge stay fully grabbable.
    <div className="slide-editor" onPointerDown={onPointerDown} onDoubleClick={onDoubleClick}>
      <div
        className="slide-surface slide-surface--editable"
        style={{
          background: slide.backgroundColor ?? theme.colors.background,
          color: theme.colors.text,
          fontFamily: theme.fontFamily,
        }}
      >
        {slide.elementOrder.map((id) => {
          const el = elements[id];
          if (!el) return null;
          const moved = preview?.get(id);
          return (
            <ElementView
              key={id}
              element={moved ? { ...el, bbox: moved } : el}
              theme={theme}
              hidden={id === editingId}
              dimmed={transferring && moved !== undefined}
            />
          );
        })}
      </div>

      <SelectionOverlay boxes={selectedBoxes} scale={scale} onHandlePointerDown={onHandlePointerDown} />

      {editing?.kind === 'text' && (
        <TextEditor
          key={editing.id}
          element={editing}
          theme={theme}
          scale={scale}
          onCommit={(text) => commands.editText(editing.id, text)}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  );
}
