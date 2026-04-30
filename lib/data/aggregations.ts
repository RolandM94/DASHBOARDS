import { AggregationFn, ChartDataPoint, Dimension, Metric } from "@/types";

// Null byte as delimiter — safe against any printable value in dimension data
const GROUP_DELIMITER = "\x00";

function applyAgg(rows: Record<string, unknown>[], field: string, fn: AggregationFn): number {
  const nums = rows
    .map((r) => {
      const v = r[field];
      return typeof v === "number" ? v : parseFloat(String(v ?? ""));
    })
    .filter((n) => isFinite(n));

  if (nums.length === 0) return 0;

  switch (fn) {
    case "COUNT": return rows.length;
    case "SUM":   return nums.reduce((a, b) => a + b, 0);
    case "AVG":   return nums.reduce((a, b) => a + b, 0) / nums.length;
    case "MIN":   return Math.min(...nums);
    case "MAX":   return Math.max(...nums);
    default:      return 0;
  }
}

export function aggregate(
  rows: Record<string, unknown>[],
  metrics: Metric[],
  dimensions: Dimension[]
): ChartDataPoint[] {
  if (dimensions.length === 0 && metrics.length === 0) return [];

  if (dimensions.length === 0) {
    const point: ChartDataPoint = { _label: "Total" };
    metrics.forEach((m) => {
      point[m.label] = applyAgg(rows, m.field, m.aggregation);
    });
    return [point];
  }

  // Group rows by the composite dimension key
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const key = dimensions.map((d) => String(row[d.field] ?? "")).join(GROUP_DELIMITER);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  return Array.from(groups.entries()).map(([key, groupRows]) => {
    const dimValues = key.split(GROUP_DELIMITER);
    const point: ChartDataPoint = {};
    dimensions.forEach((d, i) => {
      point[d.label] = dimValues[i];
    });
    metrics.forEach((m) => {
      point[m.label] = applyAgg(groupRows, m.field, m.aggregation);
    });
    return point;
  });
}
