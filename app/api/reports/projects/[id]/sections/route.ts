import { createClient } from "@/lib/supabase/server";
import {
  REPORT_SECTION_COLUMNS,
  logReportAction,
} from "@/lib/reports/api";
import {
  buildReportSectionInsert,
  dbToReportSection,
} from "@/lib/reports/models";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// GET /api/reports/projects/[id]/sections
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
    .eq("report_project_id", id)
    .order("order_index", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json((data ?? []).map((row) => dbToReportSection(row)));
}

// POST /api/reports/projects/[id]/sections
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
  const built = buildReportSectionInsert(body, id);
  if (built.error) return NextResponse.json({ error: built.error }, { status: 400 });

  const { data, error } = await supabase
    .from("report_sections")
    .insert(built.data!)
    .select(REPORT_SECTION_COLUMNS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logReportAction(supabase, user.id, "create_report_section", {
    reportProjectId: id,
    inputPayload: body,
    outputSummary: { report_section_id: data.id },
  });

  return NextResponse.json(dbToReportSection(data), { status: 201 });
}
