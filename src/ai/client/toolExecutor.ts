import { z } from 'zod';
import type { ApplyResult } from '@/domain/operations/apply';
import type { Operation } from '@/domain/operations/schema';
import type { Deck, Slide } from '@/domain/schema/deck';
import type { Element } from '@/domain/schema/elements';
import { unionBBox } from '@/domain/schema/geometry';
import { type IdGenerator, randomId } from '@/domain/schema/ids';
import { isToolName, TOOL_SCHEMAS, type ToolArgs, type ToolName } from '../shared/tools';
import { chartInputFromSpec, elementInputsFromSpecs } from './elementSpec';
import { normalizeToolArgs } from './normalizeArgs';

export interface ToolContext {
  getDeck(): Deck;
  /** Applies operations to the canonical store as one AI transaction. */
  apply(ops: Operation[], label: string): ApplyResult;
  newId?: IdGenerator;
}

export interface ToolOutcome {
  ok: boolean;
  /** JSON sent back to the model as the tool result. */
  content: string;
  /** Short human-readable line for the chat UI. */
  summary: string;
  /** Slide the user should see after the turn. */
  touchedSlideId?: string;
}

class ToolError extends Error {}

interface HandlerResult {
  ops: Operation[];
  summary: string;
  touchedSlideId?: string;
  /** Extra data for the model, computed from the ids the transaction created. */
  result?(createdIds: string[], deck: Deck): Record<string, unknown>;
}

type Handler<T extends ToolName> = (args: ToolArgs<T>, deck: Deck, newId: IdGenerator) => HandlerResult;

function slideOf(deck: Deck, slideId: string): Slide {
  const slide = deck.slides[slideId];
  if (!slide) throw new ToolError(`Slide ${slideId} does not exist. Use a slide id from the current deck state.`);
  return slide;
}

function elementOf(deck: Deck, elementId: string): Element {
  const el = deck.elements[elementId];
  if (!el) throw new ToolError(`Element ${elementId} does not exist. Use an element id from the current deck state.`);
  return el;
}

function slideNumber(deck: Deck, slideId: string): number {
  return deck.slideOrder.indexOf(slideId) + 1;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function requireDeckStarted(deck: Deck): void {
  if (deck.slideOrder.length === 0) {
    throw new ToolError(
      'The deck is empty. To create a new deck, call plan_deck first, then populate_slide for each slide.',
    );
  }
}

const handlers: { [T in ToolName]: Handler<T> } = {
  plan_deck(args, deck) {
    const ops: Operation[] = [];
    if (args.replaceExisting) {
      for (const slideId of deck.slideOrder) ops.push({ type: 'slide.delete', slideId });
    }
    ops.push({ type: 'deck.update', patch: { title: args.title } });
    for (const s of args.slides) {
      ops.push({ type: 'slide.add', slide: { title: s.title, layout: s.layout, status: 'pending' } });
    }
    return {
      ops,
      summary: `Planned ${plural(args.slides.length, 'slide')}: ${args.title}`,
      result: (created, next) => ({
        slides: created.map((slideId, i) => ({
          slideId,
          position: slideNumber(next, slideId),
          title: args.slides[i]?.title,
          layout: args.slides[i]?.layout,
          purpose: args.slides[i]?.purpose,
        })),
        next: 'Call populate_slide for every slide above.',
      }),
    };
  },

  populate_slide(args, deck) {
    const slide = slideOf(deck, args.slideId);
    if (slide.status !== 'pending') {
      throw new ToolError(
        `Slide ${args.slideId} is already populated. Edit it with update_element/add_element/delete_element instead.`,
      );
    }
    const inputs = elementInputsFromSpecs(args.elements, slide.layout);
    return {
      ops: [
        ...inputs.map((element): Operation => ({ type: 'element.add', slideId: slide.id, element })),
        {
          type: 'slide.update',
          slideId: slide.id,
          patch: { status: 'ready', ...(args.notes && { notes: args.notes }) },
        },
      ],
      summary: `Filled slide ${slideNumber(deck, slide.id)}: ${slide.title}`,
      touchedSlideId: slide.id,
      result: (created) => ({ elementIds: created }),
    };
  },

  add_slide(args, deck, newId) {
    requireDeckStarted(deck);
    const slideId = newId('sld');
    const inputs = elementInputsFromSpecs(args.elements ?? [], args.layout);
    const index = args.position !== undefined ? args.position - 1 : undefined;
    return {
      ops: [
        {
          type: 'slide.add',
          slideId,
          index,
          slide: { title: args.title, layout: args.layout, notes: args.notes ?? '' },
        },
        ...inputs.map((element): Operation => ({ type: 'element.add', slideId, element })),
      ],
      summary: `Added slide: ${args.title}`,
      touchedSlideId: slideId,
      result: (created, next) => ({ slideId, position: slideNumber(next, slideId), elementIds: created.slice(1) }),
    };
  },

  update_slide(args, deck) {
    slideOf(deck, args.slideId);
    const patch = {
      ...(args.title !== undefined && { title: args.title }),
      ...(args.backgroundColor !== undefined && { backgroundColor: args.backgroundColor }),
      ...(args.notes !== undefined && { notes: args.notes }),
    };
    return {
      ops: [{ type: 'slide.update', slideId: args.slideId, patch }],
      summary: `Updated slide ${slideNumber(deck, args.slideId)}`,
      touchedSlideId: args.slideId,
    };
  },

  change_layout(args, deck) {
    slideOf(deck, args.slideId);
    return {
      ops: [{ type: 'slide.update', slideId: args.slideId, patch: { layout: args.layout } }],
      summary: `Changed slide ${slideNumber(deck, args.slideId)} layout to ${args.layout}`,
      touchedSlideId: args.slideId,
    };
  },

  delete_slide(args, deck) {
    const slide = slideOf(deck, args.slideId);
    return {
      ops: [{ type: 'slide.delete', slideId: args.slideId }],
      summary: `Deleted slide ${slideNumber(deck, args.slideId)}: ${slide.title}`,
    };
  },

  duplicate_slide(args, deck) {
    slideOf(deck, args.slideId);
    return {
      ops: [{ type: 'slide.duplicate', slideId: args.slideId, index: args.position ? args.position - 1 : undefined }],
      summary: `Duplicated slide ${slideNumber(deck, args.slideId)}`,
      result: (created, next) => ({ slideId: created[0], position: created[0] ? slideNumber(next, created[0]) : null }),
    };
  },

  reorder_slides(args, deck) {
    slideOf(deck, args.slideId);
    return {
      ops: [{ type: 'slide.move', slideId: args.slideId, toIndex: args.toPosition - 1 }],
      summary: `Moved slide ${slideNumber(deck, args.slideId)} to position ${args.toPosition}`,
      touchedSlideId: args.slideId,
      result: (_, next) => ({ order: next.slideOrder }),
    };
  },

  add_element(args, deck) {
    const slide = slideOf(deck, args.slideId);
    const [element] = elementInputsFromSpecs([args.element], slide.layout);
    if (!element) throw new ToolError('No element to add.');
    return {
      ops: [{ type: 'element.add', slideId: slide.id, element }],
      summary: `Added ${args.element.kind} to slide ${slideNumber(deck, slide.id)}`,
      touchedSlideId: slide.id,
      result: (created) => ({ elementId: created[0] }),
    };
  },

  update_element(args, deck) {
    const el = elementOf(deck, args.elementId);
    const c = args.changes;
    const allowed: Record<Element['kind'], readonly string[]> = {
      text: ['text', 'role', 'listStyle', 'fontSize', 'bold', 'italic', 'align', 'color'],
      image: ['description', 'src'],
      shape: ['fill', 'stroke'],
      chart: ['title'],
      table: [],
    };
    const given = Object.keys(c).filter((k) => c[k as keyof typeof c] !== undefined);
    const invalid = given.filter((k) => !allowed[el.kind].includes(k));
    if (invalid.length > 0) {
      const hint =
        el.kind === 'chart'
          ? ' Use update_chart_data / change_chart_type.'
          : el.kind === 'table'
            ? ' Use update_table.'
            : '';
      throw new ToolError(`Cannot change ${invalid.join(', ')} on a ${el.kind} element.${hint}`);
    }
    if (given.length === 0) throw new ToolError('No changes given.');

    let patch: Record<string, unknown> = {};
    if (el.kind === 'text') {
      const style = {
        ...(c.fontSize !== undefined && { fontSize: c.fontSize }),
        ...(c.bold !== undefined && { fontWeight: c.bold ? 'bold' : 'normal' }),
        ...(c.italic !== undefined && { italic: c.italic }),
        ...(c.align !== undefined && { align: c.align }),
        ...(c.color !== undefined && { color: c.color }),
      };
      patch = {
        ...(c.text !== undefined && { text: c.text }),
        ...(c.role !== undefined && { role: c.role }),
        ...(c.listStyle !== undefined && { listStyle: c.listStyle }),
        ...(Object.keys(style).length > 0 && { style }),
      };
    } else if (el.kind === 'image') {
      patch = {
        ...(c.description !== undefined && { alt: c.description }),
        ...(c.src !== undefined && { src: c.src }),
      };
    } else if (el.kind === 'shape') {
      patch = { ...(c.fill !== undefined && { fill: c.fill }), ...(c.stroke !== undefined && { stroke: c.stroke }) };
    } else if (el.kind === 'chart') {
      patch = { title: c.title };
    }
    return {
      ops: [{ type: 'element.update', elementId: el.id, patch }],
      summary: `Updated ${el.kind} on slide ${slideNumber(deck, el.slideId)}`,
      touchedSlideId: el.slideId,
    };
  },

  delete_element(args, deck) {
    const first = elementOf(deck, args.elementIds[0]!);
    args.elementIds.forEach((id) => elementOf(deck, id));
    return {
      ops: [{ type: 'element.delete', elementIds: args.elementIds }],
      summary: `Deleted ${plural(args.elementIds.length, 'element')}`,
      touchedSlideId: first.slideId,
    };
  },

  move_element(args, deck) {
    const els = args.elementIds.map((id) => elementOf(deck, id));
    const from = els[0]!.slideId;
    const group = unionBBox(els.map((e) => e.bbox))!;
    const hasPosition = args.x !== undefined || args.y !== undefined;
    const position = hasPosition ? { x: args.x ?? group.x, y: args.y ?? group.y } : undefined;
    const toSlideId = args.toSlideId ?? from;
    slideOf(deck, toSlideId);

    if (toSlideId === from && !args.copy) {
      if (!position) throw new ToolError('Give x/y to reposition, or toSlideId to move to another slide.');
      const dx = position.x - group.x;
      const dy = position.y - group.y;
      return {
        ops: els.map((e) => ({
          type: 'element.setBBox',
          elementId: e.id,
          bbox: { x: e.bbox.x + dx, y: e.bbox.y + dy },
        })),
        summary: `Moved ${plural(els.length, 'element')} on slide ${slideNumber(deck, from)}`,
        touchedSlideId: from,
      };
    }
    const mode = args.copy ? 'copy' : 'move';
    return {
      ops: [{ type: 'element.transfer', elementIds: args.elementIds, toSlideId, mode, position }],
      summary: `${mode === 'copy' ? 'Copied' : 'Moved'} ${plural(els.length, 'element')} to slide ${slideNumber(deck, toSlideId)}`,
      touchedSlideId: toSlideId,
      result: (created) => (mode === 'copy' ? { newElementIds: created } : { slideId: toSlideId }),
    };
  },

  resize_element(args, deck) {
    const el = elementOf(deck, args.elementId);
    return {
      ops: [
        {
          type: 'element.setBBox',
          elementId: el.id,
          bbox: {
            w: args.w,
            h: args.h,
            ...(args.x !== undefined && { x: args.x }),
            ...(args.y !== undefined && { y: args.y }),
          },
        },
      ],
      summary: `Resized ${el.kind} on slide ${slideNumber(deck, el.slideId)}`,
      touchedSlideId: el.slideId,
      result: (_, next) => ({ box: next.elements[el.id]?.bbox }),
    };
  },

  reorder_elements(args, deck) {
    const el = elementOf(deck, args.elementId);
    return {
      ops: [{ type: 'element.reorderZ', elementId: el.id, direction: args.direction }],
      summary: `Moved ${el.kind} ${args.direction}`,
      touchedSlideId: el.slideId,
    };
  },

  add_chart(args, deck) {
    const slide = slideOf(deck, args.slideId);
    const { slideId: _slideId, ...chart } = args;
    const [element] = elementInputsFromSpecs([{ kind: 'chart', ...chart }], slide.layout);
    if (!element) throw new ToolError('No chart to add.');
    return {
      ops: [{ type: 'element.add', slideId: slide.id, element }],
      summary: `Added ${args.chartType} chart to slide ${slideNumber(deck, slide.id)}`,
      touchedSlideId: slide.id,
      result: (created) => ({ elementId: created[0] }),
    };
  },

  update_chart_data(args, deck) {
    const el = elementOf(deck, args.elementId);
    if (el.kind !== 'chart') throw new ToolError(`Element ${el.id} is a ${el.kind}, not a chart.`);
    const patch: Record<string, unknown> = {};
    if (args.title !== undefined) patch.title = args.title;
    if (args.categories) patch.categories = args.categories;
    if (args.series) {
      // Keep series ids stable when names match, so colors and references survive edits.
      const probe = chartInputFromSpec({ ...el, series: args.series }, el.bbox);
      patch.series = probe.series.map((s) => ({ ...s, id: el.series.find((old) => old.name === s.name)?.id ?? s.id }));
    }
    if (Object.keys(patch).length === 0) throw new ToolError('Give title, categories and/or series.');
    return {
      ops: [{ type: 'element.update', elementId: el.id, patch }],
      summary: `Updated chart data on slide ${slideNumber(deck, el.slideId)}`,
      touchedSlideId: el.slideId,
    };
  },

  change_chart_type(args, deck) {
    const el = elementOf(deck, args.elementId);
    if (el.kind !== 'chart') throw new ToolError(`Element ${el.id} is a ${el.kind}, not a chart.`);
    return {
      ops: [
        {
          type: 'element.update',
          elementId: el.id,
          patch: {
            chartType: args.chartType,
            ...(args.stacked !== undefined && { options: { stacked: args.stacked } }),
          },
        },
      ],
      summary: `Changed chart to ${args.chartType} on slide ${slideNumber(deck, el.slideId)}`,
      touchedSlideId: el.slideId,
    };
  },

  update_table(args, deck) {
    const el = elementOf(deck, args.elementId);
    if (el.kind !== 'table') throw new ToolError(`Element ${el.id} is a ${el.kind}, not a table.`);
    return {
      ops: [
        {
          type: 'element.update',
          elementId: el.id,
          patch: { rows: args.rows, ...(args.headerRow !== undefined && { headerRow: args.headerRow }) },
        },
      ],
      summary: `Updated table on slide ${slideNumber(deck, el.slideId)}`,
      touchedSlideId: el.slideId,
    };
  },
};

function failure(name: string, error: string): ToolOutcome {
  return { ok: false, content: JSON.stringify({ ok: false, error }), summary: `${name} failed: ${error}` };
}

/**
 * Validates one tool call from the model and applies it to the canonical deck.
 * Never throws: every failure becomes an error result the model can react to.
 */
export function executeTool(name: string, rawArgs: string, ctx: ToolContext): ToolOutcome {
  if (!isToolName(name)) return failure(name, `Unknown tool "${name}".`);

  let json: unknown;
  try {
    json = rawArgs.trim() === '' ? {} : JSON.parse(rawArgs);
  } catch {
    return failure(name, 'Arguments were not valid JSON.');
  }

  const parsed = TOOL_SCHEMAS[name].safeParse(normalizeToolArgs(name, json));
  if (!parsed.success) {
    // Kept in the console so malformed model output can be diagnosed.
    console.warn(`[ai] ${name} rejected`, z.prettifyError(parsed.error), json);
    return failure(name, `Invalid arguments:\n${z.prettifyError(parsed.error)}`);
  }

  try {
    const deck = ctx.getDeck();
    const handler = handlers[name] as Handler<typeof name>;
    const plan = handler(parsed.data as never, deck, ctx.newId ?? randomId);
    const applied = ctx.apply(plan.ops, `AI: ${plan.summary}`);
    if (!applied.ok) return failure(name, applied.error);
    const extra = plan.result?.(applied.createdIds, ctx.getDeck()) ?? {};
    return {
      ok: true,
      content: JSON.stringify({ ok: true, ...extra }),
      summary: plan.summary,
      touchedSlideId: plan.touchedSlideId,
    };
  } catch (err) {
    if (err instanceof ToolError) return failure(name, err.message);
    throw err;
  }
}
