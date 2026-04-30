import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

// GET /api/orgs/[id]/members — list all members + pending invites
export async function GET(_req: Request, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { id: orgId } = await params;

  // Verify the caller belongs to this org
  const { data: self } = await supabase
    .from("org_members")
    .select("role, status")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .single();

  if (!self) return NextResponse.json({ error: "Not a member of this organisation" }, { status: 403 });

  // Fetch all members, join display_name + avatar from profiles
  const { data: members, error } = await supabase
    .from("org_members")
    .select(`
      id,
      org_id,
      user_id,
      email,
      role,
      status,
      invited_by,
      invited_at,
      profiles!org_members_user_id_fkey (
        display_name,
        avatar_url
      )
    `)
    .eq("org_id", orgId)
    .order("invited_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Flatten the nested profiles join
  const result = (members ?? []).map((m) => {
    const prof = (m.profiles as { display_name?: string; avatar_url?: string } | null);
    return {
      id:          m.id,
      orgId:       m.org_id,
      userId:      m.user_id,
      email:       m.email,
      role:        m.role,
      status:      m.status,
      invitedBy:   m.invited_by,
      invitedAt:   m.invited_at,
      displayName: prof?.display_name ?? null,
      avatarUrl:   prof?.avatar_url  ?? null,
    };
  });

  return NextResponse.json(result);
}
