import type { SlideLayout } from '@/domain/schema/deck';
import type { ElementInput, TextStyle } from '@/domain/schema/elements';
import { type BBox, SLIDE_WIDTH } from '@/domain/schema/geometry';
import type { ChartSpec, ElementSpec } from '../shared/tools';

/**
 * Turns the model's simplified element specs into full domain element inputs:
 * fills style defaults and, when the model omits a box, places the element with
 * a simple layout so content never lands on top of itself.
 */

const MARGIN = 120;
const HEADING_BOX: BBox = { x: MARGIN, y: 70, w: SLIDE_WIDTH - 2 * MARGIN, h: 130, rotation: 0 };
const CONTENT = { x: MARGIN, y: 230, w: SLIDE_WIDTH - 2 * MARGIN, h: 790 };
const GAP = 60;

const FONT_SIZE: Record<string, number> = { title: 96, subtitle: 44, heading: 60, body: 36, caption: 26 };

function isHeading(spec: ElementSpec): boolean {
  return spec.kind === 'text' && (spec.role === 'title' || spec.role === 'heading');
}

/** Boxes for elements the model did not position, by slide layout. */
function autoBoxes(specs: readonly ElementSpec[], layout: SlideLayout): (BBox | null)[] {
  if (layout === 'title' || layout === 'section-break') {
    let row = 0;
    return specs.map((spec) => {
      if (spec.box) return null;
      const y = 340 + row * 200;
      row += 1;
      return { x: 160, y, w: SLIDE_WIDTH - 320, h: row === 1 ? 180 : 110, rotation: 0 };
    });
  }

  const unplacedBody = specs.filter((s) => !s.box && !isHeading(s));
  const columns = unplacedBody.length <= 3 ? Math.max(unplacedBody.length, 1) : 2;
  const rows = Math.ceil(unplacedBody.length / columns) || 1;
  const cellW = (CONTENT.w - GAP * (columns - 1)) / columns;
  const cellH = (CONTENT.h - GAP * (rows - 1)) / rows;
  let headingPlaced = false;
  let i = 0;

  return specs.map((spec) => {
    if (spec.box) return null;
    if (isHeading(spec) && !headingPlaced) {
      headingPlaced = true;
      return HEADING_BOX;
    }
    const col = i % columns;
    const row = Math.floor(i / columns);
    i += 1;
    return {
      x: Math.round(CONTENT.x + col * (cellW + GAP)),
      y: Math.round(CONTENT.y + row * (cellH + GAP)),
      w: Math.round(cellW),
      h: Math.round(cellH),
      rotation: 0,
    };
  });
}

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'image'
  );
}

export function chartInputFromSpec(spec: Omit<ChartSpec, 'kind'>, box: BBox): Extract<ElementInput, { kind: 'chart' }> {
  return {
    kind: 'chart',
    bbox: box,
    locked: false,
    chartType: spec.chartType,
    title: spec.title,
    categories: spec.categories,
    series: spec.series.map((s, i) => ({ id: `ser_${i + 1}`, name: s.name, values: s.values, color: s.color ?? null })),
    options: {
      stacked: spec.stacked ?? false,
      showLegend: spec.showLegend ?? (spec.series.length > 1 || spec.chartType === 'pie'),
      showGrid: true,
      showDataLabels: spec.showDataLabels ?? false,
      xAxisLabel: spec.xAxisLabel ?? '',
      yAxisLabel: spec.yAxisLabel ?? '',
    },
  };
}

function toInput(spec: ElementSpec, box: BBox, layout: SlideLayout): ElementInput {
  switch (spec.kind) {
    case 'text': {
      const role = spec.role ?? 'body';
      const centered = layout === 'title' || layout === 'section-break';
      const style: TextStyle = {
        fontSize: spec.fontSize ?? FONT_SIZE[role] ?? 36,
        fontWeight: (spec.bold ?? (role === 'title' || role === 'heading')) ? 'bold' : 'normal',
        italic: spec.italic ?? false,
        color: spec.color ?? null,
        align: spec.align ?? (centered ? 'center' : 'left'),
        verticalAlign: centered ? 'middle' : 'top',
      };
      return {
        kind: 'text',
        bbox: box,
        locked: false,
        role,
        text: spec.text,
        listStyle: spec.listStyle ?? 'none',
        style,
      };
    }
    case 'image':
      return {
        kind: 'image',
        bbox: box,
        locked: false,
        src: spec.src ?? `https://picsum.photos/seed/${slug(spec.description)}/1200/800`,
        alt: spec.description,
        fit: spec.fit ?? 'cover',
      };
    case 'shape':
      return {
        kind: 'shape',
        bbox: box,
        locked: false,
        shape: spec.shape,
        fill: spec.shape === 'line' ? null : (spec.fill ?? '#2f6fdb'),
        stroke: spec.stroke ?? null,
        strokeWidth: spec.stroke || spec.shape === 'line' ? 4 : 0,
        cornerRadius: spec.shape === 'rect' ? 16 : 0,
      };
    case 'chart':
      return chartInputFromSpec(spec, box);
    case 'table': {
      const cells = spec.rows.length * (spec.rows[0]?.length ?? 1);
      return {
        kind: 'table',
        bbox: box,
        locked: false,
        rows: spec.rows,
        headerRow: spec.headerRow ?? true,
        style: { fontSize: spec.fontSize ?? (cells > 24 ? 24 : 30), headerFill: null, borderColor: null },
      };
    }
  }
}

function boxFromSpec(spec: ElementSpec): BBox | null {
  return spec.box ? { ...spec.box, rotation: 0 } : null;
}

/** Converts specs for one slide; the domain still clamps and validates every element. */
export function elementInputsFromSpecs(specs: readonly ElementSpec[], layout: SlideLayout): ElementInput[] {
  const auto = autoBoxes(specs, layout);
  return specs.map((spec, i) => toInput(spec, boxFromSpec(spec) ?? auto[i] ?? HEADING_BOX, layout));
}
