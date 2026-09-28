import { describe, expect, it } from 'vitest';
import { applyOperations } from '@/domain/operations/apply';
import { createEmptyDeck } from '@/domain/factories';
import type { Deck } from '@/domain/schema/deck';
import { sequentialIds } from '@/domain/schema/ids';
import { executeTool, type ToolContext } from '../toolExecutor';

/** A tiny in-memory store standing in for DeckProvider. */
function harness(initial: Deck = createEmptyDeck('Test', sequentialIds())) {
  let deck = initial;
  const newId = sequentialIds();
  const ctx: ToolContext = {
    getDeck: () => deck,
    apply: (ops) => {
      const result = applyOperations(deck, ops, newId);
      if (result.ok) deck = result.deck;
      return result;
    },
    newId,
  };
  const call = (name: string, args: unknown) => {
    const out = executeTool(name, JSON.stringify(args), ctx);
    return { ...out, data: JSON.parse(out.content) as Record<string, unknown> };
  };
  return { call, deck: () => deck };
}

const chartSpec = {
  chartType: 'bar',
  title: 'Revenue',
  categories: ['Q1', 'Q2', 'Q3'],
  series: [{ name: '2025', values: [1, 2, 3] }],
};

describe('executeTool', () => {
  it('runs plan → populate and returns ids to the model', () => {
    const h = harness();
    const plan = h.call('plan_deck', {
      title: 'Roadmap',
      slides: [
        { title: 'Intro', layout: 'title', purpose: 'Open' },
        { title: 'Numbers', layout: 'chart-forward', purpose: 'Show revenue' },
      ],
    });
    expect(plan.ok).toBe(true);
    const slides = plan.data.slides as { slideId: string }[];
    expect(slides).toHaveLength(2);
    expect(h.deck().slides[slides[1]!.slideId]!.status).toBe('pending');

    const populated = h.call('populate_slide', {
      slideId: slides[1]!.slideId,
      elements: [
        { kind: 'text', role: 'heading', text: 'Revenue' },
        { kind: 'chart', ...chartSpec },
      ],
    });
    expect(populated.ok).toBe(true);
    const slide = h.deck().slides[slides[1]!.slideId]!;
    expect(slide.status).toBe('ready');
    expect(slide.elementOrder).toHaveLength(2);
  });

  it('refuses to populate an existing slide (edits must be patches)', () => {
    const h = harness();
    const plan = h.call('plan_deck', { title: 'D', slides: [{ title: 'A', layout: 'content', purpose: 'x' }] });
    const slideId = (plan.data.slides as { slideId: string }[])[0]!.slideId;
    const spec = { slideId, elements: [{ kind: 'text', text: 'Hi' }] };
    expect(h.call('populate_slide', spec).ok).toBe(true);
    const again = h.call('populate_slide', spec);
    expect(again.ok).toBe(false);
    expect(again.data.error).toMatch(/already populated/);
  });

  it('requires planning before adding slides to an empty deck', () => {
    const h = harness();
    const out = h.call('add_slide', { title: 'X', layout: 'content' });
    expect(out.ok).toBe(false);
    expect(out.data.error).toMatch(/plan_deck first/);
  });

  it('patches a single element without touching others', () => {
    const h = harness();
    const plan = h.call('plan_deck', { title: 'D', slides: [{ title: 'A', layout: 'content', purpose: 'x' }] });
    const slideId = (plan.data.slides as { slideId: string }[])[0]!.slideId;
    const filled = h.call('populate_slide', {
      slideId,
      elements: [
        { kind: 'text', role: 'heading', text: 'Heading' },
        { kind: 'text', text: 'Long body', listStyle: 'bullet' },
      ],
    });
    const [headingId, bodyId] = filled.data.elementIds as string[];
    const before = h.deck();

    const out = h.call('update_element', { elementId: bodyId, changes: { text: 'Short', fontSize: 40 } });
    expect(out.ok).toBe(true);
    const body = h.deck().elements[bodyId!]!;
    expect(body.kind === 'text' && body.text).toBe('Short');
    expect(body.kind === 'text' && body.style.fontSize).toBe(40);
    expect(body.kind === 'text' && body.listStyle).toBe('bullet');
    expect(h.deck().elements[headingId!]).toBe(before.elements[headingId!]);
  });

  it('moves an element to another slide', () => {
    const h = harness();
    const plan = h.call('plan_deck', {
      title: 'D',
      slides: [
        { title: 'A', layout: 'content', purpose: 'x' },
        { title: 'Appendix', layout: 'content', purpose: 'y' },
      ],
    });
    const [a, b] = (plan.data.slides as { slideId: string }[]).map((s) => s.slideId);
    const added = h.call('add_chart', { slideId: a, ...chartSpec });
    const chartId = added.data.elementId as string;

    const out = h.call('move_element', { elementIds: [chartId], toSlideId: b });
    expect(out.ok).toBe(true);
    expect(h.deck().elements[chartId]!.slideId).toBe(b);
  });

  it('changes chart type and data while keeping series ids', () => {
    const h = harness();
    const plan = h.call('plan_deck', { title: 'D', slides: [{ title: 'A', layout: 'content', purpose: 'x' }] });
    const slideId = (plan.data.slides as { slideId: string }[])[0]!.slideId;
    const chartId = h.call('add_chart', { slideId, ...chartSpec }).data.elementId as string;
    const oldSeriesId = (h.deck().elements[chartId] as { series: { id: string }[] }).series[0]!.id;

    expect(h.call('change_chart_type', { elementId: chartId, chartType: 'line' }).ok).toBe(true);
    expect(h.call('update_chart_data', { elementId: chartId, series: [{ name: '2025', values: [4, 5, 6] }] }).ok).toBe(
      true,
    );
    const chart = h.deck().elements[chartId]!;
    expect(chart.kind === 'chart' && chart.chartType).toBe('line');
    expect(chart.kind === 'chart' && chart.series[0]).toMatchObject({ id: oldSeriesId, values: [4, 5, 6] });
  });

  it('returns validation errors instead of throwing', () => {
    const h = harness();
    expect(h.call('delete_slide', {}).data.error).toMatch(/Invalid arguments/);
    expect(
      executeTool('delete_slide', '{not json', {
        getDeck: h.deck,
        apply: () => ({ ok: false, error: '', failedIndex: 0 }),
      }).ok,
    ).toBe(false);
    expect(h.call('explode', {}).data.error).toMatch(/Unknown tool/);
    const plan = h.call('plan_deck', { title: 'D', slides: [{ title: 'A', layout: 'content', purpose: 'x' }] });
    const slideId = (plan.data.slides as { slideId: string }[])[0]!.slideId;
    const bad = h.call('add_chart', { slideId, ...chartSpec, series: [{ name: 's', values: [1] }] });
    expect(bad.ok).toBe(false);
    expect(bad.data.error).toMatch(/categories/);
  });
});
