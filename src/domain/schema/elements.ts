import { z } from 'zod';
import { BBoxSchema } from './geometry';

export const ColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected a hex color like #1a2b3c');

const baseFields = {
  id: z.string().min(1),
  slideId: z.string().min(1),
  bbox: BBoxSchema,
  locked: z.boolean(),
  name: z.string().optional(),
};

export const TextStyleSchema = z.object({
  fontSize: z.number().min(8).max(240),
  fontWeight: z.enum(['normal', 'bold']),
  italic: z.boolean(),
  /** null = use the theme's text color */
  color: ColorSchema.nullable(),
  align: z.enum(['left', 'center', 'right']),
  verticalAlign: z.enum(['top', 'middle', 'bottom']),
});
export type TextStyle = z.infer<typeof TextStyleSchema>;

const TextElementObject = z.object({
  ...baseFields,
  kind: z.literal('text'),
  role: z.enum(['title', 'subtitle', 'heading', 'body', 'caption']),
  /** Plain text; newlines separate paragraphs / list items. */
  text: z.string(),
  listStyle: z.enum(['none', 'bullet', 'numbered']),
  style: TextStyleSchema,
});

const ImageElementObject = z.object({
  ...baseFields,
  kind: z.literal('image'),
  /** http(s) URL or data: URL (user uploads). */
  src: z.string().min(1),
  alt: z.string(),
  fit: z.enum(['cover', 'contain']),
});

const ShapeElementObject = z.object({
  ...baseFields,
  kind: z.literal('shape'),
  shape: z.enum(['rect', 'ellipse', 'line']),
  fill: ColorSchema.nullable(),
  stroke: ColorSchema.nullable(),
  strokeWidth: z.number().min(0).max(40),
  cornerRadius: z.number().min(0),
});

export const ChartTypeSchema = z.enum(['bar', 'line', 'area', 'pie']);
export type ChartType = z.infer<typeof ChartTypeSchema>;

export const ChartSeriesSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  values: z.array(z.number()),
  color: ColorSchema.nullable(),
});
export type ChartSeries = z.infer<typeof ChartSeriesSchema>;

export const ChartOptionsSchema = z.object({
  stacked: z.boolean(),
  showLegend: z.boolean(),
  showGrid: z.boolean(),
  showDataLabels: z.boolean(),
  xAxisLabel: z.string(),
  yAxisLabel: z.string(),
});

const ChartElementObject = z.object({
  ...baseFields,
  kind: z.literal('chart'),
  chartType: ChartTypeSchema,
  title: z.string(),
  categories: z.array(z.string()).min(1),
  series: z.array(ChartSeriesSchema).min(1),
  options: ChartOptionsSchema,
});

const TableElementObject = z.object({
  ...baseFields,
  kind: z.literal('table'),
  /** rows[r][c] = cell text. Rectangular. First row is the header when headerRow is true. */
  rows: z.array(z.array(z.string()).min(1)).min(1),
  headerRow: z.boolean(),
  style: z.object({
    fontSize: z.number().min(8).max(120),
    headerFill: ColorSchema.nullable(),
    borderColor: ColorSchema.nullable(),
  }),
});

const elementObjects = [
  TextElementObject,
  ImageElementObject,
  ShapeElementObject,
  ChartElementObject,
  TableElementObject,
] as const;

/** The fields the consistency check reads; satisfied by both placed elements and element inputs. */
type ElementLike =
  | { kind: 'chart'; categories: string[]; series: { name: string; values: number[] }[] }
  | { kind: 'table'; rows: string[][] }
  | { kind: 'text' | 'image' | 'shape' };

/** Cross-field rules that a plain object shape cannot express. */
function checkConsistency(el: ElementLike, ctx: z.RefinementCtx): void {
  if (el.kind === 'chart') {
    el.series.forEach((s, i) => {
      if (s.values.length !== el.categories.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['series', i, 'values'],
          message: `Series "${s.name}" has ${s.values.length} values but there are ${el.categories.length} categories`,
        });
      }
    });
  }
  if (el.kind === 'table') {
    const width = el.rows[0]?.length ?? 0;
    el.rows.forEach((row, i) => {
      if (row.length !== width) {
        ctx.addIssue({
          code: 'custom',
          path: ['rows', i],
          message: `Row ${i} has ${row.length} cells; expected ${width}`,
        });
      }
    });
  }
}

export const ElementSchema = z.discriminatedUnion('kind', elementObjects).superRefine(checkConsistency);
export type Element = z.infer<typeof ElementSchema>;
export type ElementKind = Element['kind'];

/** An element before it is placed: the domain assigns id and slideId. */
export const ElementInputSchema = z
  .discriminatedUnion('kind', [
    TextElementObject.omit({ id: true, slideId: true }),
    ImageElementObject.omit({ id: true, slideId: true }),
    ShapeElementObject.omit({ id: true, slideId: true }),
    ChartElementObject.omit({ id: true, slideId: true }),
    TableElementObject.omit({ id: true, slideId: true }),
  ])
  .superRefine(checkConsistency);
export type ElementInput = z.infer<typeof ElementInputSchema>;

export type TextElement = Extract<Element, { kind: 'text' }>;
export type ImageElement = Extract<Element, { kind: 'image' }>;
export type ShapeElement = Extract<Element, { kind: 'shape' }>;
export type ChartElement = Extract<Element, { kind: 'chart' }>;
export type TableElement = Extract<Element, { kind: 'table' }>;
