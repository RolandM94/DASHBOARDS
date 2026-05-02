import { createClient } from "@/lib/supabase/server";
import { getLatestJobPerType } from "@/lib/reports/jobTracker";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  try {
    const jobs = await getLatestJobPerType(supabase, id);
    return NextResponse.json(jobs);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not fetch jobs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
