import { z } from 'zod';

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Gemini function declarations accept an OpenAPI-style subset of JSON Schema.
 * This rewrites what Zod emits into that subset, keeping the constraints that
 * matter (types, enums, required, ranges). Anything dropped here is still
 * enforced by the Zod validation in the browser.
 */
function simplify(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(simplify);
  if (!isObject(node)) return node;

  const out: Json = {};
  for (const [key, value] of Object.entries(node)) {
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
  return flattenDiscriminatedUnion(out);
}

/**
 * Collapses `anyOf: [{kind: "text", …}, {kind: "chart", …}, …]` into ONE object
 * with a `kind` enum and every variant's fields as optional properties.
 *
 * Gemini often fails to emit calls against multi-variant schemas (finish reason
 * MALFORMED_FUNCTION_CALL, no tool call at all). A flat object is far more
 * reliable. The description lists which fields belong to which kind, and the
 * browser still validates each call strictly against the real Zod union.
 */
function flattenDiscriminatedUnion(node: Json): Json {
  const options = node.anyOf;
  if (!Array.isArray(options) || options.length < 2) return node;
  const variants = options.filter(isObject);
  const kinds = variants.map((v) => {
    const kind = isObject(v.properties) ? v.properties.kind : undefined;
    return isObject(kind) && Array.isArray(kind.enum) && kind.enum.length === 1 ? String(kind.enum[0]) : null;
  });
  if (variants.length !== options.length || kinds.some((k) => k === null)) return node;

  const properties: Json = {};
  const fieldsByKind: string[] = [];
  variants.forEach((variant, i) => {
    const props = variant.properties as Json;
    const required = new Set(Array.isArray(variant.required) ? variant.required.map(String) : []);
    const fields = Object.keys(props).filter((k) => k !== 'kind');
    fieldsByKind.push(`${kinds[i]}: ${fields.map((f) => (required.has(f) ? `${f} (required)` : f)).join(', ')}`);
    for (const [name, schema] of Object.entries(props)) {
      if (name !== 'kind' && !(name in properties)) properties[name] = schema;
    }
  });

  const { anyOf: _anyOf, ...rest } = node;
  return {
    ...rest,
    type: 'object',
    description: [rest.description, `Set "kind", then only the fields for that kind. ${fieldsByKind.join('. ')}.`]
      .filter(Boolean)
      .join(' '),
    properties: { kind: { type: 'string', enum: kinds }, ...properties },
    required: ['kind'],
  };
}

export function toToolParameters(schema: z.ZodType): Json {
  return simplify(z.toJSONSchema(schema, { io: 'input' })) as Json;
}
