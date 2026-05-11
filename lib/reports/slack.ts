import { getWorkbookSheet } from "@/lib/workbook";
import type { DashboardScope } from "@/lib/auth/dashboardScope";
import type { collectDashboardExportData } from "@/lib/reports/dashboardExports";
import type { WidgetBlockConfig, Worksheet, WorksheetStatus } from "@/types";

type DashboardExportData = Awaited<ReturnType<typeof collectDashboardExportData>>;

export interface SlackIntegrationRow {
  id: string;
  user_id: string;
  dashboard_id: string;
  webhook_url: string;
  channel_name?: string | null;
  active: boolean;
  last_shared_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SlackIntegrationPublic {
  id: string;
  dashboardId: string;
  channelName?: string | null;
  active: boolean;
  webhookUrlMasked: string;
  lastSharedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SlackMetricSummary {
  label: string;
  value: string;
}

export function validateSlackWebhookUrl(value: unknown): { url?: string; error?: string } {
  if (typeof value !== "string" || !value.trim()) return { error: "Slack webhook URL is required" };
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return { error: "Slack webhook URL is invalid" };
  }
  if (url.protocol !== "https:") return { error: "Slack webhook URL must use HTTPS" };
  if (url.hostname !== "hooks.slack.com") return { error: "Slack webhook URL must be from hooks.slack.com" };
  if (!url.pathname.startsWith("/services/")) return { error: "Slack webhook URL must be an incoming webhook URL" };
  return { url: url.toString() };
}

export function maskSlackWebhookUrl(value: string): string {
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    const tail = parts.at(-1) ?? "";
    return `${url.origin}/services/...${tail.slice(-6)}`;
  } catch {
    return "Configured";
  }
}

export function dbToSlackIntegration(row: SlackIntegrationRow): SlackIntegrationPublic {
  return {
    id: row.id,
    dashboardId: row.dashboard_id,
    channelName: row.channel_name,
    active: row.active,
    webhookUrlMasked: maskSlackWebhookUrl(row.webhook_url),
    lastSharedAt: row.last_shared_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function extractSlackKpiSummaries(scope: DashboardScope, exportData: DashboardExportData): SlackMetricSummary[] {
  const summaries: SlackMetricSummary[] = [];
  for (const result of exportData.aggregateResults) {
    const block = scope.dashboard.blocks.find((item) => item.id === result.blockId) as WidgetBlockConfig | undefined;
    if (!block) continue;
    const worksheetRow = scope.worksheets.find((worksheet) => worksheet.id === block.worksheetId);
    if (!worksheetRow) continue;
    const worksheet: Worksheet = {
      id: worksheetRow.id,
      datasetId: worksheetRow.dataset_id,
      name: worksheetRow.name,
      description: worksheetRow.description ?? undefined,
      config: worksheetRow.config as Worksheet["config"],
      status: (worksheetRow.status as WorksheetStatus) ?? "saved",
      createdAt: worksheetRow.created_at,
      updatedAt: worksheetRow.updated_at,
    };
    const sheet = getWorkbookSheet(worksheet, block.sheetId);
    if (sheet?.chartType !== "kpi") continue;
    const firstRow = result.data?.data[0];
    if (!firstRow) continue;
    for (const key of result.data?.yKeys ?? []) {
      if (summaries.length >= 6) return summaries;
      summaries.push({
        label: key,
        value: formatSlackValue(firstRow[key]),
      });
    }
  }
  return summaries;
}

export function buildSlackPayload({
  dashboardTitle,
  dashboardUrl,
  metrics,
  context,
}: {
  dashboardTitle: string;
  dashboardUrl: string;
  metrics: SlackMetricSummary[];
  context: string;
}) {
  return {
    text: `${dashboardTitle} - ${context}`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: dashboardTitle.slice(0, 150),
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${escapeSlack(context)}*\nValues are sourced from the published dashboard snapshot.`,
        },
      },
      ...(metrics.length > 0 ? [{
        type: "section",
        fields: metrics.slice(0, 6).map((metric) => ({
          type: "mrkdwn",
          text: `*${escapeSlack(metric.label)}*\n${escapeSlack(metric.value)}`,
        })),
      }] : []),
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "View dashboard",
              emoji: true,
            },
            url: dashboardUrl,
          },
        ],
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Sent by Supercoolstuff • ${escapeSlack(new Date().toLocaleString())}`,
          },
        ],
      },
    ],
  };
}

export async function sendSlackWebhook(webhookUrl: string, payload: unknown): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(body || `Slack webhook failed (${response.status})`);
  }
}

function formatSlackValue(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return String(value ?? "No value");
}

function escapeSlack(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
