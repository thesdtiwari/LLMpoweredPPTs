import type { Deck, Slide } from './schema/deck';
import type { Element } from './schema/elements';

export function getSlide(deck: Deck, slideId: string): Slide | undefined {
  return deck.slides[slideId];
}

export function getElement(deck: Deck, elementId: string): Element | undefined {
  return deck.elements[elementId];
}

export function getOrderedSlides(deck: Deck): Slide[] {
  return deck.slideOrder.flatMap((id) => deck.slides[id] ?? []);
}

/** Elements of a slide in z-order, back to front. */
export function getSlideElements(deck: Deck, slideId: string): Element[] {
  const slide = deck.slides[slideId];
  if (!slide) return [];
  return slide.elementOrder.flatMap((id) => deck.elements[id] ?? []);
}

export function getSlideIndex(deck: Deck, slideId: string): number {
  return deck.slideOrder.indexOf(slideId);
}

function snippet(text: string, max = 40): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

/** Short description used in history labels and change summaries, e.g. `chart "Revenue ($M)"`. */
export function describeElement(el: Element): string {
  switch (el.kind) {
    case 'chart':
      return el.title ? `${el.chartType} chart "${snippet(el.title)}"` : `${el.chartType} chart`;
    case 'text':
      return `text "${snippet(el.text)}"`;
    case 'table':
      return `table "${snippet(el.rows[0]?.join(' | ') ?? '')}"`;
    case 'image':
      return `image "${snippet(el.alt)}"`;
    case 'shape':
      return `${el.shape} shape`;
  }
}

/** Describes one element, or a count when several are involved. */
export function describeElements(deck: Deck, elementIds: readonly string[]): string {
  const els = elementIds.flatMap((id) => deck.elements[id] ?? []);
  if (els.length === 1) return describeElement(els[0]!);
  return `${els.length} elements`;
}
