"use client";

import { useEffect, useRef, useState } from "react";
import { WorksheetConfig, ResolvedChartData } from "@/types";
import { ChartRenderer } from "@/components/shared/charts/ChartRenderer";
import { Badge } from "@/components/ui/badge";
import { BarChart2, MousePointerClick, Filter, Loader2, Download, Sheet } from "lucide-react";
import { exportSvgAsPNG, exportAsXLSX } from "@/lib/utils/export";
import type { AggregateRequest } from "@/app/api/aggregate/route";

interface Props {
  datasetId: string;
  rowCount: number;
  config: WorksheetConfig;
  title?: string;
}

function getSetupHint(config: WorksheetConfig): string | null {
  const hasX = config.dimensions.length > 0;
  const hasY = config.metrics.length > 0;
  const isKpi = config.chartType === "kpi";
  const isPie = config.chartType === "pie";
  const isMap = config.chartType === "map";

  if (isKpi && !hasY) return "Click a numeric field on the left to add a KPI value";
  if (isPie && !hasX) return "Click a text field to set the slice-by category";
  if (isPie && !hasY) return "Now click a numeric field to set the value";
  if (isMap && !hasX) return "Click the field that contains country or region names";
  if (isMap && !hasY) return "Now click a numeric field to set the map value";
  if (!hasX && !hasY) return "Click a field on the left to start building your chart";
  if (!hasX) return "Click a text or date field to set the X Axis";
  if (!hasY) return "Click a numeric field to add a Y Axis value";
  return null;
}

// Chart types that render an <svg> and can be exported as PNG
const SVG_CHART_TYPES = new Set(["bar", "grouped_bar", "line", "area", "pie"]);

function AutoSizer({ children }: { children: (height: number) => React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(400);

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setHeight(Math.max(320, Math.floor(entry.contentRect.height)));
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} className="h-full min-h-0 min-w-0">
      {children(height)}
    </div>
  );
}

export function PreviewPanel({ datasetId, rowCount, config, title }: Props) {
  const [chartData, setChartData] = useState<ResolvedChartData | null>(null);
  const [fetching, setFetching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chartAreaRef = useRef<HTMLDivElement>(null);

  const hasMetrics = config.metrics.length > 0;

  useEffect(() => {
    if (!hasMetrics) {
      setChartData(null);
      return;
    }

    // Debounce: wait 350ms after the last config change before hitting the API
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setFetching(true);
      try {
        const body: AggregateRequest = {
          datasetId,
          metrics: config.metrics,
          dimensions: config.dimensions,
          worksheetFilters: config.filters,
          sort: config.sort ?? "natural",
        };
        const res = await fetch("/api/aggregate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) setChartData(await res.json());
        else setChartData(null);
      } catch {
        setChartData(null);
      } finally {
        setFetching(false);
      }
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [datasetId, config, hasMetrics]);

  const hint = getSetupHint(config);
  const hasData = chartData && chartData.data.length > 0 && chartData.yKeys.length > 0;
  const showTitle = title && title.trim().length > 0;
  const canExport = hasData && SVG_CHART_TYPES.has(config.chartType);

  function handleExportPNG() {
    if (!chartAreaRef.current || !chartData) return;
    const subtitle = `${chartData.data.length} data point${chartData.data.length !== 1 ? "s" : ""}`;
    exportSvgAsPNG(chartAreaRef.current, title?.trim() || "chart", title?.trim() || undefined, subtitle);
  }

  function handleExportXLSX() {
    if (!chartData?.data.length) return;
    exportAsXLSX(chartData.data, title?.trim() || "chart", title?.trim() || "Data");
  }

  return (
    <div className="flex flex-col h-full min-w-0">
      {/* Panel header */}
      <div className="px-4 py-3 border-b flex items-center justify-between bg-white shrink-0">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Live Preview
          </p>
          {fetching && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex items-center gap-2">
          {hasData && (
            <>
              <Badge variant="outline" className="text-[10px] font-normal">
                {chartData.data.length} {chartData.data.length === 1 ? "group" : "groups"}
              </Badge>
              <Badge variant="outline" className="text-[10px] font-normal">
                {rowCount.toLocaleString()} rows
              </Badge>
              {config.filters.length > 0 && (
                <Badge variant="secondary" className="text-[10px] gap-1 font-normal">
                  <Filter className="h-2.5 w-2.5" />
                  {config.filters.length} filter{config.filters.length !== 1 ? "s" : ""}
                </Badge>
              )}
            </>
          )}
          {hasData && (
            <button
              onClick={handleExportXLSX}
              className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
              title="Download as Excel"
            >
              <Sheet className="h-3.5 w-3.5" />
            </button>
          )}
          {canExport && (
            <button
              onClick={handleExportPNG}
              className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
              title="Download as PNG"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Setup hint */}
      {hint && (
        <div className="px-4 py-2 bg-indigo-50 border-b border-indigo-100 flex items-center gap-2 shrink-0">
          <MousePointerClick className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
          <p className="text-xs text-indigo-600">{hint}</p>
        </div>
      )}

      {/* Chart area */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-5">
        {!hasData ? (
          <div className="flex-1 flex items-center justify-center flex-col gap-3 text-muted-foreground">
            <div className="h-16 w-16 rounded-2xl bg-muted/60 flex items-center justify-center">
              {fetching
                ? <Loader2 className="h-8 w-8 opacity-30 animate-spin" />
                : <BarChart2 className="h-8 w-8 opacity-20" />}
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-slate-600">
                {fetching ? "Loading…" : "No chart yet"}
              </p>
              {!fetching && (
                <p className="text-xs text-muted-foreground/70">
                  {config.chartType === "kpi"
                    ? "Add values on the right to see KPI cards"
                    : "Set X and Y axes on the right to see a chart"}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div
            ref={chartAreaRef}
            className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-100 bg-white"
            style={{ boxShadow: "0px 0px 5px 0px rgba(0,0,0,.02), 0px 2px 10px 0px rgba(0,0,0,.06), 0px 0px 1px 0px rgba(0,0,0,.3)" }}
          >
            {showTitle && (
              <div className="px-5 pt-4 pb-1 shrink-0">
                <p className="font-medium text-sm text-gray-900 truncate">{title}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {chartData.data.length} data point{chartData.data.length !== 1 ? "s" : ""}
                </p>
              </div>
            )}
            <div className="min-h-0 min-w-0 flex-1 overflow-hidden px-2 pt-2 pb-3">
              <AutoSizer>
                {(height) => (
                  <ChartRenderer
                    chartData={chartData}
                    chartType={config.chartType}
                    height={height}
                    logScale={config.logScale}
                  />
                )}
              </AutoSizer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
