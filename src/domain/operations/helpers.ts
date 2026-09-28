import type { Deck, Slide } from '../schema/deck';
import type { Element } from '../schema/elements';
import type { IdGenerator } from '../schema/ids';

/** Thrown by handlers; converted into a failed ApplyResult. */
export class OperationError extends Error {}

export interface OpContext {
  newId: IdGenerator;
  /** Ids created by this transaction, in creation order. */
  created: string[];
}

export function requireSlide(deck: Deck, slideId: string): Slide {
  const slide = deck.slides[slideId];
  if (!slide) throw new OperationError(`Slide ${slideId} does not exist`);
  return slide;
}

export function requireElement(deck: Deck, elementId: string): Element {
  const el = deck.elements[elementId];
  if (!el) throw new OperationError(`Element ${elementId} does not exist`);
  return el;
}

export function requireUnlocked(el: Element, action: string): void {
  if (el.locked) throw new OperationError(`Element ${el.id} is locked and cannot be ${action}`);
}

export function withSlide(deck: Deck, slide: Slide): Deck {
  return { ...deck, slides: { ...deck.slides, [slide.id]: slide } };
}

export function withElements(deck: Deck, elements: readonly Element[]): Deck {
  if (elements.length === 0) return deck;
  const next = { ...deck.elements };
  for (const el of elements) next[el.id] = el;
  return { ...deck, elements: next };
}

export function withoutElements(deck: Deck, elementIds: readonly string[]): Deck {
  const next = { ...deck.elements };
  for (const id of elementIds) delete next[id];
  return { ...deck, elements: next };
}

export function insertAt<T>(list: readonly T[], item: T, index: number | undefined): T[] {
  const i = index === undefined ? list.length : Math.min(Math.max(index, 0), list.length);
  return [...list.slice(0, i), item, ...list.slice(i)];
}

export function uniqueId(deck: Deck, requested: string | undefined, fresh: () => string): string {
  if (requested === undefined) return fresh();
  if (deck.slides[requested] || deck.elements[requested]) {
    throw new OperationError(`Id ${requested} is already in use`);
  }
  return requested;
}
