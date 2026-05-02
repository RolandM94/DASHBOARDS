import { createClient } from "@/lib/supabase/server";
import { logReportAction } from "@/lib/reports/api";
import { parseSectionIds, reorderBlueprintSections } from "@/lib/reports/blueprintEditor";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// POST /api/reports/blueprints/[id]/reorder-sections
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body = await request.json() as Record<string, unknown>;
  const parsed = parseSectionIds(body);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const sections = await reorderBlueprintSections(supabase, id, parsed.sectionIds!);
    await logReportAction(supabase, user.id, "reorder_blueprint_sections", {
      reportProjectId: sections[0]?.reportProjectId,
      inputPayload: body,
      outputSummary: {
        report_blueprint_id: id,
        section_count: sections.length,
      },
    });

    return NextResponse.json({ status: true, sections });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Report sections could not be reordered" },
      { status: 400 }
    );
  }
}
