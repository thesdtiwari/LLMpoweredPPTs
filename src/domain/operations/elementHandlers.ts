import { z } from 'zod';
import type { Deck } from '../schema/deck';
import { type Element, ElementSchema } from '../schema/elements';
import { clampBBox, unionBBox } from '../schema/geometry';
import type { OperationOf } from './schema';
import {
  insertAt,
  type OpContext,
  OperationError,
  requireElement,
  requireSlide,
  requireUnlocked,
  uniqueId,
  withElements,
  withSlide,
  withoutElements,
} from './helpers';

const IMMUTABLE_FIELDS = new Set(['id', 'slideId', 'kind', 'bbox']);
const DEFAULT_DUPLICATE_OFFSET = { x: 40, y: 40 };

function validated(candidate: unknown): Element {
  const result = ElementSchema.safeParse(candidate);
  if (!result.success) throw new OperationError(z.prettifyError(result.error));
  return result.data;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function addElement(deck: Deck, op: OperationOf<'element.add'>, ctx: OpContext): Deck {
  const slide = requireSlide(deck, op.slideId);
  const id = uniqueId(deck, op.elementId, () => ctx.newId('el'));
  const element = validated({ ...op.element, id, slideId: slide.id, bbox: clampBBox(op.element.bbox) });
  ctx.created.push(id);
  return withElements(withSlide(deck, { ...slide, elementOrder: insertAt(slide.elementOrder, id, op.index) }), [
    element,
  ]);
}

export function updateElement(deck: Deck, op: OperationOf<'element.update'>): Deck {
  const el = requireElement(deck, op.elementId);
  const keys = Object.keys(op.patch);
  const forbidden = keys.filter((k) => IMMUTABLE_FIELDS.has(k));
  if (forbidden.length > 0) {
    throw new OperationError(`Cannot update ${forbidden.join(', ')} with element.update`);
  }
  if (keys.some((k) => k !== 'locked')) requireUnlocked(el, 'edited');

  const merged: Record<string, unknown> = { ...el };
  for (const [key, value] of Object.entries(op.patch)) {
    if (value === undefined) continue;
    const current = merged[key];
    merged[key] = isPlainObject(current) && isPlainObject(value) ? { ...current, ...value } : value;
  }
  return withElements(deck, [validated(merged)]);
}

export function setElementBBox(deck: Deck, op: OperationOf<'element.setBBox'>): Deck {
  const el = requireElement(deck, op.elementId);
  requireUnlocked(el, 'moved or resized');
  const patch = Object.fromEntries(Object.entries(op.bbox).filter(([, v]) => v !== undefined));
  return withElements(deck, [{ ...el, bbox: clampBBox({ ...el.bbox, ...patch }) }]);
}

export function deleteElements(deck: Deck, op: OperationOf<'element.delete'>): Deck {
  let next = deck;
  for (const elementId of op.elementIds) {
    const el = requireElement(next, elementId);
    requireUnlocked(el, 'deleted');
    const slide = requireSlide(next, el.slideId);
    next = withSlide(next, { ...slide, elementOrder: slide.elementOrder.filter((id) => id !== elementId) });
  }
  return withoutElements(next, op.elementIds);
}

export function duplicateElements(deck: Deck, op: OperationOf<'element.duplicate'>, ctx: OpContext): Deck {
  const offset = op.offset ?? DEFAULT_DUPLICATE_OFFSET;
  let next = deck;
  for (const elementId of op.elementIds) {
    const el = requireElement(next, elementId);
    const copy: Element = {
      ...el,
      id: ctx.newId('el'),
      locked: false,
      bbox: clampBBox({ ...el.bbox, x: el.bbox.x + offset.x, y: el.bbox.y + offset.y }),
    };
    ctx.created.push(copy.id);
    const slide = requireSlide(next, el.slideId);
    next = withElements(withSlide(next, { ...slide, elementOrder: [...slide.elementOrder, copy.id] }), [copy]);
  }
  return next;
}

/** Move or copy elements to another slide (or reposition on the same slide), keeping the group's relative layout. */
export function transferElements(deck: Deck, op: OperationOf<'element.transfer'>, ctx: OpContext): Deck {
  requireSlide(deck, op.toSlideId);
  const sources = op.elementIds.map((id) => requireElement(deck, id));
  if (op.mode === 'move') sources.forEach((el) => requireUnlocked(el, 'moved'));

  const group = unionBBox(sources.map((el) => el.bbox));
  const dx = op.position && group ? op.position.x - group.x : 0;
  const dy = op.position && group ? op.position.y - group.y : 0;

  let next = deck;
  for (const el of sources) {
    const bbox = clampBBox({ ...el.bbox, x: el.bbox.x + dx, y: el.bbox.y + dy });

    if (op.mode === 'move') {
      const from = requireSlide(next, el.slideId);
      next = withSlide(next, { ...from, elementOrder: from.elementOrder.filter((id) => id !== el.id) });
      const to = requireSlide(next, op.toSlideId);
      next = withSlide(next, { ...to, elementOrder: [...to.elementOrder, el.id] });
      next = withElements(next, [{ ...el, slideId: op.toSlideId, bbox }]);
    } else {
      const copy: Element = { ...el, id: ctx.newId('el'), slideId: op.toSlideId, locked: false, bbox };
      ctx.created.push(copy.id);
      const to = requireSlide(next, op.toSlideId);
      next = withElements(withSlide(next, { ...to, elementOrder: [...to.elementOrder, copy.id] }), [copy]);
    }
  }
  return next;
}

export function reorderElementZ(deck: Deck, op: OperationOf<'element.reorderZ'>): Deck {
  const el = requireElement(deck, op.elementId);
  const slide = requireSlide(deck, el.slideId);
  const order = slide.elementOrder.filter((id) => id !== el.id);
  const current = slide.elementOrder.indexOf(el.id);
  const target = {
    forward: current + 1,
    backward: current - 1,
    front: order.length,
    back: 0,
  }[op.direction];
  return withSlide(deck, { ...slide, elementOrder: insertAt(order, el.id, Math.max(0, target)) });
}
