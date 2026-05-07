export type DataRow = Record<string, string | number | null | undefined>;

export function topNWithOthers(
  rows: DataRow[] | null | undefined,
  metricKey: string,
  dimensionKey: string,
  n: number = 10,
): DataRow[] {
  if (!Array.isArray(rows)) return [];
  if (rows.length <= n || n <= 0) return [...rows];
  if (!rows.some((row) => Object.prototype.hasOwnProperty.call(row, metricKey))) {
    return [...rows];
  }

  const sorted = [...rows].sort((a, b) => {
    const av = typeof a[metricKey] === "number" ? a[metricKey] : 0;
    const bv = typeof b[metricKey] === "number" ? b[metricKey] : 0;
    return bv - av;
  });

  const topRows = sorted.slice(0, n);
  const remaining = sorted.slice(n);

  if (remaining.length === 0) return topRows;

  const othersRow: DataRow = { [dimensionKey]: "Others" };

  const numericKeys = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (typeof row[key] === "number") numericKeys.add(key);
    }
  }

  for (const key of numericKeys) {
    if (key === dimensionKey) continue;
    othersRow[key] = remaining.reduce((sum, row) => {
      return sum + (typeof row[key] === "number" ? row[key] : 0);
    }, 0);
  }

  for (const key of Object.keys(topRows[0] ?? {})) {
    if (!(key in othersRow) && key !== metricKey && key !== dimensionKey) {
      othersRow[key] = topRows[0][key];
    }
  }

  return [...topRows, othersRow];
}
