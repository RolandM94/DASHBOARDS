import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Metric, Dimension, Filter, SortOrder, ActiveGlobalFilters, ResolvedChartData, DatasetField } from "@/types";
import { isNumericType } from "@/types";
import { loadDashboardScope, scopeContainsDataset } from "@/lib/auth/dashboardScope";

export interface AggregateRequest {
  datasetId: string;
  metrics: Metric[];
  dimensions: Dimension[];
  worksheetFilters?: Filter[];
  globalFilters?: ActiveGlobalFilters;
  sort?: SortOrder;
  /** Pass to skip auth check for public dashboard access */
  dashboardId?: string;
}

/**
 * POST /api/aggregate
 * Runs server-side GROUP BY aggregation via the `aggregate_dataset` Postgres function.
 * Returns ResolvedChartData — the same shape ChartRenderer expects.
 */
export async function POST(request: NextRequest) {
  const body = await request.json() as AggregateRequest;
  const {
    datasetId,
    metrics = [],
    dimensions = [],
    worksheetFilters = [],
    globalFilters = {},
    sort = "natural",
    dashboardId,
  } = body;

  if (!datasetId) {
    return NextResponse.json({ error: "datasetId is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const serviceClient = await createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (dashboardId) {
    const { scope, error, status } = await loadDashboardScope(supabase, serviceClient, dashboardId);
    if (!scope) {
      return NextResponse.json({ error }, { status });
    }
    if (!scopeContainsDataset(scope, datasetId)) {
      return NextResponse.json({ error: "Dataset not referenced by dashboard" }, { status: 403 });
    }
  } else {
    if (!user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }
    // Verify the authenticated user can access this dataset.
    // RLS policies handle the actual permission check — owner, org member,
    // explicit share, or seed datasets are all allowed via separate policies.
    const { data: ds } = await supabase
      .from("datasets")
      .select("id")
      .eq("id", datasetId)
      .single();

    if (!ds) {
      return NextResponse.json({ error: "Dataset not found or access denied" }, { status: 404 });
    }
  }

  // Fetch dataset fields so we can enrich metrics with fieldType.
  // This lets aggregate_dataset round AVG correctly for integer fields.
  const { data: dsData } = await serviceClient
    .from("datasets")
    .select("fields")
    .eq("id", datasetId)
    .single();

  const datasetFields = (dsData?.fields ?? []) as DatasetField[];
  const fieldTypeMap = Object.fromEntries(datasetFields.map((f) => [f.name, f.type]));

  // Enrich each metric with the field's current type
  const enrichedMetrics: Metric[] = metrics.map((m) => ({
    ...m,
    fieldType: m.fieldType ?? fieldTypeMap[m.field],
  }));

  // Run aggregation via the stored function (service role bypasses RLS)
  const { data, error } = await serviceClient.rpc("aggregate_dataset", {
    p_dataset_id: datasetId,
    p_dimensions: dimensions,
    p_metrics: enrichedMetrics,
    p_worksheet_filters: worksheetFilters,
    p_global_filters: globalFilters,
    p_sort: sort,
  });

  // Post-process: round integer AVG results that Postgres returned as decimals.
  // (The SQL function handles this natively after migration; this is a JS fallback
  //  for datasets that haven't been through the updated aggregate_dataset yet.)
  if (data && Array.isArray(data)) {
    for (const row of data as Record<string, unknown>[]) {
      for (const m of enrichedMetrics) {
        if (m.aggregation === "AVG" && isNumericType(m.fieldType ?? "decimal") && m.fieldType === "integer") {
          const v = row[m.label];
          if (typeof v === "number") row[m.label] = Math.round(v);
        }
      }
    }
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as Record<string, unknown>[];

  // Derive xKey and yKeys from the config
  const yKeys = enrichedMetrics.map((m) => m.label);
  const xKey = dimensions.length === 0
    ? "_label"
    : dimensions.length === 1
    ? dimensions[0].label
    : "_x";

  // For KPI / no-dimension charts, add a synthetic _label key.
  // For multi-dimension charts, concatenate dimension values into a composite _x key.
  let chartData: Record<string, unknown>[];
  if (dimensions.length === 0 && rows.length > 0) {
    chartData = [{ ...rows[0], _label: "Total" }];
  } else if (dimensions.length > 1) {
    chartData = rows.map((row) => ({
      ...row,
      _x: dimensions.map((d) => row[d.label] ?? "").join(" · "),
    }));
  } else {
    chartData = rows;
  }

  const result: ResolvedChartData = {
    data: chartData as ResolvedChartData["data"],
    xKey,
    yKeys,
  };

  return NextResponse.json(result);
}
