"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface DrillDownRequest {
  datasetId: string;
  title: string;
  payload: {
    dashboardId?: string;
    dimensionValues: Record<string, unknown>;
    worksheetFilters: unknown[];
    globalFilters: Record<string, unknown>;
    smartFilters: string[];
    limit: number;
    offset: number;
  };
}

interface DrillDownResponse {
  rows: Record<string, unknown>[];
  columns: string[];
  total: number;
  limit: number;
  offset: number;
}

export function DrillDownPanel({
  request,
  onClose,
}: {
  request: DrillDownRequest | null;
  onClose: () => void;
}) {
  const [data, setData] = useState<DrillDownResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!request) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setData(null);

    fetch(`/api/datasets/${request.datasetId}/drill`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request.payload),
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? "Could not load detail rows");
        setData(body as DrillDownResponse);
      })
      .catch((err) => {
        if (err?.name !== "AbortError") setError(err instanceof Error ? err.message : "Could not load detail rows");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [request]);

  const columns = useMemo(() => {
    if (!data) return [];
    return data.columns.length > 0 ? data.columns : Array.from(new Set(data.rows.flatMap((row) => Object.keys(row))));
  }, [data]);

  if (!request) return null;
  const currentRequest = request;

  function exportCsv() {
    if (!data || data.rows.length === 0) return;
    const csv = [
      columns.map(csvEscape).join(","),
      ...data.rows.map((row) => columns.map((column) => csvEscape(formatCell(row[column]))).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${currentRequest.title || "drill-down"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20 print:hidden" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-3xl flex-col border-l bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-brand">Detail rows</p>
            <h2 className="mt-1 truncate text-lg font-bold text-slate-900">{request.title}</h2>
            {data && (
              <p className="mt-1 text-xs text-muted-foreground">
                Showing {data.rows.length.toLocaleString()} of {data.total.toLocaleString()} rows
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv} disabled={!data?.rows.length}>
              <Download className="h-3.5 w-3.5" />
              CSV
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close drill-down">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-auto p-5">
          {loading && (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading detail rows...
            </div>
          )}

          {!loading && error && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
          )}

          {!loading && !error && data?.rows.length === 0 && (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No detail rows found for this selection.
            </div>
          )}

          {!loading && !error && data && data.rows.length > 0 && (
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50">
                  <tr>
                    {columns.map((column) => (
                      <th key={column} className="border-b px-3 py-2 text-left font-semibold uppercase tracking-wider text-slate-500">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row, index) => (
                    <tr key={index} className={index % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                      {columns.map((column) => (
                        <td key={column} className="max-w-64 border-b px-3 py-2 text-slate-700">
                          <span className="block truncate" title={formatCell(row[column])}>
                            {formatCell(row[column])}
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function formatCell(value: unknown): string {
  if (typeof value === "number") return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return String(value ?? "");
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}
