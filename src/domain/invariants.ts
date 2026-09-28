import type { Deck } from './schema/deck';

/** Referential-integrity checks. Returns human-readable problems; empty means valid. */
export function checkDeck(deck: Deck): string[] {
  const problems: string[] = [];

  const orderSet = new Set(deck.slideOrder);
  if (orderSet.size !== deck.slideOrder.length) problems.push('slideOrder contains duplicates');
  for (const id of deck.slideOrder) {
    if (!deck.slides[id]) problems.push(`slideOrder references missing slide ${id}`);
  }
  for (const id of Object.keys(deck.slides)) {
    if (!orderSet.has(id)) problems.push(`slide ${id} is not in slideOrder`);
  }

  const owner = new Map<string, string>();
  for (const slide of Object.values(deck.slides)) {
    for (const elId of slide.elementOrder) {
      const el = deck.elements[elId];
      if (!el) {
        problems.push(`slide ${slide.id} references missing element ${elId}`);
        continue;
      }
      if (el.slideId !== slide.id)
        problems.push(`element ${elId} has slideId ${el.slideId} but is listed on ${slide.id}`);
      if (owner.has(elId)) problems.push(`element ${elId} is listed on more than one slide`);
      owner.set(elId, slide.id);
    }
  }
  for (const id of Object.keys(deck.elements)) {
    if (!owner.has(id)) problems.push(`element ${id} is not on any slide`);
  }

  return problems;
}
