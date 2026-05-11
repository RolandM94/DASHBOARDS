import { formatScheduleSubject, type ReportScheduleRow } from "@/lib/reports/schedules";
import type { DashboardExportArtifact } from "@/lib/reports/dashboardExports";

interface SendScheduleEmailInput {
  schedule: ReportScheduleRow;
  dashboardTitle: string;
  dashboardUrl: string;
  artifact: DashboardExportArtifact;
}

export async function sendScheduleEmail({
  schedule,
  dashboardTitle,
  dashboardUrl,
  artifact,
}: SendScheduleEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");

  const from = process.env.RESEND_FROM_EMAIL ?? "Supercoolstuff <onboarding@resend.dev>";
  const generatedAt = new Date();
  const html = renderEmailHtml({
    dashboardTitle,
    dashboardUrl,
    format: schedule.format.toUpperCase(),
    generatedAt,
  });

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: schedule.recipients,
      subject: formatScheduleSubject(schedule.frequency, dashboardTitle, generatedAt),
      html,
      attachments: [
        {
          filename: artifact.filename,
          content: Buffer.from(artifact.bytes).toString("base64"),
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(body || `Resend request failed (${response.status})`);
  }
}

function renderEmailHtml({
  dashboardTitle,
  dashboardUrl,
  format,
  generatedAt,
}: {
  dashboardTitle: string;
  dashboardUrl: string;
  format: string;
  generatedAt: Date;
}): string {
  const escapedTitle = escapeHtml(dashboardTitle);
  const escapedUrl = escapeHtml(dashboardUrl);
  return `
    <div style="font-family:Inter,Arial,sans-serif;color:#17231d;line-height:1.5">
      <h1 style="font-size:20px;margin:0 0 8px">${escapedTitle}</h1>
      <p style="margin:0 0 16px;color:#5f6f67">
        Your scheduled ${escapeHtml(format)} dashboard export was generated on ${escapeHtml(generatedAt.toLocaleString())}.
      </p>
      <p style="margin:0 0 20px;color:#5f6f67">
        Values in this export come from the published dashboard snapshot and system-calculated widget outputs.
      </p>
      <p style="margin:0 0 24px">
        <a href="${escapedUrl}" style="display:inline-block;background:#49b77a;color:#0d1f16;text-decoration:none;border-radius:8px;padding:10px 14px;font-weight:700">
          View live dashboard
        </a>
      </p>
      <p style="border-top:1px solid #e6eee9;padding-top:12px;color:#7b8a82;font-size:12px">
        Sent by Supercoolstuff. Manage this schedule from the dashboard header.
      </p>
    </div>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
