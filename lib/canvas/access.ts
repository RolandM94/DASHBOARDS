import type { createClient, createServiceClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;
type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;

export const CANVAS_COLUMNS = "id, user_id, name, blocks, layout, published, published_title, published_permission, published_at, created_at, updated_at";

export type CanvasPermission = "owner" | "editor" | "viewer";

export function dbToCanvas(
  c: Record<string, unknown>,
  options: {
    currentUserId?: string;
    sharedPermissions?: Record<string, CanvasPermission>;
  } = {}
) {
  const accessRole =
    c.user_id && options.currentUserId && c.user_id === options.currentUserId
      ? "owner"
      : options.sharedPermissions?.[String(c.id)];

  return {
    id: c.id,
    name: c.name,
    blocks: c.blocks ?? [],
    layout: c.layout ?? undefined,
    accessRole,
    published: c.published ?? false,
    publishedTitle: c.published_title ?? undefined,
    publishedPermission: c.published_permission ?? undefined,
    publishedAt: c.published_at ?? undefined,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  };
}

export async function getCanvasPermission(
  supabase: SupabaseClient,
  serviceClient: ServiceClient,
  canvasId: string,
  userId: string
): Promise<CanvasPermission | null> {
  const { data: canvas } = await serviceClient
    .from("canvases")
    .select("id, user_id")
    .eq("id", canvasId)
    .single();

  if (!canvas) return null;
  if (canvas.user_id === userId) return "owner";

  const { data: share } = await supabase
    .from("canvas_shares")
    .select("permission")
    .eq("canvas_id", canvasId)
    .eq("shared_with_user_id", userId)
    .maybeSingle();

  if (share?.permission === "editor") return "editor";
  if (share?.permission === "viewer") return "viewer";
  return null;
}
