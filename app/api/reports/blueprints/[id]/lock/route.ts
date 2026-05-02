import { createClient } from "@/lib/supabase/server";
import { logReportAction } from "@/lib/reports/api";
import { lockBlueprint } from "@/lib/reports/blueprintEditor";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// POST /api/reports/blueprints/[id]/lock
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  try {
    const result = await lockBlueprint(supabase, id, user.id);
    await logReportAction(supabase, user.id, "lock_blueprint", {
      reportProjectId: result.blueprint.reportProjectId,
      outputSummary: { report_blueprint_id: id },
    });

    return NextResponse.json({ status: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Report blueprint could not be locked" },
      { status: 400 }
    );
  }
}
