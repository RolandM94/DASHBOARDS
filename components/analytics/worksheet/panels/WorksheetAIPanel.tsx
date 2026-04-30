"use client";

import { useState, useRef } from "react";
import { DatasetField, WorksheetConfig } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Sparkles, Loader2, RotateCcw, Check, ChevronRight,
  BarChart2, PieChart, LayoutDashboard, TrendingUp, Map, Table2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Phase = "prompt" | "loading" | "result" | "error";

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

interface Result {
  title:       string;
  description: string;
  insight:     string;
  config:      WorksheetConfig;
}

interface Props {
  datasetId: string;
  fields:    DatasetField[];
  onApply:   (config: WorksheetConfig, title: string, description: string) => void;
}

const CHART_ICONS: Record<string, React.ElementType> = {
  bar:         BarChart2,
  grouped_bar: BarChart2,
  line:        TrendingUp,
  area:        TrendingUp,
  pie:         PieChart,
  kpi:         LayoutDashboard,
  map:         Map,
  table:       Table2,
};

const SUGGESTIONS = [
  "Show total count by category as a bar chart",
  "Compare the top metric values as a KPI",
  "Break down distribution by type as a pie chart",
  "Show trend over time as a line chart",
];

export function WorksheetAIPanel({ datasetId, fields, onApply }: Props) {
  const [phase,   setPhase]   = useState<Phase>("prompt");
  const [prompt,  setPrompt]  = useState("");
  const [refine,  setRefine]  = useState("");
  const [result,  setResult]  = useState<Result | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  const historyRef = useRef<ConversationMessage[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function callGenerate(userPrompt: string, prior: ConversationMessage[]) {
    setPhase("loading");
    setError(null);

    try {
      const res = await fetch("/api/ai/generate", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          prompt: userPrompt,
          datasetId,
          fields,
          priorMessages: prior,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");

      const assistantReply = JSON.stringify({
        title:       data.title,
        description: data.description,
        insight:     data.insight,
        config:      data.config,
      });

      historyRef.current = [
        ...prior,
        { role: "user",      content: userPrompt },
        { role: "assistant", content: assistantReply },
      ];

      setResult({ title: data.title, description: data.description, insight: data.insight, config: data.config });
      setPhase("result");
      setApplied(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPhase("error");
    }
  }

  function handleGenerate() {
    if (!prompt.trim()) return;
    callGenerate(prompt.trim(), []);
  }

  function handleRefine() {
    if (!refine.trim()) return;
    callGenerate(refine.trim(), historyRef.current);
    setRefine("");
  }

  function handleApply() {
    if (!result) return;
    onApply(result.config, result.title, result.description);
    setApplied(true);
  }

  function handleReset() {
    setPhase("prompt");
    setPrompt("");
    setRefine("");
    setResult(null);
    setError(null);
    setApplied(false);
    historyRef.current = [];
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  const ChartIcon = result ? (CHART_ICONS[result.config.chartType] ?? BarChart2) : null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b bg-gradient-to-r from-brand/5 to-violet-50 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-brand" />
            <p className="text-xs font-bold text-slate-600 uppercase tracking-widest">AI Assist</p>
          </div>
          {phase !== "prompt" && (
            <button
              onClick={handleReset}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              Start over
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* ── Prompt phase ─────────────────────────────────────── */}
        {phase === "prompt" && (
          <div className="p-4 space-y-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Describe the chart you want to build. AI will configure dimensions, metrics, and chart type.
            </p>

            <div className="space-y-2">
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleGenerate();
                  }
                }}
                placeholder={`e.g. "Show total budget by ministry as a bar chart" or "What are the top 10 states by project count?"`}
                rows={4}
                autoFocus
                className="w-full resize-none rounded-xl border border-input bg-white px-3 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-all"
              />
              <Button
                className="w-full gap-2"
                onClick={handleGenerate}
                disabled={!prompt.trim()}
              >
                <Sparkles className="h-4 w-4" />
                Generate chart
              </Button>
            </div>

            {/* Suggestion pills */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">Try</p>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setPrompt(s)}
                  className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border/60 bg-white/60 hover:border-brand hover:bg-brand/5 text-xs text-muted-foreground hover:text-foreground transition-all group"
                >
                  <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/40 group-hover:text-brand transition-colors" />
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Loading ───────────────────────────────────────────── */}
        {phase === "loading" && (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <div className="h-10 w-10 rounded-full bg-brand/10 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-brand" />
            </div>
            <p className="text-sm text-muted-foreground">Building your chart…</p>
          </div>
        )}

        {/* ── Error ─────────────────────────────────────────────── */}
        {phase === "error" && (
          <div className="p-4 space-y-3">
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
              <p className="text-xs text-destructive font-medium mb-1">Generation failed</p>
              <p className="text-xs text-muted-foreground">{error}</p>
            </div>
            <Button variant="outline" className="w-full" onClick={handleReset}>
              Try again
            </Button>
          </div>
        )}

        {/* ── Result ────────────────────────────────────────────── */}
        {phase === "result" && result && ChartIcon && (
          <div className="p-4 space-y-4">
            {/* Chart summary card */}
            <div className="rounded-xl border bg-white overflow-hidden">
              <div className="h-1 w-full bg-gradient-to-r from-brand to-violet-400" />
              <div className="p-3 space-y-2">
                <div className="flex items-start gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-brand/10 flex items-center justify-center shrink-0">
                    <ChartIcon className="h-4 w-4 text-brand" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-tight">{result.title}</p>
                    {result.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{result.description}</p>
                    )}
                  </div>
                </div>

                {/* Config summary */}
                <div className="text-[11px] text-muted-foreground space-y-1 pt-1 border-t">
                  <p className="capitalize">
                    <span className="font-medium text-slate-600">Chart:</span>{" "}
                    {result.config.chartType.replace("_", " ")}
                  </p>
                  {result.config.dimensions.length > 0 && (
                    <p>
                      <span className="font-medium text-slate-600">Group by:</span>{" "}
                      {result.config.dimensions.map((d) => d.field).join(", ")}
                    </p>
                  )}
                  {result.config.metrics.length > 0 && (
                    <p>
                      <span className="font-medium text-slate-600">Values:</span>{" "}
                      {result.config.metrics.map((m) => `${m.aggregation}(${m.field})`).join(", ")}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Insight */}
            {result.insight && (
              <div className="rounded-xl bg-brand/5 border border-brand/20 px-3 py-2.5">
                <p className="text-[11px] font-semibold text-brand mb-1 uppercase tracking-wider">AI Insight</p>
                <p className="text-xs text-slate-700 leading-relaxed">{result.insight}</p>
              </div>
            )}

            {/* Apply */}
            <Button
              className={cn("w-full gap-2", applied && "bg-green-600 hover:bg-green-700")}
              onClick={handleApply}
            >
              {applied ? (
                <><Check className="h-4 w-4" /> Applied to worksheet</>
              ) : (
                <><Check className="h-4 w-4" /> Apply to worksheet</>
              )}
            </Button>

            {/* Refine */}
            <div className="space-y-2 border-t pt-3">
              <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">Refine</p>
              <textarea
                value={refine}
                onChange={(e) => setRefine(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleRefine();
                  }
                }}
                placeholder={`e.g. "Switch to a pie chart" or "Group by region instead"`}
                rows={2}
                className="w-full resize-none rounded-xl border border-input bg-white px-3 py-2 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-all"
              />
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-1.5 text-xs"
                onClick={handleRefine}
                disabled={!refine.trim()}
              >
                <Sparkles className="h-3.5 w-3.5" />
                Refine chart
              </Button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
