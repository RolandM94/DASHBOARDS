"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Dataset, DatasetField, FieldType, Worksheet } from "@/types";
import { FIELD_TYPE_LABELS } from "@/types";
import { useWorksheetStore } from "@/store/worksheetStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpDown,
  Database,
  Loader2,
} from "lucide-react";

type SortDirection = "asc" | "desc";

interface CompatStats {
  total: number;
  incompatible: number;
  examples: string[];
}

interface PendingTypeChange {
  field: DatasetField;
  type: FieldType | "default";
  stats?: CompatStats;
}

interface Props {
  dataset: Dataset;
}

const ROW_LIMIT = 1000;
const TYPE_OPTIONS: Array<FieldType | "default"> = [
  "default",
  "integer",
  "decimal",
  "string",
  "date",
  "datetime",
];

function sortValue(value: unknown): string | number {
  if (value == null) return "";
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  const numeric = Number(value);
  if (String(value).trim() !== "" && Number.isFinite(numeric)) return numeric;
  const date = Date.parse(String(value));
  if (Number.isFinite(date)) return date;
  return String(value).toLocaleLowerCase();
}

function formatValue(value: unknown): string {
  if (value == null || value === "") return "-";
  if (typeof value === "number") return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function currentTypeValue(field: DatasetField): FieldType | "default" {
  return !field.inferredType || field.type === field.inferredType ? "default" : field.type;
}

function typeLabel(field: DatasetField, value: FieldType | "default"): string {
  if (value !== "default") return FIELD_TYPE_LABELS[value];
  const inferred = field.inferredType ? FIELD_TYPE_LABELS[field.inferredType] : FIELD_TYPE_LABELS[field.type];
  return `Default (${inferred})`;
}

export function DatasetTableView({ dataset }: Props) {
  const addDataset = useWorksheetStore((s) => s.addDataset);
  const updateWorksheet = useWorksheetStore((s) => s.updateWorksheet);
  const liveDataset = useWorksheetStore((s) => s.getDatasetById(dataset.id)) ?? dataset;

  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [changingField, setChangingField] = useState<string | null>(null);
  const [pendingChange, setPendingChange] = useState<PendingTypeChange | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);

    fetch(`/api/datasets/${dataset.id}/rows?preview=true&limit=${ROW_LIMIT}`, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error ?? "Failed to load dataset rows");
        }
        return res.json() as Promise<{ rows: Record<string, unknown>[] }>;
      })
      .then((data) => setRows(data.rows ?? []))
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load dataset rows");
      })
      .finally(() => setLoading(false));

    return () => ctrl.abort();
  }, [dataset.id]);

  const sortedRows = useMemo(() => {
    if (!sortField) return rows;
    return [...rows].sort((a, b) => {
      const av = sortValue(a[sortField]);
      const bv = sortValue(b[sortField]);
      if (av < bv) return sortDirection === "asc" ? -1 : 1;
      if (av > bv) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [rows, sortDirection, sortField]);

  function handleSort(field: string) {
    if (sortField === field) {
      setSortDirection((prev) => prev === "asc" ? "desc" : "asc");
      return;
    }
    setSortField(field);
    setSortDirection("asc");
  }

  async function applyTypeChange(field: DatasetField, newType: FieldType | "default", force = false) {
    setChangingField(field.name);
    try {
      const res = await fetch(
        `/api/datasets/${liveDataset.id}/fields/${encodeURIComponent(field.name)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newType, ...(force ? { force: true } : {}) }),
        }
      );

      if (res.status === 409) {
        const body = await res.json().catch(() => ({})) as { stats?: CompatStats };
        setPendingChange({ field, type: newType, stats: body.stats });
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setError(body.error ?? "Failed to update field type");
        return;
      }

      const body = await res.json() as { fields: DatasetField[]; updatedWorksheets?: Worksheet[] };
      addDataset({ ...liveDataset, fields: body.fields });
      body.updatedWorksheets?.forEach((worksheet) => {
        updateWorksheet(worksheet.id, worksheet);
      });
      setPendingChange(null);
    } catch {
      setError("Network error while updating field type");
    } finally {
      setChangingField(null);
    }
  }

  const rowSummary = liveDataset.rowCount
    ? `${Math.min(rows.length, ROW_LIMIT).toLocaleString()} of ${liveDataset.rowCount.toLocaleString()} rows loaded`
    : `${rows.length.toLocaleString()} rows loaded`;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-slate-50">
      <div className="shrink-0 border-b bg-white">
        <div className="flex min-w-0 items-center justify-between gap-4 px-5 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/home">
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
                <ArrowLeft className="h-4 w-4" />
                Home
              </Button>
            </Link>
            <div className="h-8 w-8 shrink-0 rounded-lg bg-sky-50 flex items-center justify-center">
              <Database className="h-4 w-4 text-sky-500" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold text-slate-900">{liveDataset.fileName}</h1>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                <span>{rowSummary}</span>
                <span className="text-muted-foreground/40">|</span>
                <span>{liveDataset.fields.length} fields</span>
              </div>
            </div>
          </div>
          <Badge variant="secondary" className="shrink-0 text-[11px]">
            Data table
          </Badge>
        </div>
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-hidden p-4">
        <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-white shadow-sm">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-destructive">
              {error}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No rows found for this dataset.
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_0_#e5e7eb]">
                  <tr>
                    {liveDataset.fields.map((field) => {
                      const active = sortField === field.name;
                      const SortIcon = active
                        ? sortDirection === "asc" ? ArrowUp : ArrowDown
                        : ArrowUpDown;

                      return (
                        <th
                          key={field.name}
                          className="min-w-40 border-r bg-white px-3 py-2 text-left align-top last:border-r-0"
                        >
                          <button
                            type="button"
                            onClick={() => handleSort(field.name)}
                            className="flex h-5 w-full items-center justify-between gap-3 text-left text-[11px] font-bold uppercase text-slate-600 hover:text-slate-950"
                          >
                            <span className="truncate">{field.name}</span>
                            <SortIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          </button>
                          <Select
                            value={currentTypeValue(field)}
                            disabled={changingField === field.name}
                            onValueChange={(value) => applyTypeChange(field, value as FieldType | "default")}
                          >
                            <SelectTrigger
                              size="sm"
                              className="mt-1 h-6 w-full justify-between rounded-md border-slate-200 px-2 text-[11px] text-muted-foreground"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent align="start">
                              <SelectGroup>
                                <SelectLabel>Data type</SelectLabel>
                                {TYPE_OPTIONS.map((type) => (
                                  <SelectItem key={type} value={type} className="text-xs">
                                    {typeLabel(field, type)}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-b odd:bg-white even:bg-slate-50/60 hover:bg-brand-tint-100/30">
                      {liveDataset.fields.map((field) => (
                        <td key={field.name} className="max-w-72 border-r px-3 py-2 text-slate-700 last:border-r-0">
                          <span className="block truncate" title={formatValue(row[field.name])}>
                            {formatValue(row[field.name])}
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
      </div>

      <Dialog open={pendingChange !== null} onOpenChange={(nextOpen) => !nextOpen && setPendingChange(null)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Incompatible values detected</DialogTitle>
            <DialogDescription>
              {pendingChange?.stats ? (
                <>
                  <strong>{pendingChange.stats.incompatible}</strong> of{" "}
                  <strong>{pendingChange.stats.total}</strong> rows cannot be converted to{" "}
                  <strong>{pendingChange ? typeLabel(pendingChange.field, pendingChange.type) : "the selected type"}</strong>.
                  {pendingChange.stats.examples.length > 0 && (
                    <span className="mt-2 block rounded bg-muted px-2 py-1.5 font-mono text-xs">
                      e.g. {pendingChange.stats.examples.slice(0, 3).join(", ")}
                    </span>
                  )}
                </>
              ) : (
                "Some values may not convert cleanly to the selected type."
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingChange(null)} disabled={changingField !== null}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!pendingChange || changingField !== null}
              onClick={() => pendingChange && applyTypeChange(pendingChange.field, pendingChange.type, true)}
            >
              {changingField ? "Changing..." : "Change anyway"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
