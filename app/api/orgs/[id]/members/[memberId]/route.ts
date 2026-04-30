import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { OrgRole } from "@/types";

type Params = { params: Promise<{ id: string; memberId: string }> };

// PATCH /api/orgs/[id]/members/[memberId] — update a member's role
export async function PATCH(request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { id: orgId, memberId } = await params;
  const body = await request.json();
  const { role } = body as { role: OrgRole };

  if (!["admin", "member", "viewer"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // Only owner can promote to admin; owner role cannot be assigned via API
  const { data: org } = await supabase
    .from("organizations")
    .select("owner_id")
    .eq("id", orgId)
    .single();

  if (!org) return NextResponse.json({ error: "Org not found" }, { status: 404 });

  const { data: self } = await supabase
    .from("org_members")
    .select("role, status")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .single();

  const canEdit = org.owner_id === user.id || (self?.status === "active" && ["owner", "admin"].includes(self.role));
  if (!canEdit) return NextResponse.json({ error: "Not authorised" }, { status: 403 });

  // Prevent demoting the org owner
  const { data: target } = await supabase
    .from("org_members")
    .select("user_id, role")
    .eq("id", memberId)
    .eq("org_id", orgId)
    .single();

  if (!target) return NextResponse.json({ error: "Member not found" }, { status: 404 });
  if (target.user_id === org.owner_id) {
    return NextResponse.json({ error: "Cannot change the org owner's role" }, { status: 400 });
  }

  const { data: updated, error } = await supabase
    .from("org_members")
    .update({ role })
    .eq("id", memberId)
    .eq("org_id", orgId)
    .select("id, org_id, user_id, email, role, status, invited_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(updated);
}

// DELETE /api/orgs/[id]/members/[memberId] — remove a member or cancel an invite
export async function DELETE(_req: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { id: orgId, memberId } = await params;

  // Lookup the member to be removed
  const { data: target } = await supabase
    .from("org_members")
    .select("user_id, role")
    .eq("id", memberId)
    .eq("org_id", orgId)
    .single();

  if (!target) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  // Verify the caller has permission (admin/owner, or self-removal)
  const { data: org } = await supabase
    .from("organizations")
    .select("owner_id")
    .eq("id", orgId)
    .single();

  const { data: self } = await supabase
    .from("org_members")
    .select("role, status")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .single();

  const isSelf     = target.user_id === user.id;
  const canRemove  = isSelf || org?.owner_id === user.id || (self?.status === "active" && ["owner", "admin"].includes(self.role));
  if (!canRemove) return NextResponse.json({ error: "Not authorised" }, { status: 403 });

  // Cannot remove the org owner
  if (target.user_id === org?.owner_id) {
    return NextResponse.json({ error: "Cannot remove the org owner" }, { status: 400 });
  }

  const { error } = await supabase
    .from("org_members")
    .delete()
    .eq("id", memberId)
    .eq("org_id", orgId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Clear org_id from the removed user's profile.
  // Must use service client because RLS on profiles only allows a user to
  // update their own row — an admin cannot update another member's profile.
  if (target.user_id) {
    const service = await createServiceClient();
    await service
      .from("profiles")
      .update({ org_id: null })
      .eq("id", target.user_id)
      .eq("org_id", orgId);
  }

  return new NextResponse(null, { status: 204 });
}
