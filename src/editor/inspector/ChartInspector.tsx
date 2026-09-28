'use client';

import {
  addCategory,
  addSeries,
  type ChartData,
  removeCategory,
  removeSeries,
  setCategory,
  setValue,
  updateSeries,
} from '@/domain/chartData';
import type { ChartElement, ChartType } from '@/domain/schema/elements';
import { randomId } from '@/domain/schema/ids';
import type { Theme } from '@/domain/theme';
import type { EditorCommands } from '../commands/useEditorCommands';
import { ColorField, CommitNumber, CommitText, Field, Section, Select, Toggle } from './fields';

const CHART_TYPES: readonly { value: ChartType; label: string }[] = [
  { value: 'bar', label: 'Bar' },
  { value: 'line', label: 'Line' },
  { value: 'area', label: 'Area' },
  { value: 'pie', label: 'Pie' },
];

/** Chart settings and an editable data grid (categories × series). */
export function ChartInspector({
  chart,
  theme,
  commands,
}: {
  chart: ChartElement;
  theme: Theme;
  commands: EditorCommands;
}) {
  const update = (patch: Record<string, unknown>, label: string) => commands.updateElement(chart.id, patch, label);
  const setData = (data: ChartData, label: string) =>
    update({ categories: data.categories, series: data.series }, `${label} in chart "${chart.title}"`);
  const setOption = (key: keyof ChartElement['options'], value: boolean | string) =>
    update({ options: { [key]: value } }, `Changed chart ${key}`);
  const { options } = chart;
  const canStack = chart.chartType === 'bar' || chart.chartType === 'area';

  return (
    <>
      <Section title="Chart">
        <Field label="Title">
          <CommitText value={chart.title} onCommit={(title) => update({ title }, 'Renamed chart')} />
        </Field>
        <Field label="Type">
          <Select
            value={chart.chartType}
            options={CHART_TYPES}
            onChange={(chartType) => update({ chartType }, `Changed chart to ${chartType}`)}
            ariaLabel="Chart type"
          />
        </Field>
        {chart.chartType === 'pie' && chart.series.length > 1 && (
          <p className="inspector__hint">Pie charts show only the first series.</p>
        )}
        <div className="toggle-grid">
          <Toggle label="Legend" checked={options.showLegend} onChange={(v) => setOption('showLegend', v)} />
          <Toggle
            label="Data labels"
            checked={options.showDataLabels}
            onChange={(v) => setOption('showDataLabels', v)}
          />
          {chart.chartType !== 'pie' && (
            <Toggle label="Grid" checked={options.showGrid} onChange={(v) => setOption('showGrid', v)} />
          )}
          {canStack && <Toggle label="Stacked" checked={options.stacked} onChange={(v) => setOption('stacked', v)} />}
        </div>
        {chart.chartType !== 'pie' && (
          <div className="field-row">
            <Field label="X axis label">
              <CommitText value={options.xAxisLabel} onCommit={(v) => setOption('xAxisLabel', v)} />
            </Field>
            <Field label="Y axis label">
              <CommitText value={options.yAxisLabel} onCommit={(v) => setOption('yAxisLabel', v)} />
            </Field>
          </div>
        )}
      </Section>

      <Section title="Data">
        <div className="data-grid-wrap">
          <table className="data-grid">
            <thead>
              <tr>
                <th />
                {chart.series.map((s, si) => (
                  <th key={s.id}>
                    <div className="data-grid__series">
                      <CommitText
                        ariaLabel={`Series ${si + 1} name`}
                        className="input input--cell input--head"
                        value={s.name}
                        onCommit={(name) => setData(updateSeries(chart, si, { name }), 'Renamed series')}
                      />
                      <ColorField
                        ariaLabel={`Series ${si + 1} color`}
                        value={s.color}
                        fallback={theme.chartPalette[si % theme.chartPalette.length]!}
                        allowAuto={false}
                        onChange={(color) => setData(updateSeries(chart, si, { color }), 'Recolored series')}
                      />
                      <button
                        type="button"
                        className="icon-button"
                        title="Remove series"
                        aria-label={`Remove series ${s.name}`}
                        disabled={chart.series.length <= 1}
                        onClick={() => setData(removeSeries(chart, si), 'Removed series')}
                      >
                        ×
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {chart.categories.map((category, ci) => (
                <tr key={ci}>
                  <th>
                    <div className="data-grid__category">
                      <button
                        type="button"
                        className="icon-button"
                        title="Remove category"
                        aria-label={`Remove category ${category}`}
                        disabled={chart.categories.length <= 1}
                        onClick={() => setData(removeCategory(chart, ci), 'Removed category')}
                      >
                        ×
                      </button>
                      <CommitText
                        ariaLabel={`Category ${ci + 1}`}
                        className="input input--cell input--head"
                        value={category}
                        onCommit={(name) => setData(setCategory(chart, ci, name), 'Renamed category')}
                      />
                    </div>
                  </th>
                  {chart.series.map((s, si) => (
                    <td key={s.id}>
                      <CommitNumber
                        ariaLabel={`${s.name} ${category}`}
                        className="input input--cell"
                        value={s.values[ci] ?? 0}
                        step={0.1}
                        onCommit={(v) => setData(setValue(chart, si, ci, v), 'Edited value')}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="button-row">
          <button type="button" className="button--small" onClick={() => setData(addCategory(chart), 'Added category')}>
            + Category
          </button>
          <button
            type="button"
            className="button--small"
            onClick={() => setData(addSeries(chart, randomId), 'Added series')}
          >
            + Series
          </button>
        </div>
      </Section>
    </>
  );
}
