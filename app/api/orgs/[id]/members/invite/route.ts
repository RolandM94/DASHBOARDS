import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { OrgRole } from "@/types";

type Params = { params: Promise<{ id: string }> };

// POST /api/orgs/[id]/members/invite
// Body: { email: string, role: OrgRole }
// Creates a pending invite. If the user already exists, auto-activates.
export async function POST(request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { id: orgId } = await params;
  const body = await request.json();
  const { email, role = "member" } = body as { email: string; role?: OrgRole };

  if (!email?.trim()) return NextResponse.json({ error: "email is required" }, { status: 400 });
  if (!["admin", "member", "viewer"].includes(role)) {
    return NextResponse.json({ error: "Invalid role. Must be admin, member, or viewer" }, { status: 400 });
  }

  const normalised = email.trim().toLowerCase();

  // Verify caller is owner or admin of this org
  const { data: self } = await supabase
    .from("org_members")
    .select("role, status")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .single();

  const isOrgOwner = await (async () => {
    const { data: org } = await supabase
      .from("organizations")
      .select("owner_id")
      .eq("id", orgId)
      .single();
    return org?.owner_id === user.id;
  })();

  const canInvite = isOrgOwner || (self?.status === "active" && ["owner", "admin"].includes(self.role));
  if (!canInvite) return NextResponse.json({ error: "Not authorised to invite members" }, { status: 403 });

  // Check if already a member
  const { data: existing } = await supabase
    .from("org_members")
    .select("id, status")
    .eq("org_id", orgId)
    .eq("email", normalised)
    .single();

  if (existing) {
    return NextResponse.json({ error: "This email is already a member or has a pending invite" }, { status: 409 });
  }

  // Insert the invite as pending. accept_org_invites() will activate it
  // automatically when the invitee next signs in.
  const { data: member, error } = await supabase
    .from("org_members")
    .insert({
      org_id:      orgId,
      email:       normalised,
      role,
      status:      "pending",
      invited_by:  user.id,
    })
    .select("id, org_id, user_id, email, role, status, invited_by, invited_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Already invited" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(member, { status: 201 });
}
