import { createClient } from "@/lib/supabase/server";
import {
  REPORT_BLUEPRINT_COLUMNS,
  logReportAction,
} from "@/lib/reports/api";
import {
  buildReportBlueprintInsert,
  dbToReportBlueprint,
} from "@/lib/reports/models";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// GET /api/reports/projects/[id]/blueprints
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { data, error } = await supabase
    .from("report_blueprints")
    .select(REPORT_BLUEPRINT_COLUMNS)
    .eq("report_project_id", id)
    .order("version", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json((data ?? []).map((row) => dbToReportBlueprint(row)));
}

// POST /api/reports/projects/[id]/blueprints
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
  const requestedVersion = typeof body.version === "number" && body.version > 0 ? Math.floor(body.version) : undefined;
  let version = requestedVersion;
  if (!version) {
    const { data: latest } = await supabase
      .from("report_blueprints")
      .select("version")
      .eq("report_project_id", id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    version = Number(latest?.version ?? 0) + 1;
  }

  const built = buildReportBlueprintInsert(body, id, version);
  if (built.error) return NextResponse.json({ error: built.error }, { status: 400 });

  const { data, error } = await supabase
    .from("report_blueprints")
    .insert(built.data!)
    .select(REPORT_BLUEPRINT_COLUMNS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logReportAction(supabase, user.id, "create_blueprint", {
    reportProjectId: id,
    inputPayload: body,
    outputSummary: { report_blueprint_id: data.id, version: data.version },
  });

  return NextResponse.json(dbToReportBlueprint(data), { status: 201 });
}
