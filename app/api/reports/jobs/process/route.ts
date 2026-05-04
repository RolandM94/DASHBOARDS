import { createClient } from "@/lib/supabase/server";
import { processQueuedJobs } from "@/lib/reports/worker";
import { NextResponse } from "next/server";

// GET /api/reports/jobs/process — called by Vercel Cron every 30 seconds
// POST /api/reports/jobs/process — manual trigger (admin/testing)
export async function GET() {
  const supabase = await createClient();

  try {
    const result = await processQueuedJobs(supabase, 10);

    return NextResponse.json({
      status: true,
      processed: result.processed,
      succeeded: result.succeeded,
      failed: result.failed,
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Job processing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export { GET as POST };
