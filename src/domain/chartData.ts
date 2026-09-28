import type { ChartElement, ChartSeries } from './schema/elements';
import type { IdGenerator } from './schema/ids';

/**
 * Pure edits to a chart's data. Each returns the fields to pass to
 * `element.update`, always keeping every series' values aligned with the
 * categories so the result validates.
 */
export type ChartData = Pick<ChartElement, 'categories' | 'series'>;

export function setCategory(data: ChartData, index: number, name: string): ChartData {
  return { ...data, categories: data.categories.map((c, i) => (i === index ? name : c)) };
}

export function setValue(data: ChartData, seriesIndex: number, categoryIndex: number, value: number): ChartData {
  return {
    ...data,
    series: data.series.map((s, si) =>
      si === seriesIndex ? { ...s, values: s.values.map((v, ci) => (ci === categoryIndex ? value : v)) } : s,
    ),
  };
}

export function addCategory(data: ChartData, name = `Item ${data.categories.length + 1}`): ChartData {
  return {
    categories: [...data.categories, name],
    series: data.series.map((s) => ({ ...s, values: [...s.values, 0] })),
  };
}

export function removeCategory(data: ChartData, index: number): ChartData {
  if (data.categories.length <= 1) return data;
  return {
    categories: data.categories.filter((_, i) => i !== index),
    series: data.series.map((s) => ({ ...s, values: s.values.filter((_, i) => i !== index) })),
  };
}

export function addSeries(data: ChartData, newId: IdGenerator): ChartData {
  const series: ChartSeries = {
    id: newId('ser'),
    name: `Series ${data.series.length + 1}`,
    values: data.categories.map(() => 0),
    color: null,
  };
  return { ...data, series: [...data.series, series] };
}

export function removeSeries(data: ChartData, index: number): ChartData {
  if (data.series.length <= 1) return data;
  return { ...data, series: data.series.filter((_, i) => i !== index) };
}

export function updateSeries(data: ChartData, index: number, patch: Partial<Omit<ChartSeries, 'id'>>): ChartData {
  return { ...data, series: data.series.map((s, i) => (i === index ? { ...s, ...patch } : s)) };
}
