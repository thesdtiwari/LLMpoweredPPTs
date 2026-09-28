import { z } from 'zod';
import { ColorSchema, ElementSchema } from './elements';

export const SlideLayoutSchema = z.enum([
  'title',
  'content',
  'two-column',
  'comparison',
  'section-break',
  'chart-forward',
  'blank',
]);
export type SlideLayout = z.infer<typeof SlideLayoutSchema>;

export const SlideSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  layout: SlideLayoutSchema,
  /** null = theme background */
  backgroundColor: ColorSchema.nullable(),
  notes: z.string(),
  /** Child element ids, back to front (z-order). */
  elementOrder: z.array(z.string()),
  /** 'pending' while two-phase generation has planned but not yet populated the slide. */
  status: z.enum(['ready', 'pending']),
});
export type Slide = z.infer<typeof SlideSchema>;

/**
 * Normalized deck: entities live in id-keyed maps, ordering lives in id arrays.
 * This keeps every update surgical (one slide / one element) and lets React
 * skip re-rendering anything whose object identity did not change.
 */
export const DeckSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  aspectRatio: z.literal('16:9'),
  themeId: z.string(),
  /** Incremented on every committed transaction. */
  version: z.number().int().min(0),
  slideOrder: z.array(z.string()),
  slides: z.record(z.string(), SlideSchema),
  elements: z.record(z.string(), ElementSchema),
});
export type Deck = z.infer<typeof DeckSchema>;
