import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// POST /api/auth/confirm-email
// Admin endpoint — confirms a user's email via the service role.
export async function POST(request: NextRequest) {
  const supabase = await createServiceClient();

  const body = await request.json().catch(() => ({})) as {
    email?: string;
    userId?: string;
  };

  try {
    let userId = body.userId;

    if (!userId && body.email) {
      const email = body.email.trim().toLowerCase();
      const { data } = await supabase.auth.admin.listUsers();
      const user = (data?.users ?? []).find(
        (u) => (u.email ?? "").toLowerCase() === email
      );
      if (!user) {
        return NextResponse.json({ error: "No user found with that email" }, { status: 404 });
      }
      userId = user.id;
    }

    if (!userId) {
      return NextResponse.json({ error: "Provide email or userId" }, { status: 400 });
    }

    const { error } = await supabase.auth.admin.updateUserById(userId, {
      email_confirm: true,
    });
    if (error) throw new Error(error.message);

    return NextResponse.json({ status: true, message: "Email confirmed", userId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email confirmation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
