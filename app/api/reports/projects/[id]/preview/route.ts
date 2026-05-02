import { createClient } from "@/lib/supabase/server";
import { compileReport } from "@/lib/reports/reportCompiler";
import { renderPreviewHtml } from "@/lib/reports/previewRenderer";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  try {
    const body = await request.json().catch(() => ({})) as {
      blueprint_id?: string;
      blueprintId?: string;
    };

    const blueprintId = body.blueprint_id ?? body.blueprintId;

    // Compile with allowPreview so it works with unapproved blueprints
    const result = await compileReport(supabase, id, {
      blueprintId,
      allowPreview: true,
      includeAppendices: false,
      compiledBy: user.id,
    });

    const html = renderPreviewHtml(result.payload as unknown as Record<string, unknown>);

    return NextResponse.json({
      status: true,
      html,
      payload: result.payload,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Preview generation failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return POST(_request as unknown as NextRequest, { params });
}
