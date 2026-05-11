"use client";

import { useState, useRef, useLayoutEffect, useEffect, useMemo } from "react";
import {
  ActiveGlobalFilters, CanvasBlock, FilterBlockConfig,
  GlobalFilterValue, GridLayoutItem, PublishedDashboard,
  TextBlockConfig, WidgetBlockConfig, DatasetPreviewBlockConfig, BlockType, ResolvedChartData, ActiveSmartFilters,
} from "@/types";
import { useWorksheetStore } from "@/store/worksheetStore";
import { FilterBlockView } from "@/components/analytics/canvas/FilterBlockView";
import { CanvasFilterBar } from "@/components/analytics/canvas/CanvasFilterBar";
import { getCanvasFields, getFieldWidgetCounts, splitFiltersForApi, encodeFiltersParam, decodeFiltersParam, hasActiveFilterValue } from "@/lib/data/filters";
import { getWorkbookSheet } from "@/lib/workbook";
import { ChartRenderer } from "@/components/shared/charts/ChartRenderer";
import { Button } from "@/components/ui/button";
import { Globe, Lock, Building2, Link2, Check, BarChart2, Loader2, Info, RefreshCw, X, FileDown, Sheet, Sparkles, FileText, ArrowLeft, Bookmark } from "lucide-react";
import { exportAsXLSX } from "@/lib/utils/export";
import { ReactGridLayout, WidthProvider } from "react-grid-layout/legacy";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useSavedDashboard } from "@/hooks/useSavedDashboard";
import { NLQueryBar } from "@/components/analytics/dashboard/NLQueryBar";

const GridLayout = WidthProvider(ReactGridLayout);
const ROW_HEIGHT = 30;

// ── Mobile breakpoint hook ────────────────────────────────────────

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    function check() { setIsMobile(window.innerWidth < 768); }
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
}

// ── Helpers ───────────────────────────────────────────────────────

function makeDefaultLayout(blocks: CanvasBlock[]): GridLayoutItem[] {
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

function sanitizeDownloadName(value: string): string {
  return value.replace(/[<>:"/\\|?*]/g, "-").trim() || "dashboard";
}

// ── AutoSizer ─────────────────────────────────────────────────────

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

// ── Permission metadata ───────────────────────────────────────────

const permissionIcon  = { private: Lock, org: Building2, public: Globe };
const permissionLabel = { private: "Private", org: "Organisation", public: "Public" };

// ── Read-only widget ──────────────────────────────────────────────

function ReadOnlyWidget({
  block, activeFilters, activeSmartFilters, dashboardId, onDataCountChange, onChartDataChange, refreshKey, initialData,
}: {
  block: WidgetBlockConfig;
  activeFilters: ActiveGlobalFilters;
  activeSmartFilters: ActiveSmartFilters;
  dashboardId: string;
  onDataCountChange?: (count: number) => void;
  onChartDataChange?: (data: ResolvedChartData | null) => void;
  refreshKey?: number;
  initialData?: ResolvedChartData | null;
}) {
  const worksheet = useWorksheetStore((s) => s.getWorksheetById(block.worksheetId));
  const dataset   = useWorksheetStore((s) => worksheet ? s.getDatasetById(worksheet.datasetId) : undefined);
  const sheet = useMemo(
    () => worksheet ? getWorkbookSheet(worksheet, block.sheetId) : null,
    [worksheet, block.sheetId]
  );
  const [chartData, setChartData] = useState<ResolvedChartData | null>(null);
  const [fetching, setFetching]   = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const requestSeq = useRef(0);
  const consumedInitial = useRef(false);
  const chartDataRef = useRef<ResolvedChartData | null>(null);
  const fetchingRef = useRef(false);
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
    chartDataRef.current = chartData;
  }, [chartData]);

  useEffect(() => {
    fetchingRef.current = fetching;
  }, [fetching]);

  // Use pre-loaded data from the live endpoint when available and no filters active
  useEffect(() => {
    if (initialData !== undefined && !consumedInitial.current) {
      consumedInitial.current = true;
      setChartData(initialData);
      setFetching(false);
      setFetchError(null);
    }
  }, [initialData]);

  useEffect(() => {
    if (!worksheet || !dataset || !sheet) return;
    if (sheet.metrics.length === 0) { setChartData(null); setFetchError(null); return; }

    // Skip fetch if we already have initial data and no active filters are changing
    if (consumedInitial.current && !hasActiveFilterValue(Object.values(activeFilters)[0]) && activeSmartFilters.length === 0) {
      // Only skip if we've already rendered with initial data and filters haven't changed
      if (chartDataRef.current && !fetchingRef.current) return;
    }

    const seq = requestSeq.current + 1;
    requestSeq.current = seq;
    setFetching(true);
    setFetchError(null);
    setChartData(null);

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
        dashboardId,
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
  }, [worksheet, dataset, sheet, sheetKey, activeFilters, activeFiltersKey, activeSmartFilters, activeSmartFiltersKey, dashboardId, refreshKey]);

  useEffect(() => {
    onDataCountChange?.(chartData ? chartData.data.length : 0);
  }, [chartData, onDataCountChange]);

  useEffect(() => {
    onChartDataChange?.(chartData);
  }, [chartData, onChartDataChange]);

  if (!worksheet) return (
    <div className="flex items-center justify-center h-full text-sm text-muted-foreground px-4">
      Data source not available
    </div>
  );

  if (worksheet.status === "archived") return (
    <div className="flex flex-col items-center justify-center h-full text-sm text-muted-foreground px-4 gap-1">
      <span className="text-muted-foreground/50 text-xs font-medium uppercase tracking-wider">Widget Unavailable</span>
      <span className="text-xs">The source worksheet for this widget has been deleted.</span>
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
      {fetchError ?? (sheet.metrics.length === 0 ? "No metrics configured" : "No data")}
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

// ── Read-only text block ──────────────────────────────────────────

function ReadOnlyText({ block }: { block: TextBlockConfig }) {
  if (!block.content.trim()) return (
    <div className="flex items-center justify-center h-full text-muted-foreground/40 text-sm italic">
      Empty text block
    </div>
  );
  return (
    <div className="h-full px-4 py-3 overflow-auto">
      <p className="text-sm leading-relaxed whitespace-pre-wrap">{block.content}</p>
    </div>
  );
}

// ── Read-only filter block ────────────────────────────────────────

function ReadOnlyFilter({
  block, activeFilters, onFilterChange, datasetIds, dashboardId,
}: {
  block: FilterBlockConfig;
  activeFilters: ActiveGlobalFilters;
  onFilterChange: (field: string, value: GlobalFilterValue) => void;
  datasetIds: string[];
  dashboardId: string;
}) {
  const [allValues, setAllValues] = useState<string[]>([]);

  useEffect(() => {
    if (!datasetIds.length || !block.field) return;
    const seen = new Set<string>();
    Promise.all(
      datasetIds.map((id) =>
        fetch(`/api/datasets/${id}/values?field=${encodeURIComponent(block.field)}&dashboardId=${encodeURIComponent(dashboardId)}`)
          .then((r) => (r.ok ? r.json() : []))
          .then((vals: string[]) => vals.forEach((v) => seen.add(v)))
          .catch(() => {})
      )
    ).then(() => setAllValues(Array.from(seen).sort()));
  }, [datasetIds, block.field, dashboardId]);

  return (
    <div className="h-full flex items-center px-3 gap-2">
      <FilterBlockView
        block={block}
        allValues={allValues}
        activeFilters={activeFilters}
        onFilterChange={onFilterChange}
      />
    </div>
  );
}

// ── Read-only preview block ───────────────────────────────────────

function ReadOnlyPreview({ block, dashboardId }: { block: DatasetPreviewBlockConfig; dashboardId: string }) {
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    const limit = block.rowLimit ?? 10;
    setLoading(true);
    fetch(`/api/datasets/${block.datasetId}/rows?preview=true&limit=${limit}&dashboardId=${encodeURIComponent(dashboardId)}`, { signal: ctrl.signal })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setRows(d?.rows ?? null))
      .catch((e) => { if (e?.name !== "AbortError") setRows(null); })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [block.datasetId, block.rowLimit, dashboardId]);

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

// ── Read-only widget card ─────────────────────────────────────────

function ReadOnlyWidgetCard({
  block, title, activeFilters, activeSmartFilters, onFilterChange, dashboardId, initialData,
}: {
  block: WidgetBlockConfig;
  title: string;
  activeFilters: ActiveGlobalFilters;
  activeSmartFilters: ActiveSmartFilters;
  onFilterChange: (field: string, value: GlobalFilterValue) => void;
  dashboardId: string;
  initialData?: ResolvedChartData | null;
}) {
  const [dataCount, setDataCount]       = useState<number | null>(null);
  const [refreshKey, setRefreshKey]     = useState(0);
  const [widgetData, setWidgetData]     = useState<ResolvedChartData | null>(null);
  const [explanation, setExplanation]   = useState<string | null>(null);
  const [explaining, setExplaining]     = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);

  function handleExportXLSX() {
    if (!widgetData?.data.length) return;
    exportAsXLSX(widgetData.data, title || "widget", title || "Data");
  }

  async function handleExplain() {
    setShowExplanation((v) => !v);
    if (explanation !== null) return; // already fetched
    setExplaining(true);
    try {
      const res = await fetch("/api/ai/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worksheetId: block.worksheetId, sheetId: block.sheetId, canvasId: dashboardId }),
      });
      const data = await res.json();
      setExplanation(res.ok ? (data.explanation ?? "") : (data.error ?? "Could not generate explanation"));
    } catch {
      setExplanation("Could not generate explanation");
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
    <div
      className="h-full flex flex-col bg-white rounded-xl border border-gray-100 overflow-hidden"
      style={{ boxShadow: CARD_SHADOW }}
    >
      {/* Card header */}
      <div className="px-4 pt-3.5 pb-2.5 shrink-0">
        <div className="flex items-start gap-2">
          <h3 className="text-sm font-bold text-gray-900 leading-snug flex-1 min-w-0 break-words">{title}</h3>
          <div className="flex items-center gap-0.5 shrink-0 -mt-0.5">
            {widgetData?.data.length ? (
              <button
                className="h-6 w-6 flex items-center justify-center rounded-md text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-all"
                title="Download as Excel"
                onClick={handleExportXLSX}
              >
                <Sheet className="h-3.5 w-3.5" />
              </button>
            ) : null}
            <button
              className="h-6 w-6 flex items-center justify-center rounded-md text-gray-300 hover:text-brand hover:bg-brand/10 transition-all"
              title="AI Explanation"
              onClick={handleExplain}
            >
              {explaining
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Sparkles className="h-3.5 w-3.5" />
              }
            </button>
            <button
              className="h-6 w-6 flex items-center justify-center rounded-md text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-all"
              title="Info"
            >
              <Info className="h-3.5 w-3.5" />
            </button>
            <button
              className="h-6 w-6 flex items-center justify-center rounded-md text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-all"
              title="Refresh data"
              onClick={() => setRefreshKey((k) => k + 1)}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {filterChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
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

        {dataCount !== null && dataCount > 0 && (
          <p className="text-[10px] text-gray-400 mt-1.5 font-medium">
            {dataCount.toLocaleString()} data point{dataCount !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      <div className="border-t border-gray-100 shrink-0" />

      {/* AI Explanation panel */}
      {showExplanation && (
        <div className="px-4 py-2.5 bg-brand/5 border-b border-brand/10 shrink-0">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Sparkles className="h-3 w-3 text-brand shrink-0" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-brand/70">AI Explanation</span>
          </div>
          {explaining || explanation === null ? (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Analysing chart…
            </div>
          ) : (
            <p className="text-xs text-slate-700 leading-relaxed max-h-20 overflow-y-auto">{explanation}</p>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-hidden">
        <ReadOnlyWidget
          block={block}
          activeFilters={activeFilters}
          activeSmartFilters={activeSmartFilters}
          dashboardId={dashboardId}
          onDataCountChange={setDataCount}
          onChartDataChange={setWidgetData}
          refreshKey={refreshKey}
          initialData={initialData}
        />
      </div>
    </div>
  );
}

// ── Shared block card ─────────────────────────────────────────────

function BlockCard({
  block, title, activeFilters, activeSmartFilters, onFilterChange, dashboardId, datasetIds, initialData,
}: {
  block: CanvasBlock;
  title: string;
  activeFilters: ActiveGlobalFilters;
  activeSmartFilters: ActiveSmartFilters;
  onFilterChange: (field: string, value: GlobalFilterValue) => void;
  dashboardId: string;
  datasetIds: string[];
  initialData?: ResolvedChartData | null;
}) {
  if (block.type === "widget") {
    return (
      <ReadOnlyWidgetCard
        block={block as WidgetBlockConfig}
        title={title}
        activeFilters={activeFilters}
        activeSmartFilters={activeSmartFilters}
        onFilterChange={onFilterChange}
        dashboardId={dashboardId}
        initialData={initialData}
      />
    );
  }

  return (
    <div
      className="h-full flex flex-col bg-white rounded-xl border border-gray-100 overflow-hidden"
      style={{ boxShadow: CARD_SHADOW }}
    >
      <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50/80 border-b border-gray-100 shrink-0">
        <p className="text-xs font-medium text-gray-600 truncate">{title}</p>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {block.type === "text" && (
          <ReadOnlyText block={block as TextBlockConfig} />
        )}
        {block.type === "filter" && (
          <ReadOnlyFilter
            block={block as FilterBlockConfig}
            activeFilters={activeFilters}
            onFilterChange={onFilterChange}
            datasetIds={datasetIds}
            dashboardId={dashboardId}
          />
        )}
        {block.type === "preview" && (
          <ReadOnlyPreview block={block as DatasetPreviewBlockConfig} dashboardId={dashboardId} />
        )}
      </div>
    </div>
  );
}

// ── Mobile heights per block type ─────────────────────────────────

const MOBILE_HEIGHTS: Record<BlockType, number> = {
  widget:  340,
  text:    140,
  filter:  72,
  preview: 260,
};

// ── Mobile stacked layout ─────────────────────────────────────────

function MobileStack({
  blocks, blockTitle, activeFilters, activeSmartFilters, onFilterChange, dashboardId, datasetIds, initialWidgetData,
}: {
  blocks: CanvasBlock[];
  blockTitle: (b: CanvasBlock) => string;
  activeFilters: ActiveGlobalFilters;
  activeSmartFilters: ActiveSmartFilters;
  onFilterChange: (field: string, value: GlobalFilterValue) => void;
  dashboardId: string;
  datasetIds: string[];
  initialWidgetData?: Record<string, ResolvedChartData | null>;
}) {
  return (
    <div className="space-y-3">
      {blocks.map((block) => (
        <div key={block.id} style={{ height: MOBILE_HEIGHTS[block.type] }}>
          <BlockCard
            block={block}
            title={blockTitle(block)}
            activeFilters={activeFilters}
            activeSmartFilters={activeSmartFilters}
            onFilterChange={onFilterChange}
            dashboardId={dashboardId}
            datasetIds={datasetIds}
            initialData={initialWidgetData?.[block.id]}
          />
        </div>
      ))}
    </div>
  );
}

// ── Main DashboardView ────────────────────────────────────────────

interface Props {
  dashboard: PublishedDashboard;
  initialWidgetData?: Record<string, ResolvedChartData | null>;
}

export function DashboardView({ dashboard, initialWidgetData }: Props) {
  const isMobile = useIsMobile();
  const [activeFilters, setActiveFilters] = useState<ActiveGlobalFilters>({});
  const [activeSmartFilters, setActiveSmartFilters] = useState<ActiveSmartFilters>([]);
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const router = useRouter();
  const { saved, loading: saveLoading, toggle } = useSavedDashboard(dashboard.id);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthenticated(!!session?.user);
    });
  }, []);

  function handleSave() {
    if (!authenticated) {
      router.push(`/login?redirect=/dashboard/${dashboard.id}`);
    } else {
      toggle();
    }
  }

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

  const { getWorksheetById, getDatasetById } = useWorksheetStore();

  const layout = useMemo<GridLayoutItem[]>(() => {
    const stored = dashboard.layout ?? [];
    const missing = dashboard.blocks.filter((b) => !stored.find((l) => l.i === b.id));
    if (missing.length === 0) return stored;
    return [...stored, ...makeDefaultLayout(missing)];
  }, [dashboard]);

  const datasetIds = useMemo(() => {
    const ids = new Set<string>();
    for (const block of dashboard.blocks) {
      if (block.type === "widget") {
        const ws = getWorksheetById((block as WidgetBlockConfig).worksheetId);
        if (ws) ids.add(ws.datasetId);
      }
    }
    return Array.from(ids);
  }, [dashboard.blocks, getWorksheetById]);

  const canvasFields = useMemo(
    () => getCanvasFields(dashboard.blocks, getWorksheetById, getDatasetById),
    [dashboard.blocks, getWorksheetById, getDatasetById]
  );

  const fieldWidgetCounts = useMemo(
    () => getFieldWidgetCounts(dashboard.blocks, getWorksheetById, getDatasetById),
    [dashboard.blocks, getWorksheetById, getDatasetById]
  );

  function handleFilterChange(field: string, value: GlobalFilterValue) {
    setActiveFilters((prev) => ({ ...prev, [field]: value }));
  }

  function blockTitle(block: CanvasBlock): string {
    if (block.type === "widget") {
      const ws = getWorksheetById((block as WidgetBlockConfig).worksheetId);
      const sheet = ws ? getWorkbookSheet(ws, (block as WidgetBlockConfig).sheetId) : null;
      return (block as WidgetBlockConfig).title ?? sheet?.name ?? ws?.name ?? "Widget";
    }
    if (block.type === "text") return (block as TextBlockConfig).worksheetId ? "AI Insight" : "Text";
    if (block.type === "preview") return "Dataset Preview";
    return `Filter · ${(block as FilterBlockConfig).field}`;
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function exportPDF() {
    if (exportingPdf) return;
    setExportingPdf(true);
    try {
      const params = new URLSearchParams();
      const encoded = encodeFiltersParam(activeFilters);
      if (encoded) params.set("filters", encoded);
      if (activeSmartFilters.length > 0) {
        params.set("smartFilters", JSON.stringify(activeSmartFilters));
      }
      const qs = params.toString();
      const url = `/api/dashboards/${dashboard.id}/pdf${qs ? `?${qs}` : ""}`;
      const response = await fetch(url);

      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `PDF export failed (${response.status})`);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `${sanitizeDownloadName(dashboard.title)}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "PDF export failed");
    } finally {
      setExportingPdf(false);
    }
  }

  const PermIcon = permissionIcon[dashboard.permission];
  const hasActiveFilters = Object.values(activeFilters).some(hasActiveFilterValue) || activeSmartFilters.length > 0;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">

      {/* ── Combined sticky header + filter bar ── */}
      <div className="sticky top-0 z-10 bg-white border-b shadow-sm print:static print:shadow-none print:border-b-0">

        {/* Header row */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3 min-w-0">

          {/* Left: breadcrumb + logo + title */}
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <Link
              href="/home"
              className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors hidden sm:flex items-center gap-1 shrink-0"
            >
              <ArrowLeft className="h-3 w-3" />
              Home
            </Link>
            <span className="text-muted-foreground/20 text-xs hidden sm:inline">·</span>
            <div className="h-8 w-8 bg-brand rounded-lg flex items-center justify-center shrink-0">
              <BarChart2 className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-sm sm:text-base leading-tight truncate max-w-[180px] sm:max-w-none">
                {dashboard.title}
              </h1>
              <div className="flex items-center gap-1 sm:gap-1.5 mt-0.5 flex-wrap">
                <PermIcon className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  {permissionLabel[dashboard.permission]}
                </span>
                <span className="text-muted-foreground/40 text-xs hidden sm:inline">·</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(dashboard.publishedAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-1.5 shrink-0 print:hidden">
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground hidden sm:flex"
                onClick={() => {
                  setActiveFilters({});
                  setActiveSmartFilters([]);
                }}
              >
                Clear filters
              </Button>
            )}
            {!authenticated && (
              <>
                <Link href={`/login?redirect=/dashboard/${dashboard.id}`}>
                  <Button variant="ghost" size="sm" className="gap-1.5 text-xs h-8 px-2.5 sm:px-3">
                    Sign in
                  </Button>
                </Link>
                <Link href={`/signup?redirect=/dashboard/${dashboard.id}`}>
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8 px-2.5 sm:px-3">
                    Sign up
                  </Button>
                </Link>
              </>
            )}
            {authenticated && (
              <NLQueryBar
                datasetIds={datasetIds}
                onResult={() => {
                  // Future: display inline chart result
                }}
              />
            )}
            <Button variant="outline" size="sm" onClick={handleSave} disabled={saveLoading} className="gap-1.5 text-xs h-8 px-2.5 sm:px-3">
              <Bookmark className={`h-3.5 w-3.5 ${saved ? "fill-current" : ""}`} />
              <span className="hidden sm:inline">{saved ? "Saved" : "Save"}</span>
            </Button>
            <Button variant="outline" size="sm" onClick={exportPDF} disabled={exportingPdf} className="gap-1.5 text-xs h-8 px-2.5 sm:px-3">
              {exportingPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{exportingPdf ? "Exporting…" : "Export PDF"}</span>
            </Button>
            <Link href={`/home/reports?sourceType=dashboard&sourceId=${dashboard.id}`}>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8 px-2.5 sm:px-3">
                <FileText className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Report</span>
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={copyLink} className="gap-1.5 text-xs h-8 px-2.5 sm:px-3">
              {copied
                ? <Check className="h-3.5 w-3.5 text-green-600" />
                : <Link2 className="h-3.5 w-3.5" />
              }
              <span className="hidden sm:inline">{copied ? "Copied!" : "Copy link"}</span>
            </Button>
          </div>
        </div>

        {/* Filter bar — hidden during print */}
        {canvasFields.length > 0 && (
          <div className="print:hidden">
            <CanvasFilterBar
              canvasFields={canvasFields}
              datasetIds={datasetIds}
              activeFilters={activeFilters}
              onFilterChange={handleFilterChange}
              onClearAll={() => {
                setActiveFilters({});
                setActiveSmartFilters([]);
              }}
              fieldWidgetCounts={fieldWidgetCounts}
              dashboardId={dashboard.id}
              activeSmartFilters={activeSmartFilters}
              onSmartFiltersChange={setActiveSmartFilters}
            />
          </div>
        )}
      </div>

      {/* ── Main grid/stack ── */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-4 sm:py-6">
        {dashboard.blocks.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground text-sm">
            This dashboard has no content blocks.
          </div>
        ) : !mounted ? null : isMobile ? (
          <MobileStack
            blocks={dashboard.blocks}
            blockTitle={blockTitle}
            activeFilters={activeFilters}
            activeSmartFilters={activeSmartFilters}
            onFilterChange={handleFilterChange}
            dashboardId={dashboard.id}
            datasetIds={datasetIds}
            initialWidgetData={initialWidgetData}
          />
        ) : (
          <GridLayout
            layout={layout}
            cols={12}
            rowHeight={ROW_HEIGHT}
            margin={[16, 16]}
            containerPadding={[0, 0]}
            isDraggable={false}
            isResizable={false}
          >
            {dashboard.blocks.map((block) => (
              <div key={block.id}>
                <BlockCard
                  block={block}
                  title={blockTitle(block)}
                  activeFilters={activeFilters}
                  activeSmartFilters={activeSmartFilters}
                  onFilterChange={handleFilterChange}
                  dashboardId={dashboard.id}
                  datasetIds={datasetIds}
                  initialData={initialWidgetData?.[block.id]}
                />
              </div>
            ))}
          </GridLayout>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="max-w-7xl mx-auto w-full px-6 py-6 flex flex-col items-center justify-center gap-1.5 print:hidden">
        <p className="text-[11px] text-muted-foreground/40 flex items-center gap-1.5">
          <BarChart2 className="h-3 w-3" />
          Powered by Supercoolstuff
        </p>
        <Link href="/templates" className="text-[11px] text-muted-foreground/40 transition-colors hover:text-brand">
          Browse dashboard templates
        </Link>
      </div>

    </div>
  );
}
