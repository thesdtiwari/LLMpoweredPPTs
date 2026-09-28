import type { Deck } from '../schema/deck';
import type { Element } from '../schema/elements';

/**
 * Compact deck snapshot for the model. Rebuilt from the canonical store before
 * every request, so manual edits (moves, text changes, cross-slide drags) are
 * always what the model sees. Ids are included so the model can target patches.
 */
export interface AiDeckView {
  title: string;
  slideCount: number;
  canvas: { width: 1920; height: 1080 };
  /** What the user is looking at, so "this slide" / "the chart" resolve correctly. */
  focus: { currentSlideId: string | null; selectedElementIds: readonly string[] };
  /** Manual edits since the AI's last turn, newest last. Explains why the deck differs from earlier messages. */
  userChangesSinceYourLastTurn: readonly string[];
  /** Where every chart, table and image currently lives, for direct lookup of "the chart" etc. */
  index: { id: string; kind: string; title: string; slidePosition: number; slideId: string }[];
  slides: AiSlideView[];
}

interface AiSlideView {
  position: number;
  id: string;
  title: string;
  layout: string;
  status: string;
  notes?: string;
  elements: Record<string, unknown>[];
}

function elementView(el: Element): Record<string, unknown> {
  const { x, y, w, h } = el.bbox;
  const base = { id: el.id, kind: el.kind, box: { x, y, w, h }, ...(el.locked && { locked: true }) };
  switch (el.kind) {
    case 'text':
      return {
        ...base,
        role: el.role,
        text: el.text,
        ...(el.listStyle !== 'none' && { listStyle: el.listStyle }),
        fontSize: el.style.fontSize,
      };
    case 'image':
      return { ...base, description: el.alt };
    case 'shape':
      return { ...base, shape: el.shape, fill: el.fill };
    case 'chart':
      return {
        ...base,
        chartType: el.chartType,
        title: el.title,
        categories: el.categories,
        series: el.series.map((s) => ({ name: s.name, values: s.values })),
        ...(el.options.stacked && { stacked: true }),
      };
    case 'table':
      return { ...base, rows: el.rows };
  }
}

const INDEXED_KINDS = new Set(['chart', 'table', 'image']);
/** Keep the change list short; the full deck state is included anyway. */
const MAX_CHANGES = 20;

function indexTitle(el: Element): string {
  if (el.kind === 'chart') return el.title;
  if (el.kind === 'table') return el.rows[0]?.join(' | ') ?? '';
  if (el.kind === 'image') return el.alt;
  return '';
}

export function buildAiDeckView(
  deck: Deck,
  focus: { currentSlideId: string | null; selectedElementIds: readonly string[] },
  userChanges: readonly string[] = [],
): AiDeckView {
  const index = deck.slideOrder.flatMap((slideId, i) =>
    (deck.slides[slideId]?.elementOrder ?? []).flatMap((id) => {
      const el = deck.elements[id];
      if (!el || !INDEXED_KINDS.has(el.kind)) return [];
      return [{ id, kind: el.kind, title: indexTitle(el), slidePosition: i + 1, slideId }];
    }),
  );
  return {
    title: deck.title,
    slideCount: deck.slideOrder.length,
    canvas: { width: 1920, height: 1080 },
    focus,
    userChangesSinceYourLastTurn: userChanges.slice(-MAX_CHANGES),
    index,
    slides: deck.slideOrder.flatMap((slideId, index) => {
      const slide = deck.slides[slideId];
      if (!slide) return [];
      return [
        {
          position: index + 1,
          id: slide.id,
          title: slide.title,
          layout: slide.layout,
          status: slide.status,
          ...(slide.notes && { notes: slide.notes }),
          elements: slide.elementOrder.flatMap((id) => {
            const el = deck.elements[id];
            return el ? [elementView(el)] : [];
          }),
        },
      ];
    }),
  };
}
