"use client";

import { useState, useEffect, useRef } from "react";
import { Dataset, DatasetField, Worksheet, WorkbookConfig, WorkbookSheet, WorksheetConfig, isNumericType } from "@/types";
import { useWorksheetStore } from "@/store/worksheetStore";
import { FieldPanel, FieldCategoryMap, buildDefaultCategoryMap } from "../panels/FieldPanel";
import { ConfigPanel, assignFieldToConfig } from "../panels/ConfigPanel";
import { PreviewPanel } from "../panels/PreviewPanel";
import { WorksheetFilterBar } from "../config/WorksheetFilterBar";
import { WorksheetAIPanel } from "../panels/WorksheetAIPanel";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ArrowLeft, LayoutDashboard, Loader2, Sparkles, Settings2, Plus, Copy, Trash2 } from "lucide-react";
import { generateId } from "@/lib/utils/ids";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { createBlankSheet, normalizeWorkbookConfig } from "@/lib/workbook";

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

interface Props {
  dataset: Dataset;
  initialWorksheet?: Worksheet;
  onSave: (worksheet: Worksheet) => Promise<Worksheet | null>;
  onBack: () => void;
}

export function StepBuild({ dataset, initialWorksheet, onSave, onBack }: Props) {
  const router = useRouter();
  const addDataset = useWorksheetStore((s) => s.addDataset);
  const [workbookName, setWorkbookName] = useState(initialWorksheet?.name ?? "Untitled Workbook");
  const [workbook, setWorkbook] = useState<WorkbookConfig>(() =>
    normalizeWorkbookConfig(initialWorksheet?.config, {
      name: initialWorksheet?.name,
      description: initialWorksheet?.description,
    })
  );
  const [localFields, setLocalFields] = useState<DatasetField[]>(dataset.fields);
  const [categoryMap, setCategoryMap] = useState<FieldCategoryMap>(() => buildDefaultCategoryMap(dataset.fields));
  const [rightPanel,  setRightPanel]  = useState<"config" | "ai">("config");

  const activeSheet = workbook.sheets.find((sheet) => sheet.id === workbook.activeSheetId) ?? workbook.sheets[0];
  const config: WorksheetConfig = activeSheet;
  const title = activeSheet.name;
  const description = activeSheet.description ?? "";

  // ── Auto-save state ───────────────────────────────────────────────
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">(
    initialWorksheet ? "saved" : "idle"
  );
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(
    initialWorksheet?.updatedAt ? new Date(initialWorksheet.updatedAt) : null
  );
  // savedId: DB-assigned worksheet ID once persisted (needed for Add to Canvas link)
  const [savedId, setSavedId] = useState<string | null>(initialWorksheet?.id ?? null);
  // Refs for stale-closure-safe auto-save
  const savedIdRef = useRef<string | null>(initialWorksheet?.id ?? null);
  const autoSaveRef = useRef({ workbook, workbookName });
  const onSaveRef = useRef(onSave);
  const isFirstRender = useRef(true);

  useEffect(() => {
    autoSaveRef.current = { workbook, workbookName };
  }, [workbook, workbookName]);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  // ── Auto-save effect ──────────────────────────────────────────────
  useEffect(() => {
    // Skip the very first render — only save on actual user changes
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    // Don't save a brand-new, completely blank workbook
    const hasAnyConfiguredSheet = workbook.sheets.some((sheet) =>
      sheet.metrics.length > 0 || sheet.dimensions.length > 0 || sheet.name.trim() !== "Sheet 1"
    );
    const isBlankNew = !savedIdRef.current
      && !autoSaveRef.current.workbookName.trim()
      && !hasAnyConfiguredSheet;
    if (isBlankNew) return;

    const timer = setTimeout(async () => {
      const { workbook: c, workbookName: n } = autoSaveRef.current;
      const current = c.sheets.find((sheet) => sheet.id === c.activeSheetId) ?? c.sheets[0];
      const ws: Worksheet = {
        id: savedIdRef.current ?? generateId(),
        name: n.trim() || current?.name || "Untitled Workbook",
        description: current?.description || undefined,
        datasetId: dataset.id,
        config: c,
        createdAt: initialWorksheet?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: "saved",
      };
      setSaveStatus("saving");
      const result = await onSaveRef.current(ws);
      if (result) {
        savedIdRef.current = result.id;
        setSavedId(result.id);
        setLastSavedAt(new Date());
        setSaveStatus("saved");
      } else {
        setSaveStatus("idle");
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [workbook, workbookName, dataset.id, initialWorksheet?.createdAt]);

  function updateActiveSheet(patch: Partial<WorkbookSheet> | WorksheetConfig) {
    setWorkbook((prev) => ({
      ...prev,
      sheets: prev.sheets.map((sheet) =>
        sheet.id === prev.activeSheetId ? { ...sheet, ...patch } : sheet
      ),
    }));
  }

  function setActiveSheetTitle(name: string) {
    updateActiveSheet({ name });
  }

  function setActiveSheetDescription(nextDescription: string) {
    updateActiveSheet({ description: nextDescription || undefined });
  }

  function addSheet() {
    setWorkbook((prev) => {
      const sheet = createBlankSheet(`Sheet ${prev.sheets.length + 1}`);
      return {
        ...prev,
        activeSheetId: sheet.id,
        sheets: [...prev.sheets, sheet],
      };
    });
    setRightPanel("config");
  }

  function duplicateSheet() {
    setWorkbook((prev) => {
      const current = prev.sheets.find((sheet) => sheet.id === prev.activeSheetId) ?? prev.sheets[0];
      const copy: WorkbookSheet = {
        ...current,
        id: generateId(),
        name: `${current.name} Copy`,
      };
      return {
        ...prev,
        activeSheetId: copy.id,
        sheets: [...prev.sheets, copy],
      };
    });
  }

  function deleteActiveSheet() {
    setWorkbook((prev) => {
      if (prev.sheets.length <= 1) return prev;
      const nextSheets = prev.sheets.filter((sheet) => sheet.id !== prev.activeSheetId);
      return {
        ...prev,
        activeSheetId: nextSheets[0].id,
        sheets: nextSheets,
      };
    });
  }

  function handleFieldClick(field: DatasetField) {
    const category = categoryMap[field.name] ?? (isNumericType(field.type) ? "measure" : "dimension");
    updateActiveSheet(assignFieldToConfig(field, config, category));
  }

  function handleFieldTypeChange(updated: DatasetField) {
    const newFields = localFields.map((f) => f.name === updated.name ? updated : f);
    setLocalFields(newFields);
    addDataset({ ...dataset, fields: newFields });
    // Auto-move field to the natural category for the new type
    setCategoryMap((prev) => ({
      ...prev,
      [updated.name]: isNumericType(updated.type) ? "measure" : "dimension",
    }));
    // Update fieldType on any metrics using this field
    updateActiveSheet({
      ...config,
      metrics: config.metrics.map((m) =>
        m.field === updated.name ? { ...m, fieldType: updated.type } : m
      ),
    });
  }

  function handleFieldDescriptionChange(updated: DatasetField) {
    const newFields = localFields.map((f) => f.name === updated.name ? updated : f);
    setLocalFields(newFields);
    // Update store so AI and other components see the new descriptions immediately
    addDataset({ ...dataset, fields: newFields });
    // Persist to server — fire-and-forget; errors are silent (non-critical metadata)
    fetch(`/api/datasets/${dataset.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ fields: newFields }),
    }).catch(() => {});
  }

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-white shrink-0 gap-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 text-muted-foreground shrink-0">
            <ArrowLeft className="h-4 w-4" />
            Change data
          </Button>
          <span className="text-muted-foreground/50 text-sm shrink-0">|</span>
          <input
            value={workbookName}
            onChange={(e) => setWorkbookName(e.target.value)}
            className="min-w-0 max-w-xs flex-1 bg-transparent text-sm font-semibold text-slate-800 outline-none"
            placeholder="Untitled Workbook"
          />
          <span className="text-xs text-muted-foreground truncate">{dataset.fileName}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
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
          {savedId && (
            <Button variant="outline" size="sm" className="gap-2" onClick={() => router.push("/analytics/canvas/new")}>
              <LayoutDashboard className="h-4 w-4" />
              Add to Canvas
            </Button>
          )}
          {/* AI / Configure toggle */}
          <div className="flex items-center rounded-lg border bg-muted/40 p-0.5 gap-0.5">
            <button
              onClick={() => setRightPanel("config")}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all",
                rightPanel === "config"
                  ? "bg-white shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Settings2 className="h-3.5 w-3.5" />
              Configure
            </button>
            <button
              onClick={() => setRightPanel("ai")}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all",
                rightPanel === "ai"
                  ? "bg-brand text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Sparkles className="h-3.5 w-3.5" />
              AI Assist
            </button>
          </div>
        </div>
      </div>

      {/* Filter bar — between top bar and 3-panel layout */}
      <WorksheetFilterBar
        filters={config.filters}
        fields={localFields}
        datasetId={dataset.id}
        onChange={(filters) => updateActiveSheet({ filters })}
      />

      <div className="flex h-10 items-center gap-1 border-b bg-white px-4">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {workbook.sheets.map((sheet) => (
            <button
              key={sheet.id}
              onClick={() => setWorkbook((prev) => ({ ...prev, activeSheetId: sheet.id }))}
              className={cn(
                "h-7 max-w-40 shrink-0 rounded-md px-3 text-xs font-medium transition-colors",
                sheet.id === workbook.activeSheetId
                  ? "bg-brand text-white"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
              title={sheet.name}
            >
              <span className="block truncate">{sheet.name || "Untitled Sheet"}</span>
            </button>
          ))}
          <button
            onClick={addSheet}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Add sheet"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={duplicateSheet}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Duplicate active sheet"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={deleteActiveSheet}
            disabled={workbook.sheets.length <= 1}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
            title="Delete active sheet"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* 3-panel layout */}
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {/* Left: field pills */}
        <div className="flex w-60 shrink-0 flex-col overflow-hidden border-r bg-white">
          <FieldPanel
            fields={localFields}
            fileName={dataset.fileName}
            config={config}
            categoryMap={categoryMap}
            datasetId={dataset.id}
            onFieldClick={handleFieldClick}
            onCategoryChange={setCategoryMap}
            onFieldTypeChange={handleFieldTypeChange}
            onFieldDescriptionChange={handleFieldDescriptionChange}
          />
        </div>

        {/* Center: live preview */}
        <div
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          style={{
            backgroundColor: "#f8fafc",
            backgroundImage: "radial-gradient(circle, #cbd5e1 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }}
        >
          <PreviewPanel datasetId={dataset.id} rowCount={dataset.rowCount ?? 0} config={config} title={title} />
        </div>

        {/* Right: configure or AI assist */}
        <div className="flex w-72 shrink-0 flex-col overflow-hidden border-l bg-white">
          {rightPanel === "ai" ? (
            <WorksheetAIPanel
              datasetId={dataset.id}
              fields={localFields}
              onApply={(cfg, aiTitle, aiDesc) => {
                updateActiveSheet({
                  ...cfg,
                  name: aiTitle || title,
                  description: aiDesc || description || undefined,
                });
                setRightPanel("config");
              }}
              onApplyWorkbook={(generatedSheets) => {
                setWorkbook((prev) => {
                  const sheets: WorkbookSheet[] = generatedSheets.map((generated, index) => ({
                    ...generated.config,
                    id: generateId(),
                    name: generated.title || `Sheet ${index + 1}`,
                    description: generated.description || undefined,
                  }));
                  return {
                    ...prev,
                    activeSheetId: sheets[0].id,
                    sheets,
                  };
                });
                setRightPanel("config");
              }}
            />
          ) : (
            <ConfigPanel
              config={config}
              fields={localFields}
              title={title}
              description={description}
              onTitleChange={setActiveSheetTitle}
              onDescriptionChange={setActiveSheetDescription}
              onChange={updateActiveSheet}
            />
          )}
        </div>
      </div>

    </div>
  );
}
