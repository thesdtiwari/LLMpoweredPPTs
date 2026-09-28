'use client';

import type { PointerEvent as ReactPointerEvent } from 'react';
import type { BBox } from '@/domain/schema/geometry';
import { type Handle, HANDLES } from './geometry';

const HANDLE_POSITION: Record<Handle, [number, number]> = {
  nw: [0, 0],
  n: [0.5, 0],
  ne: [1, 0],
  e: [1, 0.5],
  se: [1, 1],
  s: [0.5, 1],
  sw: [0, 1],
  w: [0, 0.5],
};

const HANDLE_CURSOR: Record<Handle, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
};

interface Props {
  boxes: readonly { id: string; bbox: BBox; locked: boolean }[];
  scale: number;
  /** Handles are shown only for a single, unlocked selection. */
  onHandlePointerDown?: (handle: Handle, e: ReactPointerEvent) => void;
}

/**
 * Outlines and resize handles, drawn in slide space. Sizes are divided by the
 * artboard scale so they look the same on screen at any zoom.
 */
export function SelectionOverlay({ boxes, scale, onHandlePointerDown }: Props) {
  const line = 2 / scale;
  const handleSize = 12 / scale;
  const single = boxes.length === 1 ? boxes[0] : undefined;

  return (
    <>
      {boxes.map(({ id, bbox, locked }) => (
        <div
          key={id}
          className="selection-box"
          style={{
            left: bbox.x,
            top: bbox.y,
            width: bbox.w,
            height: bbox.h,
            outline: `${line}px ${locked ? 'dashed' : 'solid'} var(--accent)`,
          }}
        />
      ))}
      {single &&
        !single.locked &&
        onHandlePointerDown &&
        HANDLES.map((handle) => {
          const [fx, fy] = HANDLE_POSITION[handle];
          return (
            <div
              key={handle}
              className="resize-handle"
              data-handle={handle}
              onPointerDown={(e) => onHandlePointerDown(handle, e)}
              style={{
                left: single.bbox.x + fx * single.bbox.w - handleSize / 2,
                top: single.bbox.y + fy * single.bbox.h - handleSize / 2,
                width: handleSize,
                height: handleSize,
                borderWidth: 1.5 / scale,
                cursor: HANDLE_CURSOR[handle],
              }}
            />
          );
        })}
    </>
  );
}
