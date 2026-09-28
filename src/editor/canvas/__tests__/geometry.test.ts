import { describe, expect, it } from 'vitest';
import { type BBox, SLIDE_HEIGHT, SLIDE_WIDTH } from '@/domain/schema/geometry';
import { moveGroup, resizeBox } from '../geometry';

const box = (x: number, y: number, w: number, h: number): BBox => ({ x, y, w, h, rotation: 0 });

describe('moveGroup', () => {
  it('snaps the group top-left to the grid and keeps relative offsets', () => {
    const origins = new Map([
      ['a', box(100, 100, 200, 100)],
      ['b', box(400, 300, 100, 100)],
    ]);
    const moved = moveGroup(origins, 33, 47, { snapToGrid: true });
    expect(moved.get('a')).toMatchObject({ x: 140, y: 140 });
    expect(moved.get('b')).toMatchObject({ x: 440, y: 340 });
  });

  it('moves freely without snapping', () => {
    const moved = moveGroup(new Map([['a', box(100, 100, 200, 100)]]), 33, 47, { snapToGrid: false });
    expect(moved.get('a')).toMatchObject({ x: 133, y: 147 });
  });

  it('keeps the whole group on the artboard', () => {
    const origins = new Map([
      ['a', box(100, 100, 200, 100)],
      ['b', box(400, 300, 100, 100)],
    ]);
    const moved = moveGroup(origins, 5000, 5000, { snapToGrid: true });
    expect(moved.get('b')).toMatchObject({ x: SLIDE_WIDTH - 100, y: SLIDE_HEIGHT - 100 });
    expect(moved.get('a')).toMatchObject({ x: SLIDE_WIDTH - 400, y: SLIDE_HEIGHT - 300 });
  });
});

describe('resizeBox', () => {
  const origin = box(200, 200, 400, 200);

  it('moves only the dragged edges', () => {
    expect(resizeBox(origin, 'e', 100, 999, { snapToGrid: false, keepAspect: false })).toEqual(box(200, 200, 500, 200));
    expect(resizeBox(origin, 'nw', -50, -30, { snapToGrid: false, keepAspect: false })).toEqual(
      box(150, 170, 450, 230),
    );
  });

  it('snaps moved edges to the grid', () => {
    expect(resizeBox(origin, 'se', 13, 27, { snapToGrid: true, keepAspect: false })).toEqual(box(200, 200, 420, 220));
  });

  it('enforces a minimum size instead of flipping', () => {
    const result = resizeBox(origin, 'w', 1000, 0, { snapToGrid: false, keepAspect: false });
    expect(result.w).toBe(20);
    expect(result.x + result.w).toBe(600);
  });

  it('stays inside the artboard', () => {
    const result = resizeBox(origin, 'se', 5000, 5000, { snapToGrid: false, keepAspect: false });
    expect(result.x + result.w).toBe(SLIDE_WIDTH);
    expect(result.y + result.h).toBe(SLIDE_HEIGHT);
  });

  it('keeps aspect ratio on corner handles when asked', () => {
    const result = resizeBox(origin, 'se', 400, 0, { snapToGrid: false, keepAspect: true });
    expect(result.w / result.h).toBeCloseTo(2);
  });
});
