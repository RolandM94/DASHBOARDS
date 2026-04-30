import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// POST /api/auth/accept-invites
// Called right after sign-in. Finds any pending org invites that match the
// current user's email and marks them active, then sets profiles.org_id.
// This is idempotent — safe to call on every login.
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  await supabase.rpc("accept_org_invites", {
    p_user_id: user.id,
    p_email:   user.email!,
  });

  return NextResponse.json({ ok: true });
}
