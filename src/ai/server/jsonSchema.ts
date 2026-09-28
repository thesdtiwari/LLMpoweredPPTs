import { z } from 'zod';

type Json = Record<string, unknown>;

/**
 * Gemini function declarations accept an OpenAPI-style subset of JSON Schema.
 * This rewrites what Zod emits into that subset, keeping the constraints that
 * matter (types, enums, required, ranges). Anything dropped here is still
 * enforced by the Zod validation in the browser.
 */
function simplify(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(simplify);
  if (!node || typeof node !== 'object') return node;

  const out: Json = {};
  for (const [key, value] of Object.entries(node as Json)) {
    switch (key) {
      case '$schema':
      case 'additionalProperties':
      case 'pattern':
        break;
      case 'const':
        out.enum = [value];
        if (typeof value === 'string') out.type = 'string';
        break;
      case 'exclusiveMinimum':
        out.minimum = value;
        break;
      case 'exclusiveMaximum':
        out.maximum = value;
        break;
      case 'oneOf':
        out.anyOf = simplify(value);
        break;
      default:
        out[key] = simplify(value);
    }
  }
  return out;
}

export function toToolParameters(schema: z.ZodType): Json {
  return simplify(z.toJSONSchema(schema, { io: 'input' })) as Json;
}
