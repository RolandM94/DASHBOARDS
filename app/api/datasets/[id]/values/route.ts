import { createClient, createServiceClient } from "@/lib/supabase/server";
import { loadDashboardScope, scopeContainsDataset } from "@/lib/auth/dashboardScope";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * GET /api/datasets/[id]/values?field=FieldName
 * Returns up to 500 distinct values for a field — used by filter block dropdowns.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const field = searchParams.get("field");
  const dashboardId = searchParams.get("dashboardId");

  if (!field) return NextResponse.json({ error: "field is required" }, { status: 400 });

  const supabase = await createClient();
  const serviceClient = await createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (dashboardId) {
    const { scope, error, status } = await loadDashboardScope(supabase, serviceClient, dashboardId);
    if (!scope) return NextResponse.json({ error }, { status });
    if (!scopeContainsDataset(scope, id)) {
      return NextResponse.json({ error: "Dataset not referenced by dashboard" }, { status: 403 });
    }
  } else {
    if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    // RLS verifies owner, org, share, seed, and public dataset access.
    const { data: ds } = await supabase
      .from("datasets")
      .select("id")
      .eq("id", id)
      .single();

    if (!ds) return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
  }

  const { data, error } = await serviceClient.rpc("get_distinct_values", {
    p_dataset_ids: [id],
    p_field: field,
    p_limit: 500,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}
