import type { TableElement } from '@/domain/schema/elements';
import type { Theme } from '@/domain/theme';

export function TableElementView({ element, theme }: { element: TableElement; theme: Theme }) {
  const [first, ...rest] = element.rows;
  const header = element.headerRow ? first : undefined;
  const body = element.headerRow ? rest : element.rows;
  const border = `2px solid ${element.style.borderColor ?? theme.colors.border}`;

  return (
    <table className="table-element" style={{ fontSize: element.style.fontSize }}>
      {header && (
        <thead>
          <tr style={{ background: element.style.headerFill ?? theme.colors.surface }}>
            {header.map((cell, c) => (
              <th key={c} style={{ border }}>
                {cell}
              </th>
            ))}
          </tr>
        </thead>
      )}
      <tbody>
        {body.map((row, r) => (
          <tr key={r}>
            {row.map((cell, c) => (
              <td key={c} style={{ border }}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
