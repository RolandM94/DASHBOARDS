import { createClient } from "@/lib/supabase/server";
import { logReportAction } from "@/lib/reports/api";
import { approveBlueprint } from "@/lib/reports/blueprintEditor";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// POST /api/reports/blueprints/[id]/approve
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body = await request.json().catch(() => ({})) as { lock?: boolean };

  try {
    const result = await approveBlueprint(supabase, id, user.id, Boolean(body.lock));
    await logReportAction(supabase, user.id, "approve_blueprint", {
      reportProjectId: result.blueprint.reportProjectId,
      inputPayload: body as Record<string, unknown>,
      outputSummary: {
        report_blueprint_id: id,
        locked: Boolean(body.lock),
      },
    });

    return NextResponse.json({ status: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Report blueprint could not be approved" },
      { status: 400 }
    );
  }
}
