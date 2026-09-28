import { bbox, chartInput, createEmptyDeck, tableInput, textInput } from './factories';
import { applyOperations } from './operations/apply';
import type { Operation } from './operations/schema';
import type { Deck } from './schema/deck';
import { type IdGenerator, randomId } from './schema/ids';

const heading = (text: string) =>
  textInput(text, bbox(120, 70, 1680, 120), { role: 'heading', style: { fontSize: 64, fontWeight: 'bold' } });

/** Operations that build a small demo deck; dispatching them makes "load sample" an ordinary, undoable change. */
export function sampleDeckOperations(newId: IdGenerator = randomId): Operation[] {
  const [s1, s2, s3, s4] = [newId('sld'), newId('sld'), newId('sld'), newId('sld')];

  return [
    { type: 'deck.update', patch: { title: 'Q3 Product Roadmap' } },
    { type: 'slide.add', slideId: s1, slide: { title: 'Q3 Product Roadmap', layout: 'title' } },
    {
      type: 'element.add',
      slideId: s1,
      element: textInput('Q3 Product Roadmap', bbox(160, 360, 1600, 180), {
        role: 'title',
        style: { fontSize: 110, fontWeight: 'bold', align: 'center', verticalAlign: 'middle' },
      }),
    },
    {
      type: 'element.add',
      slideId: s1,
      element: textInput('Priorities, milestones and metrics', bbox(160, 560, 1600, 100), {
        role: 'subtitle',
        style: { fontSize: 44, align: 'center', color: '#5b6573' },
      }),
    },

    { type: 'slide.add', slideId: s2, slide: { title: 'Priorities', layout: 'content' } },
    { type: 'element.add', slideId: s2, element: heading('Q3 priorities') },
    {
      type: 'element.add',
      slideId: s2,
      element: textInput(
        'Ship collaborative editing to all customers\nCut onboarding time in half\nLaunch the partner API beta\nReduce p95 latency below 300 ms',
        bbox(120, 240, 1680, 700),
        { listStyle: 'bullet', style: { fontSize: 44 } },
      ),
    },

    { type: 'slide.add', slideId: s3, slide: { title: 'Revenue', layout: 'chart-forward' } },
    { type: 'element.add', slideId: s3, element: heading('Revenue by quarter') },
    {
      type: 'element.add',
      slideId: s3,
      element: {
        ...chartInput(),
        bbox: bbox(120, 220, 1100, 780),
        title: 'Revenue ($M)',
        series: [
          { id: 'ser_2024', name: '2024', values: [4.1, 4.8, 5.2, 6.0], color: null },
          { id: 'ser_2025', name: '2025', values: [5.0, 5.9, 6.8, 7.4], color: null },
        ],
      },
    },
    {
      type: 'element.add',
      slideId: s3,
      element: textInput(
        'Revenue grew 31% year over year in Q3.\n\nEnterprise plans drove most of the increase.',
        bbox(1280, 260, 520, 600),
        { style: { fontSize: 36 } },
      ),
    },

    { type: 'slide.add', slideId: s4, slide: { title: 'Pricing', layout: 'content' } },
    { type: 'element.add', slideId: s4, element: heading('Pricing tiers') },
    {
      type: 'element.add',
      slideId: s4,
      element: {
        ...tableInput(),
        bbox: bbox(120, 240, 1680, 520),
        rows: [
          ['Plan', 'Price / seat', 'Seats', 'Support'],
          ['Starter', '$0', 'Up to 5', 'Community'],
          ['Team', '$12', 'Unlimited', 'Email'],
          ['Enterprise', 'Custom', 'Unlimited', 'Dedicated'],
        ],
      },
    },
  ];
}

export function createSampleDeck(newId: IdGenerator = randomId): Deck {
  const result = applyOperations(createEmptyDeck('Untitled presentation', newId), sampleDeckOperations(newId), newId);
  if (!result.ok) throw new Error(`Sample deck is invalid: ${result.error}`);
  return result.deck;
}
