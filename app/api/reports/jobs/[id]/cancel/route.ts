import { createClient } from "@/lib/supabase/server";
import { cancelJob, canCancelJob, getJob } from "@/lib/reports/jobTracker";
import { NextResponse } from "next/server";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const job = await getJob(supabase, id);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  if (!canCancelJob(job.status)) {
    return NextResponse.json(
      { error: `Cannot cancel job in status "${job.status}"` },
      { status: 400 }
    );
  }

  try {
    const updated = await cancelJob(supabase, id);
    return NextResponse.json({ status: true, job: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not cancel job";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
