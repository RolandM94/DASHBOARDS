import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { DatasetVisibility } from "@/types";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/datasets/[id]/visibility
// Body: { visibility: "private" | "org" | "public" }
export async function PATCH(request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const { visibility } = body as { visibility: DatasetVisibility };

  if (!["private", "org", "public"].includes(visibility)) {
    return NextResponse.json({ error: "visibility must be private, org, or public" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("datasets")
    .update({ visibility })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, visibility")
    .single();

  if (error || !data) return NextResponse.json({ error: "Dataset not found or not authorised" }, { status: 404 });
  return NextResponse.json(data);
}
