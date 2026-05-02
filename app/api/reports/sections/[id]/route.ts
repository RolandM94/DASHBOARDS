import { createClient } from "@/lib/supabase/server";
import {
  REPORT_SECTION_COLUMNS,
  logReportAction,
} from "@/lib/reports/api";
import {
  buildReportSectionPatch,
  dbToReportSection,
} from "@/lib/reports/models";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// GET /api/reports/sections/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { data, error } = await supabase
    .from("report_sections")
    .select(REPORT_SECTION_COLUMNS)
    .eq("id", id)
    .single();

  if (error || !data) return NextResponse.json({ error: "Report section not found" }, { status: 404 });
  return NextResponse.json(dbToReportSection(data));
}

// PATCH /api/reports/sections/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body = await request.json() as Record<string, unknown>;
  const built = buildReportSectionPatch(body);
  if (built.error) return NextResponse.json({ error: built.error }, { status: 400 });

  const { data: existing } = await supabase
    .from("report_sections")
    .select("id, report_blueprint_id, report_blueprints(status)")
    .eq("id", id)
    .single();
  const blueprintStatus = (existing?.report_blueprints as { status?: string } | null)?.status;
  if (blueprintStatus === "approved" || blueprintStatus === "locked") {
    return NextResponse.json(
      { error: "Approved or locked blueprints must be versioned before editing sections" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("report_sections")
    .update(built.data!)
    .eq("id", id)
    .select(REPORT_SECTION_COLUMNS)
    .single();

  if (error || !data) return NextResponse.json({ error: "Report section not found" }, { status: 404 });

  await logReportAction(supabase, user.id, "edit_report_section", {
    reportProjectId: data.report_project_id,
    inputPayload: body,
    outputSummary: { report_section_id: id },
  });

  return NextResponse.json(dbToReportSection(data));
}

// DELETE /api/reports/sections/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { data: existing } = await supabase
    .from("report_sections")
    .select("id, report_blueprint_id, report_blueprints(status)")
    .eq("id", id)
    .single();
  const blueprintStatus = (existing?.report_blueprints as { status?: string } | null)?.status;
  if (blueprintStatus === "approved" || blueprintStatus === "locked") {
    return NextResponse.json(
      { error: "Approved or locked blueprints must be versioned before removing sections" },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("report_sections")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
