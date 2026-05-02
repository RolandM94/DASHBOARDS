import { createClient } from "@/lib/supabase/server";
import {
  REPORT_PROJECT_COLUMNS,
  logReportAction,
} from "@/lib/reports/api";
import {
  buildReportProjectPatch,
  dbToReportProject,
} from "@/lib/reports/models";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// GET /api/reports/projects/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { data, error } = await supabase
    .from("report_projects")
    .select(REPORT_PROJECT_COLUMNS)
    .eq("id", id)
    .eq("created_by", user.id)
    .single();

  if (error || !data) return NextResponse.json({ error: "Report project not found" }, { status: 404 });
  return NextResponse.json(dbToReportProject(data));
}

// PATCH /api/reports/projects/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body = await request.json() as Record<string, unknown>;
  const built = buildReportProjectPatch(body);
  if (built.error) return NextResponse.json({ error: built.error }, { status: 400 });

  const { data, error } = await supabase
    .from("report_projects")
    .update(built.data!)
    .eq("id", id)
    .eq("created_by", user.id)
    .select(REPORT_PROJECT_COLUMNS)
    .single();

  if (error || !data) return NextResponse.json({ error: "Report project not found" }, { status: 404 });

  await logReportAction(supabase, user.id, "update_report_project", {
    reportProjectId: id,
    inputPayload: body,
    outputSummary: { report_project_id: id },
  });

  return NextResponse.json(dbToReportProject(data));
}

// DELETE /api/reports/projects/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { error } = await supabase
    .from("report_projects")
    .delete()
    .eq("id", id)
    .eq("created_by", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
