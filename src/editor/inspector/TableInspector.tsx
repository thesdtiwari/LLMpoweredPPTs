'use client';

import type { TableElement } from '@/domain/schema/elements';
import { addColumn, addRow, removeColumn, removeRow, type Rows, setCell } from '@/domain/tableData';
import type { EditorCommands } from '../commands/useEditorCommands';
import { CommitNumber, CommitText, Field, Section, Toggle } from './fields';

/** Editable cell grid plus row / column controls. */
export function TableInspector({ table, commands }: { table: TableElement; commands: EditorCommands }) {
  const setRows = (rows: Rows, label: string) => commands.updateElement(table.id, { rows }, label);
  const columns = table.rows[0]?.length ?? 0;

  return (
    <>
      <Section title="Table">
        <div className="field-row">
          <Toggle
            label="Header row"
            checked={table.headerRow}
            onChange={(headerRow) => commands.updateElement(table.id, { headerRow }, 'Toggled table header')}
          />
          <Field label="Font size">
            <CommitNumber
              value={table.style.fontSize}
              min={8}
              max={120}
              onCommit={(fontSize) => commands.updateElement(table.id, { style: { fontSize } }, 'Table font size')}
            />
          </Field>
        </div>
      </Section>

      <Section title={`Cells (${table.rows.length} × ${columns})`}>
        <div className="data-grid-wrap">
          <table className="data-grid">
            <thead>
              <tr>
                <th />
                {Array.from({ length: columns }, (_, c) => (
                  <th key={c}>
                    <button
                      type="button"
                      className="icon-button"
                      title="Remove column"
                      aria-label={`Remove column ${c + 1}`}
                      disabled={columns <= 1}
                      onClick={() => setRows(removeColumn(table.rows, c), 'Removed table column')}
                    >
                      ×
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, r) => (
                <tr key={r} className={r === 0 && table.headerRow ? 'data-grid__header-row' : undefined}>
                  <th>
                    <button
                      type="button"
                      className="icon-button"
                      title="Remove row"
                      aria-label={`Remove row ${r + 1}`}
                      disabled={table.rows.length <= 1}
                      onClick={() => setRows(removeRow(table.rows, r), 'Removed table row')}
                    >
                      ×
                    </button>
                  </th>
                  {row.map((cell, c) => (
                    <td key={c}>
                      <CommitText
                        ariaLabel={`Row ${r + 1} column ${c + 1}`}
                        className="input input--cell"
                        value={cell}
                        onCommit={(text) => setRows(setCell(table.rows, r, c, text), 'Edited table cell')}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="button-row">
          <button
            type="button"
            className="button--small"
            onClick={() => setRows(addRow(table.rows), 'Added table row')}
          >
            + Row
          </button>
          <button
            type="button"
            className="button--small"
            onClick={() => setRows(addColumn(table.rows), 'Added table column')}
          >
            + Column
          </button>
        </div>
      </Section>
    </>
  );
}
