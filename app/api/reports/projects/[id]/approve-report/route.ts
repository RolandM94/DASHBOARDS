import { createClient } from "@/lib/supabase/server";
import { logReportAction } from "@/lib/reports/api";
import { approveReport } from "@/lib/reports/approvalWorkflow";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// POST /api/reports/projects/[id]/approve-report
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  try {
    const project = await approveReport(supabase, id, user.id);
    await logReportAction(supabase, user.id, "approve_report", {
      reportProjectId: id,
      outputSummary: { status: project.status },
    });
    return NextResponse.json({ status: true, project });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Report could not be approved" },
      { status: 400 }
    );
  }
}
