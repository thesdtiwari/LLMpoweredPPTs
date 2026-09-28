import { describe, expect, it } from 'vitest';
import { chartInput, createEmptyDeck, tableInput } from '../factories';
import {
  addCategory,
  addSeries,
  removeCategory,
  removeSeries,
  setCategory,
  setValue,
  updateSeries,
} from '../chartData';
import { applyOperations } from '../operations/apply';
import { sequentialIds } from '../schema/ids';
import { addColumn, addRow, removeColumn, removeRow, setCell } from '../tableData';

function deckWith(element: ReturnType<typeof chartInput> | ReturnType<typeof tableInput>) {
  const result = applyOperations(createEmptyDeck(), [
    { type: 'slide.add', slideId: 'S' },
    { type: 'element.add', slideId: 'S', elementId: 'E', element },
  ]);
  if (!result.ok) throw new Error(result.error);
  return result.deck;
}

describe('chart data edits', () => {
  const base = { categories: ['Q1', 'Q2'], series: [{ id: 'a', name: 'A', values: [1, 2], color: null }] };

  it('keeps series aligned with categories', () => {
    const added = addCategory(base);
    expect(added.categories).toEqual(['Q1', 'Q2', 'Item 3']);
    expect(added.series[0]!.values).toEqual([1, 2, 0]);
    const removed = removeCategory(added, 0);
    expect(removed).toMatchObject({ categories: ['Q2', 'Item 3'], series: [{ values: [2, 0] }] });
    expect(
      removeCategory({ ...base, categories: ['only'], series: [{ ...base.series[0]!, values: [1] }] }, 0).categories,
    ).toEqual(['only']);
  });

  it('adds, edits and removes series', () => {
    let d = addSeries(base, sequentialIds());
    expect(d.series[1]).toMatchObject({ id: 'ser_1', values: [0, 0] });
    d = setValue(d, 1, 1, 9);
    d = updateSeries(d, 1, { name: 'B', color: '#112233' });
    d = setCategory(d, 0, 'Jan');
    expect(d).toMatchObject({
      categories: ['Jan', 'Q2'],
      series: [{}, { name: 'B', values: [0, 9], color: '#112233' }],
    });
    expect(removeSeries(d, 0).series.map((s) => s.name)).toEqual(['B']);
    expect(removeSeries(base, 0)).toBe(base);
  });

  it('produces patches the domain accepts', () => {
    const deck = deckWith(chartInput());
    const chart = deck.elements.E!;
    if (chart.kind !== 'chart') throw new Error('expected chart');
    const patch = addSeries(addCategory(chart), sequentialIds());
    const result = applyOperations(deck, [{ type: 'element.update', elementId: 'E', patch }]);
    expect(result.ok).toBe(true);
  });
});

describe('table edits', () => {
  const rows = [
    ['H1', 'H2'],
    ['a', 'b'],
  ];

  it('edits cells and inserts / removes rows and columns', () => {
    expect(setCell(rows, 1, 1, 'x')).toEqual([
      ['H1', 'H2'],
      ['a', 'x'],
    ]);
    expect(addRow(rows, 0)).toEqual([
      ['H1', 'H2'],
      ['', ''],
      ['a', 'b'],
    ]);
    expect(addColumn(rows)).toEqual([
      ['H1', 'H2', ''],
      ['a', 'b', ''],
    ]);
    expect(removeRow(rows, 0)).toEqual([['a', 'b']]);
    expect(removeColumn(rows, 1)).toEqual([['H1'], ['a']]);
    expect(removeColumn([['only']], 0)).toEqual([['only']]);
  });

  it('produces rows the domain accepts', () => {
    const deck = deckWith(tableInput());
    const table = deck.elements.E!;
    if (table.kind !== 'table') throw new Error('expected table');
    const next = removeColumn(addRow(addColumn(table.rows)), 0);
    expect(applyOperations(deck, [{ type: 'element.update', elementId: 'E', patch: { rows: next } }]).ok).toBe(true);
  });
});
