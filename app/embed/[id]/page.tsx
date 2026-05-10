import { createClient, createServiceClient } from "@/lib/supabase/server";
import { loadDashboardScope, type DashboardWorksheetRow } from "@/lib/auth/dashboardScope";
import { aggregateDataset } from "@/lib/data/aggregateDataset";
import { getWorkbookSheet } from "@/lib/workbook";
import { renderDashboardPdfHtml } from "@/lib/reports/dashboardPdfHtml";
import type { WidgetBlockConfig, Metric, Dimension, ResolvedChartData, Worksheet, WorksheetStatus } from "@/types";
import type { Metadata } from "next";

export const metadata: Metadata = { robots: "noindex" };

function toWorksheet(row: DashboardWorksheetRow): Worksheet {
  return {
    id: row.id,
    datasetId: row.dataset_id,
    name: row.name,
    description: row.description ?? undefined,
    config: row.config as Worksheet["config"],
    status: (row.status as WorksheetStatus) ?? "saved",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export default async function EmbedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const serviceClient = await createServiceClient();

  const { scope, error } = await loadDashboardScope(supabase, serviceClient, id);
  if (!scope) return <div style={{ padding: 40, color: "#6b7280", textAlign: "center" }}>Dashboard not found</div>;

  const dashboard = scope.dashboard;
  const layout = (dashboard.layout as Array<{ i: string; x: number; y: number; w: number; h: number }> | undefined) ?? [];

  // Fetch widget data
  const widgetBlocks = dashboard.blocks.filter((b): b is WidgetBlockConfig => b.type === "widget");
  const widgetData: Record<string, Record<string, unknown> | null> = {};

  await Promise.all(
    widgetBlocks.map(async (block) => {
      try {
        const worksheetRow = scope.worksheets.find((w) => w.id === block.worksheetId);
        if (!worksheetRow) return;

        const worksheet = toWorksheet(worksheetRow);
        const sheet = getWorkbookSheet(worksheet, block.sheetId);
        if (!sheet) return;

        const chartData = await aggregateDataset(serviceClient, {
          datasetId: worksheet.datasetId,
          metrics: sheet.metrics as Metric[],
          dimensions: sheet.dimensions as Dimension[],
          worksheetFilters: sheet.filters ?? [],
          sort: sheet.sort ?? "natural",
        });

        widgetData[block.id] = {
          query_output: {
            rows: chartData.data,
            columns: [chartData.xKey, ...chartData.yKeys],
            y_keys: chartData.yKeys,
            x_key: chartData.xKey,
          },
          chartType: sheet.chartType ?? "bar",
          title: block.title ?? sheet.name ?? worksheet.name ?? "Widget",
        };
      } catch { /* skip */ }
    }),
  );

  // Render to HTML
  const blocks = dashboard.blocks.map((block) => {
    const pos = layout.find((l) => l.i === block.id);

    if (block.type === "widget") {
      const wd = widgetData[block.id];
      return {
        id: block.id,
        x: pos?.x ?? 0,
        y: pos?.y ?? 0,
        w: pos?.w ?? 6,
        h: pos?.h ?? 14,
        type: "widget" as const,
        title: typeof wd?.title === "string" ? wd.title : "Widget",
        chartType: typeof wd?.chartType === "string" ? wd.chartType : "bar",
        figure: wd as Record<string, unknown> | undefined,
      };
    }

    if (block.type === "text") {
      return {
        id: block.id,
        x: pos?.x ?? 0,
        y: pos?.y ?? 0,
        w: pos?.w ?? 12,
        h: pos?.h ?? 4,
        type: "text" as const,
        content: (block as { content?: string }).content ?? "",
      };
    }

    return null;
  }).filter(Boolean);

  const orientation = "landscape";
  const pageHtml = renderDashboardPdfHtml({
    header: {
      title: dashboard.title,
      permissionLabel: "",
      publishedDate: "",
      generatedDate: "",
    },
    blocks: blocks as Array<{
      id: string; x: number; y: number; w: number; h: number;
      type: "widget" | "text" | "preview";
      title?: string; chartType?: string; figure?: Record<string, unknown>;
      content?: string; columns?: string[]; previewRows?: Array<Record<string, unknown>>;
    }>,
  });

  // Inject embed-specific styles
  const embedStyles = `
    body { margin: 0; padding: 8px; background: transparent !important; }
    .page { page-break-after: auto !important; }
    .header { display: none !important; }
    .page-header-continued { display: none !important; }
    @page { margin: 0; }
    .embed-resize-sentinel { height: 100%; }
  `;

  const resizeScript = `
    <script>
      (function() {
        var sentinel = document.querySelector('.grid');
        if (!sentinel) return;
        var ro = new ResizeObserver(function() {
          var h = document.documentElement.scrollHeight;
          parent.postMessage({ type: 'resize', height: h }, '*');
        });
        ro.observe(sentinel);
        // Initial resize
        setTimeout(function() {
          parent.postMessage({ type: 'resize', height: document.documentElement.scrollHeight }, '*');
        }, 500);
      })();
    </script>
  `;

  const styledHtml = pageHtml
    .replace("</style>", `${embedStyles}</style>`)
    .replace("</body>", `${resizeScript}</body>`);

  return (
    <div
      dangerouslySetInnerHTML={{ __html: styledHtml }}
      style={{ all: "initial" }}
    />
  );
}
