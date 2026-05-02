import {
  REPORT_JOB_COLUMNS,
  type SupabaseRouteClient,
} from "@/lib/reports/api";
import {
  buildReportJobInsert,
  buildReportJobPatch,
  dbToReportJob,
  isOneOf,
  REPORT_JOB_STATUSES,
  REPORT_JOB_TYPES,
} from "@/lib/reports/models";
import type { ReportJob, ReportJobStatus, ReportJobType } from "@/types";

export function canCancelJob(status: ReportJobStatus): boolean {
  return status === "queued" || status === "running";
}

export function canRetryJob(status: ReportJobStatus): boolean {
  return status === "failed" || status === "cancelled";
}

export function computeProgressPercent(completed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((Math.min(completed, total) / total) * 100);
}

export function jobLabel(jobType: ReportJobType): string {
  const labels: Record<ReportJobType, string> = {
    capture_source_snapshot: "Capturing dashboard data",
    generate_blueprint: "Generating blueprint",
    generate_section: "Generating section",
    generate_all_sections: "Generating sections",
    compile_report: "Compiling report",
    export_report: "Exporting report",
  };
  return labels[jobType] ?? jobType.replaceAll("_", " ");
}

// ── Database helpers ─────────────────────────────────────────────────────────

export async function createJob(
  supabase: SupabaseRouteClient,
  reportProjectId: string,
  jobType: ReportJobType,
  totalSteps = 1
): Promise<ReportJob> {
  const built = buildReportJobInsert({
    reportProjectId,
    jobType,
    totalSteps,
  });
  if (built.error) throw new Error(built.error);

  const { data, error } = await supabase
    .from("report_jobs")
    .insert(built.data!)
    .select(REPORT_JOB_COLUMNS)
    .single();

  if (error) throw new Error(error.message);
  return dbToReportJob(data);
}

export async function startJob(
  supabase: SupabaseRouteClient,
  jobId: string
): Promise<void> {
  const { data, error } = await supabase
    .from("report_jobs")
    .update({
      status: "running",
      started_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .select(REPORT_JOB_COLUMNS)
    .single();

  if (error) throw new Error(error.message);
}

export async function updateJobProgress(
  supabase: SupabaseRouteClient,
  jobId: string,
  currentStep: string,
  completedSteps: number,
  totalSteps: number
): Promise<void> {
  const progressPercent = computeProgressPercent(completedSteps, totalSteps);
  const { error } = await supabase
    .from("report_jobs")
    .update({
      progress_percent: progressPercent,
      current_step: currentStep,
      completed_steps: completedSteps,
      total_steps: totalSteps,
    })
    .eq("id", jobId);

  if (error) throw new Error(error.message);
}

export async function completeJob(
  supabase: SupabaseRouteClient,
  jobId: string
): Promise<void> {
  const { error } = await supabase
    .from("report_jobs")
    .update({
      status: "completed",
      progress_percent: 100,
      completed_steps: (await getJobTotalSteps(supabase, jobId)),
      finished_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  if (error) throw new Error(error.message);
}

async function getJobTotalSteps(supabase: SupabaseRouteClient, jobId: string): Promise<number> {
  const { data } = await supabase
    .from("report_jobs")
    .select("total_steps")
    .eq("id", jobId)
    .single();
  return data?.total_steps ?? 1;
}

export async function failJob(
  supabase: SupabaseRouteClient,
  jobId: string,
  errorMessage: string
): Promise<void> {
  const { error } = await supabase
    .from("report_jobs")
    .update({
      status: "failed",
      error_message: errorMessage,
      finished_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  if (error) throw new Error(error.message);
}

export async function cancelJob(
  supabase: SupabaseRouteClient,
  jobId: string
): Promise<ReportJob> {
  const patch = buildReportJobPatch({
    status: "cancelled",
    finishedAt: new Date().toISOString(),
  });
  if (patch.error) throw new Error(patch.error);

  const { data, error } = await supabase
    .from("report_jobs")
    .update(patch.data!)
    .eq("id", jobId)
    .select(REPORT_JOB_COLUMNS)
    .single();

  if (error) throw new Error(error.message);
  return dbToReportJob(data);
}

export async function getJob(
  supabase: SupabaseRouteClient,
  jobId: string
): Promise<ReportJob | null> {
  const { data, error } = await supabase
    .from("report_jobs")
    .select(REPORT_JOB_COLUMNS)
    .eq("id", jobId)
    .single();

  if (error) return null;
  return dbToReportJob(data);
}

export async function getLatestJobs(
  supabase: SupabaseRouteClient,
  reportProjectId: string,
  jobType?: ReportJobType
): Promise<ReportJob[]> {
  let query = supabase
    .from("report_jobs")
    .select(REPORT_JOB_COLUMNS)
    .eq("report_project_id", reportProjectId)
    .order("created_at", { ascending: false });

  if (jobType) {
    query = query.eq("job_type", jobType);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => dbToReportJob(row));
}

export async function getLatestJobPerType(
  supabase: SupabaseRouteClient,
  reportProjectId: string
): Promise<ReportJob[]> {
  const jobs = await getLatestJobs(supabase, reportProjectId);
  const seen = new Set<string>();
  const latest: ReportJob[] = [];
  for (const job of jobs) {
    if (!seen.has(job.jobType)) {
      seen.add(job.jobType);
      latest.push(job);
    }
  }
  return latest;
}

// ── Route wrapper ────────────────────────────────────────────────────────────

export type JobWorkResult<T> = {
  job: ReportJob;
  result: T;
};

export async function runWithJob<T>(
  supabase: SupabaseRouteClient,
  reportProjectId: string,
  jobType: ReportJobType,
  totalSteps: number,
  work: (
    updateProgress: (step: string, completed: number, total: number) => Promise<void>,
    jobId: string
  ) => Promise<T>
): Promise<JobWorkResult<T>> {
  const job = await createJob(supabase, reportProjectId, jobType, totalSteps);
  const jobId = job.id;

  let currentJob = job;
  try {
    await startJob(supabase, jobId);

    const updateProgress = async (step: string, completed: number, total: number) => {
      await updateJobProgress(supabase, jobId, step, completed, total);
      currentJob = { ...currentJob, currentStep: step, progressPercent: computeProgressPercent(completed, total), completedSteps: completed, totalSteps: total };
    };

    const result = await work(updateProgress, jobId);

    await completeJob(supabase, jobId);
    currentJob = { ...currentJob, status: "completed" as ReportJobStatus, progressPercent: 100 };

    return { job: currentJob, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Job failed";
    await failJob(supabase, jobId, message);
    currentJob = { ...currentJob, status: "failed" as ReportJobStatus, errorMessage: message };
    return { job: currentJob, result: undefined as unknown as T };
  }
}
