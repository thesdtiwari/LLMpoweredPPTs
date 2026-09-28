import type { TextElement } from '@/domain/schema/elements';
import type { Theme } from '@/domain/theme';

const JUSTIFY = { top: 'flex-start', middle: 'center', bottom: 'flex-end' } as const;

export function TextElementView({ element, theme }: { element: TextElement; theme: Theme }) {
  const { style } = element;
  const lines = element.text.split('\n');

  return (
    <div
      className="text-element"
      style={{
        justifyContent: JUSTIFY[style.verticalAlign],
        fontSize: style.fontSize,
        fontWeight: style.fontWeight === 'bold' ? 700 : 400,
        fontStyle: style.italic ? 'italic' : 'normal',
        color: style.color ?? theme.colors.text,
        textAlign: style.align,
      }}
    >
      {element.listStyle === 'none' ? (
        <div className="text-element__body">{element.text}</div>
      ) : element.listStyle === 'bullet' ? (
        <ul className="text-element__list">
          {lines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      ) : (
        <ol className="text-element__list">
          {lines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ol>
      )}
    </div>
  );
}
