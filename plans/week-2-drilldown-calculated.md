# Week 2 Plan — Chart Drill-Down + Calculated Fields

## Summary
Add two analytics features that fit the product’s existing dataset-agnostic dashboard model:

- **Chart drill-down:** click a chart segment, point, bar, or table row and inspect the source rows behind that visible value.
- **Calculated fields:** create calculated metric series from existing aggregated metric labels using safe formulas.

The implementation must preserve the product principle: the system calculates values; AI and UI must not invent figures.

---

## 1. Calculated Fields

### Corrected Approach
Calculated fields are post-aggregation metrics. They are evaluated in TypeScript after `aggregate_dataset` returns grouped rows.

Important correction: `CALCULATED` metrics must **not** be sent to the SQL RPC. The current Postgres function treats unknown aggregations as a fallback SUM, which would produce incorrect data.

### Formula Semantics
For this first pass, formulas reference existing **metric labels** in the aggregated output:

```txt
{Total Revenue} - {Total Cost}
({Total Revenue} - {Total Cost}) / {Total Revenue} * 100
```

This avoids ambiguity about whether `{revenue}` means raw row value, SUM(revenue), AVG(revenue), etc. Later we can add richer syntax like `{SUM:Revenue}`.

### Files

| File | Action |
|---|---|
| `types/index.ts` | Add `CALCULATED` to `AggregationFn`; add optional `formula?: string` to `Metric`. |
| `lib/data/formulaEvaluator.ts` | New safe tokenizer/parser/evaluator. |
| `lib/data/aggregateDataset.ts` | Split base vs calculated metrics; send only base metrics to RPC; apply formulas after chart rows are shaped. |
| `components/analytics/worksheet/panels/ConfigPanel.tsx` | Add inline calculated metric editor under metrics. |
| `components/analytics/worksheet/config/MetricBuilder.tsx` | Keep aggregation selectors limited to base aggregations. |
| `lib/ai/validate.ts` and AI prompt helpers | Do not let AI accidentally emit calculated metrics unless explicitly supported. |
| `tests/*.test.ts` | Add formula and aggregate calculated metric coverage. |

### Formula Rules
- Supported: `{Metric Label}`, numeric literals, `+`, `-`, `*`, `/`, parentheses.
- Unknown metric reference returns a validation error in UI.
- Non-numeric value or division by zero returns `null` for that row.
- Empty formula cannot be saved.
- No `eval`, no functions, no raw SQL, no arbitrary identifiers.

---

## 2. Chart Drill-Down

### Corrected Approach
Use a `POST` endpoint with full filter context. A drill-down must show rows that make up the current chart value, not merely rows matching the clicked category.

Important correction: compound dimensions must be sent as a structured dimension map, not as the display `_x` string.

### API

**New file:** `app/api/datasets/[id]/drill/route.ts`

```ts
POST /api/datasets/:id/drill
{
  "dashboardId": "...",
  "dimensionValues": { "Region": "North", "Status": "Completed" },
  "worksheetFilters": [],
  "globalFilters": {},
  "smartFilters": [],
  "limit": 50,
  "offset": 0
}
```

Returns:

```ts
{
  "rows": [{ "...": "..." }],
  "columns": ["Region", "Status", "Amount"],
  "total": 2341,
  "limit": 50,
  "offset": 0
}
```

### Access Rules
- Authenticated app users use normal dataset RLS access checks.
- Public dashboards pass `dashboardId`; the API uses `loadDashboardScope` and only allows datasets referenced by that dashboard.
- Service role is only used after access/scope is verified, matching existing dataset row preview patterns.

### Filters Applied
The endpoint must apply all relevant constraints:

- clicked dimension values
- worksheet filters
- active global/dashboard filters
- smart filters
- row limit and offset

### UI

| File | Action |
|---|---|
| `components/shared/charts/ChartRenderer.tsx` | Add `onDrillDown?: (row: ChartDataPoint) => void`; wire bar, pie, line/area active point, and table row clicks. KPI remains disabled. |
| `components/analytics/dashboard/DrillDownPanel.tsx` | New right-side drawer with loading/loaded/empty/error states and CSV export. |
| `components/analytics/dashboard/DashboardView.tsx` | Resolve worksheet/dataset/sheet context; open drawer with clicked row; send full filter payload. |

### Design Rules
- Keep the panel light, dense, and operational.
- Use existing green/gold accents sparingly.
- Use tables for inspection; avoid marketing-style cards.
- The panel title should explain the clicked scope, e.g. `Rows for Region = North`.

---

## Implementation Order

1. Calculated field types, formula evaluator, and tests.
2. Aggregate split/apply logic and tests.
3. ConfigPanel calculated field UI.
4. Drill-down API with full filter payload and tests.
5. ChartRenderer click plumbing.
6. DrillDownPanel + DashboardView integration.
7. `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`.

---

## Non-Goals For This Pass
- No raw-row formulas.
- No AI-generated calculated formulas.
- No persisted calculated-field model beyond worksheet metric config.
- No SQL changes unless drill-down performance proves inadequate.
