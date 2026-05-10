import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * GET /api/templates
 * Returns all public dashboard templates, grouped by category.
 */
export async function GET() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("dashboard_templates")
    .select("*")
    .order("featured", { ascending: false })
    .order("downloads", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

/**
 * POST /api/templates
 * Admin-only: creates a new template (requires user auth).
 * Body: { title, description, category, data, sample_dataset?, sample_dataset_fields? }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body = await request.json() as {
    title: string;
    description?: string;
    category?: string;
    data: Record<string, unknown>;
    sample_dataset?: unknown[];
    sample_dataset_fields?: unknown[];
  };

  if (!body.title?.trim()) return NextResponse.json({ error: "title is required" }, { status: 400 });
  if (!body.data) return NextResponse.json({ error: "data is required" }, { status: 400 });

  const { data, error } = await supabase
    .from("dashboard_templates")
    .insert({
      title: body.title.trim(),
      description: body.description?.trim() ?? null,
      category: body.category ?? "general",
      data: body.data,
      sample_dataset: body.sample_dataset ?? null,
      sample_dataset_fields: body.sample_dataset_fields ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
