"use client";

import { useState } from "react";
import { DropZone } from "../upload/DropZone";
import { parseFile } from "@/lib/parsers";
import { Dataset } from "@/types";
import { AlertCircle, CheckCircle2, Loader2, Database, Leaf, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorksheetStore } from "@/store/worksheetStore";

const BATCH_SIZE = 500;
const CONCURRENCY = 5;

interface Props {
  onParsed: (dataset: Dataset, file?: File) => void;
}

export function StepUpload({ onParsed }: Props) {
  const [loading, setLoading] = useState(false);
  const [percent, setPercent] = useState(0);
  const [phase, setPhase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    dataset: Dataset;
    file: File;
    expected: number;
    saved: number;
  } | null>(null);

  const datasets   = useWorksheetStore((s) => s.datasets);
  const dsHydrated = useWorksheetStore((s) => s.hydrated);

  // Own + seed datasets only (not shared-with-me — user can't build off those)
  const pickable = datasets.filter(
    (d) => !d.accessType || d.accessType === "own" || d.isSeed || d.accessType === "seed"
  );

  async function handleFile(file: File) {
    setError(null);
    setSuccess(null);
    setLoading(true);
    setPercent(0);
    setPhase("Parsing file…");

    try {
      const { rows, fields } = await parseFile(file);
      const totalRows = rows.length;

      // ── Phase 1: create dataset metadata ──────────────────────────
      setPhase("Saving dataset…");
      const metaRes = await fetch("/api/datasets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, fields, rowCount: totalRows }),
      });

      if (!metaRes.ok) {
        const { error: e } = await metaRes.json();
        throw new Error(e ?? "Failed to create dataset");
      }

      const saved = await metaRes.json();
      const datasetId: string = saved.id;

      // ── Phase 2: parallel batch upload ────────────────────────────
      const batches: { chunk: typeof rows; startIndex: number }[] = [];
      for (let i = 0; i < totalRows; i += BATCH_SIZE) {
        batches.push({ chunk: rows.slice(i, i + BATCH_SIZE), startIndex: i });
      }

      let completed = 0;
      setPhase(`Uploading rows…`);
      setPercent(0);

      for (let i = 0; i < batches.length; i += CONCURRENCY) {
        const window = batches.slice(i, i + CONCURRENCY);

        await Promise.all(
          window.map(async ({ chunk, startIndex }) => {
            const res = await fetch(`/api/datasets/${datasetId}/rows`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ rows: chunk, startIndex }),
            });
            if (!res.ok) {
              const body = await res.json().catch(() => ({}));
              throw new Error(body.error ?? "Failed to upload batch");
            }
            completed++;
            setPercent(Math.round((completed / batches.length) * 100));
          })
        );
      }

      // ── Phase 3: verify saved row count ───────────────────────────
      setPhase("Verifying…");
      setPercent(100);

      const verifyRes = await fetch(`/api/datasets/${datasetId}/rows`);
      const { count: savedCount } = verifyRes.ok
        ? await verifyRes.json()
        : { count: 0 };

      const dataset: Dataset = {
        id: datasetId,
        fileName: saved.file_name ?? file.name,
        uploadedAt: saved.uploaded_at ?? new Date().toISOString(),
        fields: saved.fields ?? fields,
        rowCount: totalRows,
      };

      setSuccess({ dataset, file, expected: totalRows, saved: savedCount });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload file");
    } finally {
      setLoading(false);
      setPhase(null);
    }
  }

  // If upload succeeded, show the result banner before proceeding
  if (success) {
    const allGood = success.saved >= success.expected;
    return (
      <div className="max-w-xl mx-auto w-full space-y-4">
        <div
          className={`rounded-xl border p-5 space-y-3 ${
            allGood
              ? "bg-green-50 border-green-200"
              : "bg-amber-50 border-amber-200"
          }`}
        >
          <div className="flex items-start gap-3">
            {allGood ? (
              <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            )}
            <div>
              <p className={`font-semibold text-sm ${allGood ? "text-green-800" : "text-amber-800"}`}>
                {allGood
                  ? `All ${success.saved.toLocaleString()} rows uploaded successfully`
                  : `Upload incomplete — ${success.saved.toLocaleString()} of ${success.expected.toLocaleString()} rows saved`}
              </p>
              <p className={`text-xs mt-0.5 ${allGood ? "text-green-700" : "text-amber-700"}`}>
                {allGood
                  ? `${success.file.name} is ready to use`
                  : "Please try uploading the file again"}
              </p>
            </div>
          </div>
        </div>

        {allGood ? (
          <Button
            className="w-full"
            onClick={() => onParsed(success.dataset, success.file)}
          >
            Continue to Build Workbook
          </Button>
        ) : (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setSuccess(null)}
          >
            Try Again
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto w-full space-y-6">
      {/* Upload new */}
      <div className="space-y-4">
        <div className="text-center space-y-1">
          <h2 className="text-xl font-semibold">Upload your data</h2>
          <p className="text-sm text-muted-foreground">
            Upload a CSV or Excel file — up to 100,000+ rows supported
          </p>
        </div>

        <div data-tour-id="upload-dropzone">
          <DropZone onFile={handleFile} loading={loading} />
        </div>

        {/* Progress bar */}
        {loading && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                {phase}
              </span>
              <span className="tabular-nums font-medium">{percent}%</span>
            </div>
            <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-brand rounded-full transition-all duration-200"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-lg px-4 py-3">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
      </div>

      {/* Existing datasets */}
      {dsHydrated && pickable.length > 0 && (
        <>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="flex-1 h-px bg-border" />
            <span>or choose from your library</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <div className="space-y-2">
            {pickable.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => onParsed(d)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border bg-white hover:border-brand hover:bg-brand/5 transition-all text-left group"
              >
                <div className="h-8 w-8 shrink-0 rounded-lg bg-sky-50 flex items-center justify-center">
                  {d.isSeed || d.accessType === "seed"
                    ? <Leaf className="h-4 w-4 text-brand" />
                    : <Database className="h-4 w-4 text-sky-500" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{d.fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.rowCount?.toLocaleString() ?? "?"} rows
                    {(d.isSeed || d.accessType === "seed") && " · Sample dataset"}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-brand transition-colors shrink-0" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
