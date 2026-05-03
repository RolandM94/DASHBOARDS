import { createClient } from "@/lib/supabase/server";
import {
  REPORT_PROJECT_COLUMNS,
  logReportAction,
} from "@/lib/reports/api";
import {
  buildReportProjectInsert,
  dbToReportProject,
} from "@/lib/reports/models";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// GET /api/reports/projects
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { data, error } = await supabase
    .from("report_projects")
    .select(REPORT_PROJECT_COLUMNS)
    .eq("created_by", user.id)
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json((data ?? []).map((row) => dbToReportProject(row)));
}

// POST /api/reports/projects
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body = await request.json() as Record<string, unknown>;
  const built = buildReportProjectInsert(body, user.id);
  if (built.error) return NextResponse.json({ error: built.error }, { status: 400 });

  if (body.sourceType === "dashboard") {
    const { data: dashboard } = await supabase
      .from("dashboards")
      .select("id")
      .eq("id", body.sourceDashboardId)
      .single();
    if (!dashboard) return NextResponse.json({ error: "Dashboard source not found or access denied" }, { status: 404 });
  }

  if (body.sourceType === "canvas") {
    const { data: canvas } = await supabase
      .from("canvases")
      .select("id")
      .eq("id", body.sourceCanvasId)
      .single();
    if (!canvas) return NextResponse.json({ error: "Canvas source not found or access denied" }, { status: 404 });
  }

  if (typeof body.templateId === "string" && body.templateId.trim()) {
    const { data: template } = await supabase
      .from("report_templates")
      .select("id")
      .eq("id", body.templateId.trim())
      .eq("created_by", user.id)
      .single();
    if (!template) return NextResponse.json({ error: "Template not found or access denied" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("report_projects")
    .insert(built.data!)
    .select(REPORT_PROJECT_COLUMNS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logReportAction(supabase, user.id, "create_report_project", {
    reportProjectId: data.id,
    inputPayload: body,
    outputSummary: { report_project_id: data.id },
  });

  return NextResponse.json(dbToReportProject(data), { status: 201 });
}
