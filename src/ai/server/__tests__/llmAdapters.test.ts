import { describe, expect, it } from 'vitest';
import { TOOL_NAMES, TOOL_SCHEMAS } from '../../shared/tools';
import { toToolParameters } from '../jsonSchema';
import { ToolCallAccumulator } from '../toolCallAccumulator';

describe('ToolCallAccumulator', () => {
  it('handles Gemini-style complete calls without index, keeping the thought signature', () => {
    const acc = new ToolCallAccumulator();
    const first = acc.push({
      id: 'call_a',
      function: { name: 'add_slide', arguments: '{"title":"Alpha"}' },
      extra_content: { google: { thought_signature: 'sig' } },
    });
    expect(first.completed).toEqual([]);
    expect(first.started?.name).toBe('add_slide');

    const second = acc.push({ id: 'call_b', function: { name: 'add_slide', arguments: '{"title":"Beta"}' } });
    expect(second.completed).toEqual([
      {
        id: 'call_a',
        name: 'add_slide',
        arguments: '{"title":"Alpha"}',
        extra: { google: { thought_signature: 'sig' } },
      },
    ]);
    expect(acc.flush()).toEqual([{ id: 'call_b', name: 'add_slide', arguments: '{"title":"Beta"}' }]);
  });

  it('handles OpenAI-style indexed argument fragments', () => {
    const acc = new ToolCallAccumulator();
    acc.push({ index: 0, id: 'c0', function: { name: 'delete_slide', arguments: '' } });
    acc.push({ index: 0, function: { arguments: '{"slide' } });
    acc.push({ index: 0, function: { arguments: 'Id":"s1"}' } });
    const next = acc.push({ index: 1, id: 'c1', function: { name: 'delete_slide', arguments: '{}' } });
    expect(next.completed).toEqual([{ id: 'c0', name: 'delete_slide', arguments: '{"slideId":"s1"}' }]);
    expect(acc.flush().map((c) => c.id)).toEqual(['c1']);
    expect(acc.flush()).toEqual([]);
  });
});

describe('toToolParameters', () => {
  it('emits only the JSON Schema subset Gemini accepts', () => {
    for (const name of TOOL_NAMES) {
      const json = JSON.stringify(toToolParameters(TOOL_SCHEMAS[name]));
      expect(json, name).not.toMatch(/"(\$schema|const|exclusiveMinimum|additionalProperties|pattern|oneOf)"/);
    }
  });

  it('flattens the element union into one object with a kind enum', () => {
    const params = toToolParameters(TOOL_SCHEMAS.add_element) as {
      properties: {
        element: {
          type: string;
          anyOf?: unknown;
          required: string[];
          properties: Record<string, unknown>;
          description: string;
        };
      };
    };
    const element = params.properties.element;
    expect(element.anyOf).toBeUndefined();
    expect(element.type).toBe('object');
    expect(element.required).toEqual(['kind']);
    expect(element.properties.kind).toEqual({ type: 'string', enum: ['text', 'image', 'shape', 'chart', 'table'] });
    for (const field of ['text', 'description', 'shape', 'chartType', 'series', 'rows', 'box']) {
      expect(element.properties, field).toHaveProperty(field);
    }
    expect(element.description).toContain('chart: chartType (required)');
  });
});
