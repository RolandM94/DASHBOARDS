import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { email, password, displayName } = body as {
    email: string;
    password: string;
    displayName?: string;
  };

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[signup] SUPABASE_SERVICE_ROLE_KEY is not set in environment");
    return NextResponse.json(
      { error: "Server misconfiguration — contact support." },
      { status: 500 }
    );
  }

  try {
    const supabase = await createServiceClient();
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: displayName?.trim() || email.split("@")[0] },
    });

    if (error) {
      console.error("[signup] admin.createUser failed", {
        email,
        status: error.status,
        code: error.code,
        message: error.message,
        name: (error as { name?: string }).name,
      });

      const lower = (error.message ?? "").toLowerCase();
      if (lower.includes("rate limit") || lower.includes("too many") || error.status === 429) {
        return NextResponse.json(
          { error: "Too many signup attempts. Please wait a few minutes and try again." },
          { status: 429 }
        );
      }

      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      id: data.user.id,
      email: data.user.email,
    });
  } catch (err) {
    console.error("[signup] unexpected error", {
      email,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Something went wrong" },
      { status: 500 }
    );
  }
}
