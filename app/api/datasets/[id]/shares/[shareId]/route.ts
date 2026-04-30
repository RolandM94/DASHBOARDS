import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

type Params = { params: Promise<{ id: string; shareId: string }> };

// DELETE /api/datasets/[id]/shares/[shareId] — revoke a share (owner only)
export async function DELETE(_req: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { id: datasetId, shareId } = await params;

  // Verify dataset ownership (RLS will also enforce this, but gives a clear error)
  const { data: dataset } = await supabase
    .from("datasets")
    .select("id")
    .eq("id", datasetId)
    .eq("user_id", user.id)
    .single();

  if (!dataset) return NextResponse.json({ error: "Dataset not found or not authorised" }, { status: 404 });

  const { error } = await supabase
    .from("dataset_shares")
    .delete()
    .eq("id", shareId)
    .eq("dataset_id", datasetId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
