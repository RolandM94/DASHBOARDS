import { createServiceClient } from "@/lib/supabase/server";
import crypto from "crypto";

export interface ApiKeyAuth {
  userId: string;
  scopes: string[];
}

/**
 * Authenticates a request using the Bearer token from the Authorization header.
 * The token is looked up by prefix (first 8 chars), then verified by SHA256 hash.
 */
export async function authenticateApiKey(request: Request): Promise<ApiKeyAuth | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7).trim();
  if (token.length < 12) return null;

  const keyPrefix = token.slice(0, 8);
  const keyHash = crypto.createHash("sha256").update(token).digest("hex");

  const serviceClient = await createServiceClient();
  const { data: raw } = await serviceClient
    .from("api_keys")
    .select("id, user_id, scopes, key_hash, revoked_at")
    .eq("key_prefix", keyPrefix)
    .single();

  if (!raw) return null;
  const data = raw as { id: string; user_id: string; scopes: string[]; key_hash: string; revoked_at: string | null };
  if (data.revoked_at) return null;
  if (data.key_hash !== keyHash) return null;

  // Update last_used_at (fire-and-forget)
  await serviceClient
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);

  return { userId: data.user_id, scopes: data.scopes };
}

/**
 * Generates a new API key and returns the full key (only shown once).
 * The key is formatted as: sc_{prefix}_{random}
 */
export function generateApiKey(): { fullKey: string; keyPrefix: string; keyHash: string } {
  const random = crypto.randomBytes(24).toString("hex");
  const fullKey = `sc_${random}`;
  const keyPrefix = fullKey.slice(0, 8);
  const keyHash = crypto.createHash("sha256").update(fullKey).digest("hex");
  return { fullKey, keyPrefix, keyHash };
}
