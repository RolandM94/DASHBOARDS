import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// GET /api/orgs — return the current user's org (if any) + their membership
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  // Get the user's profile to find org_id
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();

  if (!profile?.org_id) {
    return NextResponse.json({ org: null, membership: null });
  }

  // Fetch org + current member's role
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("id, name, slug, owner_id, created_at")
    .eq("id", profile.org_id)
    .single();

  if (orgError) {
    // Surface RLS / DB errors so the client can show a real error message
    // instead of silently showing the "create org" form.
    return NextResponse.json({ error: orgError.message }, { status: 500 });
  }
  if (!org) return NextResponse.json({ org: null, membership: null });

  const { data: membership } = await supabase
    .from("org_members")
    .select("id, role, status, invited_at")
    .eq("org_id", profile.org_id)
    .eq("user_id", user.id)
    .single();

  return NextResponse.json({ org, membership: membership ?? null });
}

// POST /api/orgs — create a new organisation and make the caller the owner
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body = await request.json();
  const { name } = body as { name: string };
  if (!name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  // Derive slug from name
  const slug = name.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  // Check if user already belongs to an org
  const { data: existing } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();

  if (existing?.org_id) {
    return NextResponse.json({ error: "Already a member of an organisation" }, { status: 409 });
  }

  // Create org
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .insert({ name: name.trim(), slug, owner_id: user.id })
    .select("id, name, slug, owner_id, created_at")
    .single();

  if (orgError) {
    if (orgError.code === "23505") {
      return NextResponse.json({ error: "An organisation with that name already exists" }, { status: 409 });
    }
    // Table doesn't exist — migration 0004 hasn't been applied yet
    if (orgError.code === "42P01") {
      return NextResponse.json({
        error: "Database migration required. Please run supabase/migrations/0004_multi_user_sharing.sql in your Supabase SQL Editor.",
      }, { status: 503 });
    }
    return NextResponse.json({ error: orgError.message }, { status: 500 });
  }

  // Add owner as active member with role 'owner'
  await supabase.from("org_members").insert({
    org_id: org.id,
    user_id: user.id,
    email: user.email!,
    role: "owner",
    status: "active",
    invited_by: user.id,
  });

  // Set org_id on the creator's profile
  await supabase
    .from("profiles")
    .update({ org_id: org.id })
    .eq("id", user.id);

  return NextResponse.json(org, { status: 201 });
}
