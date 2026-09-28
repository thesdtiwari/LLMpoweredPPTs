'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BBox } from '@/domain/schema/geometry';
import type { DropTarget } from '@/store/EditorUiProvider';
import { DRAG_THRESHOLD_PX, type Handle, moveGroup, resizeBox, sameBox } from './geometry';

export type DragKind = 'move' | 'resize';

/** Marks a DOM node (a filmstrip thumbnail) as a drop target for elements dragged off the canvas. */
export const DROP_SLIDE_ATTR = 'data-drop-slide-id';

interface Gesture {
  kind: DragKind;
  origins: ReadonlyMap<string, BBox>;
  /** Set for moves: dropping onto another slide's thumbnail transfers the elements there. */
  sourceSlideId?: string;
  startX: number;
  startY: number;
  started: boolean;
  preview: Map<string, BBox> | null;
  dropTarget: DropTarget | null;
  last: { x: number; y: number };
  update(dx: number, dy: number, ev: PointerEvent): Map<string, BBox>;
}

export interface CanvasDragCallbacks {
  /** A move or resize on the canvas finished; only boxes that changed are passed. */
  onCommit(kind: DragKind, changed: ReadonlyMap<string, BBox>): void;
  /** Elements were dropped onto another slide's thumbnail. */
  onTransfer(elementIds: string[], target: DropTarget): void;
  onDropTargetChange(target: DropTarget | null): void;
}

function findDropTarget(x: number, y: number, copy: boolean, sourceSlideId: string): DropTarget | null {
  const node = document.elementFromPoint(x, y)?.closest<HTMLElement>(`[${DROP_SLIDE_ATTR}]`);
  const slideId = node?.getAttribute(DROP_SLIDE_ATTR);
  if (!slideId || slideId === sourceSlideId) return null;
  return { slideId, mode: copy ? 'copy' : 'move' };
}

const sameTarget = (a: DropTarget | null, b: DropTarget | null) => a?.slideId === b?.slideId && a?.mode === b?.mode;

/**
 * Pointer-driven move / resize for the canvas, plus dragging elements onto a
 * filmstrip thumbnail (⌥/Alt copies instead of moving).
 *
 * The in-progress gesture lives in a ref; only the preview boxes are React
 * state, so each frame re-renders just the dragged elements. Nothing touches
 * the deck until pointer up, which makes one undo entry per gesture. Escape
 * cancels and restores the original boxes.
 */
export function useCanvasDrag(scale: number, callbacks: CanvasDragCallbacks) {
  const [preview, setPreview] = useState<ReadonlyMap<string, BBox> | null>(null);
  const [transferring, setTransferring] = useState(false);
  const gestureRef = useRef<Gesture | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const scaleRef = useRef(scale);
  const callbacksRef = useRef(callbacks);

  useEffect(() => {
    scaleRef.current = scale;
    callbacksRef.current = callbacks;
  });

  useEffect(() => () => cleanupRef.current?.(), []);

  const start = useCallback((gesture: Gesture) => {
    cleanupRef.current?.();
    gestureRef.current = gesture;

    const setTarget = (g: Gesture, target: DropTarget | null) => {
      if (sameTarget(g.dropTarget, target)) return;
      g.dropTarget = target;
      setTransferring(target !== null);
      callbacksRef.current.onDropTargetChange(target);
    };

    const onMove = (ev: PointerEvent) => {
      const g = gestureRef.current;
      if (!g) return;
      g.last = { x: ev.clientX, y: ev.clientY };
      const screenDx = ev.clientX - g.startX;
      const screenDy = ev.clientY - g.startY;
      if (!g.started && Math.hypot(screenDx, screenDy) < DRAG_THRESHOLD_PX) return;
      g.started = true;

      const target = g.sourceSlideId ? findDropTarget(ev.clientX, ev.clientY, ev.altKey, g.sourceSlideId) : null;
      setTarget(g, target);
      // Over a thumbnail the elements stay put (faded) — they are going elsewhere.
      g.preview = target ? new Map(g.origins) : g.update(screenDx / scaleRef.current, screenDy / scaleRef.current, ev);
      setPreview(g.preview);
    };

    const finish = (commit: boolean) => {
      const g = gestureRef.current;
      cleanup();
      setPreview(null);
      if (!g) return;
      const target = g.dropTarget;
      setTarget(g, null);
      if (!commit || !g.started) return;

      if (target) {
        callbacksRef.current.onTransfer([...g.origins.keys()], target);
        return;
      }
      if (!g.preview) return;
      const changed = new Map([...g.preview].filter(([id, b]) => !sameBox(b, g.origins.get(id)!)));
      if (changed.size > 0) callbacksRef.current.onCommit(g.kind, changed);
    };

    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    const onKey = (ev: KeyboardEvent) => {
      const g = gestureRef.current;
      if (ev.key === 'Escape' && ev.type === 'keydown') {
        // Capture phase: keep Escape from also clearing the selection.
        ev.preventDefault();
        ev.stopPropagation();
        finish(false);
      } else if (ev.key === 'Alt' && g?.started && g.sourceSlideId) {
        // Toggling ⌥ mid-drag switches between move and copy without moving the pointer.
        ev.preventDefault();
        setTarget(g, findDropTarget(g.last.x, g.last.y, ev.type === 'keydown', g.sourceSlideId));
      }
    };

    function cleanup() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKey, true);
      document.body.classList.remove('is-dragging');
      gestureRef.current = null;
      cleanupRef.current = null;
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    document.body.classList.add('is-dragging');
    cleanupRef.current = cleanup;
  }, []);

  const baseGesture = (origins: ReadonlyMap<string, BBox>, clientX: number, clientY: number) => ({
    origins,
    startX: clientX,
    startY: clientY,
    started: false,
    preview: null,
    dropTarget: null,
    last: { x: clientX, y: clientY },
  });

  /** Hold ⌘/Ctrl while dragging to place freely without the grid. */
  const beginMove = useCallback(
    (origins: ReadonlyMap<string, BBox>, clientX: number, clientY: number, sourceSlideId: string) => {
      start({
        ...baseGesture(origins, clientX, clientY),
        kind: 'move',
        sourceSlideId,
        update: (dx, dy, ev) => moveGroup(origins, dx, dy, { snapToGrid: !(ev.metaKey || ev.ctrlKey) }),
      });
    },
    [start],
  );

  /** Hold Shift to keep the aspect ratio; ⌘/Ctrl to ignore the grid. */
  const beginResize = useCallback(
    (elementId: string, handle: Handle, origin: BBox, clientX: number, clientY: number) => {
      start({
        ...baseGesture(new Map([[elementId, origin]]), clientX, clientY),
        kind: 'resize',
        update: (dx, dy, ev) =>
          new Map([
            [
              elementId,
              resizeBox(origin, handle, dx, dy, { snapToGrid: !(ev.metaKey || ev.ctrlKey), keepAspect: ev.shiftKey }),
            ],
          ]),
      });
    },
    [start],
  );

  return { preview, transferring, beginMove, beginResize };
}
