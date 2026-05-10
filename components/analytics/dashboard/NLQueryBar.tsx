"use client";

import { useState, useRef, useCallback } from "react";
import { Sparkles, Loader2, Send, X } from "lucide-react";
import type { ResolvedChartData } from "@/types";

interface NLQueryBarProps {
  datasetIds: string[];
  onResult?: (data: { chartData: ResolvedChartData; title: string; chartType: string }) => void;
}

export function NLQueryBar({ datasetIds, onResult }: NLQueryBarProps) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(async () => {
    if (!question.trim() || loading || datasetIds.length === 0) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/ai/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim(), datasetId: datasetIds[0] }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Query failed");
        return;
      }

      onResult?.({
        chartData: data.chartData,
        title: data.query.title ?? "Query Result",
        chartType: data.query.chartType ?? "bar",
      });

      setQuestion("");
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [question, loading, datasetIds, onResult]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-brand transition-colors"
        title="Ask a question about this data"
      >
        <Sparkles className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Ask AI</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1 min-w-[200px]">
        <input
          ref={inputRef}
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
          placeholder="Ask a question about this data…"
          disabled={loading}
          className="w-full h-8 px-3 pr-8 text-xs rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:opacity-50"
          autoFocus
        />
        {loading ? (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
        ) : (
          <button onClick={handleSubmit} disabled={!question.trim()} className="absolute right-2 top-1/2 -translate-y-1/2">
            <Send className="h-3.5 w-3.5 text-muted-foreground hover:text-brand transition-colors disabled:opacity-30" />
          </button>
        )}
      </div>
      <button onClick={() => { setOpen(false); setError(null); }} className="shrink-0">
        <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive transition-colors" />
      </button>
      {error && <span className="text-xs text-destructive whitespace-nowrap">{error}</span>}
    </div>
  );
}
