import { createClient, createServiceClient } from "@/lib/supabase/server";
import { loadDashboardScope, scopeContainsDataset } from "@/lib/auth/dashboardScope";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * GET /api/datasets/[id]/rows
 *
 * Default: returns { count: number } — row count only (used after upload to verify).
 *
 * With ?preview=true&limit=N: returns { rows: Record<string,unknown>[] } — actual
 * row data for the dataset preview block on canvas/dashboard.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const serviceClient = await createServiceClient();
  const url = new URL(request.url);
  const dashboardId = url.searchParams.get("dashboardId");
  const { data: { user } } = await supabase.auth.getUser();

  if (dashboardId) {
    const { scope, error, status } = await loadDashboardScope(supabase, serviceClient, dashboardId);
    if (!scope) return NextResponse.json({ error }, { status });
    if (!scopeContainsDataset(scope, id)) {
      return NextResponse.json({ error: "Dataset not referenced by dashboard" }, { status: 403 });
    }
  } else {
    if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    // RLS check — user must have access to this dataset
    const { data: ds } = await supabase
      .from("datasets")
      .select("id")
      .eq("id", id)
      .single();

    if (!ds) return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
  }

  const preview = url.searchParams.get("preview") === "true";

  if (preview) {
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 1000);
    const { data, error } = await serviceClient
      .from("dataset_rows")
      .select("data")
      .eq("dataset_id", id)
      .order("row_index", { ascending: true })
      .limit(limit);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ rows: (data ?? []).map((r) => r.data) });
  }

  const { count, error } = await serviceClient
    .from("dataset_rows")
    .select("*", { count: "exact", head: true })
    .eq("dataset_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ count: count ?? 0 });
}

/**
 * POST /api/datasets/[id]/rows
 * Batch-inserts a chunk of parsed rows into dataset_rows.
 * Called multiple times during upload (500 rows per request).
 * Body: { rows: Record<string, unknown>[]; startIndex: number }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  // Verify ownership before inserting
  const { data: ds, error: dsErr } = await supabase
    .from("datasets")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (dsErr || !ds) {
    return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
  }

  const { rows, startIndex = 0 } = await request.json() as {
    rows: Record<string, unknown>[];
    startIndex: number;
  };

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "rows must be a non-empty array" }, { status: 400 });
  }

  // Use service role for the bulk insert (bypasses RLS for performance)
  const serviceClient = await createServiceClient();
  const records = rows.map((data, i) => ({
    dataset_id: id,
    row_index: startIndex + i,
    data,
  }));

  const { error } = await serviceClient
    .from("dataset_rows")
    .insert(records);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ inserted: records.length }, { status: 201 });
}
