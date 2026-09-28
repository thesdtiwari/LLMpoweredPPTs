import { z } from 'zod';
import { SlideLayoutSchema } from '@/domain/schema/deck';
import { ChartTypeSchema } from '@/domain/schema/elements';

/**
 * The AI tool surface. Each tool's Zod schema is the single source of truth:
 * the server converts it to JSON Schema for the model, and the browser validates
 * every tool call against it before touching the deck.
 *
 * Tools take simplified "specs" (e.g. fontSize/bold instead of a full style
 * object); the executor fills in defaults and turns them into domain operations.
 */

const hex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .describe('Hex color, e.g. #1f6feb');
const id = z.string().min(1);

export const BoxSpecSchema = z
  .object({ x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive() })
  .describe('Position and size in slide units. The slide is 1920 wide × 1080 tall, origin top-left.');

const TextSpec = z.object({
  kind: z.literal('text'),
  text: z.string().describe('Plain text. Use \\n between paragraphs or list items.'),
  role: z.enum(['title', 'subtitle', 'heading', 'body', 'caption']).optional(),
  listStyle: z.enum(['none', 'bullet', 'numbered']).optional(),
  fontSize: z.number().min(12).max(160).optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  align: z.enum(['left', 'center', 'right']).optional(),
  color: hex.optional(),
  box: BoxSpecSchema.optional(),
});

const ImageSpec = z.object({
  kind: z.literal('image'),
  description: z.string().min(1).describe('What the image shows; also used as alt text and to pick a placeholder.'),
  src: z.url().optional().describe('Only a real, known https image URL. Omit to use a placeholder. Never invent URLs.'),
  fit: z.enum(['cover', 'contain']).optional(),
  box: BoxSpecSchema.optional(),
});

const ShapeSpec = z.object({
  kind: z.literal('shape'),
  shape: z.enum(['rect', 'ellipse', 'line']),
  fill: hex.optional(),
  stroke: hex.optional(),
  box: BoxSpecSchema.optional(),
});

const SeriesSpec = z.object({
  name: z.string(),
  values: z.array(z.number()).describe('One number per category, same order as categories.'),
  color: hex.optional(),
});

const chartFields = {
  chartType: ChartTypeSchema,
  title: z.string(),
  categories: z.array(z.string()).min(1),
  series: z.array(SeriesSpec).min(1).describe('Pie charts use only the first series.'),
  stacked: z.boolean().optional(),
  showLegend: z.boolean().optional(),
  showDataLabels: z.boolean().optional(),
  xAxisLabel: z.string().optional(),
  yAxisLabel: z.string().optional(),
  box: BoxSpecSchema.optional(),
};

const ChartSpec = z.object({ kind: z.literal('chart'), ...chartFields });

const TableSpec = z.object({
  kind: z.literal('table'),
  rows: z.array(z.array(z.string()).min(1)).min(1).describe('rows[r][c] = cell text; all rows the same length.'),
  headerRow: z.boolean().optional().describe('Treat the first row as a header (default true).'),
  fontSize: z.number().min(12).max(80).optional(),
  box: BoxSpecSchema.optional(),
});

export const ElementSpecSchema = z.discriminatedUnion('kind', [TextSpec, ImageSpec, ShapeSpec, ChartSpec, TableSpec]);
export type ElementSpec = z.infer<typeof ElementSpecSchema>;
export type ChartSpec = z.infer<typeof ChartSpec>;

const position = z.number().int().min(1).describe('1-based slide position as the user sees it.');

export const TOOL_SCHEMAS = {
  plan_deck: z.object({
    title: z.string().min(1),
    replaceExisting: z
      .boolean()
      .optional()
      .describe('Delete all existing slides first. Only when the user asks for a brand-new deck.'),
    slides: z
      .array(
        z.object({
          title: z.string().min(1),
          layout: SlideLayoutSchema,
          purpose: z.string().describe('One sentence: what this slide must communicate.'),
        }),
      )
      .min(1)
      .max(15),
  }),
  populate_slide: z.object({
    slideId: id,
    elements: z.array(ElementSpecSchema).min(1).max(20),
    notes: z.string().optional().describe('Speaker notes.'),
  }),

  add_slide: z.object({
    title: z.string().min(1),
    layout: SlideLayoutSchema,
    position: position.optional().describe('Where to insert; defaults to the end.'),
    elements: z.array(ElementSpecSchema).max(20).optional(),
    notes: z.string().optional(),
  }),
  update_slide: z.object({
    slideId: id,
    title: z.string().min(1).optional().describe('Filmstrip name of the slide (does not change heading text).'),
    backgroundColor: hex.optional(),
    notes: z.string().optional(),
  }),
  change_layout: z.object({ slideId: id, layout: SlideLayoutSchema }),
  delete_slide: z.object({ slideId: id }),
  duplicate_slide: z.object({ slideId: id, position: position.optional() }),
  reorder_slides: z.object({ slideId: id, toPosition: position }),

  add_element: z.object({ slideId: id, element: ElementSpecSchema }),
  update_element: z.object({
    elementId: id,
    changes: z
      .object({
        text: z.string(),
        role: z.enum(['title', 'subtitle', 'heading', 'body', 'caption']),
        listStyle: z.enum(['none', 'bullet', 'numbered']),
        fontSize: z.number().min(12).max(160),
        bold: z.boolean(),
        italic: z.boolean(),
        align: z.enum(['left', 'center', 'right']),
        color: hex,
        description: z.string().describe('Image alt text / description.'),
        src: z.url(),
        fill: hex,
        stroke: hex,
        title: z.string().describe('Chart title.'),
      })
      .partial()
      .describe('Only the fields to change. Text fields apply to text elements, fill/stroke to shapes, etc.'),
  }),
  delete_element: z.object({ elementIds: z.array(id).min(1) }),
  move_element: z.object({
    elementIds: z.array(id).min(1),
    toSlideId: id.optional().describe('Destination slide; omit to reposition on the same slide.'),
    x: z.number().optional(),
    y: z.number().optional(),
    copy: z.boolean().optional().describe('Copy instead of move (only with toSlideId).'),
  }),
  resize_element: z.object({
    elementId: id,
    w: z.number().positive(),
    h: z.number().positive(),
    x: z.number().optional(),
    y: z.number().optional(),
  }),
  reorder_elements: z.object({ elementId: id, direction: z.enum(['forward', 'backward', 'front', 'back']) }),

  add_chart: z.object({ slideId: id, ...chartFields }),
  update_chart_data: z.object({
    elementId: id,
    title: z.string().optional(),
    categories: z.array(z.string()).min(1).optional(),
    series: z.array(SeriesSpec).min(1).optional(),
  }),
  change_chart_type: z.object({ elementId: id, chartType: ChartTypeSchema, stacked: z.boolean().optional() }),
  update_table: z.object({
    elementId: id,
    rows: z.array(z.array(z.string()).min(1)).min(1),
    headerRow: z.boolean().optional(),
  }),
} as const;

export type ToolName = keyof typeof TOOL_SCHEMAS;
export type ToolArgs<T extends ToolName> = z.infer<(typeof TOOL_SCHEMAS)[T]>;

export const TOOL_DESCRIPTIONS: Record<ToolName, string> = {
  plan_deck:
    'Phase 1 of creating a new deck: create the outline as empty "pending" slides. Returns the new slide ids. Call it alone, then fill every slide with populate_slide.',
  populate_slide:
    'Phase 2 of creating a deck: fill one pending slide from plan_deck with its elements. Only works on pending slides; use the edit tools for existing slides.',
  add_slide: 'Insert a new slide (optionally with elements) at a position.',
  update_slide: 'Change slide metadata: filmstrip title, background color, speaker notes.',
  change_layout:
    'Change a slide layout hint. Does not move elements; reposition them with move_element/resize_element if needed.',
  delete_slide: 'Delete a slide and its elements.',
  duplicate_slide: 'Duplicate a slide (with new element ids).',
  reorder_slides: 'Move a slide to a new 1-based position.',
  add_element: 'Add one element (text, image, shape, chart or table) to a slide.',
  update_element:
    'Change content or style of one element, e.g. rewrite text. Prefer this over deleting and re-adding. Position/size use move_element/resize_element.',
  delete_element: 'Delete elements by id.',
  move_element:
    'Move elements to (x, y) on their slide, or to another slide (keeps position unless x/y given). copy=true copies instead.',
  resize_element: 'Set an element width/height (and optionally x/y).',
  reorder_elements: 'Change z-order: forward, backward, front or back.',
  add_chart: 'Add a chart (bar, line, area, pie) with data to a slide.',
  update_chart_data: 'Replace a chart title, categories and/or series data. Series values must match the categories.',
  change_chart_type: 'Switch a chart type (e.g. bar → line). Keeps the data.',
  update_table: 'Replace all cell text of a table (rows × columns).',
};

export const TOOL_NAMES = Object.keys(TOOL_SCHEMAS) as ToolName[];

export function isToolName(name: string): name is ToolName {
  return Object.hasOwn(TOOL_SCHEMAS, name);
}
