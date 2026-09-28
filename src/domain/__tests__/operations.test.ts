import { describe, expect, it } from 'vitest';
import { bbox, chartInput, createEmptyDeck, textInput } from '../factories';
import { checkDeck } from '../invariants';
import { applyOperations } from '../operations/apply';
import type { Operation } from '../operations/schema';
import { createSampleDeck } from '../sampleDeck';
import type { Deck } from '../schema/deck';
import { SLIDE_HEIGHT, SLIDE_WIDTH } from '../schema/geometry';
import { sequentialIds } from '../schema/ids';

function apply(deck: Deck, ops: Operation[]) {
  const result = applyOperations(deck, ops, sequentialIds());
  if (!result.ok) throw new Error(result.error);
  return result;
}

/** Two slides; slide A holds a text box and a chart. */
function fixture() {
  const deck = createEmptyDeck('Test', sequentialIds());
  const ops: Operation[] = [
    { type: 'slide.add', slideId: 'A' },
    { type: 'slide.add', slideId: 'B' },
    { type: 'element.add', slideId: 'A', elementId: 'text', element: textInput('Hello', bbox(100, 100, 400, 100)) },
    {
      type: 'element.add',
      slideId: 'A',
      elementId: 'chart',
      element: { ...chartInput(), bbox: bbox(900, 500, 800, 500) },
    },
  ];
  return apply(deck, ops).deck;
}

describe('applyOperations', () => {
  it('builds a valid sample deck', () => {
    const deck = createSampleDeck(sequentialIds());
    expect(deck.slideOrder).toHaveLength(4);
    expect(checkDeck(deck)).toEqual([]);
  });

  it('adds, moves and deletes slides', () => {
    let deck = fixture();
    deck = apply(deck, [{ type: 'slide.add', slideId: 'C', index: 0 }]).deck;
    expect(deck.slideOrder).toEqual(['C', 'A', 'B']);

    deck = apply(deck, [{ type: 'slide.move', slideId: 'C', toIndex: 2 }]).deck;
    expect(deck.slideOrder).toEqual(['A', 'B', 'C']);

    deck = apply(deck, [{ type: 'slide.delete', slideId: 'A' }]).deck;
    expect(deck.slideOrder).toEqual(['B', 'C']);
    expect(deck.elements.chart).toBeUndefined();
    expect(checkDeck(deck)).toEqual([]);
  });

  it('duplicates a slide with fresh element ids', () => {
    const deck = fixture();
    const { deck: next, createdIds } = apply(deck, [{ type: 'slide.duplicate', slideId: 'A' }]);
    const copyId = createdIds[0]!;
    expect(next.slideOrder).toEqual(['A', copyId, 'B']);
    expect(next.slides[copyId]!.elementOrder).toHaveLength(2);
    expect(next.slides[copyId]!.elementOrder).not.toContain('chart');
    expect(checkDeck(next)).toEqual([]);
  });

  it('moves an element to another slide and updates its parent', () => {
    const next = apply(fixture(), [
      { type: 'element.transfer', elementIds: ['chart'], toSlideId: 'B', mode: 'move' },
    ]).deck;
    expect(next.elements.chart!.slideId).toBe('B');
    expect(next.slides.A!.elementOrder).toEqual(['text']);
    expect(next.slides.B!.elementOrder).toEqual(['chart']);
  });

  it('copies an element to another slide with a new id', () => {
    const { deck: next, createdIds } = apply(fixture(), [
      { type: 'element.transfer', elementIds: ['chart'], toSlideId: 'B', mode: 'copy' },
    ]);
    expect(next.slides.A!.elementOrder).toContain('chart');
    expect(next.slides.B!.elementOrder).toEqual(createdIds);
  });

  it('clamps dropped elements into the artboard', () => {
    const next = apply(fixture(), [
      { type: 'element.transfer', elementIds: ['chart'], toSlideId: 'B', mode: 'move', position: { x: 1800, y: 1000 } },
    ]).deck;
    const b = next.elements.chart!.bbox;
    expect(b.x + b.w).toBeLessThanOrEqual(SLIDE_WIDTH);
    expect(b.y + b.h).toBeLessThanOrEqual(SLIDE_HEIGHT);
  });

  it('merges nested patches and re-validates the element', () => {
    const next = apply(fixture(), [
      { type: 'element.update', elementId: 'chart', patch: { chartType: 'line', options: { stacked: true } } },
    ]).deck;
    const chart = next.elements.chart!;
    expect(chart.kind === 'chart' && chart.chartType).toBe('line');
    expect(chart.kind === 'chart' && chart.options.showLegend).toBe(true);
  });

  it('rejects invalid chart data and leaves the deck untouched', () => {
    const deck = fixture();
    const result = applyOperations(deck, [
      { type: 'element.update', elementId: 'chart', patch: { categories: ['only one'] } },
    ]);
    expect(result.ok).toBe(false);
    expect(deck.elements.chart).toEqual(fixture().elements.chart);
  });

  it('is all-or-nothing', () => {
    const deck = fixture();
    const result = applyOperations(deck, [
      { type: 'slide.update', slideId: 'A', patch: { title: 'Changed' } },
      { type: 'element.delete', elementIds: ['does-not-exist'] },
    ]);
    expect(result).toMatchObject({ ok: false, failedIndex: 1 });
    expect(deck.slides.A!.title).toBe('Untitled slide');
  });

  it('refuses to move or delete a locked element', () => {
    const deck = apply(fixture(), [{ type: 'element.update', elementId: 'text', patch: { locked: true } }]).deck;
    expect(applyOperations(deck, [{ type: 'element.setBBox', elementId: 'text', bbox: { x: 0 } }]).ok).toBe(false);
    expect(applyOperations(deck, [{ type: 'element.delete', elementIds: ['text'] }]).ok).toBe(false);
  });

  it('changes z-order', () => {
    const next = apply(fixture(), [{ type: 'element.reorderZ', elementId: 'text', direction: 'front' }]).deck;
    expect(next.slides.A!.elementOrder).toEqual(['chart', 'text']);
  });

  it('keeps untouched slides and elements referentially identical', () => {
    const deck = fixture();
    const next = apply(deck, [{ type: 'element.setBBox', elementId: 'text', bbox: { x: 300 } }]).deck;
    expect(next.slides.B).toBe(deck.slides.B);
    expect(next.elements.chart).toBe(deck.elements.chart);
    expect(next.version).toBe(deck.version + 1);
  });
});
