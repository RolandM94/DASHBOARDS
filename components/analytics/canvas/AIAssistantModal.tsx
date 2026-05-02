"use client";

import { useEffect, useState, useRef } from "react";
import type { Dataset, Worksheet, WorksheetConfig, ChartType, WidgetBlockConfig, WorkbookConfig, WorkbookSheet } from "@/types";
import { useWorksheetStore } from "@/store/worksheetStore";
import { useCanvasStore } from "@/store/canvasStore";
import { generateId } from "@/lib/utils/ids";
import { getWorkbookSheet, normalizeWorkbookConfig } from "@/lib/workbook";
import { Button } from "@/components/ui/button";
import {
  Sparkles, X, Loader2, ChevronDown, Check,
  BarChart2, LineChart, PieChart, TrendingUp, Hash, Table, Globe, Layers,
  MessageSquare, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Chart type icon map ───────────────────────────────────────────

const CHART_ICONS: Record<ChartType, React.ComponentType<{ className?: string }>> = {
  bar:         BarChart2,
  grouped_bar: Layers,
  line:        LineChart,
  area:        TrendingUp,
  pie:         PieChart,
  kpi:         Hash,
  table:       Table,
  map:         Globe,
};

const CHART_LABELS: Record<ChartType, string> = {
  bar:         "Bar Chart",
  grouped_bar: "Grouped Bar",
  line:        "Line Chart",
  area:        "Area Chart",
  pie:         "Pie Chart",
  kpi:         "KPI Cards",
  table:       "Table",
  map:         "Map",
};

// ── Dataset picker ────────────────────────────────────────────────

function DatasetPicker({
  datasets,
  value,
  onChange,
}: {
  datasets: Dataset[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = datasets.find((d) => d.id === value);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 h-9 px-3 rounded-lg border border-gray-200 text-sm hover:border-brand transition-colors bg-white"
      >
        <span className={cn("truncate", !selected && "text-muted-foreground")}>
          {selected ? selected.fileName : "Select a dataset…"}
        </span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 max-h-48 overflow-y-auto">
          {datasets.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No datasets</p>
          ) : (
            datasets.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => { onChange(d.id); setOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted/40 text-left transition-colors"
              >
                {value === d.id && <Check className="h-3.5 w-3.5 text-brand shrink-0" />}
                <span className={cn("truncate", value !== d.id && "pl-5")}>{d.fileName}</span>
                {d.rowCount !== undefined && (
                  <span className="ml-auto text-xs text-muted-foreground shrink-0">
                    {d.rowCount.toLocaleString()} rows
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Config preview card ───────────────────────────────────────────

function ConfigPreview({
  title,
  description,
  config,
}: {
  title: string;
  description: string;
  config: WorksheetConfig;
}) {
  const Icon  = CHART_ICONS[config.chartType] ?? BarChart2;
  const label = CHART_LABELS[config.chartType] ?? config.chartType;

  return (
    <div className="rounded-xl border border-brand/20 bg-brand-tint-100/40 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-brand flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-slate-900 truncate">{title}</p>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{description}</p>
          )}
        </div>
        <span className="shrink-0 text-[10px] bg-brand/10 text-brand-deep font-semibold px-2 py-1 rounded-full border border-brand/20">
          {label}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        {config.dimensions.length > 0 && (
          <div className="bg-violet-50 border border-violet-100 rounded-lg px-3 py-2">
            <p className="text-[9px] font-bold uppercase tracking-widest text-violet-400 mb-1">Dimension</p>
            {config.dimensions.map((d) => (
              <p key={d.id} className="font-medium text-violet-800 truncate">{d.field}</p>
            ))}
          </div>
        )}
        {config.metrics.length > 0 && (
          <div className="bg-brand-tint-100 border border-brand-tint-200 rounded-lg px-3 py-2">
            <p className="text-[9px] font-bold uppercase tracking-widest text-brand-deep/50 mb-1">
              {config.metrics.length === 1 ? "Metric" : "Metrics"}
            </p>
            {config.metrics.slice(0, 3).map((m) => (
              <p key={m.id} className="font-medium text-brand-deep truncate">
                {m.aggregation} of {m.field}
              </p>
            ))}
            {config.metrics.length > 3 && (
              <p className="text-brand-deep/60">+{config.metrics.length - 3} more</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Insight preview ───────────────────────────────────────────────

function InsightPreview({
  insight,
  include,
  onToggle,
}: {
  insight: string;
  include: boolean;
  onToggle: () => void;
}) {
  if (!insight) return null;

  return (
    <div className={cn(
      "rounded-xl border p-3.5 space-y-2 transition-colors",
      include
        ? "border-brand/20 bg-brand-tint-100/30"
        : "border-gray-200 bg-gray-50/60",
    )}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <MessageSquare className="h-3.5 w-3.5 text-brand shrink-0" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            AI Insight
          </span>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "flex items-center gap-1 text-[11px] font-medium rounded-full px-2.5 py-0.5 border transition-colors",
            include
              ? "bg-brand text-white border-brand"
              : "bg-white text-muted-foreground border-gray-200 hover:border-brand hover:text-brand",
          )}
        >
          {include && <Check className="h-3 w-3" />}
          {include ? "Add to canvas" : "Skip"}
        </button>
      </div>
      <p className="text-xs text-slate-700 leading-relaxed">{insight}</p>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────

interface Props {
  canvasId: string;
  onClose:  () => void;
}

type ConversationMessage = { role: "user" | "assistant"; content: string };

type ModalState =
  | { phase: "input" }
  | { phase: "loading" }
  | {
      phase: "result";
      title: string;
      description: string;
      insight: string;
      config: WorksheetConfig;
      sheets: Array<{ title: string; description: string; insight: string; config: WorksheetConfig }>;
      dataCoverage: Array<{ sheetTitle: string; field: string; distinctCount: number }>;
      datasetId: string;
    }
  | { phase: "adding" }
  | { phase: "error"; message: string };

export function AIAssistantModal({ canvasId, onClose }: Props) {
  const datasets        = useWorksheetStore((s) => s.datasets);
  const worksheets      = useWorksheetStore((s) => s.worksheets);
  const addWorksheet    = useWorksheetStore((s) => s.addWorksheet);
  const updateWorksheet = useWorksheetStore((s) => s.updateWorksheet);
  const addBlock        = useCanvasStore((s) => s.addBlock);
  const updateBlock     = useCanvasStore((s) => s.updateBlock);
  const canvas          = useCanvasStore((s) => s.getCanvasById(canvasId));

  const widgetBlocks = (canvas?.blocks ?? []).filter((b) => b.type === "widget") as WidgetBlockConfig[];

  const [mode, setMode] = useState<"create" | "modify">("create");
  const [targetWidgetId, setTargetWidgetId] = useState(widgetBlocks[0]?.id ?? "");
  const [selectedDataset, setSelectedDataset] = useState("");
  const [prompt, setPrompt]           = useState("");
  const [state, setState]             = useState<ModalState>({ phase: "input" });
  const [includeInsight, setIncludeInsight] = useState(true);
  const [includeFilter, setIncludeFilter]   = useState(false);

  // Conversational editing — tracks the exchange so Claude can refine iteratively
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([]);
  const [refinePrompt, setRefinePrompt] = useState("");

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const targetWidget    = widgetBlocks.find((b) => b.id === targetWidgetId);
  const targetWorksheet = targetWidget ? worksheets.find((w) => w.id === targetWidget.worksheetId) : undefined;
  const targetSheet = targetWorksheet ? getWorkbookSheet(targetWorksheet, targetWidget?.sheetId) : undefined;
  const targetSheetId = targetWidget?.sheetId ?? targetSheet?.id;
  const linkedInsightBlock = targetWorksheet
    ? canvas?.blocks.find((b) =>
        b.type === "text" &&
        b.worksheetId === targetWorksheet.id &&
        ((b as { sheetId?: string }).sheetId
          ? (b as { sheetId?: string }).sheetId === targetSheetId
          : !targetWidget?.sheetId)
      )
    : undefined;

  useEffect(() => {
    if (mode !== "modify") return;
    if (targetWidgetId && widgetBlocks.some((b) => b.id === targetWidgetId)) return;
    setTargetWidgetId(widgetBlocks[0]?.id ?? "");
  }, [mode, targetWidgetId, widgetBlocks]);

  // In modify mode the dataset comes from the target worksheet; in create mode it's user-selected
  const activeDatasetId = mode === "modify"
    ? (targetWorksheet?.datasetId ?? "")
    : selectedDataset;
  const dataset = datasets.find((d) => d.id === activeDatasetId);

  /** Calls the generate endpoint. Accepts optional prior messages for refinement. */
  async function callGenerate(userPrompt: string, priorMessages: ConversationMessage[]) {
    if (!activeDatasetId || !dataset) return;
    setState({ phase: "loading" });

    // In modify mode with no prior messages yet, prime conversation with current config
    let effectivePriorMessages = priorMessages;
    if (mode === "modify" && targetWorksheet && targetSheet && priorMessages.length === 0) {
      effectivePriorMessages = [
        {
          role: "user",
          content: "Here is the current chart configuration to modify. Preserve the current intent unless I explicitly ask to change it.",
        },
        { role: "assistant", content: JSON.stringify({
          title:       targetWidget?.title ?? targetSheet.name,
          description: targetSheet.description ?? targetWorksheet.description ?? "",
          chartType:   targetSheet.chartType,
          dimensions:  targetSheet.dimensions,
          metrics:     targetSheet.metrics,
          filters:     targetSheet.filters,
          sort:        targetSheet.sort ?? "natural",
          logScale:    targetSheet.logScale ?? false,
        }) },
      ];
    }

    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt:        userPrompt,
          datasetId:     activeDatasetId,
          fields:        dataset.fields,
          canvasId,
          priorMessages: effectivePriorMessages.length > 0 ? effectivePriorMessages : undefined,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setState({ phase: "error", message: json.error ?? "AI request failed" });
        return;
      }

      // Store the exchange in conversation history for follow-up refinements
      const assistantReply: ConversationMessage = {
        role: "assistant",
        content: JSON.stringify({
          title:       json.title,
          description: json.description,
          insight:     json.insight,
          sheets:      json.sheets,
          chartType:   json.config.chartType,
          dimensions:  json.config.dimensions,
          metrics:     json.config.metrics,
          filters:     json.config.filters,
          sort:        json.config.sort,
          logScale:    json.config.logScale ?? false,
        }),
      };

      setRefinePrompt("");

      // Cap history to last 10 messages (5 exchanges) to avoid unbounded token growth
      const cappedHistory = [
        ...effectivePriorMessages,
        { role: "user" as const, content: userPrompt },
        assistantReply,
      ].slice(-10);

      setConversationHistory(cappedHistory);

      setState({
        phase:       "result",
        title:       json.title,
        description: json.description,
        insight:     json.insight ?? "",
        config:      json.config,
        sheets:      Array.isArray(json.sheets) && json.sheets.length > 0
          ? json.sheets
          : [{ title: json.title, description: json.description, insight: json.insight ?? "", config: json.config }],
        dataCoverage: Array.isArray(json.dataCoverage) ? json.dataCoverage : [],
        datasetId:   activeDatasetId,   // fix: was selectedDataset (wrong in modify mode)
      });
    } catch (err) {
      setState({
        phase:   "error",
        message: err instanceof Error ? err.message : "Network error",
      });
    }
  }

  function handleGenerate() {
    if (!prompt.trim()) return;
    void callGenerate(prompt.trim(), []);
  }

  function handleRefine() {
    if (!refinePrompt.trim()) return;
    void callGenerate(refinePrompt.trim(), conversationHistory);
  }

  async function handleAddToCanvas() {
    if (state.phase !== "result") return;
    setState({ phase: "adding" });

    try {
      // ── Modify mode: PATCH the existing worksheet ─────────────────
      if (mode === "modify" && targetWorksheet && targetSheet) {
        const workbook = normalizeWorkbookConfig(targetWorksheet.config, {
          name: targetWorksheet.name,
          description: targetWorksheet.description,
        });
        const selectedSheetId = targetWidget?.sheetId ?? targetSheet.id;
        const nextConfig: WorkbookConfig = {
          ...workbook,
          activeSheetId: selectedSheetId,
          sheets: workbook.sheets.map((sheet) =>
            sheet.id === selectedSheetId
              ? {
                  ...sheet,
                  ...state.config,
                  id: sheet.id,
                  name: state.title,
                  description: state.description || undefined,
                }
              : sheet
          ),
        };
        const patchRes = await fetch(`/api/workbooks/${targetWorksheet.id}`, {
          method:  "PATCH",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            name:        targetWorksheet.name,
            description: targetWorksheet.description || undefined,
            config:      nextConfig,
          }),
        });
        if (!patchRes.ok) {
          const e = await patchRes.json();
          setState({ phase: "error", message: e.error ?? "Failed to update sheet" });
          return;
        }
        const updated: Worksheet = await patchRes.json();
        updateWorksheet(updated.id, updated);
        if (targetWidget) {
          updateBlock(canvasId, targetWidget.id, { title: state.title, sheetId: selectedSheetId });
        }
        if (linkedInsightBlock && state.insight) {
          updateBlock(canvasId, linkedInsightBlock.id, { content: state.insight });
        } else if (includeInsight && state.insight) {
          addBlock(canvasId, {
            id:          generateId(),
            type:        "text",
            order:       canvas?.blocks.length ?? 0,
            content:     state.insight,
            worksheetId: targetWorksheet.id,
            sheetId:     selectedSheetId,
          });
        }
        onClose();
        return;
      }

      // ── Create mode: persist a new workbook ──────────────────────
      // 1. Persist the workbook via the v1 worksheets API
      const generatedSheets = state.sheets.map((generated, index) => ({
        ...generated,
        title: generated.title || `Sheet ${index + 1}`,
      }));
      const sheets: WorkbookSheet[] = generatedSheets.map((generated) => ({
        ...generated.config,
        id: generateId(),
        name: generated.title,
        description: generated.description || undefined,
      }));
      const workbookConfig: WorkbookConfig = {
        version: 1,
        activeSheetId: sheets[0].id,
        sheets,
      };

      const wsRes = await fetch("/api/workbooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          datasetId:   state.datasetId,
          name:        state.title,
          description: state.description || undefined,
          config:      workbookConfig,
          status:      "saved",
        }),
      });

      if (!wsRes.ok) {
        const e = await wsRes.json();
        setState({ phase: "error", message: e.error ?? "Failed to save workbook" });
        return;
      }

      const worksheet: Worksheet = await wsRes.json();
      addWorksheet(worksheet);

      // 2. Add widget blocks to canvas — one per generated workbook sheet
      sheets.forEach((sheet, index) => {
        addBlock(canvasId, {
          id:          generateId(),
          type:        "widget",
          order:       index,
          worksheetId: worksheet.id,
          sheetId:     sheet.id,
          title:       sheet.name,
        });
      });

      // 3. Optionally add insight text blocks immediately after the widgets
      const insightBlocks = generatedSheets
        .map((generated, index) => ({
          insight: generated.insight || (generatedSheets.length === 1 ? state.insight : ""),
          sheetId: sheets[index].id,
          order: sheets.length + index,
        }))
        .filter((generated) => generated.insight);

      if (includeInsight && insightBlocks.length > 0) {
        insightBlocks.forEach((generated) => {
          addBlock(canvasId, {
            id:          generateId(),
            type:        "text",
            order:       generated.order,
            content:     generated.insight,
            worksheetId: worksheet.id,   // link for AI refresh badge
            sheetId:     generated.sheetId,
          });
        });
      }

      // 4. Optionally add a filter block for the first dimension
      if (includeFilter && state.config.dimensions.length > 0) {
        const dim = state.config.dimensions[0];
        addBlock(canvasId, {
          id:         generateId(),
          type:       "filter",
          order:      2,
          field:      dim.field,
          filterType: "multi_select",
          label:      dim.label ?? dim.field,
        });
      }

      onClose();
    } catch (err) {
      setState({
        phase:   "error",
        message: err instanceof Error ? err.message : "Failed to add to canvas",
      });
    }
  }

  function handleReset() {
    setState({ phase: "input" });
    setIncludeInsight(true);
    setIncludeFilter(false);
    setConversationHistory([]);
    setRefinePrompt("");
    setPrompt("");
  }

  function handleTargetWidgetChange(widgetId: string) {
    setTargetWidgetId(widgetId);
    handleReset();
  }

  const isLoading = state.phase === "loading" || state.phase === "adding";

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !isLoading) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3 shrink-0">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-brand to-brand-dark flex items-center justify-center shrink-0">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-sm text-gray-900">AI Chart Assistant</h2>
            <p className="text-xs text-muted-foreground">Choose the data, then describe the chart</p>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground transition-colors disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* Mode toggle */}
          {widgetBlocks.length > 0 && (
            <div className="flex items-center rounded-lg border bg-muted/40 p-0.5 gap-0.5">
              {(["create", "modify"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    if (m === mode) return;  // no-op on already-active tab
                    setMode(m);
                    // Reset targetWidgetId to first available to avoid stale reference
                    if (m === "modify") setTargetWidgetId(widgetBlocks[0]?.id ?? "");
                    handleReset();
                  }}
                  disabled={isLoading}
                  className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    mode === m
                      ? "bg-white shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m === "create" ? "Create new chart" : "Modify existing widget"}
                </button>
              ))}
            </div>
          )}

          {/* Dataset selector (create mode) / Widget picker (modify mode) */}
          {mode === "create" ? (
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Dataset
              </label>
              <DatasetPicker
                datasets={datasets.filter((d) => !d.accessType || d.accessType === "own" || d.isSeed || d.accessType === "seed")}
                value={selectedDataset}
                onChange={setSelectedDataset}
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Widget to modify
              </label>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {widgetBlocks.map((wb) => {
                  const ws = worksheets.find((w) => w.id === wb.worksheetId);
                  const sheet = ws ? getWorkbookSheet(ws, wb.sheetId) : null;
                  return (
                    <button
                      key={wb.id}
                      type="button"
                      onClick={() => handleTargetWidgetChange(wb.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors text-sm ${
                        targetWidgetId === wb.id
                          ? "border-brand bg-brand-tint-100/60 text-brand-deep"
                          : "border-gray-200 hover:border-brand/40"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{wb.title ?? sheet?.name ?? ws?.name ?? "Widget"}</p>
                        {sheet ? (
                          <p className="text-[11px] text-muted-foreground">{sheet.chartType} · {sheet.metrics.length} metric{sheet.metrics.length !== 1 ? "s" : ""}</p>
                        ) : (
                          <p className="text-[11px] text-red-400">Workbook not found</p>
                        )}
                      </div>
                      {targetWidgetId === wb.id && <Check className="h-3.5 w-3.5 text-brand shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Prompt */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              What would you like to see?
            </label>
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleGenerate();
              }}
              placeholder="e.g. Bar chart of total budget by ministry, sorted highest first"
              rows={3}
              disabled={isLoading || state.phase === "result"}
              className="w-full text-sm rounded-lg border border-gray-200 px-3 py-2.5 resize-none outline-none focus:border-brand transition-colors placeholder:text-muted-foreground/50 disabled:bg-muted/30 disabled:cursor-not-allowed"
            />
            <p className="text-[10px] text-muted-foreground/60">⌘↵ to generate</p>
          </div>

          {/* Example prompts */}
          {state.phase === "input" && prompt === "" && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-semibold">
                Try asking…
              </p>
              {[
                "Bar chart of total budget by ministry",
                "KPI showing total expenditure and count of projects",
                "Pie chart of spend by sector",
              ].map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => { setPrompt(example); textareaRef.current?.focus(); }}
                  className="w-full text-left text-xs px-3 py-2 rounded-lg border border-dashed border-gray-200 text-muted-foreground hover:border-brand hover:text-brand transition-colors"
                >
                  {example}
                </button>
              ))}
            </div>
          )}

          {/* Loading */}
          {state.phase === "loading" && (
            <div className="flex items-center gap-3 py-4 justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-brand" />
              <p className="text-sm text-muted-foreground">Generating chart…</p>
            </div>
          )}

          {/* Adding */}
          {state.phase === "adding" && (
            <div className="flex items-center gap-3 py-4 justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-brand" />
              <p className="text-sm text-muted-foreground">Adding to canvas…</p>
            </div>
          )}

          {/* Result — chart config + insight + refine */}
          {state.phase === "result" && (
            <>
              <ConfigPreview
                title={state.title}
                description={state.description}
                config={state.config}
              />
              {state.sheets.length > 1 && (
                <div className="rounded-xl border border-brand/20 bg-brand/5 px-3 py-2">
                  <p className="text-xs font-medium text-brand-deep">
                    {state.sheets.length} workbook sheets will be created.
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                    {state.sheets.map((sheet) => sheet.title).join(", ")}
                  </p>
                </div>
              )}
              {state.dataCoverage.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <p className="font-semibold">Dataset coverage check</p>
                  {state.dataCoverage.map((item) => (
                    <p key={`${item.sheetTitle}-${item.field}`}>
                      {item.sheetTitle}: {item.field} has {item.distinctCount.toLocaleString()} distinct value{item.distinctCount !== 1 ? "s" : ""} in this dataset.
                    </p>
                  ))}
                </div>
              )}
              <InsightPreview
                insight={state.insight}
                include={includeInsight}
                onToggle={() => setIncludeInsight((v) => !v)}
              />
              {/* Filter block suggestion — only when chart has dimensions */}
              {state.config.dimensions.length > 0 && (
                <div className={`rounded-xl border p-3.5 transition-colors ${includeFilter ? "border-violet-200 bg-violet-50/40" : "border-gray-200 bg-gray-50/60"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        Add filter for <span className="text-violet-700">{state.config.dimensions[0].field}</span>
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIncludeFilter((v) => !v)}
                      className={`flex items-center gap-1 text-[11px] font-medium rounded-full px-2.5 py-0.5 border transition-colors ${
                        includeFilter
                          ? "bg-violet-600 text-white border-violet-600"
                          : "bg-white text-muted-foreground border-gray-200 hover:border-violet-400 hover:text-violet-600"
                      }`}
                    >
                      {includeFilter && <Check className="h-3 w-3" />}
                      {includeFilter ? "Add filter" : "Skip"}
                    </button>
                  </div>
                  {includeFilter && (
                    <p className="text-xs text-muted-foreground mt-1.5 leading-snug">
                      A multi-select filter for <strong>{state.config.dimensions[0].field}</strong> will be placed on the canvas.
                    </p>
                  )}
                </div>
              )}
              {/* Conversational refinement */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Refine this chart
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={refinePrompt}
                    onChange={(e) => setRefinePrompt(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleRefine(); }}
                    placeholder='e.g. "change to line chart" or "sort highest first"'
                    className="flex-1 text-xs rounded-lg border border-gray-200 px-3 py-2 outline-none focus:border-brand transition-colors placeholder:text-muted-foreground/40"
                  />
                  <button
                    type="button"
                    onClick={handleRefine}
                    disabled={!refinePrompt.trim()}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-brand text-white text-xs font-medium disabled:opacity-40 hover:bg-brand-dark transition-colors shrink-0"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Refine
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Error */}
          {state.phase === "error" && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm font-medium text-red-700">Something went wrong</p>
              <p className="text-xs text-red-500 mt-0.5">{state.message}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex items-center gap-2 shrink-0">
          {state.phase === "result" ? (
            <>
              <Button variant="outline" size="sm" className="text-xs" onClick={handleReset}>
                Try again
              </Button>
              <Button size="sm" className="text-xs flex-1 gap-1.5" onClick={handleAddToCanvas}>
                <Check className="h-3.5 w-3.5" />
                {mode === "modify" ? "Apply changes" : "Add to canvas"}
              </Button>
            </>
          ) : state.phase === "error" ? (
            <>
              <Button variant="outline" size="sm" className="text-xs" onClick={onClose}>
                Cancel
              </Button>
              <Button size="sm" className="text-xs flex-1" onClick={handleReset}>
                Try again
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline" size="sm" className="text-xs"
                onClick={onClose} disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                size="sm" className="text-xs flex-1 gap-1.5"
                onClick={handleGenerate}
                disabled={isLoading || !activeDatasetId || !prompt.trim() || (mode === "modify" && (!targetWidgetId || !targetWorksheet))}
              >
                {isLoading
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Sparkles className="h-3.5 w-3.5" />
                }
                Generate chart
              </Button>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
