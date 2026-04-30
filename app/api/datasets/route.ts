import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// GET /api/datasets — list datasets accessible to the current user:
//   1. Own datasets (any visibility)
//   2. Seed datasets (is_seed = true)
//   3. Org-visible datasets from org members
//   4. Datasets explicitly shared with this user
//   5. Public datasets are intentionally excluded here (they're accessed via
//      unauthenticated dashboard view only, not the management UI)
//
// Each result includes an `accessType` discriminator:
//   "own" | "seed" | "org" | "share"
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  // Try the full column set (post-migration). Fall back to base columns if the
  // visibility/is_seed columns don't exist yet (migration 0004 not applied).
  const COLS_FULL = "id, file_name, uploaded_at, fields, row_count, visibility, is_seed";
  const COLS_BASE = "id, file_name, uploaded_at, fields, row_count";

  // 1. Own datasets
  const { data: ownData, error: ownErr } = await supabase
    .from("datasets")
    .select(COLS_FULL)
    .eq("user_id", user.id)
    .order("uploaded_at", { ascending: false });

  if (ownErr) {
    // If the error is a missing column (migration pending), fall back gracefully
    if (ownErr.code === "42703" || ownErr.message?.includes("column")) {
      const fallback = await supabase
        .from("datasets")
        .select(COLS_BASE)
        .eq("user_id", user.id)
        .order("uploaded_at", { ascending: false });
      if (fallback.error) return NextResponse.json({ error: fallback.error.message }, { status: 500 });
      // Return legacy format — sharing features unavailable until migration runs
      return NextResponse.json(
        (fallback.data ?? []).map((d) => ({ ...d, visibility: "private", is_seed: false, accessType: "own" }))
      );
    }
    return NextResponse.json({ error: ownErr.message }, { status: 500 });
  }

  const ownIds = new Set((ownData ?? []).map((d) => d.id));

  // 2. Seed datasets (system-owned, available to all authenticated users)
  const { data: seedData } = await supabase
    .from("datasets")
    .select(COLS_FULL)
    .eq("is_seed", true)
    .order("uploaded_at", { ascending: true });

  // 3. Org-visible datasets — only if user belongs to an org
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();

  let orgData: typeof ownData = [];
  if (profile?.org_id) {
    // Get user_ids of all active members in the same org (excluding self)
    const { data: members } = await supabase
      .from("org_members")
      .select("user_id")
      .eq("org_id", profile.org_id)
      .eq("status", "active")
      .neq("user_id", user.id);

    const memberIds = (members ?? []).map((m) => m.user_id).filter(Boolean) as string[];

    if (memberIds.length > 0) {
      const { data: orgDs } = await supabase
        .from("datasets")
        .select(COLS_FULL)
        .in("user_id", memberIds)
        .eq("visibility", "org")
        .order("uploaded_at", { ascending: false });
      orgData = orgDs ?? [];
    }
  }

  // 4. Explicitly shared datasets
  const { data: sharedLinks } = await supabase
    .from("dataset_shares")
    .select("dataset_id, permission")
    .eq("shared_with_user_id", user.id);

  let shareData: typeof ownData = [];
  if (sharedLinks && sharedLinks.length > 0) {
    const sharedIds = sharedLinks.map((s) => s.dataset_id);
    const { data: sharedDs } = await supabase
      .from("datasets")
      .select(COLS_FULL)
      .in("id", sharedIds)
      .order("uploaded_at", { ascending: false });
    shareData = sharedDs ?? [];
  }

  // Merge & deduplicate, tagging each with accessType
  type Row = {
    id: string;
    file_name: string;
    uploaded_at: string;
    fields: unknown;
    row_count: number;
    visibility: string;
    is_seed: boolean;
    accessType: "own" | "seed" | "org" | "share";
  };

  const seen = new Set<string>();
  const results: Row[] = [];

  function add(rows: typeof ownData, type: Row["accessType"]) {
    for (const r of rows ?? []) {
      if (seen.has(r.id)) continue;
      // Don't show seed datasets under "own" if they happen to be owned by this user
      if (type === "seed" && ownIds.has(r.id)) continue;
      seen.add(r.id);
      results.push({ ...r, accessType: type } as Row);
    }
  }

  add(ownData,  "own");
  add(seedData, "seed");
  add(orgData,  "org");
  add(shareData, "share");

  return NextResponse.json(results);
}

// POST /api/datasets — create dataset metadata (rows uploaded separately via /rows)
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body = await request.json();
  const { fileName, fields, rowCount } = body as {
    fileName: string;
    fields: unknown[];
    rowCount: number;
  };

  if (!fileName || !Array.isArray(fields)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("datasets")
    .insert({
      user_id: user.id,
      file_name: fileName,
      fields,
      row_count: rowCount ?? 0,
    })
    .select("id, file_name, uploaded_at, fields, row_count")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
