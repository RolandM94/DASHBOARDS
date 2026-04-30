"use client";

import { useReducer, useState, useEffect, useRef } from "react";
import { Dataset, DatasetField, Worksheet, WorksheetConfig, isNumericType } from "@/types";
import { useWorksheetStore } from "@/store/worksheetStore";
import { FieldPanel, FieldCategoryMap, buildDefaultCategoryMap } from "../panels/FieldPanel";
import { ConfigPanel, assignFieldToConfig } from "../panels/ConfigPanel";
import { PreviewPanel } from "../panels/PreviewPanel";
import { WorksheetFilterBar } from "../config/WorksheetFilterBar";
import { WorksheetAIPanel } from "../panels/WorksheetAIPanel";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ArrowLeft, LayoutDashboard, Loader2, Sparkles, Settings2 } from "lucide-react";
import { generateId } from "@/lib/utils/ids";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const initialConfig: WorksheetConfig = {
  metrics: [],
  dimensions: [],
  filters: [],
  chartType: "bar",
};

function configReducer(_state: WorksheetConfig, update: WorksheetConfig): WorksheetConfig {
  return update;
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
  const [config, dispatch] = useReducer(configReducer, initialWorksheet?.config ?? initialConfig);
  const [title, setTitle] = useState(initialWorksheet?.name ?? "");
  const [description, setDescription] = useState(initialWorksheet?.description ?? "");
  const [localFields, setLocalFields] = useState<DatasetField[]>(dataset.fields);
  const [categoryMap, setCategoryMap] = useState<FieldCategoryMap>(() => buildDefaultCategoryMap(dataset.fields));
  const [rightPanel,  setRightPanel]  = useState<"config" | "ai">("config");

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
  const autoSaveRef = useRef({ config, title, description });
  autoSaveRef.current = { config, title, description };
  const isFirstRender = useRef(true);

  // ── Auto-save effect ──────────────────────────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    // Skip the very first render — only save on actual user changes
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    // Don't save a brand-new, completely blank worksheet
    const isBlankNew = !savedIdRef.current
      && !autoSaveRef.current.title.trim()
      && config.metrics.length === 0
      && config.dimensions.length === 0;
    if (isBlankNew) return;

    const timer = setTimeout(async () => {
      const { config: c, title: t, description: d } = autoSaveRef.current;
      const ws: Worksheet = {
        id: savedIdRef.current ?? generateId(),
        name: t.trim() || "Untitled Worksheet",
        description: d.trim() || undefined,
        datasetId: dataset.id,
        config: c,
        createdAt: initialWorksheet?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: "saved",
      };
      setSaveStatus("saving");
      const result = await onSave(ws);
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
  }, [config, title, description]);

  function handleFieldClick(field: DatasetField) {
    const category = categoryMap[field.name] ?? (isNumericType(field.type) ? "measure" : "dimension");
    dispatch(assignFieldToConfig(field, config, category));
  }

  function handleFieldTypeChange(updated: DatasetField) {
    setLocalFields((prev) => prev.map((f) => f.name === updated.name ? updated : f));
    // Auto-move field to the natural category for the new type
    setCategoryMap((prev) => ({
      ...prev,
      [updated.name]: isNumericType(updated.type) ? "measure" : "dimension",
    }));
    // Update fieldType on any metrics using this field
    dispatch({
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
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 text-muted-foreground shrink-0">
            <ArrowLeft className="h-4 w-4" />
            Change data
          </Button>
          <span className="text-muted-foreground/50 text-sm shrink-0">|</span>
          <span className="text-sm text-muted-foreground truncate">{dataset.fileName}</span>
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
        onChange={(filters) => dispatch({ ...config, filters })}
      />

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
                dispatch(cfg);
                if (aiTitle) setTitle(aiTitle);
                if (aiDesc)  setDescription(aiDesc);
                setRightPanel("config");
              }}
            />
          ) : (
            <ConfigPanel
              config={config}
              fields={localFields}
              title={title}
              description={description}
              onTitleChange={setTitle}
              onDescriptionChange={setDescription}
              onChange={dispatch}
            />
          )}
        </div>
      </div>

    </div>
  );
}
