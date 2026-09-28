import { z } from 'zod';
import { SlideLayoutSchema } from '../schema/deck';
import { ColorSchema, ElementInputSchema } from '../schema/elements';
import { BBoxSchema, PointSchema } from '../schema/geometry';

/**
 * Every change to the deck — from the canvas, shortcuts, or AI tools — is one of
 * these operations. They are applied in batches (transactions) by applyOperations.
 */
const id = z.string().min(1);
const ids = z.array(id).min(1);

const SlideFieldsSchema = z.object({
  title: z.string(),
  layout: SlideLayoutSchema,
  backgroundColor: ColorSchema.nullable(),
  notes: z.string(),
  status: z.enum(['ready', 'pending']),
});

export const OperationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('deck.update'),
    patch: z.object({ title: z.string().min(1), themeId: z.string() }).partial(),
  }),

  z.object({
    type: z.literal('slide.add'),
    /** Insert position; defaults to the end. */
    index: z.number().int().min(0).optional(),
    /** Optional pre-assigned id (e.g. so one transaction can add a slide and then its elements). */
    slideId: id.optional(),
    slide: SlideFieldsSchema.partial().optional(),
  }),
  z.object({ type: z.literal('slide.update'), slideId: id, patch: SlideFieldsSchema.partial() }),
  z.object({ type: z.literal('slide.delete'), slideId: id }),
  z.object({ type: z.literal('slide.duplicate'), slideId: id, index: z.number().int().min(0).optional() }),
  z.object({ type: z.literal('slide.move'), slideId: id, toIndex: z.number().int().min(0) }),

  z.object({
    type: z.literal('element.add'),
    slideId: id,
    element: ElementInputSchema,
    elementId: id.optional(),
    /** z-index position; defaults to the front. */
    index: z.number().int().min(0).optional(),
  }),
  z.object({
    type: z.literal('element.update'),
    elementId: id,
    /** Shallow field patch; nested objects (style, options) are merged one level deep. Result is re-validated. */
    patch: z.record(z.string(), z.unknown()),
  }),
  z.object({ type: z.literal('element.setBBox'), elementId: id, bbox: BBoxSchema.partial() }),
  z.object({ type: z.literal('element.delete'), elementIds: ids }),
  z.object({ type: z.literal('element.duplicate'), elementIds: ids, offset: PointSchema.optional() }),
  z.object({
    type: z.literal('element.transfer'),
    elementIds: ids,
    toSlideId: id,
    mode: z.enum(['move', 'copy']),
    /** Top-left of the group on the destination slide; defaults to the current position. Always clamped. */
    position: PointSchema.optional(),
  }),
  z.object({
    type: z.literal('element.reorderZ'),
    elementId: id,
    direction: z.enum(['forward', 'backward', 'front', 'back']),
  }),
]);

export type Operation = z.infer<typeof OperationSchema>;
export type OperationType = Operation['type'];
export type OperationOf<T extends OperationType> = Extract<Operation, { type: T }>;

export const DELETE_OPERATION_TYPES: ReadonlySet<OperationType> = new Set(['slide.delete', 'element.delete']);
