/**
 * Pure edits to a table's cells. Every result stays rectangular and has at
 * least one row and one column, so it always validates.
 */
export type Rows = readonly (readonly string[])[];

const width = (rows: Rows) => rows[0]?.length ?? 0;

export function setCell(rows: Rows, r: number, c: number, text: string): string[][] {
  return rows.map((row, ri) => row.map((cell, ci) => (ri === r && ci === c ? text : cell)));
}

/** Inserts an empty row after `after` (or at the end). */
export function addRow(rows: Rows, after = rows.length - 1): string[][] {
  const copy = rows.map((row) => [...row]);
  copy.splice(
    after + 1,
    0,
    Array.from({ length: width(rows) }, () => ''),
  );
  return copy;
}

export function removeRow(rows: Rows, index: number): string[][] {
  if (rows.length <= 1) return rows.map((row) => [...row]);
  return rows.filter((_, i) => i !== index).map((row) => [...row]);
}

/** Inserts an empty column after `after` (or at the end). */
export function addColumn(rows: Rows, after = width(rows) - 1): string[][] {
  return rows.map((row) => {
    const copy = [...row];
    copy.splice(after + 1, 0, '');
    return copy;
  });
}

export function removeColumn(rows: Rows, index: number): string[][] {
  if (width(rows) <= 1) return rows.map((row) => [...row]);
  return rows.map((row) => row.filter((_, i) => i !== index));
}
