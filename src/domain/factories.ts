import type { Deck } from './schema/deck';
import type { ElementInput, ElementKind, TextStyle } from './schema/elements';
import type { BBox } from './schema/geometry';
import { type IdGenerator, randomId } from './schema/ids';
import { DEFAULT_THEME_ID } from './theme';

export function createEmptyDeck(title = 'Untitled presentation', newId: IdGenerator = randomId): Deck {
  return {
    id: newId('deck'),
    title,
    aspectRatio: '16:9',
    themeId: DEFAULT_THEME_ID,
    version: 0,
    slideOrder: [],
    slides: {},
    elements: {},
  };
}

export type InputOf<K extends ElementKind> = Extract<ElementInput, { kind: K }>;

export function bbox(x: number, y: number, w: number, h: number): BBox {
  return { x, y, w, h, rotation: 0 };
}

const BASE_TEXT_STYLE: TextStyle = {
  fontSize: 32,
  fontWeight: 'normal',
  italic: false,
  color: null,
  align: 'left',
  verticalAlign: 'top',
};

export function textInput(
  text: string,
  box: BBox,
  options: Partial<Pick<InputOf<'text'>, 'role' | 'listStyle'>> & { style?: Partial<TextStyle> } = {},
): InputOf<'text'> {
  return {
    kind: 'text',
    bbox: box,
    locked: false,
    role: options.role ?? 'body',
    text,
    listStyle: options.listStyle ?? 'none',
    style: { ...BASE_TEXT_STYLE, ...options.style },
  };
}

/** Sensible defaults for the insert toolbar: centered on the artboard, ready to drag. */
export function defaultElementInput(kind: ElementKind): ElementInput {
  switch (kind) {
    case 'text':
      return textInput('Double-click to edit text', bbox(660, 470, 600, 140));
    case 'image':
      return {
        kind: 'image',
        bbox: bbox(710, 340, 500, 400),
        locked: false,
        src: 'https://picsum.photos/seed/slide/800/600',
        alt: 'Placeholder image',
        fit: 'cover',
      };
    case 'shape':
      return {
        kind: 'shape',
        bbox: bbox(810, 390, 300, 300),
        locked: false,
        shape: 'rect',
        fill: '#2f6fdb',
        stroke: null,
        strokeWidth: 0,
        cornerRadius: 16,
      };
    case 'chart':
      return chartInput();
    case 'table':
      return tableInput();
  }
}

export function chartInput(): InputOf<'chart'> {
  return {
    kind: 'chart',
    bbox: bbox(560, 290, 800, 500),
    locked: false,
    chartType: 'bar',
    title: 'New chart',
    categories: ['Q1', 'Q2', 'Q3', 'Q4'],
    series: [{ id: 'ser_1', name: 'Series 1', values: [10, 20, 15, 25], color: null }],
    options: {
      stacked: false,
      showLegend: true,
      showGrid: true,
      showDataLabels: false,
      xAxisLabel: '',
      yAxisLabel: '',
    },
  };
}

export function tableInput(): InputOf<'table'> {
  return {
    kind: 'table',
    bbox: bbox(460, 340, 1000, 400),
    locked: false,
    rows: [
      ['Header 1', 'Header 2', 'Header 3'],
      ['', '', ''],
      ['', '', ''],
    ],
    headerRow: true,
    style: { fontSize: 28, headerFill: null, borderColor: null },
  };
}
