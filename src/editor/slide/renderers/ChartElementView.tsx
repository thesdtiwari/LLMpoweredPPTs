'use client';

import type { ReactNode } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts';
import type { ChartElement } from '@/domain/schema/elements';
import type { Theme } from '@/domain/theme';

const TITLE_HEIGHT = 56;
const FONT_SIZE = 22;

/** Recharts wants one row per category; the schema stores one array per series. */
function toRows(element: ChartElement): Record<string, string | number>[] {
  return element.categories.map((category, i) => {
    const row: Record<string, string | number> = { category };
    for (const s of element.series) row[s.id] = s.values[i] ?? 0;
    return row;
  });
}

export function ChartElementView({ element, theme }: { element: ChartElement; theme: Theme }) {
  const { w, h } = element.bbox;
  const hasTitle = element.title.trim().length > 0;
  const width = w;
  const height = Math.max(h - (hasTitle ? TITLE_HEIGHT : 0), 40);
  const colorOf = (i: number, own: string | null) => own ?? theme.chartPalette[i % theme.chartPalette.length]!;
  const { options } = element;
  const tick = { fontSize: FONT_SIZE, fill: theme.colors.mutedText };
  const legend = options.showLegend ? (
    <Legend verticalAlign="top" height={48} wrapperStyle={{ fontSize: FONT_SIZE }} />
  ) : null;
  const stackId = options.stacked ? 'stack' : undefined;
  const rows = toRows(element);

  const axes = (
    <>
      {options.showGrid && <CartesianGrid strokeDasharray="4 4" stroke={theme.colors.border} />}
      <XAxis dataKey="category" tick={tick} />
      <YAxis tick={tick} width={80} />
    </>
  );

  let chart: ReactNode;
  switch (element.chartType) {
    case 'bar':
      chart = (
        <BarChart width={width} height={height} data={rows}>
          {axes}
          {legend}
          {element.series.map((s, i) => (
            <Bar
              key={s.id}
              dataKey={s.id}
              name={s.name}
              fill={colorOf(i, s.color)}
              stackId={stackId}
              isAnimationActive={false}
              label={options.showDataLabels ? { position: 'top', fontSize: FONT_SIZE } : false}
            />
          ))}
        </BarChart>
      );
      break;
    case 'line':
      chart = (
        <LineChart width={width} height={height} data={rows}>
          {axes}
          {legend}
          {element.series.map((s, i) => (
            <Line
              key={s.id}
              type="monotone"
              dataKey={s.id}
              name={s.name}
              stroke={colorOf(i, s.color)}
              strokeWidth={4}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      );
      break;
    case 'area':
      chart = (
        <AreaChart width={width} height={height} data={rows}>
          {axes}
          {legend}
          {element.series.map((s, i) => (
            <Area
              key={s.id}
              type="monotone"
              dataKey={s.id}
              name={s.name}
              stroke={colorOf(i, s.color)}
              fill={colorOf(i, s.color)}
              fillOpacity={0.3}
              stackId={stackId}
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      );
      break;
    case 'pie': {
      // A pie shows the first series across categories.
      const series = element.series[0];
      const slices = element.categories.map((name, i) => ({ name, value: series?.values[i] ?? 0 }));
      chart = (
        <PieChart width={width} height={height}>
          {legend}
          <Pie
            data={slices}
            dataKey="value"
            nameKey="name"
            outerRadius="80%"
            isAnimationActive={false}
            label={options.showDataLabels ? { fontSize: FONT_SIZE } : false}
          >
            {slices.map((slice, i) => (
              <Cell key={slice.name + i} fill={theme.chartPalette[i % theme.chartPalette.length]} />
            ))}
          </Pie>
        </PieChart>
      );
      break;
    }
  }

  return (
    <div className="chart-element">
      {hasTitle && (
        <div className="chart-element__title" style={{ height: TITLE_HEIGHT }}>
          {element.title}
        </div>
      )}
      {chart}
    </div>
  );
}
