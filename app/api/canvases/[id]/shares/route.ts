import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

type Params = { params: Promise<{ id: string }> };
type Permission = "editor" | "viewer";

async function requireCanvasOwner(canvasId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { supabase, error: NextResponse.json({ error: "Unauthorised" }, { status: 401 }) };
  }

  const { data: canvas } = await supabase
    .from("canvases")
    .select("id")
    .eq("id", canvasId)
    .eq("user_id", user.id)
    .single();

  if (!canvas) {
    return { supabase, user, error: NextResponse.json({ error: "Canvas not found or access denied" }, { status: 404 }) };
  }

  return { supabase, user };
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await requireCanvasOwner(id);
  if (auth.error) return auth.error;

  const { data, error } = await auth.supabase
    .from("canvas_shares")
    .select(`
      id,
      canvas_id,
      shared_with_email,
      shared_with_user_id,
      permission,
      created_at,
      profiles!canvas_shares_shared_with_user_id_fkey (
        display_name,
        avatar_url
      )
    `)
    .eq("canvas_id", id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json((data ?? []).map((share) => {
    const profile = share.profiles as { display_name?: string | null; avatar_url?: string | null } | null;
    return {
      id: share.id,
      canvasId: share.canvas_id,
      sharedWithEmail: share.shared_with_email,
      sharedWithUserId: share.shared_with_user_id,
      permission: share.permission,
      createdAt: share.created_at,
      displayName: profile?.display_name ?? null,
      avatarUrl: profile?.avatar_url ?? null,
    };
  }));
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await requireCanvasOwner(id);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({})) as { email?: string; permission?: Permission };
  const email = body.email?.trim().toLowerCase();
  const permission = body.permission ?? "editor";
  if (!email) return NextResponse.json({ error: "email is required" }, { status: 400 });
  if (permission !== "editor" && permission !== "viewer") {
    return NextResponse.json({ error: "permission must be editor or viewer" }, { status: 400 });
  }
  if (email === auth.user!.email?.toLowerCase()) {
    return NextResponse.json({ error: "Cannot share a canvas with yourself" }, { status: 400 });
  }

  const serviceClient = await createServiceClient();
  const sharedWithUserId = await findUserIdByEmail(serviceClient, email);
  if (!sharedWithUserId) {
    return NextResponse.json({ error: "Invitee must sign up before you can share this canvas" }, { status: 404 });
  }

  const { data, error } = await auth.supabase
    .from("canvas_shares")
    .upsert({
      canvas_id: id,
      shared_with_email: email,
      shared_with_user_id: sharedWithUserId,
      permission,
      shared_by: auth.user!.id,
    }, { onConflict: "canvas_id,shared_with_email" })
    .select("id, canvas_id, shared_with_email, shared_with_user_id, permission, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    id: data.id,
    canvasId: data.canvas_id,
    sharedWithEmail: data.shared_with_email,
    sharedWithUserId: data.shared_with_user_id,
    permission: data.permission,
    createdAt: data.created_at,
    displayName: null,
    avatarUrl: null,
  }, { status: 201 });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await requireCanvasOwner(id);
  if (auth.error) return auth.error;

  const url = new URL(request.url);
  const shareId = url.searchParams.get("shareId");
  const userId = url.searchParams.get("userId");
  if (!shareId && !userId) {
    return NextResponse.json({ error: "shareId or userId is required" }, { status: 400 });
  }

  let query = auth.supabase
    .from("canvas_shares")
    .delete()
    .eq("canvas_id", id);
  query = shareId ? query.eq("id", shareId) : query.eq("shared_with_user_id", userId);

  const { error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

async function findUserIdByEmail(
  serviceClient: Awaited<ReturnType<typeof createServiceClient>>,
  email: string
): Promise<string | null> {
  const pageSize = 1000;
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await serviceClient.auth.admin.listUsers({ page, perPage: pageSize });
    if (error) throw new Error(error.message);
    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email);
    if (user) return user.id;
    if (data.users.length < pageSize) return null;
  }
  return null;
}
