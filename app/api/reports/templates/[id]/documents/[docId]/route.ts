import { createClient } from "@/lib/supabase/server";
import { deleteReferenceDocument } from "@/lib/reports/templateService";
import { NextResponse } from "next/server";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const { docId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  try {
    await deleteReferenceDocument(supabase, docId, user.id);
    return NextResponse.json({ status: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not delete document";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
