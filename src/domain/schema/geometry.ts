import { z } from 'zod';

/**
 * Every slide is a fixed 1920×1080 logical artboard (16:9). The domain, the AI,
 * and export all work in these units; only the canvas converts to screen pixels.
 */
export const SLIDE_WIDTH = 1920;
export const SLIDE_HEIGHT = 1080;
export const MIN_ELEMENT_SIZE = 20;

export const BBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
  rotation: z.number(),
});
export type BBox = z.infer<typeof BBoxSchema>;

export const PointSchema = z.object({ x: z.number(), y: z.number() });
export type Point = z.infer<typeof PointSchema>;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Keeps an element fully inside the artboard, shrinking it first if it is too large. */
export function clampBBox(bbox: BBox): BBox {
  const w = Math.round(clamp(bbox.w, MIN_ELEMENT_SIZE, SLIDE_WIDTH));
  const h = Math.round(clamp(bbox.h, MIN_ELEMENT_SIZE, SLIDE_HEIGHT));
  return {
    x: Math.round(clamp(bbox.x, 0, SLIDE_WIDTH - w)),
    y: Math.round(clamp(bbox.y, 0, SLIDE_HEIGHT - h)),
    w,
    h,
    rotation: bbox.rotation,
  };
}

/** Smallest box containing all given boxes (rotation ignored). */
export function unionBBox(boxes: readonly BBox[]): BBox | null {
  const first = boxes[0];
  if (!first) return null;
  let minX = first.x;
  let minY = first.y;
  let maxX = first.x + first.w;
  let maxY = first.y + first.h;
  for (const b of boxes) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY, rotation: 0 };
}
