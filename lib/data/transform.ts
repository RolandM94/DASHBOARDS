import { ChartDataPoint, Dimension, Metric, ResolvedChartData, SortOrder } from "@/types";

export function sortChartData(
  dataPoints: ChartDataPoint[],
  metrics: Metric[],
  dimensions: Dimension[],
  sort: SortOrder = "natural",
): ChartDataPoint[] {
  if (sort === "natural" || !dataPoints.length) return dataPoints;

  const primaryKey = metrics[0]?.label;
  const xKey = dimensions.length === 0 ? "_label" : dimensions[0].label;

  // Can't sort by value if there are no metrics
  if (!primaryKey && (sort === "value_asc" || sort === "value_desc" || sort === "top_5" || sort === "top_10" || sort === "top_20")) {
    return dataPoints;
  }
  const copy = [...dataPoints];

  const byValueDesc = (a: ChartDataPoint, b: ChartDataPoint) =>
    Number(b[primaryKey] ?? 0) - Number(a[primaryKey] ?? 0);
  const byValueAsc = (a: ChartDataPoint, b: ChartDataPoint) =>
    Number(a[primaryKey] ?? 0) - Number(b[primaryKey] ?? 0);

  switch (sort) {
    case "value_asc":  return copy.sort(byValueAsc);
    case "value_desc": return copy.sort(byValueDesc);
    case "top_5":      return copy.sort(byValueDesc).slice(0, 5);
    case "top_10":     return copy.sort(byValueDesc).slice(0, 10);
    case "top_20":     return copy.sort(byValueDesc).slice(0, 20);
    case "alpha_asc":
      return copy.sort((a, b) => String(a[xKey] ?? "").localeCompare(String(b[xKey] ?? "")));
    case "alpha_desc":
      return copy.sort((a, b) => String(b[xKey] ?? "").localeCompare(String(a[xKey] ?? "")));
    default:
      return dataPoints;
  }
}

export function toRechartsData(
  dataPoints: ChartDataPoint[],
  metrics: Metric[],
  dimensions: Dimension[]
): ResolvedChartData {
  const yKeys = metrics.map((m) => m.label);

  if (dimensions.length === 0) {
    return { data: dataPoints, xKey: "_label", yKeys };
  }

  if (dimensions.length === 1) {
    return { data: dataPoints, xKey: dimensions[0].label, yKeys };
  }

  // Multiple dimensions: build a composite x label so all grouping fields are visible
  // e.g. dimensions ["State", "Year"] → xKey "State · Year", values "Lagos · 2022"
  const compositeKey = dimensions.map((d) => d.label).join(" · ");
  const data = dataPoints.map((point) => ({
    ...point,
    [compositeKey]: dimensions.map((d) => String(point[d.label] ?? "")).join(" · "),
  }));

  return { data, xKey: compositeKey, yKeys };
}
