import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Metric, Dimension, Filter, SortOrder, ActiveGlobalFilters } from "@/types";
import { loadDashboardScope, scopeContainsDataset } from "@/lib/auth/dashboardScope";
import { aggregateDataset, assertDatasetAccess } from "@/lib/data/aggregateDataset";

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
    if (!await assertDatasetAccess(supabase, datasetId)) {
      return NextResponse.json({ error: "Dataset not found or access denied" }, { status: 404 });
    }
  }

  try {
    const result = await aggregateDataset(serviceClient, {
      datasetId,
      metrics,
      dimensions,
      worksheetFilters,
      globalFilters,
      sort,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Aggregation failed" },
      { status: 500 }
    );
  }
}
