"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useWorksheetStore } from "@/store/worksheetStore";
import type { Dataset, WorkbookConfig, WorkbookSheet, WorksheetConfig } from "@/types";
import { generateId } from "@/lib/utils/ids";
import { Button } from "@/components/ui/button";
import {
  Sparkles, Loader2, ChevronDown, Check, X,
  BarChart2, PieChart, TrendingUp, LayoutDashboard, Map, Table2,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Inline dataset picker ─────────────────────────────────────────

function DatasetPicker({
  datasets, value, onChange, disabled,
}: {
  datasets: Dataset[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = datasets.find((d) => d.id === value);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-white text-xs hover:border-brand transition-colors disabled:opacity-50 disabled:cursor-not-allowed max-w-[180px]"
      >
        <span className={cn("truncate", !selected && "text-muted-foreground")}>
          {selected ? selected.fileName : "Pick dataset"}
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-30 min-w-[200px] max-w-[280px] max-h-52 overflow-y-auto">
          {datasets.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => { onChange(d.id); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted/40 text-left transition-colors"
            >
              {value === d.id && <Check className="h-3 w-3 text-brand shrink-0" />}
              <span className={cn("truncate", value !== d.id && "pl-4")}>{d.fileName}</span>
              {d.rowCount !== undefined && (
                <span className="ml-auto text-[10px] text-muted-foreground shrink-0 pl-2">
                  {d.rowCount.toLocaleString()} rows
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Config summary card ───────────────────────────────────────────

const CHART_ICONS: Record<string, React.ElementType> = {
  bar: BarChart2, grouped_bar: BarChart2, line: TrendingUp, area: TrendingUp,
  pie: PieChart, kpi: LayoutDashboard, map: Map, table: Table2,
};

function ConfigSummary({
  title, description, config,
}: {
  title: string;
  description: string;
  config: WorksheetConfig;
}) {
  const Icon = CHART_ICONS[config.chartType] ?? BarChart2;
  return (
    <div className="rounded-xl border border-brand/20 bg-brand/5 p-4 space-y-2.5">
      <div className="flex items-start gap-3">
        <div className="h-8 w-8 rounded-lg bg-brand flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-slate-900">{title}</p>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{description}</p>
          )}
        </div>
        <span className="text-[10px] bg-brand/10 text-brand-deep font-semibold px-2 py-0.5 rounded-full border border-brand/20 shrink-0 capitalize">
          {config.chartType.replace("_", " ")}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5 text-[11px]">
        {config.dimensions.length > 0 && (
          <span className="bg-violet-50 border border-violet-100 text-violet-700 px-2 py-0.5 rounded-full">
            Group: {config.dimensions.map((d) => d.field).join(", ")}
          </span>
        )}
        {config.metrics.slice(0, 2).map((m) => (
          <span key={m.id} className="bg-brand-tint-100 border border-brand-tint-200 text-brand-deep px-2 py-0.5 rounded-full">
            {m.aggregation}({m.field})
          </span>
        ))}
        {config.metrics.length > 2 && (
          <span className="text-muted-foreground px-2 py-0.5">+{config.metrics.length - 2} more</span>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────

type Phase = "idle" | "loading" | "preview" | "saving" | "error";

interface GeneratedResult {
  title:       string;
  description: string;
  insight:     string;
  config:      WorksheetConfig;
  sheets:      Array<{
    title: string;
    description: string;
    insight: string;
    config: WorksheetConfig;
  }>;
  dataCoverage: Array<{
    sheetTitle: string;
    field: string;
    distinctCount: number;
  }>;
}

export function AICommandBar() {
  const router      = useRouter();
  const datasets    = useWorksheetStore((s) => s.datasets);
  const addWorksheet = useWorksheetStore((s) => s.addWorksheet);
  const hydrated    = useWorksheetStore((s) => s.hydrated);

  const [phase,    setPhase]    = useState<Phase>("idle");
  const [prompt,   setPrompt]   = useState("");
  const [datasetId, setDatasetId] = useState("");
  const [result,   setResult]   = useState<GeneratedResult | null>(null);
  const [error,    setError]    = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Default to first own/seed dataset once hydrated
  const pickable = datasets.filter(
    (d) => !d.accessType || d.accessType === "own" || d.isSeed || d.accessType === "seed"
  );
  const effectiveDatasetId = datasetId || (pickable.length === 1 ? pickable[0]?.id : "");
  const dataset = datasets.find((d) => d.id === effectiveDatasetId);

  async function handleGenerate() {
    if (!prompt.trim() || !dataset) return;
    setPhase("loading");
    setError(null);

    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt:    prompt.trim(),
          datasetId: dataset.id,
          fields:    dataset.fields,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");

      setResult({
        title:       data.title,
        description: data.description,
        insight:     data.insight ?? "",
        config:      data.config,
        sheets:      Array.isArray(data.sheets) && data.sheets.length > 0
          ? data.sheets
          : [{ title: data.title, description: data.description, insight: data.insight ?? "", config: data.config }],
        dataCoverage: Array.isArray(data.dataCoverage) ? data.dataCoverage : [],
      });
      setPhase("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPhase("error");
    }
  }

  async function handleCreate() {
    if (!result || !dataset) return;
    setPhase("saving");

    try {
      const sheets: WorkbookSheet[] = result.sheets.map((generated, index) => ({
        ...generated.config,
        id: generateId(),
        name: generated.title || `Sheet ${index + 1}`,
        description: generated.description || undefined,
      }));
      const workbookConfig: WorkbookConfig = {
        version: 1,
        activeSheetId: sheets[0].id,
        sheets,
      };

      const res = await fetch("/api/workbooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          datasetId:   dataset.id,
          name:        result.title,
          description: result.description || undefined,
          config:      workbookConfig,
          status:      "saved",
        }),
      });

      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error ?? "Failed to create workbook");
      }

      const worksheet = await res.json();
      addWorksheet(worksheet);
      router.push(`/analytics/workbook/${worksheet.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create workbook");
      setPhase("error");
    }
  }

  function handleDiscard() {
    setPhase("idle");
    setPrompt("");
    setResult(null);
    setError(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  const isLoading  = phase === "loading" || phase === "saving";
  const hasDatasets = pickable.length > 0;

  return (
    <div className="rounded-2xl border border-brand/20 bg-gradient-to-br from-brand/5 via-white to-violet-50/40 p-4 space-y-3 shadow-sm">
      {/* Prompt bar */}
      <div className="flex items-center gap-2">
        <div className="h-7 w-7 rounded-lg bg-brand flex items-center justify-center shrink-0">
          <Sparkles className="h-3.5 w-3.5 text-white" />
        </div>
        <input
          ref={inputRef}
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !isLoading && phase !== "preview") handleGenerate();
          }}
          placeholder="Ask AI — e.g. Show budget utilisation by ministry…"
          disabled={isLoading || phase === "preview"}
          className="flex-1 h-9 px-3 rounded-xl border border-border bg-white text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-all disabled:bg-muted/20 disabled:cursor-not-allowed"
        />
        {hydrated && hasDatasets && (
          <DatasetPicker
            datasets={pickable}
            value={effectiveDatasetId}
            onChange={setDatasetId}
            disabled={isLoading || phase === "preview"}
          />
        )}
        {phase === "idle" || phase === "error" ? (
          <Button
            size="sm"
            className="gap-1.5 shrink-0"
            onClick={handleGenerate}
            disabled={isLoading || !prompt.trim() || !effectiveDatasetId}
          >
            {isLoading
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <ArrowRight className="h-3.5 w-3.5" />
            }
            Generate
          </Button>
        ) : phase === "loading" ? (
          <Button size="sm" disabled className="gap-1.5 shrink-0">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Thinking…
          </Button>
        ) : phase === "preview" || phase === "saving" ? (
          <button
            type="button"
            onClick={handleDiscard}
            disabled={phase === "saving"}
            className="h-9 w-9 flex items-center justify-center rounded-xl border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-all disabled:opacity-40 shrink-0"
            title="Discard and start over"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {/* Error */}
      {phase === "error" && error && (
        <p className="text-xs text-destructive flex items-center gap-1.5 px-1">
          {error}
        </p>
      )}
      {phase === "idle" && hydrated && pickable.length > 1 && !effectiveDatasetId && (
        <p className="text-xs text-muted-foreground px-1">
          Choose the dataset AI should use before generating a workbook.
        </p>
      )}
      {phase === "idle" && dataset && (
        <p className="text-xs text-muted-foreground px-1">
          AI will use {dataset.fileName}{dataset.rowCount !== undefined ? ` (${dataset.rowCount.toLocaleString()} rows)` : ""}.
        </p>
      )}

      {/* Config preview + actions */}
      {(phase === "preview" || phase === "saving") && result && (
        <div className="space-y-3">
          <ConfigSummary
            title={result.title}
            description={result.description}
            config={result.config}
          />
          {result.sheets.length > 1 && (
            <p className="text-xs text-muted-foreground px-1">
              AI will create {result.sheets.length} workbook sheets.
            </p>
          )}
          {result.dataCoverage.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <p className="font-semibold">Dataset coverage check</p>
              {result.dataCoverage.map((item) => (
                <p key={`${item.sheetTitle}-${item.field}`}>
                  {item.sheetTitle}: {item.field} has {item.distinctCount.toLocaleString()} distinct value{item.distinctCount !== 1 ? "s" : ""} in {dataset?.fileName}.
                </p>
              ))}
            </div>
          )}
          {result.insight && (
            <p className="text-xs text-slate-600 leading-relaxed px-1 border-l-2 border-brand/30 pl-3 italic">
              {result.insight}
            </p>
          )}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="gap-1.5 flex-1"
              onClick={handleCreate}
              disabled={phase === "saving"}
            >
              {phase === "saving"
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Creating…</>
                : <><BarChart2 className="h-3.5 w-3.5" /> Open in Workbook Builder</>
              }
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
