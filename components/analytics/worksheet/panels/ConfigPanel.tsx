"use client";

import {
  DatasetField, WorksheetConfig, Dimension, Metric,
  AggregationFn, ChartType, SortOrder, isNumericType,
} from "@/types";
import { ChartTypeSelector } from "../config/ChartTypeSelector";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Plus, Hash, Type, Calendar, ChevronDown, ChevronUp, TrendingUp, ArrowUpDown, ToggleLeft } from "lucide-react";
import { generateId } from "@/lib/utils/ids";
import { cn } from "@/lib/utils";
import { useState } from "react";

const AGG_FNS: AggregationFn[] = ["COUNT", "SUM", "AVG", "MIN", "MAX"];

const typeIcon: Record<string, React.ComponentType<{ className?: string }>> = {
  integer:  Hash,
  decimal:  Hash,
  number:   Hash,   // legacy
  string:   Type,
  date:     Calendar,
  datetime: Calendar,
  boolean:  ToggleLeft,
};

const typeChipColor: Record<string, string> = {
  integer:  "bg-brand-tint-100 border-brand-tint-400 text-brand-deep",
  decimal:  "bg-brand-tint-100 border-brand-tint-400 text-brand-deep",
  number:   "bg-brand-tint-100 border-brand-tint-400 text-brand-deep",  // legacy
  string:   "bg-violet-50 border-violet-200 text-violet-700",
  date:     "bg-orange-50 border-orange-200 text-orange-700",
  datetime: "bg-orange-50 border-orange-200 text-orange-700",
  boolean:  "bg-green-50 border-green-200 text-green-700",
};

// ─── Field chip (selected state) ─────────────────────────────────

function FieldChip({
  name, type, onRemove,
}: {
  name: string; type?: string; onRemove: () => void;
}) {
  const Icon = typeIcon[type ?? "string"] ?? Type;
  const color = typeChipColor[type ?? "string"] ?? typeChipColor.string;
  return (
    <div className={cn("flex h-7 min-w-0 items-center gap-1.5 rounded-md border px-2 text-xs font-medium", color)}>
      <Icon className="h-3 w-3 shrink-0" />
      <span className="truncate max-w-[118px]">{name}</span>
      <button
        onClick={onRemove}
        className="ml-0.5 shrink-0 opacity-50 hover:opacity-100 transition-opacity"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

// ─── Axis section ─────────────────────────────────────────────────

function AxisSection({
  label,
  accentColor,
  isEmpty,
  children,
  onAdd,
  addLabel,
  collapsible,
}: {
  label: string;
  accentColor: string;
  isEmpty: boolean;
  children: React.ReactNode;
  onAdd?: () => void;
  addLabel?: string;
  collapsible?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-100 bg-white">
      <div className={cn("flex h-8 items-center justify-between px-3", accentColor)}>
        <div className="flex items-center gap-2">
          {collapsible && (
            <button onClick={() => setCollapsed((c) => !c)} className="opacity-60 hover:opacity-100">
              {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
            </button>
          )}
          <p className="text-[10px] font-bold uppercase tracking-widest">{label}</p>
        </div>
        {onAdd && (
          <button onClick={onAdd} className="flex items-center gap-0.5 text-[10px] font-semibold opacity-70 hover:opacity-100 transition-opacity">
            <Plus className="h-3 w-3" /> {addLabel ?? "Add"}
          </button>
        )}
      </div>
      {!collapsed && (
        <div className="bg-white p-2.5">
          {isEmpty ? (
            <p className="py-2 text-center text-[11px] text-muted-foreground/50">Drop a field here</p>
          ) : (
            children
          )}
        </div>
      )}
    </div>
  );
}

// ─── Metric row ───────────────────────────────────────────────────

function MetricRow({
  metric, field, onUpdate, onRemove,
}: {
  metric: Metric;
  field?: DatasetField;
  onUpdate: (patch: Partial<Metric>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-lg border border-slate-100 bg-white p-2">
      <div className="flex items-center gap-1.5">
        <FieldChip name={metric.field} type={field?.type} onRemove={onRemove} />
        <div className="min-w-0 flex-1">
          <input
            value={metric.label}
            onChange={(e) => onUpdate({ label: e.target.value })}
            placeholder="Series label"
            className="h-7 w-full truncate border-0 bg-transparent px-1 text-[11px] text-muted-foreground outline-none placeholder:text-muted-foreground/40 focus:text-slate-700"
          />
        </div>
        <Select
          value={metric.aggregation}
          onValueChange={(v) => v && onUpdate({ aggregation: v as AggregationFn, label: `${v} of ${metric.field}` })}
        >
          <SelectTrigger className="h-7 w-[68px] shrink-0 border-brand-tint-400 bg-brand-tint-100 text-xs font-semibold text-brand-deep">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AGG_FNS.map((fn) => <SelectItem key={fn} value={fn} className="text-xs">{fn}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// Chart types that support a continuous Y axis (log scale applicable)
const LOG_SCALE_CHART_TYPES: ChartType[] = ["bar", "grouped_bar", "line", "area"];

const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: "natural",    label: "Default order" },
  { value: "value_desc", label: "Value ↓ (Highest first)" },
  { value: "value_asc",  label: "Value ↑ (Lowest first)" },
  { value: "top_5",      label: "Top 5" },
  { value: "top_10",     label: "Top 10" },
  { value: "top_20",     label: "Top 20" },
  { value: "alpha_asc",  label: "A → Z (Alphabetical)" },
  { value: "alpha_desc", label: "Z → A (Reverse alpha)" },
];

// ─── Chart-type context ───────────────────────────────────────────

function axisLabels(chartType: ChartType) {
  switch (chartType) {
    case "pie":   return { x: "Slice By (Category)", y: "Value", multiY: false };
    case "kpi":   return { x: null, y: "KPI Values", multiY: true };
    case "table": return { x: "Row Label", y: "Value Columns", multiY: true };
    case "grouped_bar": return { x: "X Axis (Category)", y: "Y Axis (Values)", multiY: true };
    case "map":   return { x: "Country / Region (name or ISO code)", y: "Value", multiY: false };
    default:      return { x: "X Axis", y: "Y Axis", multiY: true };
  }
}

// ─── Main ConfigPanel ─────────────────────────────────────────────

interface Props {
  config: WorksheetConfig;
  fields: DatasetField[];
  title: string;
  description: string;
  onTitleChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onChange: (config: WorksheetConfig) => void;
}

export function ConfigPanel({
  config, fields, title, description,
  onTitleChange, onDescriptionChange, onChange,
}: Props) {
  const ax = axisLabels(config.chartType);

  function removeDimension(id: string) {
    onChange({ ...config, dimensions: config.dimensions.filter((d) => d.id !== id) });
  }

  function addMetric(fieldName: string) {
    const f = fields.find((x) => x.name === fieldName);
    const agg: AggregationFn = f && isNumericType(f.type) ? "SUM" : "COUNT";
    const metric: Metric = {
      id: generateId(), field: fieldName, aggregation: agg,
      label: `${agg} of ${fieldName}`,
    };
    onChange({ ...config, metrics: [...config.metrics, metric] });
  }
  function updateMetric(id: string, patch: Partial<Metric>) {
    onChange({ ...config, metrics: config.metrics.map((m) => m.id === id ? { ...m, ...patch } : m) });
  }
  function removeMetric(id: string) {
    onChange({ ...config, metrics: config.metrics.filter((m) => m.id !== id) });
  }

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="border-b bg-slate-50/70 px-4 py-3">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Configure</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Title & description */}
        <div className="space-y-3 border-b px-4 py-3">
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Title</label>
            <Input
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="e.g. Projects by State"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Description <span className="font-normal normal-case text-muted-foreground/60">(optional)</span>
            </label>
            <Input
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder="Short description of this chart"
              className="h-8 text-sm"
            />
          </div>
        </div>

        {/* Chart type */}
        <div className="border-b px-4 py-3">
          <ChartTypeSelector
            value={config.chartType}
            onChange={(chartType) => onChange({ ...config, chartType })}
          />
        </div>

        <div className="space-y-2.5 px-4 py-3">
          {/* X Axis / Slice By — supports multiple dimensions */}
          {ax.x && (
            <AxisSection
              label={ax.x}
              accentColor="bg-violet-50 text-violet-700 border-violet-100"
              isEmpty={config.dimensions.length === 0}
            >
              <div className="flex flex-wrap gap-1.5">
                {config.dimensions.map((dim) => {
                  const f = fields.find((ff) => ff.name === dim.field);
                  return (
                    <FieldChip
                      key={dim.id}
                      name={dim.field}
                      type={f?.type}
                      onRemove={() => removeDimension(dim.id)}
                    />
                  );
                })}
              </div>
            </AxisSection>
          )}

          {/* Y Axis / Values */}
          <AxisSection
            label={ax.y}
            accentColor="bg-brand-tint-100 text-brand-deep border-brand-tint-200"
            isEmpty={config.metrics.length === 0}
            onAdd={ax.multiY ? () => {
              const firstNumeric = fields.find((f) => isNumericType(f.type) && !config.metrics.some(m => m.field === f.name));
              const fallback = fields.find((f) => !config.metrics.some(m => m.field === f.name));
              const target = firstNumeric ?? fallback;
              if (target) addMetric(target.name);
            } : undefined}
            addLabel="Add series"
            collapsible={config.metrics.length > 2}
          >
            <div className="space-y-1.5">
              {config.metrics.map((m) => (
                <MetricRow
                  key={m.id}
                  metric={m}
                  field={fields.find((f) => f.name === m.field)}
                  onUpdate={(patch) => updateMetric(m.id, patch)}
                  onRemove={() => removeMetric(m.id)}
                />
              ))}
            </div>
          </AxisSection>

          {/* Log scale toggle — only for continuous-axis charts */}
          {LOG_SCALE_CHART_TYPES.includes(config.chartType) && (
            <div className="flex h-11 items-center justify-between rounded-lg border border-slate-100 bg-white px-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                <div>
                  <p className="text-xs font-medium text-slate-700">Logarithmic scale</p>
                  <p className="text-[10px] leading-tight text-muted-foreground/70">For wide value ranges</p>
                </div>
              </div>
              <button
                onClick={() => onChange({ ...config, logScale: !config.logScale })}
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none",
                  config.logScale ? "bg-brand" : "bg-input"
                )}
                role="switch"
                aria-checked={config.logScale}
              >
                <span
                  className={cn(
                    "pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform",
                    config.logScale ? "translate-x-4" : "translate-x-0"
                  )}
                />
              </button>
            </div>
          )}

          {/* Sort */}
          {config.chartType !== "kpi" && (
            <div className="flex h-11 items-center justify-between gap-3 rounded-lg border border-slate-100 bg-white px-3">
              <div className="flex items-center gap-2">
                <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                <div>
                  <p className="text-xs font-medium text-slate-700">Sort</p>
                  <p className="text-[10px] leading-tight text-muted-foreground/70">Order results</p>
                </div>
              </div>
              <Select
                value={config.sort ?? "natural"}
                onValueChange={(v) => v && onChange({ ...config, sort: v as SortOrder })}
              >
                <SelectTrigger className="h-7 w-32 shrink-0 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="text-xs">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ─── Smart field-click assignment (category-aware) ───────────────

import type { FieldCategory } from "../panels/FieldPanel";

export function assignFieldToConfig(
  field: DatasetField,
  config: WorksheetConfig,
  category: FieldCategory,
): WorksheetConfig {
  const isMeasure = category === "measure";

  // KPI — all fields become metrics
  if (config.chartType === "kpi") {
    const agg: AggregationFn = isMeasure ? "SUM" : "COUNT";
    return {
      ...config,
      metrics: [...config.metrics, { id: generateId(), field: field.name, aggregation: agg, label: `${agg} of ${field.name}` }],
    };
  }

  // Pie / Map: dimension → category (single only), measure → value (single only)
  if (config.chartType === "pie" || config.chartType === "map") {
    if (isMeasure) {
      const agg: AggregationFn = "SUM";
      return { ...config, metrics: [{ id: generateId(), field: field.name, aggregation: agg, label: `${agg} of ${field.name}` }] };
    } else {
      const dim: Dimension = { id: generateId(), field: field.name, label: field.name };
      return { ...config, dimensions: [dim] }; // map/pie only supports one location/slice field
    }
  }

  // Measure → Y axis (append as new metric series)
  if (isMeasure) {
    const agg: AggregationFn = isNumericType(field.type) ? "SUM" : "COUNT";
    return {
      ...config,
      metrics: [...config.metrics, { id: generateId(), field: field.name, aggregation: agg, label: `${agg} of ${field.name}` }],
    };
  }

  // Dimension → X axis — append (skip if already present, like Y axis does for duplicates)
  if (config.dimensions.some((d) => d.field === field.name)) return config;
  const dim: Dimension = { id: generateId(), field: field.name, label: field.name };
  return { ...config, dimensions: [...config.dimensions, dim] };
}
