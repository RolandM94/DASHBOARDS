import { createClient } from "@/lib/supabase/server";
import {
  logReportAction,
} from "@/lib/reports/api";
import {
  getBlueprintWithSections as readBlueprintWithSections,
  updateBlueprintMetadata as editBlueprintMetadata,
} from "@/lib/reports/blueprintEditor";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// GET /api/reports/blueprints/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  try {
    return NextResponse.json(await readBlueprintWithSections(supabase, id));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Report blueprint not found" },
      { status: 404 }
    );
  }
}

// PATCH /api/reports/blueprints/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body = await request.json() as Record<string, unknown>;

  try {
    const result = await editBlueprintMetadata(supabase, id, body);
    await logReportAction(supabase, user.id, "edit_blueprint", {
      reportProjectId: result.blueprint.reportProjectId,
      inputPayload: body,
      outputSummary: {
        report_blueprint_id: result.blueprint.id,
        created_new_version: result.createdNewVersion,
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Report blueprint could not be updated" },
      { status: 400 }
    );
  }
}

// DELETE /api/reports/blueprints/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { error } = await supabase
    .from("report_blueprints")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
