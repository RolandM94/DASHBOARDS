import { createClient } from "@/lib/supabase/server";
import { logReportAction } from "@/lib/reports/api";
import { createBlueprintVersion } from "@/lib/reports/blueprintEditor";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// POST /api/reports/blueprints/[id]/new-version
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  try {
    const result = await createBlueprintVersion(supabase, id);
    await logReportAction(supabase, user.id, "create_blueprint_version", {
      reportProjectId: result.blueprint.reportProjectId,
      inputPayload: { source_blueprint_id: id },
      outputSummary: {
        report_blueprint_id: result.blueprint.id,
        version: result.blueprint.version,
      },
    });

    return NextResponse.json({ status: true, ...result }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "New blueprint version could not be created" },
      { status: 400 }
    );
  }
}
