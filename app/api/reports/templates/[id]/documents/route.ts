import { createClient } from "@/lib/supabase/server";
import {
  addReferenceDocument,
  getTemplateDocuments,
} from "@/lib/reports/templateService";
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

  try {
    const docs = await getTemplateDocuments(supabase, id, user.id);
    return NextResponse.json(docs);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not fetch documents";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  try {
    const body = await request.json() as Record<string, unknown>;
    body.templateId = id;
    const doc = await addReferenceDocument(supabase, body, user.id);
    return NextResponse.json(doc, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not add document";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
