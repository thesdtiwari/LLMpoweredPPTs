/**
 * Repairs common, unambiguous deviations in model-produced element specs
 * before Zod validation. LLMs (Gemini in particular) do not always honour the
 * `kind` enum: they write "bullets", "heading", "rectangle", "bar_chart", or
 * omit `kind` entirely. Rejecting those costs a whole retry round-trip, so we
 * map them onto the real schema here. Anything still invalid is rejected by
 * Zod as before, with the error sent back to the model.
 */

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

const TEXT_ROLES: Record<string, string> = {
  title: 'title',
  subtitle: 'subtitle',
  heading: 'heading',
  header: 'heading',
  headline: 'heading',
  body: 'body',
  paragraph: 'body',
  caption: 'caption',
  quote: 'body',
  label: 'caption',
};
const TEXT_KINDS = new Set([
  'text',
  'textbox',
  'text_box',
  'bullets',
  'bullet_list',
  'list',
  ...Object.keys(TEXT_ROLES),
]);
const SHAPE_ALIASES: Record<string, string> = {
  shape: 'rect',
  rect: 'rect',
  rectangle: 'rect',
  box: 'rect',
  square: 'rect',
  ellipse: 'ellipse',
  circle: 'ellipse',
  oval: 'ellipse',
  icon: 'ellipse',
  line: 'line',
  divider: 'line',
  separator: 'line',
};
const IMAGE_KINDS = new Set(['image', 'img', 'picture', 'photo', 'illustration']);
const TABLE_KINDS = new Set(['table', 'grid']);
const CHART_TYPES = ['bar', 'line', 'area', 'pie'];

/** Guesses the kind from the fields present when `kind` is missing or unknown. */
function inferKind(el: Json): string | undefined {
  if ('chartType' in el || 'series' in el || 'categories' in el) return 'chart';
  if ('rows' in el) return 'table';
  if ('src' in el || 'description' in el) return 'image';
  if ('shape' in el || 'fill' in el) return 'shape';
  if ('text' in el || 'content' in el) return 'text';
  return undefined;
}

function toNumber(v: unknown): unknown {
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v.replace(/[,$%]/g, '')))) {
    return Number(v.replace(/[,$%]/g, ''));
  }
  return v;
}

export function normalizeElementSpec(input: unknown): unknown {
  if (!isObject(input)) return input;
  const el: Json = { ...input };
  const raw =
    typeof el.kind === 'string'
      ? el.kind
          .trim()
          .toLowerCase()
          .replace(/[\s-]+/g, '_')
      : undefined;

  if (el.text === undefined && typeof el.content === 'string') {
    el.text = el.content;
    delete el.content;
  }

  if (raw && TEXT_KINDS.has(raw)) {
    el.kind = 'text';
    if (!el.role && TEXT_ROLES[raw]) el.role = TEXT_ROLES[raw];
    if (!el.listStyle && (raw === 'bullets' || raw === 'bullet_list' || raw === 'list')) el.listStyle = 'bullet';
    if (Array.isArray(el.text)) {
      el.text = el.text.join('\n');
      el.listStyle ??= 'bullet';
    }
  } else if (raw && SHAPE_ALIASES[raw]) {
    el.kind = 'shape';
    el.shape ??= SHAPE_ALIASES[raw];
  } else if (raw && IMAGE_KINDS.has(raw)) {
    el.kind = 'image';
  } else if (raw && TABLE_KINDS.has(raw)) {
    el.kind = 'table';
  } else if (raw && (raw === 'chart' || raw === 'graph' || raw.includes('chart') || raw.includes('graph'))) {
    el.kind = 'chart';
    el.chartType ??= CHART_TYPES.find((t) => raw.includes(t)) ?? 'bar';
  } else if (!raw || !['text', 'image', 'shape', 'chart', 'table'].includes(raw)) {
    const inferred = inferKind(el);
    if (inferred) el.kind = inferred;
  }

  if (el.kind === 'text' && Array.isArray(el.text)) el.text = el.text.join('\n');
  if (el.kind === 'shape' && typeof el.shape === 'string') el.shape = SHAPE_ALIASES[el.shape.toLowerCase()] ?? el.shape;
  if (el.kind === 'image' && el.description === undefined) el.description = String(el.alt ?? el.text ?? 'Image');
  if (el.kind === 'chart' && Array.isArray(el.series)) {
    el.series = el.series.map((s) =>
      isObject(s) && Array.isArray(s.values) ? { ...s, values: s.values.map(toNumber) } : s,
    );
  }
  if (el.kind === 'table' && Array.isArray(el.rows)) {
    el.rows = el.rows.map((row) => (Array.isArray(row) ? row.map((c) => (c == null ? '' : String(c))) : row));
  }
  return el;
}

/** Applies element-spec repairs to the tools that carry element specs. */
export function normalizeToolArgs(toolName: string, args: unknown): unknown {
  if (!isObject(args)) return args;
  switch (toolName) {
    case 'populate_slide':
    case 'add_slide':
      return Array.isArray(args.elements) ? { ...args, elements: args.elements.map(normalizeElementSpec) } : args;
    case 'add_element':
      return { ...args, element: normalizeElementSpec(args.element) };
    case 'add_chart':
    case 'update_chart_data':
      return Array.isArray(args.series)
        ? {
            ...args,
            series: args.series.map((s) =>
              isObject(s) && Array.isArray(s.values) ? { ...s, values: s.values.map(toNumber) } : s,
            ),
          }
        : args;
    default:
      return args;
  }
}
