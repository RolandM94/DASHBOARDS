import { createClient } from "@/lib/supabase/server";
import { generateApiKey } from "@/lib/data/apiAuth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * GET /api/keys
 * Returns a list of API keys for the authenticated user (without the full key).
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { data, error } = await supabase
    .from("api_keys")
    .select("id, name, key_prefix, scopes, created_at, last_used_at, revoked_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

/**
 * POST /api/keys
 * Creates a new API key. Returns the full key only once.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { name, scopes = ["read"] } = await request.json() as { name?: string; scopes?: string[] };
  if (!name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const validScopes = scopes.filter((s) => ["read", "write", "admin"].includes(s));
  if (validScopes.length === 0) validScopes.push("read");

  const { fullKey, keyPrefix, keyHash } = generateApiKey();

  const { error } = await supabase
    .from("api_keys")
    .insert({
      user_id: user.id,
      name: name.trim(),
      key_prefix: keyPrefix,
      key_hash: keyHash,
      scopes: validScopes,
    });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    fullKey,
    keyPrefix,
    name: name.trim(),
    scopes: validScopes,
  }, { status: 201 });
}

/**
 * DELETE /api/keys/[id]
 * Revokes an API key.
 */
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  // Extract key id from the URL path
  const url = new URL(request.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const keyId = segments[segments.length - 1];

  if (!keyId) return NextResponse.json({ error: "Key ID required" }, { status: 400 });

  const { error } = await supabase
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", keyId)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
