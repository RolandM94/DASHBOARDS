import { createServiceClient } from "@/lib/supabase/server";
import { type SupabaseRouteClient } from "@/lib/reports/api";
import { claimNextQueuedJobs, completeJob, failJob, updateJobProgress } from "@/lib/reports/jobTracker";
import { logReportAction } from "@/lib/reports/api";
import { captureReportSource } from "@/lib/reports/sourceReader";
import { generateReportBlueprint } from "@/lib/reports/blueprintGenerator";
import { generateAllReportSections } from "@/lib/reports/sectionGenerator";
import { compileReport } from "@/lib/reports/reportCompiler";
import { exportReport } from "@/lib/reports/exportEngine";
import type { ReportJob, ReportExportFormat, ActiveGlobalFilters, ActiveSmartFilters, ReportType } from "@/types";

export interface ProcessResult {
  processed: number;
  succeeded: number;
  failed: number;
  errors: string[];
}

export async function processQueuedJobs(
  supabase: SupabaseRouteClient,
  limit = 10
): Promise<ProcessResult> {
  const jobs = await claimNextQueuedJobs(supabase, limit);
  if (jobs.length === 0) return { processed: 0, succeeded: 0, failed: 0, errors: [] };

  let succeeded = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const job of jobs) {
    try {
      await processJob(supabase, job);
      succeeded += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : "Unknown worker error";
      errors.push(`Job ${job.id} (${job.jobType}): ${message}`);
    }
  }

  return { processed: jobs.length, succeeded, failed, errors };
}

async function processJob(supabase: SupabaseRouteClient, job: ReportJob): Promise<void> {
  const update = async (step: string, completed: number, total: number) => {
    await updateJobProgress(supabase, job.id, step, completed, total);
  };

  const serviceClient = await createServiceClient();
  const jobId = job.id;
  const projectId = job.reportProjectId;
  const payload = job.jobPayload;

  const { data: project } = await supabase
    .from("report_projects")
    .select("created_by")
    .eq("id", projectId)
    .single();
  const userId = project?.created_by ?? "system";

  try {
    switch (job.jobType) {
      case "capture_source_snapshot": {
        await update("Capturing dashboard data", 0, 1);
        const result = await captureReportSource(supabase, serviceClient, projectId, {
          activeFilters: payload.activeFilters as ActiveGlobalFilters | undefined,
          activeSmartFilters: payload.activeSmartFilters as ActiveSmartFilters | undefined,
        });
        await logReportAction(supabase, userId, "capture_source_snapshot", {
          reportProjectId: projectId,
          outputSummary: { snapshot_id: result.snapshotId, widgets_captured: result.sourcePackage.metadata.widget_count },
        });
        await update("Source snapshot captured", 1, 1);
        break;
      }

      case "generate_blueprint": {
        await update("Generating blueprint", 0, 1);
        const result = await generateReportBlueprint(supabase, projectId, {
          instructions: payload.instructions as string | undefined,
          audience: payload.audience as string | undefined,
          reportType: payload.reportType as ReportType | undefined,
        }, userId);
        await logReportAction(supabase, userId, "generate_blueprint", {
          reportProjectId: projectId,
          outputSummary: { report_blueprint_id: result.blueprint.id, section_count: result.sections.length },
          aiModel: "claude-haiku-4-5-20251001",
        });
        await update("Blueprint generated", 1, 1);
        break;
      }

      case "generate_section": {
        // Individual section generation is handled by generate_all_sections
        // Fall through to generate all if a single section job comes in
        await update("Generating report sections", 0, 1);
        const result = await generateAllReportSections(supabase, projectId, {
          instructions: payload.instructions as string | undefined,
          allowPreview: Boolean(payload.allowPreview),
        }, userId);
        await logReportAction(supabase, userId, "generate_all_sections", {
          reportProjectId: projectId,
          outputSummary: { generated_count: result.generated.length, failed_count: result.failed.length },
          status: result.failed.length > 0 ? "failed" : "success",
          aiModel: "claude-haiku-4-5-20251001",
        });
        await update("Sections generated", 1, 1);
        break;
      }

      case "generate_all_sections": {
        await update("Generating report sections", 0, 1);
        const result = await generateAllReportSections(supabase, projectId, {
          instructions: payload.instructions as string | undefined,
          allowPreview: Boolean(payload.allowPreview),
        }, userId);
        await logReportAction(supabase, userId, "generate_all_sections", {
          reportProjectId: projectId,
          outputSummary: { generated_count: result.generated.length, failed_count: result.failed.length },
          status: result.failed.length > 0 ? "failed" : "success",
          aiModel: "claude-haiku-4-5-20251001",
        });
        await update("Sections generated", 1, 1);
        break;
      }

      case "compile_report": {
        await update("Compiling report", 0, 1);
        const result = await compileReport(supabase, projectId, {
          blueprintId: payload.blueprintId as string | undefined,
          includeAppendices: payload.includeAppendices as boolean | undefined,
          allowPreview: Boolean(payload.allowPreview),
          compiledBy: userId,
          userId,
        });
        await logReportAction(supabase, userId, "compile_report", {
          reportProjectId: projectId,
          outputSummary: { report_compilation_id: result.compilation.id, section_count: result.payload.sections.length },
        });
        await update("Report compiled", 1, 1);
        break;
      }

      case "export_report": {
        const format = (payload.format as ReportExportFormat) || "docx";
        const exportOptions = payload.exportOptions as Record<string, unknown> | undefined;
        const compilationId = payload.compilationId as string | undefined;

        await update(`Exporting ${format.toUpperCase()}`, 0, 1);
        const result = await exportReport(supabase, projectId, {
          format,
          exportOptions: exportOptions ?? {},
          compilationId,
          exportedBy: userId,
        });
        await logReportAction(supabase, userId, "export_report", {
          reportProjectId: projectId,
          outputSummary: { report_export_id: result.exportRecord.id, format, download_url: result.artifact.downloadUrl },
        });
        await update("Export ready", 1, 1);
        break;
      }

      default:
        throw new Error(`Unknown job type: ${job.jobType}`);
    }

    await completeJob(supabase, jobId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Job processing failed";
    await failJob(supabase, jobId, message);
    throw error;
  }
}
