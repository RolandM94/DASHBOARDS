import { createClient } from "@/lib/supabase/server";
import { createTemplate, getTemplates } from "@/lib/reports/templateService";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  try {
    const templates = await getTemplates(supabase, user.id);
    return NextResponse.json(templates);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not fetch templates";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  try {
    const body = await request.json() as Record<string, unknown>;
    const template = await createTemplate(supabase, body, user.id);
    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create template";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
