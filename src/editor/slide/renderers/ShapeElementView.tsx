import type { ShapeElement } from '@/domain/schema/elements';
import type { Theme } from '@/domain/theme';

export function ShapeElementView({ element, theme }: { element: ShapeElement; theme: Theme }) {
  const { w, h } = element.bbox;
  const fill = element.fill ?? 'none';
  const stroke = element.stroke ?? (element.shape === 'line' ? theme.colors.text : 'none');
  const sw = element.shape === 'line' ? Math.max(element.strokeWidth, 2) : element.strokeWidth;
  const inset = sw / 2;

  return (
    <svg className="shape-element" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {element.shape === 'rect' && (
        <rect
          x={inset}
          y={inset}
          width={Math.max(w - sw, 0)}
          height={Math.max(h - sw, 0)}
          rx={element.cornerRadius}
          fill={fill}
          stroke={stroke}
          strokeWidth={sw}
        />
      )}
      {element.shape === 'ellipse' && (
        <ellipse
          cx={w / 2}
          cy={h / 2}
          rx={Math.max(w / 2 - inset, 0)}
          ry={Math.max(h / 2 - inset, 0)}
          fill={fill}
          stroke={stroke}
          strokeWidth={sw}
        />
      )}
      {element.shape === 'line' && <line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke={stroke} strokeWidth={sw} />}
    </svg>
  );
}
