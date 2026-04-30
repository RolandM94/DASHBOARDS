import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// GET /api/worksheets — list the current user's worksheets
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { data, error } = await supabase
    .from("worksheets")
    .select("id, dataset_id, name, description, config, status, created_at, updated_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Map snake_case DB columns to camelCase for the frontend
  const worksheets = (data ?? []).map((w) => ({
    id: w.id,
    datasetId: w.dataset_id,
    name: w.name,
    description: w.description ?? undefined,
    config: w.config,
    status: w.status,
    createdAt: w.created_at,
    updatedAt: w.updated_at,
  }));

  return NextResponse.json(worksheets);
}

// POST /api/worksheets — create a new worksheet
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body = await request.json();
  const { datasetId, name, description, config, status } = body as {
    datasetId: string;
    name: string;
    description?: string;
    config: unknown;
    status?: string;
  };

  if (!datasetId || !name || !config) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("worksheets")
    .insert({
      user_id: user.id,
      dataset_id: datasetId,
      name,
      description,
      config,
      status: status ?? "saved",
    })
    .select("id, dataset_id, name, description, config, status, created_at, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    id: data.id,
    datasetId: data.dataset_id,
    name: data.name,
    description: data.description ?? undefined,
    config: data.config,
    status: data.status,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  }, { status: 201 });
}
