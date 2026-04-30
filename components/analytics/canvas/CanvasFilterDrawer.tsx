"use client";

import { useState, useEffect, useCallback } from "react";
import { DatasetField, ActiveGlobalFilters, DateRangeValue, GlobalFilterValue, NumericRangeValue, isNumericType, isDateType } from "@/types";
import { isNumericRange, isDateRange, groupFieldsByCategory } from "@/lib/data/filters";
import { Accordion } from "@base-ui/react/accordion";
import { Slider } from "@base-ui/react/slider";
import { X, ChevronDown, Search, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Date presets ──────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear();
const DATE_PRESETS = [
  { label: "This Year",  years: [String(CURRENT_YEAR)] },
  { label: "Last Year",  years: [String(CURRENT_YEAR - 1)] },
  { label: "Last 3 Yrs", years: Array.from({ length: 3 }, (_, i) => String(CURRENT_YEAR - i)) },
  { label: "Last 5 Yrs", years: Array.from({ length: 5 }, (_, i) => String(CURRENT_YEAR - i)) },
];

// ── Helpers ───────────────────────────────────────────────────────

function hasActiveValue(v: GlobalFilterValue | undefined): boolean {
  if (v === undefined) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (isNumericRange(v)) return v.min !== undefined || v.max !== undefined;
  if (isDateRange(v)) return v.from !== undefined || v.to !== undefined;
  return v !== "";
}

function getSelected(activeFilters: ActiveGlobalFilters, field: string): string[] {
  const v = activeFilters[field];
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v !== "") return [v];
  return [];
}

// ── FieldControl ──────────────────────────────────────────────────

interface FieldControlProps {
  field: DatasetField;
  activeFilters: ActiveGlobalFilters;
  onFilterChange: (field: string, value: GlobalFilterValue) => void;
  fieldValues: Record<string, string[]>;
  loadingValues: string | null;
  fieldRanges: Record<string, { min: number; max: number }>;
  loadingRanges: boolean;
  fieldSearch: Record<string, string>;
  onSearchChange: (field: string, val: string) => void;
  widgetCount?: number;
}

function FieldControl({
  field,
  activeFilters,
  onFilterChange,
  fieldValues,
  loadingValues,
  fieldRanges,
  loadingRanges,
  fieldSearch,
  onSearchChange,
  widgetCount,
}: FieldControlProps) {
  const isActive = hasActiveValue(activeFilters[field.name]);

  if (isNumericType(field.type)) {
    const range = fieldRanges[field.name];
    const dataMin = range?.min ?? 0;
    const dataMax = range?.max ?? 100;
    const v = activeFilters[field.name];
    const curMin = isNumericRange(v) && v.min !== undefined ? v.min : dataMin;
    const curMax = isNumericRange(v) && v.max !== undefined ? v.max : dataMax;

    return (
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 truncate">
              {field.name}
            </p>
            {widgetCount !== undefined && widgetCount > 0 && (
              <span className="shrink-0 text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-medium leading-none">
                {widgetCount}w
              </span>
            )}
          </div>
          {isActive && (
            <button
              onClick={() => onFilterChange(field.name, {} as NumericRangeValue)}
              className="text-[10px] text-brand hover:underline shrink-0 ml-2"
            >
              Reset
            </button>
          )}
        </div>
        {loadingRanges && !range ? (
          <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Loading range…</span>
          </div>
        ) : (
          <>
            {/* Slider */}
            <Slider.Root
              value={[curMin, curMax] as readonly number[]}
              min={dataMin}
              max={dataMax}
              minStepsBetweenValues={0}
              onValueChange={(value) => {
                const vals = value as readonly number[];
                onFilterChange(field.name, { min: vals[0], max: vals[1] } as NumericRangeValue);
              }}
              className="relative flex w-full touch-none items-center py-1"
            >
              <Slider.Control className="relative flex w-full items-center">
                <Slider.Track className="relative h-1.5 w-full rounded-full bg-gray-200">
                  <Slider.Indicator className="absolute h-full rounded-full bg-brand" />
                  <Slider.Thumb
                    className="block h-4 w-4 rounded-full border-2 border-brand bg-white shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand/30 data-[dragging]:scale-110"
                  />
                  <Slider.Thumb
                    className="block h-4 w-4 rounded-full border-2 border-brand bg-white shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand/30 data-[dragging]:scale-110"
                  />
                </Slider.Track>
              </Slider.Control>
            </Slider.Root>

            {/* Value labels */}
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>{dataMin.toLocaleString()}</span>
              <span>{dataMax.toLocaleString()}</span>
            </div>

            {/* Selected range display */}
            {isActive && (
              <div className="flex justify-between text-xs font-medium text-brand">
                <span>{curMin.toLocaleString()}</span>
                <span>{curMax.toLocaleString()}</span>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // ── Date field — date range picker ───────────────────────────────
  if (isDateType(field.type)) {
    const v = activeFilters[field.name];
    const dateRange: DateRangeValue = isDateRange(v) ? (v as DateRangeValue) : {};

    function setDateRange(patch: Partial<DateRangeValue>) {
      const next = { ...dateRange, ...patch };
      if (patch.from === undefined && "from" in patch) delete next.from;
      if (patch.to === undefined && "to" in patch) delete next.to;
      onFilterChange(field.name, next as DateRangeValue);
    }

    return (
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 truncate">
              {field.name}
            </p>
            {widgetCount !== undefined && widgetCount > 0 && (
              <span className="shrink-0 text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-medium leading-none">
                {widgetCount}w
              </span>
            )}
          </div>
          {isActive && (
            <button
              onClick={() => onFilterChange(field.name, {} as DateRangeValue)}
              className="text-[10px] text-brand hover:underline shrink-0 ml-2"
            >
              Reset
            </button>
          )}
        </div>

        {/* Year presets */}
        <div className="flex flex-wrap gap-1">
          {DATE_PRESETS.map((preset) => {
            const years = [...preset.years].sort();
            return (
              <button
                key={preset.label}
                onClick={() =>
                  onFilterChange(field.name, {
                    from: `${years[0]}-01-01`,
                    to: `${years[years.length - 1]}-12-31`,
                  } as DateRangeValue)
                }
                className="px-2 py-0.5 text-[10px] rounded-full border border-gray-200 hover:border-brand hover:text-brand transition-colors"
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        {/* Date inputs */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">From</p>
            <input
              type="date"
              value={dateRange.from ?? ""}
              onChange={(e) =>
                setDateRange({ from: e.target.value || undefined })
              }
              className="w-full h-7 px-2 text-xs border border-gray-200 rounded-lg outline-none focus:border-brand transition-colors"
            />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">To</p>
            <input
              type="date"
              value={dateRange.to ?? ""}
              onChange={(e) =>
                setDateRange({ to: e.target.value || undefined })
              }
              className="w-full h-7 px-2 text-xs border border-gray-200 rounded-lg outline-none focus:border-brand transition-colors"
            />
          </div>
        </div>
      </div>
    );
  }

  // ── String — multi-select checkbox list ───────────────────────────
  const rawValues = fieldValues[field.name] ?? [];
  const search = fieldSearch[field.name] ?? "";
  const displayValues = search
    ? rawValues.filter((v) => v.toLowerCase().includes(search.toLowerCase()))
    : rawValues;
  const selected = getSelected(activeFilters, field.name);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 truncate">
            {field.name}
          </p>
          {widgetCount !== undefined && widgetCount > 0 && (
            <span className="shrink-0 text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-medium leading-none">
              {widgetCount}w
            </span>
          )}
        </div>
        {selected.length > 0 && (
          <button
            onClick={() => onFilterChange(field.name, [])}
            className="text-[10px] text-brand hover:underline shrink-0 ml-2"
          >
            Clear ({selected.length})
          </button>
        )}
      </div>

      {/* Search (only if many values) */}
      {rawValues.length > 8 && (
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
          <input
            value={search}
            onChange={(e) => onSearchChange(field.name, e.target.value)}
            className="w-full pl-7 pr-2 h-7 text-xs border border-gray-200 rounded-lg outline-none focus:border-brand transition-colors"
            placeholder="Search…"
          />
        </div>
      )}

      {/* Checkbox list */}
      <div className="max-h-36 overflow-y-auto rounded-lg border border-gray-100">
        {loadingValues === field.name ? (
          <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading…
          </div>
        ) : displayValues.length === 0 ? (
          <p className="text-xs text-muted-foreground px-3 py-3 text-center">
            {search ? "No matches" : "No values"}
          </p>
        ) : (
          <div className="p-1">
            {displayValues.map((v) => {
              const checked = selected.includes(v);
              return (
                <button
                  key={v}
                  onClick={() => {
                    const next = checked
                      ? selected.filter((x) => x !== v)
                      : [...selected, v];
                    onFilterChange(field.name, next);
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted text-left text-xs transition-colors"
                >
                  <div
                    className={cn(
                      "h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0 transition-colors",
                      checked ? "bg-brand border-brand" : "border-gray-300"
                    )}
                  >
                    {checked && <Check className="h-2.5 w-2.5 text-white" />}
                  </div>
                  <span className="truncate">{v}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main drawer ───────────────────────────────────────────────────

export interface CanvasFilterDrawerProps {
  open: boolean;
  onClose: () => void;
  fields: DatasetField[];
  datasetIds: string[];
  activeFilters: ActiveGlobalFilters;
  onFilterChange: (field: string, value: GlobalFilterValue) => void;
  onClearAll: () => void;
  fieldWidgetCounts?: Record<string, number>;
  dashboardId?: string;
}

export function CanvasFilterDrawer({
  open,
  onClose,
  fields,
  datasetIds,
  activeFilters,
  onFilterChange,
  onClearAll,
  fieldWidgetCounts,
  dashboardId,
}: CanvasFilterDrawerProps) {
  const [fieldValues, setFieldValues] = useState<Record<string, string[]>>({});
  const [loadingValues, setLoadingValues] = useState<string | null>(null);
  const [fieldRanges, setFieldRanges] = useState<Record<string, { min: number; max: number }>>({});
  const [loadingRanges, setLoadingRanges] = useState(false);
  const [fieldSearch, setFieldSearch] = useState<Record<string, string>>({});

  const groupedFields = groupFieldsByCategory(fields);
  const activeCount = fields.filter((f) => hasActiveValue(activeFilters[f.name])).length;

  // ── Fetch min/max for all number fields when drawer opens ─────────
  useEffect(() => {
    if (!open || datasetIds.length === 0) return;
    const numberFields = fields.filter((f) => isNumericType(f.type));
    const unfetched = numberFields.filter((f) => !fieldRanges[f.name]);
    if (unfetched.length === 0) return;

    setLoadingRanges(true);
    const metrics = unfetched.flatMap((f) => [
      { id: `min-${f.name}`, field: f.name, aggregation: "MIN" as const, label: `${f.name}__min` },
      { id: `max-${f.name}`, field: f.name, aggregation: "MAX" as const, label: `${f.name}__max` },
    ]);

    fetch("/api/aggregate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ datasetId: datasetIds[0], metrics, dimensions: [], dashboardId }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((result) => {
        if (!result?.data?.[0]) return;
        const row = result.data[0] as Record<string, unknown>;
        const ranges: Record<string, { min: number; max: number }> = {};
        for (const f of unfetched) {
          const minVal = Number(row[`${f.name}__min`] ?? 0);
          const maxVal = Number(row[`${f.name}__max`] ?? 100);
          if (!isNaN(minVal) && !isNaN(maxVal) && maxVal > minVal) {
            ranges[f.name] = { min: minVal, max: maxVal };
          }
        }
        setFieldRanges((prev) => ({ ...prev, ...ranges }));
      })
      .catch(() => {})
      .finally(() => setLoadingRanges(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, datasetIds.join(","), fields.map((f) => f.name).join(","), dashboardId]);

  // ── Fetch values for string/date fields ───────────────────────────
  const fetchValues = useCallback(
    async (field: string) => {
      if (fieldValues[field] !== undefined || datasetIds.length === 0) return;
      setLoadingValues(field);
      try {
        const seen = new Set<string>();
        await Promise.all(
          datasetIds.map((id) =>
            fetch(`/api/datasets/${id}/values?field=${encodeURIComponent(field)}${dashboardId ? `&dashboardId=${encodeURIComponent(dashboardId)}` : ""}`)
              .then((r) => (r.ok ? r.json() : []))
              .then((vals: string[]) => vals.forEach((v) => seen.add(v)))
              .catch(() => {})
          )
        );
        setFieldValues((prev) => ({ ...prev, [field]: Array.from(seen).sort() }));
      } finally {
        setLoadingValues(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [datasetIds.join(","), JSON.stringify(Object.keys(fieldValues)), dashboardId]
  );

  // Fetch string/date values for fields in a section when it opens
  function prefetchSection(sectionFields: DatasetField[]) {
    for (const f of sectionFields) {
      if (!isNumericType(f.type)) fetchValues(f.name);
    }
  }

  // Default: open sections that have active filters, plus "financial" as fallback
  const defaultOpen = groupedFields
    .filter(
      (g) =>
        g.fields.some((f) => hasActiveValue(activeFilters[f.name])) ||
        g.category === "financial"
    )
    .map((g) => g.category);

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 bg-black/30 z-40 transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Slide-in panel */}
      <div
        className={cn(
          "fixed right-0 top-0 bottom-0 w-80 bg-white shadow-2xl z-50 flex flex-col transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 shrink-0 flex items-start justify-between">
          <div>
            <h2 className="font-semibold text-sm text-gray-900">Dashboard filter</h2>
            {activeCount > 0 ? (
              <p className="text-xs text-brand mt-0.5 font-medium">
                {activeCount} Active filter{activeCount !== 1 ? "s" : ""}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground/60 mt-0.5">No active filters</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab row — "Filter" is the only live tab */}
        <div className="px-5 border-b border-gray-100 shrink-0 flex gap-5">
          <button className="py-2.5 text-sm font-semibold text-brand border-b-2 border-brand -mb-px">
            Filter
          </button>
        </div>

        {/* Accordion body */}
        <div className="flex-1 overflow-y-auto">
          {groupedFields.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-10">
              No filterable fields
            </p>
          ) : (
            <Accordion.Root
              multiple
              defaultValue={defaultOpen}
              onValueChange={(openValues) => {
                // Prefetch values for newly opened sections
                for (const cat of openValues as string[]) {
                  const group = groupedFields.find((g) => g.category === cat);
                  if (group) prefetchSection(group.fields);
                }
              }}
            >
              {groupedFields.map(({ category, label, fields: gFields }) => {
                const sectionActiveCount = gFields.filter((f) =>
                  hasActiveValue(activeFilters[f.name])
                ).length;
                return (
                  <Accordion.Item
                    key={category}
                    value={category}
                    className="border-b border-gray-100 last:border-0"
                    onOpenChange={(isOpen) => {
                      if (isOpen) prefetchSection(gFields);
                    }}
                  >
                    <Accordion.Header className="flex">
                      <Accordion.Trigger className="flex flex-1 items-center justify-between px-5 py-3.5 text-sm font-medium text-gray-700 hover:bg-muted/40 transition-colors group data-[panel-open]:text-gray-900">
                        <div className="flex items-center gap-2">
                          <span>{label} filter</span>
                          {sectionActiveCount > 0 && (
                            <span className="text-[10px] bg-brand text-white px-1.5 py-0.5 rounded-full font-bold leading-none">
                              {sectionActiveCount}
                            </span>
                          )}
                        </div>
                        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[panel-open]:rotate-180" />
                      </Accordion.Trigger>
                    </Accordion.Header>

                    <Accordion.Panel className="px-5 pb-5 pt-1 space-y-5 overflow-hidden">
                      {gFields.map((f) => (
                        <FieldControl
                          key={f.name}
                          field={f}
                          activeFilters={activeFilters}
                          onFilterChange={onFilterChange}
                          fieldValues={fieldValues}
                          loadingValues={loadingValues}
                          fieldRanges={fieldRanges}
                          loadingRanges={loadingRanges}
                          fieldSearch={fieldSearch}
                          onSearchChange={(name, val) =>
                            setFieldSearch((prev) => ({ ...prev, [name]: val }))
                          }
                          widgetCount={fieldWidgetCounts?.[f.name]}
                        />
                      ))}
                    </Accordion.Panel>
                  </Accordion.Item>
                );
              })}
            </Accordion.Root>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 shrink-0">
          <button
            onClick={onClearAll}
            disabled={activeCount === 0}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Clear All
          </button>
        </div>
      </div>
    </>
  );
}
