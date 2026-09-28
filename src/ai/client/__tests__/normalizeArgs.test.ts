import { describe, expect, it } from 'vitest';
import { TOOL_SCHEMAS } from '../../shared/tools';
import { normalizeToolArgs } from '../normalizeArgs';

const parse = (elements: unknown[]) =>
  TOOL_SCHEMAS.populate_slide.safeParse(normalizeToolArgs('populate_slide', { slideId: 's1', elements }));

describe('normalizeToolArgs', () => {
  it('maps common kind aliases onto the schema', () => {
    const result = parse([
      { kind: 'heading', text: 'Title' },
      { kind: 'bullets', text: ['One', 'Two'] },
      { kind: 'Rectangle', fill: '#112233' },
      { kind: 'icon' },
      { kind: 'bar_chart', title: 'Rev', categories: ['Q1'], series: [{ name: 'A', values: ['1,200'] }] },
      { kind: 'img', alt: 'A photo' },
    ]);
    expect(result.success).toBe(true);
    const els = result.success ? result.data.elements : [];
    expect(els.map((e) => e.kind)).toEqual(['text', 'text', 'shape', 'shape', 'chart', 'image']);
    expect(els[0]).toMatchObject({ role: 'heading' });
    expect(els[1]).toMatchObject({ text: 'One\nTwo', listStyle: 'bullet' });
    expect(els[2]).toMatchObject({ shape: 'rect' });
    expect(els[4]).toMatchObject({ chartType: 'bar', series: [{ values: [1200] }] });
    expect(els[5]).toMatchObject({ description: 'A photo' });
  });

  it('infers a missing kind from the fields present', () => {
    const result = parse([
      { rows: [['a', 1]] },
      { chartType: 'line', title: 't', categories: ['x'], series: [{ name: 's', values: [1] }] },
      { content: 'Hello' },
    ]);
    expect(result.success).toBe(true);
    const els = result.success ? result.data.elements : [];
    expect(els.map((e) => e.kind)).toEqual(['table', 'chart', 'text']);
    expect(els[0]).toMatchObject({ rows: [['a', '1']] });
  });

  it('still rejects content it cannot repair', () => {
    expect(parse([{ kind: 'video', url: 'x' }]).success).toBe(false);
  });
});
