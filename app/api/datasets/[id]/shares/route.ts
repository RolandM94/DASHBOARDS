import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { DatasetSharePermission } from "@/types";

type Params = { params: Promise<{ id: string }> };

// GET /api/datasets/[id]/shares — list all shares (owner only)
export async function GET(_req: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { id: datasetId } = await params;

  // Verify ownership
  const { data: dataset } = await supabase
    .from("datasets")
    .select("id")
    .eq("id", datasetId)
    .eq("user_id", user.id)
    .single();

  if (!dataset) return NextResponse.json({ error: "Dataset not found or not authorised" }, { status: 404 });

  const { data: shares, error } = await supabase
    .from("dataset_shares")
    .select(`
      id,
      dataset_id,
      shared_with_email,
      shared_with_user_id,
      permission,
      created_at,
      profiles!dataset_shares_shared_with_user_id_fkey (
        display_name,
        avatar_url
      )
    `)
    .eq("dataset_id", datasetId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = (shares ?? []).map((s) => {
    const prof = (s.profiles as { display_name?: string } | null);
    return {
      id:               s.id,
      datasetId:        s.dataset_id,
      sharedWithEmail:  s.shared_with_email,
      sharedWithUserId: s.shared_with_user_id,
      permission:       s.permission,
      createdAt:        s.created_at,
      displayName:      prof?.display_name ?? null,
    };
  });

  return NextResponse.json(result);
}

// POST /api/datasets/[id]/shares — share with a specific user by email
// Body: { email: string, permission: "viewer" | "editor" }
export async function POST(request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { id: datasetId } = await params;
  const body = await request.json();
  const { email, permission = "viewer" } = body as { email: string; permission?: DatasetSharePermission };

  if (!email?.trim()) return NextResponse.json({ error: "email is required" }, { status: 400 });
  if (!["viewer", "editor"].includes(permission)) {
    return NextResponse.json({ error: "permission must be viewer or editor" }, { status: 400 });
  }

  const normalised = email.trim().toLowerCase();

  // Verify dataset ownership
  const { data: dataset } = await supabase
    .from("datasets")
    .select("id")
    .eq("id", datasetId)
    .eq("user_id", user.id)
    .single();

  if (!dataset) return NextResponse.json({ error: "Dataset not found or not authorised" }, { status: 404 });

  // Don't allow sharing with yourself
  if (normalised === user.email?.toLowerCase()) {
    return NextResponse.json({ error: "Cannot share a dataset with yourself" }, { status: 400 });
  }

  const { data: share, error } = await supabase
    .from("dataset_shares")
    .insert({
      dataset_id:         datasetId,
      shared_with_email:  normalised,
      permission,
    })
    .select("id, dataset_id, shared_with_email, shared_with_user_id, permission, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Already shared with this email" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Map to camelCase so the frontend DatasetShare type is satisfied
  return NextResponse.json({
    id:               share.id,
    datasetId:        share.dataset_id,
    sharedWithEmail:  share.shared_with_email,
    sharedWithUserId: share.shared_with_user_id ?? null,
    permission:       share.permission,
    createdAt:        share.created_at,
    displayName:      null,
  }, { status: 201 });
}
