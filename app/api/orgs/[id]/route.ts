import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/orgs/[id] — update org name (owner only)
export async function PATCH(request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const { name } = body as { name?: string };
  if (!name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const { data, error } = await supabase
    .from("organizations")
    .update({ name: name.trim() })
    .eq("id", id)
    .eq("owner_id", user.id)
    .select("id, name, slug, owner_id, created_at")
    .single();

  if (error || !data) return NextResponse.json({ error: "Not found or not authorised" }, { status: 404 });
  return NextResponse.json(data);
}

// DELETE /api/orgs/[id] — delete org (owner only)
export async function DELETE(_req: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { id } = await params;

  const { error } = await supabase
    .from("organizations")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Clear org_id from all member profiles.
  // Must use service client because RLS on profiles only allows a user to
  // update their own row — the owner cannot update other members' profiles.
  const service = await createServiceClient();
  await service.from("profiles").update({ org_id: null }).eq("org_id", id);

  return new NextResponse(null, { status: 204 });
}
