import { createClient } from "@/lib/supabase/server";
import {
  REPORT_EXPORT_COLUMNS,
  logReportAction,
} from "@/lib/reports/api";
import {
  buildReportExportPatch,
  dbToReportExport,
} from "@/lib/reports/models";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// GET /api/reports/exports/[id]
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
    .eq("id", id)
    .single();

  if (error || !data) return NextResponse.json({ error: "Report export not found" }, { status: 404 });
  return NextResponse.json(dbToReportExport(data));
}

// PATCH /api/reports/exports/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body = await request.json() as Record<string, unknown>;
  const built = buildReportExportPatch(body);
  if (built.error) return NextResponse.json({ error: built.error }, { status: 400 });

  const { data, error } = await supabase
    .from("report_exports")
    .update(built.data!)
    .eq("id", id)
    .select(REPORT_EXPORT_COLUMNS)
    .single();

  if (error || !data) return NextResponse.json({ error: "Report export not found" }, { status: 404 });

  await logReportAction(supabase, user.id, "update_report_export", {
    reportProjectId: data.report_project_id,
    inputPayload: body,
    outputSummary: { report_export_id: id },
  });

  return NextResponse.json(dbToReportExport(data));
}

// DELETE /api/reports/exports/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { error } = await supabase
    .from("report_exports")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
