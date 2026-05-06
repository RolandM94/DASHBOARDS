"use client";

import { useState, useMemo, useRef, useLayoutEffect, useEffect } from "react";
import { ReactGridLayout, WidthProvider } from "react-grid-layout/legacy";
import type { Layout as RGLLayout } from "react-grid-layout/legacy";
import {
  Canvas, WidgetBlockConfig, TextBlockConfig,
  FilterBlockConfig, DatasetPreviewBlockConfig, ActiveGlobalFilters, GlobalFilterValue,
  GridLayoutItem, BlockType, ResolvedChartData, SortOrder, ChartType, ActiveSmartFilters, WorkbookSheet,
} from "@/types";
import { useCanvasStore } from "@/store/canvasStore";
import { useWorksheetStore } from "@/store/worksheetStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { generateId } from "@/lib/utils/ids";
import { Plus, CheckCircle2, ArrowLeft, BarChart2, Type, Trash2, Globe, Filter, GripVertical, Loader2, Info, RefreshCw, Pencil, X, Sparkles, Table2, ArrowUpDown, TrendingUp, FileText } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChartRenderer } from "@/components/shared/charts/ChartRenderer";
import { cn } from "@/lib/utils";
import { getCanvasFields, getFieldWidgetCounts, splitFiltersForApi, encodeFiltersParam, decodeFiltersParam } from "@/lib/data/filters";
import { FilterBlockView } from "./FilterBlockView";
import { CanvasFilterBar } from "./CanvasFilterBar";
import { PublishModal } from "./PublishModal";
import { AIAssistantModal } from "./AIAssistantModal";
import { getWorkbookSheet, getWorkbookSheets, normalizeWorkbookConfig } from "@/lib/workbook";
import { toast } from "@/lib/toast";

const GridLayout = WidthProvider(ReactGridLayout);

const LOG_SCALE_CHART_TYPES: ChartType[] = ["bar", "grouped_bar", "line", "area"];

const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: "natural",    label: "Default order" },
  { value: "value_desc", label: "Value desc" },
  { value: "value_asc",  label: "Value asc" },
  { value: "top_5",      label: "Top 5" },
  { value: "top_10",     label: "Top 10" },
  { value: "top_20",     label: "Top 20" },
  { value: "alpha_asc",  label: "A-Z" },
  { value: "alpha_desc", label: "Z-A" },
];

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ── Helpers ───────────────────────────────────────────────────────

function makeDefaultLayout(blocks: Canvas["blocks"]): GridLayoutItem[] {
  let y = 0;
  return blocks.map((block) => {
    const item = makeDefaultItem(block.id, block.type, 0, y);
    y += item.h + 1;
    return item;
  });
}

function makeDefaultItem(id: string, type: BlockType, x: number, y: number): GridLayoutItem {
  if (type === "widget")  return { i: id, x, y, w: 6,  h: 14, minW: 3, minH: 8 };
  if (type === "text")    return { i: id, x, y, w: 12, h: 4,  minW: 3, minH: 2 };
  if (type === "preview") return { i: id, x, y, w: 12, h: 10, minW: 4, minH: 4 };
  return                         { i: id, x, y, w: 6,  h: 3,  minW: 2, minH: 2 };
}

function smartFiltersForApi(activeSmartFilters: ActiveSmartFilters) {
  return activeSmartFilters.map((id) => ({
    id: `smart-${id}`,
    field: "_smart",
    operator: "equals" as const,
    value: id,
    label: "Smart Filter",
  }));
}

// ── AutoSizer — measures available height and passes it to children ─

function AutoSizer({ children }: { children: (height: number) => React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(200);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setHeight(Math.floor(entry.contentRect.height));
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="min-w-0 overflow-hidden" style={{ height: "100%", width: "100%", minHeight: 0 }}>
      {children(height)}
    </div>
  );
}

// ── Widget block content ──────────────────────────────────────────

function WidgetBlockEdit({
  block, activeFilters, activeSmartFilters, onDataCountChange, refreshKey,
}: {
  block: WidgetBlockConfig;
  activeFilters: ActiveGlobalFilters;
  activeSmartFilters: ActiveSmartFilters;
  onDataCountChange?: (count: number) => void;
  refreshKey?: number;
}) {
  const worksheet = useWorksheetStore((s) => s.getWorksheetById(block.worksheetId));
  const dataset = useWorksheetStore((s) => worksheet ? s.getDatasetById(worksheet.datasetId) : undefined);
  const sheet = useMemo(
    () => worksheet ? getWorkbookSheet(worksheet, block.sheetId) : null,
    [worksheet, block.sheetId]
  );
  const [chartData, setChartData] = useState<ResolvedChartData | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const requestSeq = useRef(0);
  const sheetKey = useMemo(() => {
    if (!sheet) return "";
    return JSON.stringify({
      metrics: sheet.metrics,
      dimensions: sheet.dimensions,
      filters: sheet.filters ?? [],
      sort: sheet.sort ?? "natural",
      chartType: sheet.chartType,
      logScale: sheet.logScale ?? false,
    });
  }, [sheet]);
  const activeFiltersKey = useMemo(() => JSON.stringify(activeFilters), [activeFilters]);
  const activeSmartFiltersKey = useMemo(() => JSON.stringify(activeSmartFilters), [activeSmartFilters]);

  useEffect(() => {
    if (!worksheet || !dataset) return;
    if (!sheet || sheet.metrics.length === 0) { setChartData(null); setFetchError(null); return; }

    const seq = requestSeq.current + 1;
    requestSeq.current = seq;
    setFetching(true);
    setFetchError(null);
    setChartData(null);

    // Split range values out of globalFilters → merge into worksheetFilters as gte/lte
    const { cleanGlobalFilters, extraFilters } = splitFiltersForApi(activeFilters);

    fetch("/api/aggregate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        datasetId: dataset.id,
        metrics: sheet.metrics,
        dimensions: sheet.dimensions,
        worksheetFilters: [...(sheet.filters ?? []), ...extraFilters, ...smartFiltersForApi(activeSmartFilters)],
        globalFilters: cleanGlobalFilters,
        sort: sheet.sort ?? "natural",
      }),
    })
      .then(async (r) => {
        if (r.ok) return r.json();
        const body = await r.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Aggregate request failed (${r.status})`);
      })
      .then((d) => {
        if (requestSeq.current !== seq) return;
        setChartData(d);
      })
      .catch((err) => {
        if (requestSeq.current !== seq) return;
        setChartData(null);
        setFetchError(err instanceof Error ? err.message : "Failed to load chart data");
      })
      .finally(() => {
        if (requestSeq.current === seq) setFetching(false);
      });
  }, [worksheet, dataset, sheet, sheetKey, activeFilters, activeFiltersKey, activeSmartFilters, activeSmartFiltersKey, refreshKey]);

  // Report data count to parent card
  useEffect(() => {
    onDataCountChange?.(chartData ? chartData.data.length : 0);
  }, [chartData, onDataCountChange]);

  if (!worksheet) return (
    <div className="flex items-center justify-center h-full text-sm text-muted-foreground px-4">
      Workbook not found
    </div>
  );

  if (!sheet) return (
    <div className="flex items-center justify-center h-full text-sm text-muted-foreground px-4">
      Sheet not found
    </div>
  );

  if (fetching && !chartData) return (
    <div className="flex items-center justify-center h-full text-sm text-gray-400 gap-2 px-4">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading…
    </div>
  );

  if (!chartData) return (
    <div className="flex items-center justify-center h-full text-sm text-gray-400 px-4">
      {fetchError ?? (!sheet || sheet.metrics.length === 0 ? "Add metrics to this workbook sheet to see data" : "No data")}
    </div>
  );

  return (
    <div className="h-full min-w-0 flex flex-col px-2 pb-2 overflow-hidden">
      <AutoSizer>
        {(h) => (
          <ChartRenderer
            chartData={chartData}
            chartType={sheet.chartType}
            height={Math.max(h - 4, 80)}
            logScale={sheet.logScale}
          />
        )}
      </AutoSizer>
    </div>
  );
}

// ── Text block content ────────────────────────────────────────────

function TextBlockEdit({ block, canvasId }: { block: TextBlockConfig; canvasId: string }) {
  const updateBlock = useCanvasStore((s) => s.updateBlock);
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefreshInsight() {
    if (!block.worksheetId) return;
    setRefreshing(true);
    try {
      const res = await fetch("/api/ai/explain", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ worksheetId: block.worksheetId, sheetId: block.sheetId, canvasId }),
      });
      const data = await res.json();
      if (res.ok && data.explanation) {
        updateBlock(canvasId, block.id, { content: data.explanation } as Partial<TextBlockConfig>);
        toast.success("AI insight refreshed");
      } else {
        toast.error(data.error ?? "AI could not refresh this insight");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI could not refresh this insight");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="h-full flex flex-col">
      {block.worksheetId && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-brand/5 border-b border-brand/10 shrink-0">
          <Sparkles className="h-3 w-3 text-brand shrink-0" />
          <span className="text-[10px] text-brand/70 font-medium flex-1">AI Insight</span>
          <button
            onClick={handleRefreshInsight}
            disabled={refreshing}
            title="Refresh AI insight"
            className="h-5 w-5 flex items-center justify-center rounded hover:bg-brand/10 text-brand/50 hover:text-brand transition-all disabled:opacity-40"
          >
            {refreshing
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <RefreshCw className="h-3 w-3" />
            }
          </button>
        </div>
      )}
      <div className="flex-1 px-4 py-2">
        <textarea
          value={block.content}
          onChange={(e) => updateBlock(canvasId, block.id, { content: e.target.value } as Partial<TextBlockConfig>)}
          className="w-full h-full resize-none text-sm border-none outline-none bg-transparent leading-relaxed"
          placeholder="Type your text here…"
        />
      </div>
    </div>
  );
}

// ── Filter block content ──────────────────────────────────────────

function FilterBlockEdit({
  block, activeFilters, onFilterChange,
}: {
  block: FilterBlockConfig;
  activeFilters: ActiveGlobalFilters;
  onFilterChange: (field: string, value: GlobalFilterValue) => void;
}) {
  const { worksheets, getDatasetById } = useWorksheetStore();
  const [allValues, setAllValues] = useState<string[]>([]);

  useEffect(() => {
    // Collect dataset IDs from all worksheets on this canvas
    const datasetIds = [...new Set(worksheets.map((w) => w.datasetId))];
    if (datasetIds.length === 0 || !block.field) return;

    // Fetch distinct values for this field across all datasets
    const params = new URLSearchParams({ field: block.field });
    // Use the first dataset that has this field (simple heuristic)
    const dsId = datasetIds.find((id) => {
      const ds = getDatasetById(id);
      return ds?.fields.some((f) => f.name === block.field);
    });
    if (!dsId) return;

    fetch(`/api/datasets/${dsId}/values?${params}`)
      .then((r) => r.ok ? r.json() : [])
      .then((vals: string[]) => setAllValues(vals))
      .catch(() => {});
  }, [block.field, worksheets, getDatasetById]);

  return (
    <div className="h-full flex items-center px-3 gap-2">
      <Filter className="h-4 w-4 text-orange-500 shrink-0" />
      <FilterBlockView
        block={block}
        allValues={allValues}
        activeFilters={activeFilters}
        onFilterChange={onFilterChange}
      />
    </div>
  );
}

// ── Dataset preview block content ────────────────────────────────

function DatasetPreviewBlockEdit({ block }: { block: DatasetPreviewBlockConfig }) {
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    const limit = block.rowLimit ?? 10;
    setLoading(true);
    fetch(`/api/datasets/${block.datasetId}/rows?preview=true&limit=${limit}`, { signal: ctrl.signal })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setRows(d?.rows ?? null))
      .catch((e) => { if (e?.name !== "AbortError") setRows(null); })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [block.datasetId, block.rowLimit]);

  if (loading) return (
    <div className="flex items-center justify-center h-full text-sm text-gray-400 gap-2">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading…
    </div>
  );
  if (!rows || rows.length === 0) return (
    <div className="flex items-center justify-center h-full text-sm text-gray-400">No data</div>
  );

  const keys = Object.keys(rows[0]);
  return (
    <div className="h-full overflow-auto">
      <table className="text-xs w-full border-collapse">
        <thead className="sticky top-0 bg-gray-50">
          <tr>
            {keys.map((k) => (
              <th key={k} className="text-left px-3 py-1.5 font-semibold text-gray-600 border-b border-gray-200 whitespace-nowrap">{k}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
              {keys.map((k) => (
                <td key={k} className="px-3 py-1.5 text-gray-700 whitespace-nowrap max-w-[180px] truncate">{String(row[k] ?? "")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Shared card shadow ────────────────────────────────────────────

const CARD_SHADOW = "0px 0px 5px 0px rgba(0,0,0,.02), 0px 2px 10px 0px rgba(0,0,0,.06), 0px 0px 1px 0px rgba(0,0,0,.3)";

// ── Widget card (full-bleed header redesign) ──────────────────────

function WidgetCard({
  block, canvasId, title, activeFilters, activeSmartFilters, onFilterChange,
}: {
  block: WidgetBlockConfig;
  canvasId: string;
  title: string;
  activeFilters: ActiveGlobalFilters;
  activeSmartFilters: ActiveSmartFilters;
  onFilterChange: (field: string, value: GlobalFilterValue) => void;
}) {
  const removeBlock = useCanvasStore((s) => s.removeBlock);
  const addBlock    = useCanvasStore((s) => s.addBlock);
  const ws = useWorksheetStore((s) => s.getWorksheetById(block.worksheetId));
  const sheet = useMemo(
    () => ws ? getWorkbookSheet(ws, block.sheetId) : null,
    [ws, block.sheetId]
  );
  const updateWorksheet = useWorksheetStore((s) => s.updateWorksheet);
  const [dataCount,  setDataCount]  = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [explaining, setExplaining] = useState(false);
  const [updatingConfig, setUpdatingConfig] = useState(false);
  const [insightPromptOpen, setInsightPromptOpen] = useState(false);
  const [insightInstructions, setInsightInstructions] = useState("");

  const supportsLogScale = sheet ? LOG_SCALE_CHART_TYPES.includes(sheet.chartType) : false;

  async function patchSheetConfig(patch: Partial<WorkbookSheet>) {
    if (!ws || !sheet) return;
    const workbook = normalizeWorkbookConfig(ws.config, { name: ws.name, description: ws.description });
    const nextConfig = {
      ...workbook,
      sheets: workbook.sheets.map((candidate) =>
        candidate.id === sheet.id ? { ...candidate, ...patch } : candidate
      ),
    };
    updateWorksheet(ws.id, { config: nextConfig });
    setRefreshKey((k) => k + 1);
    setUpdatingConfig(true);
    try {
      await fetch(`/api/workbooks/${ws.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: nextConfig }),
      });
    } finally {
      setUpdatingConfig(false);
    }
  }

  async function handleExplain(instructions = "") {
    setExplaining(true);
    try {
      const res  = await fetch("/api/ai/explain", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          worksheetId: block.worksheetId,
          sheetId: block.sheetId,
          canvasId,
          instructions: instructions.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.explanation) {
        addBlock(canvasId, {
          id:          generateId(),
          type:        "text",
          order:       0,
          content:     data.explanation,
          worksheetId: block.worksheetId,
          sheetId:     block.sheetId,
        });
        setInsightPromptOpen(false);
        setInsightInstructions("");
        toast.success("AI insight added");
      } else {
        toast.error(data.error ?? "AI could not generate an insight");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI could not generate an insight");
    } finally {
      setExplaining(false);
    }
  }

  const filterChips = useMemo(() =>
    Object.entries(activeFilters)
      .filter(([, v]) => (Array.isArray(v) ? v.length > 0 : v !== ""))
      .map(([field, value]) => ({
        field,
        label: Array.isArray(value)
          ? (value.length === 1 ? `${field} | ${value[0]}` : `${field} | ${value.length} selected`)
          : `${field} | ${value}`,
      })),
    [activeFilters]
  );

  return (
    <>
      <div
        className="h-full flex flex-col bg-white rounded-xl border border-gray-100 overflow-hidden"
        style={{ boxShadow: CARD_SHADOW }}
      >
      {/* Header — also the drag handle */}
      <div className="rgl-drag-handle px-4 pt-3.5 pb-2.5 shrink-0 cursor-grab active:cursor-grabbing select-none">
        <div className="flex items-start gap-2">
          <h3 className="text-sm font-bold text-gray-900 leading-snug flex-1 min-w-0 break-words">{title}</h3>
          {/* Icon toolbar — stops drag propagation */}
          <div
            className="flex items-center gap-0.5 shrink-0 -mt-0.5"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {sheet && sheet.chartType !== "kpi" && (
              <>
                <div className="flex h-6 items-center gap-1 rounded-md border border-gray-100 bg-gray-50 px-1.5">
                  <ArrowUpDown className="h-3 w-3 text-gray-400" />
                  <Select
                    value={sheet.sort ?? "natural"}
                    disabled={updatingConfig}
                    onValueChange={(v) => v && patchSheetConfig({ sort: v as SortOrder })}
                  >
                    <SelectTrigger className="h-5 w-[92px] border-0 bg-transparent p-0 text-[10px] text-gray-500 shadow-none">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SORT_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value} className="text-xs">
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {supportsLogScale && (
                  <button
                    type="button"
                    disabled={updatingConfig}
                    onClick={() => patchSheetConfig({ logScale: !sheet.logScale })}
                    className={cn(
                      "inline-flex h-6 items-center gap-1 rounded-md border px-1.5 text-[10px] font-medium transition-colors disabled:opacity-50",
                      sheet.logScale
                        ? "border-brand/30 bg-brand-tint-100 text-brand-deep"
                        : "border-gray-100 bg-gray-50 text-gray-500 hover:text-gray-700"
                    )}
                    role="switch"
                    aria-checked={Boolean(sheet.logScale)}
                    title="Toggle logarithmic scale"
                  >
                    <TrendingUp className="h-3 w-3" />
                    <span
                      className={cn(
                        "relative inline-flex h-3.5 w-6 shrink-0 items-center rounded-full transition-colors",
                        sheet.logScale ? "bg-brand" : "bg-gray-200"
                      )}
                    >
                      <span
                        className={cn(
                          "h-2.5 w-2.5 rounded-full bg-white shadow-sm transition-transform",
                          sheet.logScale ? "translate-x-3" : "translate-x-0.5"
                        )}
                      />
                    </span>
                  </button>
                )}
              </>
            )}
            <button
              className="h-6 w-6 flex items-center justify-center rounded-md text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-all"
              title="Info"
            >
              <Info className="h-3.5 w-3.5" />
            </button>
            <button
              className="h-6 w-6 flex items-center justify-center rounded-md text-gray-300 hover:text-brand hover:bg-brand/10 transition-all disabled:opacity-40"
              title="Write AI insight"
              onClick={() => setInsightPromptOpen(true)}
              disabled={explaining}
            >
              {explaining
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Sparkles className="h-3.5 w-3.5" />
              }
            </button>
            <button
              className="h-6 w-6 flex items-center justify-center rounded-md text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-all"
              title="Refresh data"
              onClick={() => setRefreshKey((k) => k + 1)}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            {ws && (
              <a
                href={`/analytics/workbook/${ws.id}`}
                className="h-6 w-6 flex items-center justify-center rounded-md text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-all"
                title="Edit workbook"
              >
                <Pencil className="h-3.5 w-3.5" />
              </a>
            )}
            <button
              className="h-6 w-6 flex items-center justify-center rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"
              title="Remove widget"
              onClick={() => removeBlock(canvasId, block.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Active filter chips */}
        {filterChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mt-2" onPointerDown={(e) => e.stopPropagation()}>
            {filterChips.map(({ field, label }) => (
              <span
                key={field}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-tint-100 text-brand-deep text-[10px] font-medium border border-brand-tint-200"
              >
                {label}
                <button
                  onClick={() => onFilterChange(field, Array.isArray(activeFilters[field]) ? [] : "")}
                  className="hover:text-brand-darkest ml-0.5 flex items-center"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Data point count */}
        {dataCount !== null && dataCount > 0 && (
          <p className="text-[10px] text-gray-400 mt-1.5 font-medium">
            {dataCount.toLocaleString()} data point{dataCount !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      <div className="border-t border-gray-100 shrink-0" />

      {/* Chart */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <WidgetBlockEdit
          block={block}
          activeFilters={activeFilters}
          activeSmartFilters={activeSmartFilters}
          onDataCountChange={setDataCount}
          refreshKey={refreshKey}
        />
      </div>
      </div>

      <Dialog open={insightPromptOpen} onOpenChange={setInsightPromptOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Write AI Insight</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Writing instructions
              </Label>
              <textarea
                value={insightInstructions}
                onChange={(e) => setInsightInstructions(e.target.value)}
                placeholder="e.g. Write for executive directors, focus on risks and underperformance, keep it concise."
                className="min-h-28 w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none transition-colors focus:border-brand"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Leave blank for the default plain-English analysis.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInsightPromptOpen(false)} disabled={explaining}>
              Cancel
            </Button>
            <Button
              className="gap-1.5"
              onClick={() => handleExplain(insightInstructions)}
              disabled={explaining}
            >
              {explaining && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Generate Insight
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Unified card wrapper (text + filter + preview blocks) ────────

function BlockCard({
  block, canvasId, title, activeFilters, activeSmartFilters, onFilterChange,
}: {
  block: Canvas["blocks"][number];
  canvasId: string;
  title: string;
  activeFilters: ActiveGlobalFilters;
  activeSmartFilters: ActiveSmartFilters;
  onFilterChange: (field: string, value: GlobalFilterValue) => void;
}) {
  const removeBlock = useCanvasStore((s) => s.removeBlock);

  if (block.type === "widget") {
    return (
      <WidgetCard
        block={block as WidgetBlockConfig}
        canvasId={canvasId}
        title={title}
        activeFilters={activeFilters}
        activeSmartFilters={activeSmartFilters}
        onFilterChange={onFilterChange}
      />
    );
  }

  return (
    <div
      className="h-full flex flex-col bg-white rounded-xl border border-gray-100 overflow-hidden"
      style={{ boxShadow: CARD_SHADOW }}
    >
      {/* Drag handle — the ONLY zone that starts a drag */}
      <div className="rgl-drag-handle flex items-center gap-2 px-3 py-2 bg-gray-50/80 border-b border-gray-100 cursor-grab active:cursor-grabbing shrink-0 select-none">
        <GripVertical className="h-3.5 w-3.5 text-gray-300 shrink-0" />
        <p className="text-xs font-medium text-gray-500 flex-1 truncate">{title}</p>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => removeBlock(canvasId, block.id)}
          className="h-5 w-5 flex items-center justify-center rounded opacity-40 hover:opacity-100 hover:bg-red-50 hover:text-red-500 transition-all"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      {/* Content fills remaining height */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {block.type === "text" && (
          <TextBlockEdit block={block as TextBlockConfig} canvasId={canvasId} />
        )}
        {block.type === "filter" && (
          <FilterBlockEdit
            block={block as FilterBlockConfig}
            activeFilters={activeFilters}
            onFilterChange={onFilterChange}
          />
        )}
        {block.type === "preview" && (
          <DatasetPreviewBlockEdit block={block as DatasetPreviewBlockConfig} />
        )}
      </div>
    </div>
  );
}

// ── Main canvas builder ───────────────────────────────────────────

interface Props {
  existingCanvas?: Canvas;
}

export function CanvasBuilder({ existingCanvas }: Props) {
  const router = useRouter();
  const { addCanvas, addBlock, updateLayout, getCanvasById } = useCanvasStore();
  const { worksheets, datasets, getWorksheetById, getDatasetById } = useWorksheetStore();

  const [canvasId, setCanvasId] = useState<string | null>(existingCanvas?.id ?? null);
  const [nameOpen, setNameOpen] = useState(!existingCanvas);
  const [name, setName] = useState(existingCanvas?.name ?? "");
  const [addOpen, setAddOpen] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [filterConfigOpen, setFilterConfigOpen] = useState(false);
  const [filterField, setFilterField] = useState("");
  const [filterType, setFilterType] = useState<"dropdown" | "multi_select">("dropdown");
  const [previewConfigOpen, setPreviewConfigOpen] = useState(false);
  const [previewDatasetId, setPreviewDatasetId] = useState("");
  const [publishOpen, setPublishOpen] = useState(false);
  const [aiOpen, setAiOpen]           = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">(
    existingCanvas ? "saved" : "idle"
  );
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(
    existingCanvas?.updatedAt ? new Date(existingCanvas.updatedAt) : null
  );
  const [activeFilters, setActiveFilters] = useState<ActiveGlobalFilters>({});
  const [activeSmartFilters, setActiveSmartFilters] = useState<ActiveSmartFilters>([]);

  // WidthProvider does a server-side pass with width=0; skip render until mounted
  const [mounted, setMounted] = useState(false);

  // ── Restore filters from URL on first mount ───────────────────────
  useEffect(() => {
    setMounted(true);
    const params = new URLSearchParams(window.location.search);
    const restored = decodeFiltersParam(params.get("filters"));
    if (Object.keys(restored).length > 0) setActiveFilters(restored);
    const smart = params.get("smartFilters");
    if (smart) {
      try {
        const parsed = JSON.parse(smart);
        if (Array.isArray(parsed)) setActiveSmartFilters(parsed.filter((id) => typeof id === "string"));
      } catch {
        // Ignore malformed URL state.
      }
    }
  }, []);

  // ── Sync active filters → URL ─────────────────────────────────────
  useEffect(() => {
    if (!mounted) return;
    const params = new URLSearchParams(window.location.search);
    const encoded = encodeFiltersParam(activeFilters);
    if (encoded) {
      params.set("filters", encoded);
    } else {
      params.delete("filters");
    }
    if (activeSmartFilters.length > 0) {
      params.set("smartFilters", JSON.stringify(activeSmartFilters));
    } else {
      params.delete("smartFilters");
    }
    const search = params.toString();
    const newUrl = window.location.pathname + (search ? `?${search}` : "");
    window.history.replaceState(null, "", newUrl);
  }, [activeFilters, activeSmartFilters, mounted]);

  const canvas = canvasId ? getCanvasById(canvasId) : null;

  // ── Auto-save canvas blocks + layout ──────────────────────────────
  // Use stable JSON keys so the effect only fires when content changes,
  // not when the canvas object gets a new reference from the store.
  const blocksKey = canvas ? JSON.stringify(canvas.blocks) : null;
  const layoutKey = canvas ? JSON.stringify(canvas.layout) : null;
  const canvasRef = useRef(canvas);
  const isCanvasFirstRender = useRef(true);

  useEffect(() => {
    canvasRef.current = canvas;
  }, [canvas]);

  useEffect(() => {
    if (isCanvasFirstRender.current) {
      isCanvasFirstRender.current = false;
      return;
    }
    if (!canvasRef.current) return;

    const c = canvasRef.current;
    const timer = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        await fetch(`/api/canvases/${c.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ blocks: c.blocks, layout: c.layout }),
        });
        setLastSavedAt(new Date());
        setSaveStatus("saved");
      } catch {
        setSaveStatus("idle");
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [blocksKey, layoutKey]);

  // Resolve layout: use stored one if present, otherwise generate defaults.
  // Ensures every block has an entry even for canvases created before the grid refactor.
  const layout = useMemo<GridLayoutItem[]>(() => {
    if (!canvas) return [];
    const stored = canvas.layout ?? [];
    const missing = canvas.blocks.filter((b) => !stored.find((l) => l.i === b.id));
    if (missing.length === 0) return stored;
    const extras = makeDefaultLayout(missing);
    return [...stored, ...extras];
  }, [canvas]);

  const canvasFields = useMemo(() => {
    if (!canvas) return [];
    return getCanvasFields(canvas.blocks, getWorksheetById, getDatasetById);
  }, [canvas, getWorksheetById, getDatasetById]);

  const fieldWidgetCounts = useMemo(() => {
    if (!canvas) return {};
    return getFieldWidgetCounts(canvas.blocks, getWorksheetById, getDatasetById);
  }, [canvas, getWorksheetById, getDatasetById]);

  const datasetIds = useMemo(() => {
    if (!canvas) return [];
    const ids = new Set<string>();
    for (const block of canvas.blocks) {
      if (block.type === "widget") {
        const ws = getWorksheetById((block as WidgetBlockConfig).worksheetId);
        if (ws) ids.add(ws.datasetId);
      }
    }
    return Array.from(ids);
  }, [canvas, getWorksheetById]);

  const workbookGroups = useMemo(() => {
    const query = addSearch.trim().toLowerCase();
    return worksheets
      .map((ws) => {
        const dataset = getDatasetById(ws.datasetId);
        const sheets = getWorkbookSheets(ws).filter((sheet) => {
          if (!query) return true;
          return `${ws.name} ${sheet.name} ${sheet.chartType} ${dataset?.fileName ?? ""}`
            .toLowerCase()
            .includes(query);
        });
        return { workbook: ws, dataset, sheets };
      })
      .filter((group) => group.sheets.length > 0);
  }, [addSearch, worksheets, getDatasetById]);

  // ── Handlers ────────────────────────────────────────────────────

  async function initCanvas(n: string) {
    if (existingCanvas) {
      setCanvasId(existingCanvas.id);
      setNameOpen(false);
      return;
    }
    // Create canvas in the DB first — use the DB-generated UUID
    const res = await fetch("/api/canvases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: n.trim() }),
    });
    if (!res.ok) return; // stay on name dialog if creation fails
    const c: Canvas = await res.json();
    addCanvas(c);
    setCanvasId(c.id);
    setNameOpen(false);
  }

  function handleLayoutChange(newLayout: RGLLayout) {
    if (!canvas) return;
    // Persist positions/sizes; preserve our minW/minH metadata
    const merged: GridLayoutItem[] = Array.from(newLayout).map((item) => {
      const existing = layout.find((l) => l.i === item.i);
      // Spread existing to preserve any future metadata (minW, minH, etc.)
      return { ...existing, i: item.i, x: item.x, y: item.y, w: item.w, h: item.h };
    });
    updateLayout(canvas.id, merged);
  }

  function handleAddWidget(worksheetId: string, sheetId?: string) {
    if (!canvas) return;
    const block: WidgetBlockConfig = {
      id: generateId(), type: "widget", worksheetId, sheetId, order: canvas.blocks.length,
    };
    addBlock(canvas.id, block);
    setAddOpen(false);
  }

  function handleAddText() {
    if (!canvas) return;
    const block: TextBlockConfig = {
      id: generateId(), type: "text", content: "", order: canvas.blocks.length,
    };
    addBlock(canvas.id, block);
    setAddOpen(false);
  }

  function handleAddFilter() {
    if (!canvas || !filterField) return;
    const field = canvasFields.find((f) => f.name === filterField);
    const block: FilterBlockConfig = {
      id: generateId(), type: "filter", field: filterField,
      filterType, label: field?.name ?? filterField, order: canvas.blocks.length,
    };
    addBlock(canvas.id, block);
    setFilterField("");
    setFilterType("dropdown");
    setFilterConfigOpen(false);
    setAddOpen(false);
  }

  function handleAddPreview() {
    if (!canvas || !previewDatasetId) return;
    const block: DatasetPreviewBlockConfig = {
      id: generateId(), type: "preview", datasetId: previewDatasetId, order: canvas.blocks.length,
    };
    addBlock(canvas.id, block);
    setPreviewDatasetId("");
    setPreviewConfigOpen(false);
    setAddOpen(false);
  }

  function handleFilterChange(field: string, value: GlobalFilterValue) {
    setActiveFilters((prev) => ({ ...prev, [field]: value }));
  }

  // ── Block title helper ───────────────────────────────────────────

  function blockTitle(block: Canvas["blocks"][number]): string {
    if (block.type === "widget") {
      const widget = block as WidgetBlockConfig;
      const ws = getWorksheetById(widget.worksheetId);
      const sheet = ws ? getWorkbookSheet(ws, widget.sheetId) : null;
      return widget.title ?? sheet?.name ?? ws?.name ?? "Widget";
    }
    if (block.type === "text")    return (block as TextBlockConfig).worksheetId ? "AI Insight" : "Text block";
    if (block.type === "preview") {
      const ds = getDatasetById((block as DatasetPreviewBlockConfig).datasetId);
      return `Preview · ${ds?.fileName ?? "Dataset"}`;
    }
    return `Filter · ${(block as FilterBlockConfig).field}`;
  }

  // ── Render ───────────────────────────────────────────────────────

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-white shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/analytics">
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
              <ArrowLeft className="h-4 w-4" />
              Analytics
            </Button>
          </Link>
          {canvas && (
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">{canvas.name}</span>
              {canvas.published && (
                <Badge className="text-[10px] bg-green-100 text-green-700 border-green-200">Published</Badge>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canvas && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 border-brand/30 text-brand hover:bg-brand-tint-100 hover:border-brand"
                onClick={() => setAiOpen(true)}
              >
                <Sparkles className="h-4 w-4" /> AI
              </Button>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setAddOpen(true)} data-tour-id="add-block-btn">
                <Plus className="h-4 w-4" /> Add Block
              </Button>
              <Link href={`/analytics/reports?sourceType=canvas&sourceId=${canvas.id}`}>
                <Button variant="outline" size="sm" className="gap-2">
                  <FileText className="h-4 w-4" /> Report
                </Button>
              </Link>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setPublishOpen(true)} data-tour-id="publish-btn">
                <Globe className="h-4 w-4" />
                {canvas.published ? "Republish" : "Publish"}
              </Button>
            </>
          )}
          {saveStatus === "saving" && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Saving…
            </span>
          )}
          {saveStatus === "saved" && lastSavedAt && (
            <span className="flex items-center gap-1.5 text-xs text-green-600">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Saved {formatTime(lastSavedAt)}
            </span>
          )}
        </div>
      </div>

      {/* Global filter bar */}
      {canvas && canvasFields.length > 0 && (
        <CanvasFilterBar
          canvasFields={canvasFields}
          datasetIds={datasetIds}
          activeFilters={activeFilters}
          activeSmartFilters={activeSmartFilters}
          onFilterChange={handleFilterChange}
          onClearAll={() => {
            setActiveFilters({});
            setActiveSmartFilters([]);
          }}
          fieldWidgetCounts={fieldWidgetCounts}
          onSmartFiltersChange={setActiveSmartFilters}
        />
      )}

      {/* Canvas area */}
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-6 bg-muted/20">
        {!canvas ? (
          <div className="text-center text-muted-foreground text-sm">Initializing…</div>
        ) : canvas.blocks.length === 0 ? (
          <div className="max-w-2xl mx-auto border-2 border-dashed rounded-2xl p-16 text-center">
            <p className="text-muted-foreground text-sm mb-4">Your canvas is empty. Add your first block.</p>
            <Button onClick={() => setAddOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Add Block
            </Button>
          </div>
        ) : mounted ? (
          <GridLayout
            layout={layout}
            cols={12}
            rowHeight={30}
            draggableHandle=".rgl-drag-handle"
            onLayoutChange={handleLayoutChange}
            margin={[16, 16]}
            containerPadding={[0, 0]}
            isResizable
            isDraggable
            resizeHandles={["se", "sw"]}
          >
            {canvas.blocks.map((block) => (
              <div key={block.id}>
                <BlockCard
                  block={block}
                  canvasId={canvas.id}
                  title={blockTitle(block)}
                  activeFilters={activeFilters}
                  activeSmartFilters={activeSmartFilters}
                  onFilterChange={handleFilterChange}
                />
              </div>
            ))}
          </GridLayout>
        ) : null}
      </div>

      {/* Name dialog */}
      <Dialog open={nameOpen} onOpenChange={() => {}}>
        <DialogContent data-tour-id="canvas-name-dialog">
          <DialogHeader><DialogTitle>Name your canvas</DialogTitle></DialogHeader>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Health Programme Dashboard"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && name.trim() && initCanvas(name)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => router.push("/analytics")}>Cancel</Button>
            <Button onClick={() => initCanvas(name)} disabled={!name.trim()}>Create Canvas</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add block dialog */}
      <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) { setFilterConfigOpen(false); setPreviewConfigOpen(false); setAddSearch(""); } }}>
        <DialogContent className="w-[min(720px,calc(100vw-2rem))] sm:max-w-[720px]">
          <DialogHeader><DialogTitle>Add Block</DialogTitle></DialogHeader>
          {previewConfigOpen ? (
            <div className="space-y-4 py-2">
              <button
                onClick={() => setPreviewConfigOpen(false)}
                className="text-xs text-brand hover:underline flex items-center gap-1"
              >
                ← Back
              </button>
              <div className="space-y-1.5">
                <Label>Dataset</Label>
                {datasets.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No datasets available.</p>
                ) : (
                  <Select value={previewDatasetId || undefined} onValueChange={(v) => v && setPreviewDatasetId(v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choose a dataset" />
                    </SelectTrigger>
                    <SelectContent>
                      {datasets.map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.fileName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <DialogFooter>
                <Button onClick={handleAddPreview} disabled={!previewDatasetId}>Add Preview Block</Button>
              </DialogFooter>
            </div>
          ) : filterConfigOpen ? (
            <div className="space-y-4 py-2">
              <button
                onClick={() => setFilterConfigOpen(false)}
                className="text-xs text-brand hover:underline flex items-center gap-1"
              >
                ← Back
              </button>
              <div className="space-y-1.5">
                <Label>Filter field</Label>
                {canvasFields.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Add widget blocks first so there are fields to filter on.</p>
                ) : (
                  <Select value={filterField || undefined} onValueChange={(v) => v && setFilterField(v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choose a field" />
                    </SelectTrigger>
                    <SelectContent>
                      {canvasFields.map((f) => (
                        <SelectItem key={f.name} value={f.name}>{f.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Filter type</Label>
                <div className="flex gap-2">
                  {(["dropdown", "multi_select"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setFilterType(t)}
                      className={`flex-1 px-3 py-2 rounded-lg border text-sm transition-colors ${filterType === t ? "border-brand bg-brand-tint-100 text-brand-deep" : "border-muted hover:border-muted-foreground/40"}`}
                    >
                      {t === "dropdown" ? "Dropdown" : "Multi-select"}
                    </button>
                  ))}
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleAddFilter} disabled={!filterField}>Add Filter Block</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">Add workbook sheet</p>
                <p className="text-xs text-muted-foreground">Choose a specific sheet. Canvas widgets stay bound to that sheet.</p>
              </div>
              {worksheets.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No workbooks yet.{" "}
                  <Link href="/analytics/workbook/new" className="text-brand underline">Create one first.</Link>
                </p>
              ) : (
                <div className="space-y-3">
                  <Input
                    value={addSearch}
                    onChange={(e) => setAddSearch(e.target.value)}
                    placeholder="Search workbooks or sheets"
                    className="h-9"
                  />
                  <div className="max-h-[360px] overflow-y-auto pr-1 space-y-3">
                    {workbookGroups.length === 0 ? (
                      <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                        No matching workbook sheets.
                      </p>
                    ) : workbookGroups.map(({ workbook, dataset, sheets }) => (
                      <div key={workbook.id} className="rounded-lg border bg-white overflow-hidden">
                        <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-3 py-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">{workbook.name}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {dataset?.fileName ?? "Dataset"} · {sheets.length} sheet{sheets.length !== 1 ? "s" : ""}
                            </p>
                          </div>
                          <Link
                            href={`/analytics/workbook/${workbook.id}`}
                            className="shrink-0 text-xs font-medium text-brand hover:underline"
                            onClick={() => setAddOpen(false)}
                          >
                            Edit
                          </Link>
                        </div>
                        <div className="divide-y">
                          {sheets.map((sheet) => (
                            <button
                              key={`${workbook.id}-${sheet.id}`}
                              onClick={() => handleAddWidget(workbook.id, sheet.id)}
                              className="w-full flex items-center gap-3 px-3 py-3 hover:bg-brand-tint-100 transition-colors text-left"
                            >
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand/10">
                                <BarChart2 className="h-4 w-4 text-brand" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-900 truncate">{sheet.name}</p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {sheet.metrics.length} metric{sheet.metrics.length !== 1 ? "s" : ""} · {sheet.dimensions.length} dimension{sheet.dimensions.length !== 1 ? "s" : ""}
                                </p>
                              </div>
                              <Badge variant="secondary" className="text-xs shrink-0 capitalize">{sheet.chartType.replace("_", " ")}</Badge>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="border-t pt-3 space-y-2">
                <button
                  onClick={handleAddText}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border hover:border-gray-400 hover:bg-gray-50 transition-colors text-left"
                >
                  <Type className="h-4 w-4 text-gray-600 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Text Block</p>
                    <p className="text-xs text-muted-foreground">Title, description, or narrative</p>
                  </div>
                </button>
                <button
                  onClick={() => setFilterConfigOpen(true)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border hover:border-orange-400 hover:bg-orange-50 transition-colors text-left"
                >
                  <Filter className="h-4 w-4 text-orange-600 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Filter Block</p>
                    <p className="text-xs text-muted-foreground">Global filter across widgets</p>
                  </div>
                </button>
                <button
                  onClick={() => setPreviewConfigOpen(true)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border hover:border-teal-400 hover:bg-teal-50 transition-colors text-left"
                >
                  <Table2 className="h-4 w-4 text-teal-600 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Dataset Preview</p>
                    <p className="text-xs text-muted-foreground">Show raw rows from a dataset</p>
                  </div>
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Publish modal */}
      {canvas && (
        <PublishModal canvasId={canvas.id} open={publishOpen} onOpenChange={setPublishOpen} />
      )}

      {/* AI Assistant modal */}
      {aiOpen && canvas && (
        <AIAssistantModal canvasId={canvas.id} onClose={() => setAiOpen(false)} />
      )}
    </div>
  );
}
