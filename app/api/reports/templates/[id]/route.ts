import { createClient } from "@/lib/supabase/server";
import { deleteTemplate, getTemplate, updateTemplate } from "@/lib/reports/templateService";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const template = await getTemplate(supabase, id, user.id);
  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });
  return NextResponse.json(template);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  try {
    const body = await request.json() as Record<string, unknown>;
    const template = await updateTemplate(supabase, id, body, user.id);
    return NextResponse.json(template);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update template";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  try {
    await deleteTemplate(supabase, id, user.id);
    return NextResponse.json({ status: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not delete template";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
