import { createClient } from "@/lib/supabase/server";
import { logReportAction } from "@/lib/reports/api";
import { addSectionToBlueprint } from "@/lib/reports/blueprintEditor";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// POST /api/reports/blueprints/[id]/sections
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body = await request.json() as Record<string, unknown>;

  try {
    const section = await addSectionToBlueprint(supabase, id, body);
    await logReportAction(supabase, user.id, "add_blueprint_section", {
      reportProjectId: section.reportProjectId,
      inputPayload: body,
      outputSummary: {
        report_blueprint_id: id,
        report_section_id: section.id,
      },
    });

    return NextResponse.json(section, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Report section could not be added" },
      { status: 400 }
    );
  }
}
