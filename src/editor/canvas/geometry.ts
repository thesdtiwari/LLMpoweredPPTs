import { type BBox, MIN_ELEMENT_SIZE, SLIDE_HEIGHT, SLIDE_WIDTH, unionBBox } from '@/domain/schema/geometry';

/** Snap increment in slide units (1920 / 20 = 96 columns). */
export const GRID = 20;

/** Pointer travel (screen px) before a press becomes a drag, so plain clicks never move anything. */
export const DRAG_THRESHOLD_PX = 3;

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export const HANDLES: readonly Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export function snap(value: number, grid = GRID): number {
  return Math.round(value / grid) * grid;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

/**
 * Moves a group of boxes by (dx, dy) slide units, keeping their relative layout.
 * The group's top-left snaps to the grid and the whole group stays on the artboard.
 */
export function moveGroup(
  origins: ReadonlyMap<string, BBox>,
  dx: number,
  dy: number,
  options: { snapToGrid: boolean },
): Map<string, BBox> {
  const group = unionBBox([...origins.values()]);
  if (!group) return new Map();

  let x = group.x + dx;
  let y = group.y + dy;
  if (options.snapToGrid) {
    x = snap(x);
    y = snap(y);
  }
  x = clamp(x, 0, Math.max(0, SLIDE_WIDTH - group.w));
  y = clamp(y, 0, Math.max(0, SLIDE_HEIGHT - group.h));

  const offsetX = x - group.x;
  const offsetY = y - group.y;
  const result = new Map<string, BBox>();
  for (const [id, b] of origins) {
    result.set(id, { ...b, x: Math.round(b.x + offsetX), y: Math.round(b.y + offsetY) });
  }
  return result;
}

/**
 * Resizes a box by dragging one handle (dx, dy in slide units). Only the edges
 * the handle controls move; they snap to the grid and stay on the artboard.
 * keepAspect applies to corner handles.
 */
export function resizeBox(
  origin: BBox,
  handle: Handle,
  dx: number,
  dy: number,
  options: { snapToGrid: boolean; keepAspect: boolean },
): BBox {
  const movesW = handle.includes('w');
  const movesE = handle.includes('e');
  const movesN = handle.includes('n');
  const movesS = handle.includes('s');
  const maybeSnap = (v: number) => (options.snapToGrid ? snap(v) : v);

  let left = origin.x;
  let top = origin.y;
  let right = origin.x + origin.w;
  let bottom = origin.y + origin.h;

  if (movesW) left = clamp(maybeSnap(left + dx), 0, right - MIN_ELEMENT_SIZE);
  if (movesE) right = clamp(maybeSnap(right + dx), left + MIN_ELEMENT_SIZE, SLIDE_WIDTH);
  if (movesN) top = clamp(maybeSnap(top + dy), 0, bottom - MIN_ELEMENT_SIZE);
  if (movesS) bottom = clamp(maybeSnap(bottom + dy), top + MIN_ELEMENT_SIZE, SLIDE_HEIGHT);

  const isCorner = (movesW || movesE) && (movesN || movesS);
  if (options.keepAspect && isCorner && origin.h > 0) {
    const ratio = origin.w / origin.h;
    let w = right - left;
    let h = bottom - top;
    if (w / h > ratio) w = h * ratio;
    else h = w / ratio;
    // Shrink-only adjustment, anchored at the opposite corner, so bounds still hold.
    if (movesW) left = right - w;
    else right = left + w;
    if (movesN) top = bottom - h;
    else bottom = top + h;
  }

  return {
    x: Math.round(left),
    y: Math.round(top),
    w: Math.round(right - left),
    h: Math.round(bottom - top),
    rotation: origin.rotation,
  };
}

export function sameBox(a: BBox, b: BBox): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h && a.rotation === b.rotation;
}
