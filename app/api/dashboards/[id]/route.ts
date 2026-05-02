import { createClient, createServiceClient } from "@/lib/supabase/server";
import { loadDashboardScope } from "@/lib/auth/dashboardScope";
import { NextResponse } from "next/server";

/**
 * GET /api/dashboards/[id]
 * Returns the published dashboard + the datasets referenced by its widget blocks.
 * Access is permission-aware:
 *   - private  → only the owner
 *   - org      → owner or any authenticated user in the same org
 *   - public   → anyone (no auth required)
 *
 * The Supabase RLS policies on the `dashboards` table enforce this automatically.
 * We still fetch datasets with the service role so unauthenticated public viewers
 * can see the chart data.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const serviceClient = await createServiceClient();

  const { scope, error, status } = await loadDashboardScope(supabase, serviceClient, id);
  if (!scope) {
    return NextResponse.json({ error }, { status });
  }

  let datasets: unknown[] = [];
  if (scope.datasetIds.length > 0) {
    const { data: dsRows, error: dsErr } = await serviceClient
      .from("datasets")
      .select("id, file_name, uploaded_at, fields, row_count")
      .in("id", scope.datasetIds);

    if (dsErr) return NextResponse.json({ error: dsErr.message }, { status: 500 });

    datasets = (dsRows ?? []).map((d) => ({
      id: d.id,
      fileName: d.file_name,
      uploadedAt: d.uploaded_at,
      fields: d.fields,
      rowCount: d.row_count,
    }));
  }

  const mappedWorksheets = scope.worksheets.map((w) => ({
    id: w.id,
    datasetId: w.dataset_id,
    name: w.name,
    description: w.description ?? undefined,
    config: w.config,
    status: w.status,
    createdAt: w.created_at,
    updatedAt: w.updated_at,
  }));

  return NextResponse.json({
    dashboard: {
      id: scope.dashboard.id,
      canvasId: scope.dashboard.canvas_id,
      title: scope.dashboard.title,
      permission: scope.dashboard.permission,
      publishedAt: scope.dashboard.published_at,
      blocks: scope.dashboard.blocks,
      layout: scope.dashboard.layout,
    },
    worksheets: mappedWorksheets,
    datasets,
  });
}
