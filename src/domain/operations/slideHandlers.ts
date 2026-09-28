import type { Deck, Slide } from '../schema/deck';
import type { Element } from '../schema/elements';
import type { OperationOf } from './schema';
import {
  insertAt,
  type OpContext,
  OperationError,
  requireSlide,
  uniqueId,
  withElements,
  withSlide,
  withoutElements,
} from './helpers';

export function addSlide(deck: Deck, op: OperationOf<'slide.add'>, ctx: OpContext): Deck {
  const id = uniqueId(deck, op.slideId, () => ctx.newId('sld'));
  const slide: Slide = {
    id,
    title: op.slide?.title ?? 'Untitled slide',
    layout: op.slide?.layout ?? 'blank',
    backgroundColor: op.slide?.backgroundColor ?? null,
    notes: op.slide?.notes ?? '',
    status: op.slide?.status ?? 'ready',
    elementOrder: [],
  };
  ctx.created.push(id);
  return { ...withSlide(deck, slide), slideOrder: insertAt(deck.slideOrder, id, op.index) };
}

export function updateSlide(deck: Deck, op: OperationOf<'slide.update'>): Deck {
  const slide = requireSlide(deck, op.slideId);
  const patch = Object.fromEntries(Object.entries(op.patch).filter(([, v]) => v !== undefined));
  return withSlide(deck, { ...slide, ...patch });
}

export function deleteSlide(deck: Deck, op: OperationOf<'slide.delete'>): Deck {
  const slide = requireSlide(deck, op.slideId);
  const slides = { ...deck.slides };
  delete slides[slide.id];
  return {
    ...withoutElements(deck, slide.elementOrder),
    slides,
    slideOrder: deck.slideOrder.filter((id) => id !== slide.id),
  };
}

export function duplicateSlide(deck: Deck, op: OperationOf<'slide.duplicate'>, ctx: OpContext): Deck {
  const source = requireSlide(deck, op.slideId);
  const newSlideId = ctx.newId('sld');
  ctx.created.push(newSlideId);

  const copies: Element[] = source.elementOrder.map((elId) => {
    const el = deck.elements[elId];
    if (!el) throw new OperationError(`Element ${elId} does not exist`);
    const copy = { ...el, id: ctx.newId('el'), slideId: newSlideId };
    ctx.created.push(copy.id);
    return copy;
  });

  const slide: Slide = { ...source, id: newSlideId, elementOrder: copies.map((c) => c.id) };
  const index = op.index ?? deck.slideOrder.indexOf(source.id) + 1;
  return {
    ...withElements(withSlide(deck, slide), copies),
    slideOrder: insertAt(deck.slideOrder, newSlideId, index),
  };
}

export function moveSlide(deck: Deck, op: OperationOf<'slide.move'>): Deck {
  requireSlide(deck, op.slideId);
  const rest = deck.slideOrder.filter((id) => id !== op.slideId);
  return { ...deck, slideOrder: insertAt(rest, op.slideId, op.toIndex) };
}
