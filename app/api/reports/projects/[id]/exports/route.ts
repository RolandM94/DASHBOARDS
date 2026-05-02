import { createClient } from "@/lib/supabase/server";
import {
  REPORT_EXPORT_COLUMNS,
  logReportAction,
} from "@/lib/reports/api";
import {
  buildReportExportInsert,
  dbToReportExport,
} from "@/lib/reports/models";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// GET /api/reports/projects/[id]/exports
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { data, error } = await supabase
    .from("report_exports")
    .select(REPORT_EXPORT_COLUMNS)
    .eq("report_project_id", id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json((data ?? []).map((row) => dbToReportExport(row)));
}

// POST /api/reports/projects/[id]/exports
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { data: project } = await supabase
    .from("report_projects")
    .select("id")
    .eq("id", id)
    .eq("created_by", user.id)
    .single();
  if (!project) return NextResponse.json({ error: "Report project not found" }, { status: 404 });

  const body = await request.json() as Record<string, unknown>;
  const built = buildReportExportInsert(body, id, user.id);
  if (built.error) return NextResponse.json({ error: built.error }, { status: 400 });

  const { data, error } = await supabase
    .from("report_exports")
    .insert(built.data!)
    .select(REPORT_EXPORT_COLUMNS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logReportAction(supabase, user.id, "create_report_export", {
    reportProjectId: id,
    inputPayload: body,
    outputSummary: { report_export_id: data.id, format: data.format },
  });

  return NextResponse.json(dbToReportExport(data), { status: 201 });
}
