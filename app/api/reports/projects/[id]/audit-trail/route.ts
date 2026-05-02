import { createClient } from "@/lib/supabase/server";
import { compareReportVersions, getReportAuditTrail } from "@/lib/reports/auditTrail";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// GET /api/reports/projects/[id]/audit-trail
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const search = request.nextUrl.searchParams;
  const versionA = Number(search.get("version_a") ?? search.get("versionA"));
  const versionB = Number(search.get("version_b") ?? search.get("versionB"));

  try {
    const auditTrail = await getReportAuditTrail(supabase, id);
    const comparison = Number.isFinite(versionA) && Number.isFinite(versionB)
      ? await compareReportVersions(supabase, id, versionA, versionB)
      : undefined;

    return NextResponse.json({
      status: true,
      audit_trail: auditTrail,
      comparison,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Report audit trail could not be loaded" },
      { status: 404 }
    );
  }
}
