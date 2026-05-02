"use client";

import { useState, useEffect, useCallback } from "react";
import { DatasetField, FieldType, Filter, FilterOperator, ActiveSmartFilters, isNumericType, isDateType } from "@/types";
import { groupFieldsByCategory } from "@/lib/data/filters";
import { getDatasetSmartFilters } from "@/lib/data/smart-filters";
import { generateId } from "@/lib/utils/ids";
import { Accordion } from "@base-ui/react/accordion";
import { Slider } from "@base-ui/react/slider";
import { X, ChevronDown, Search, Check, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Date presets ──────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear();
const DATE_PRESETS = [
  { label: "This Year",  years: [String(CURRENT_YEAR)] },
  { label: "Last Year",  years: [String(CURRENT_YEAR - 1)] },
  { label: "Last 3 Yrs", years: Array.from({ length: 3 }, (_, i) => String(CURRENT_YEAR - i)) },
  { label: "Last 5 Yrs", years: Array.from({ length: 5 }, (_, i) => String(CURRENT_YEAR - i)) },
];

// ── Filter[] helpers ──────────────────────────────────────────────

function getMultiSelected(field: string, filters: Filter[]): string[] {
  const f = filters.find(
    (x) => x.field === field && (x.operator === "in" || x.operator === "equals")
  );
  if (!f) return [];
  if (f.operator === "in" && Array.isArray(f.value)) return f.value as string[];
  if (f.operator === "equals" && typeof f.value === "string") return [f.value];
  return [];
}

function getRange(field: string, filters: Filter[]): { min?: number; max?: number } {
  const gte = filters.find((f) => f.field === field && (f.operator === "gte" || f.operator === "gt"));
  const lte = filters.find((f) => f.field === field && (f.operator === "lte" || f.operator === "lt"));
  return {
    min: gte ? Number(gte.value) : undefined,
    max: lte ? Number(lte.value) : undefined,
  };
}

function isFieldActive(field: string, fieldType: FieldType, filters: Filter[]): boolean {
  if (isNumericType(fieldType)) {
    const { min, max } = getRange(field, filters);
    return min !== undefined || max !== undefined;
  }
  if (isDateType(fieldType)) {
    return filters.some((f) =>
      f.field === field &&
      (f.operator === "gte" || f.operator === "gt" || f.operator === "lte" || f.operator === "lt")
    );
  }
  return getMultiSelected(field, filters).length > 0;
}

function applyMultiSelect(field: string, values: string[], existing: Filter[]): Filter[] {
  const others = existing.filter((f) => f.field !== field);
  if (values.length === 0) return others;
  return [
    ...others,
    { id: generateId(), field, operator: "in" as FilterOperator, value: values, label: field },
  ];
}

function applyRange(
  field: string,
  min: number | undefined,
  max: number | undefined,
  existing: Filter[]
): Filter[] {
  const others = existing.filter((f) => f.field !== field);
  const next: Filter[] = [...others];
  if (min !== undefined)
    next.push({ id: generateId(), field, operator: "gte" as FilterOperator, value: min, label: field });
  if (max !== undefined)
    next.push({ id: generateId(), field, operator: "lte" as FilterOperator, value: max, label: field });
  return next;
}

function clearField(field: string, existing: Filter[]): Filter[] {
  return existing.filter((f) => f.field !== field);
}

// ── FieldControl ──────────────────────────────────────────────────

interface FieldControlProps {
  field: DatasetField;
  filters: Filter[];
  onChange: (filters: Filter[]) => void;
  fieldValues: Record<string, string[]>;
  loadingValues: string | null;
  fieldRanges: Record<string, { min: number; max: number }>;
  loadingRanges: boolean;
  fieldSearch: Record<string, string>;
  onSearchChange: (field: string, val: string) => void;
}

function FieldControl({
  field,
  filters,
  onChange,
  fieldValues,
  loadingValues,
  fieldRanges,
  loadingRanges,
  fieldSearch,
  onSearchChange,
}: FieldControlProps) {
  const isActive = isFieldActive(field.name, field.type, filters);

  if (isNumericType(field.type)) {
    const range = fieldRanges[field.name];
    const dataMin = range?.min ?? 0;
    const dataMax = range?.max ?? 100;
    const current = getRange(field.name, filters);
    const curMin = current.min !== undefined ? current.min : dataMin;
    const curMax = current.max !== undefined ? current.max : dataMax;

    return (
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
            {field.name}
          </p>
          {isActive && (
            <button
              onClick={() => onChange(clearField(field.name, filters))}
              className="text-[10px] text-brand hover:underline"
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
            <Slider.Root
              value={[curMin, curMax] as readonly number[]}
              min={dataMin}
              max={dataMax}
              minStepsBetweenValues={0}
              onValueChange={(value) => {
                const vals = value as readonly number[];
                onChange(applyRange(field.name, vals[0], vals[1], filters));
              }}
              className="relative flex w-full touch-none items-center py-1"
            >
              <Slider.Control className="relative flex w-full items-center">
                <Slider.Track className="relative h-1.5 w-full rounded-full bg-gray-200">
                  <Slider.Indicator className="absolute h-full rounded-full bg-brand" />
                  <Slider.Thumb className="block h-4 w-4 rounded-full border-2 border-brand bg-white shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-brand/30 data-[dragging]:scale-110" />
                  <Slider.Thumb className="block h-4 w-4 rounded-full border-2 border-brand bg-white shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-brand/30 data-[dragging]:scale-110" />
                </Slider.Track>
              </Slider.Control>
            </Slider.Root>

            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>{dataMin.toLocaleString()}</span>
              <span>{dataMax.toLocaleString()}</span>
            </div>

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
    const gteFilter = filters.find(
      (f) => f.field === field.name && (f.operator === "gte" || f.operator === "gt")
    );
    const lteFilter = filters.find(
      (f) => f.field === field.name && (f.operator === "lte" || f.operator === "lt")
    );
    const currentFrom = gteFilter ? String(gteFilter.value) : "";
    const currentTo   = lteFilter ? String(lteFilter.value) : "";

    function setDateRange(from: string, to: string) {
      const others = filters.filter(
        (f) =>
          !(
            f.field === field.name &&
            (f.operator === "gte" || f.operator === "gt" ||
             f.operator === "lte" || f.operator === "lt")
          )
      );
      const next = [...others];
      if (from) next.push({ id: generateId(), field: field.name, operator: "gte" as FilterOperator, value: from, label: field.name });
      if (to)   next.push({ id: generateId(), field: field.name, operator: "lte" as FilterOperator, value: to,   label: field.name });
      onChange(next);
    }

    return (
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
            {field.name}
          </p>
          {isActive && (
            <button
              onClick={() => onChange(clearField(field.name, filters))}
              className="text-[10px] text-brand hover:underline"
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
                  setDateRange(`${years[0]}-01-01`, `${years[years.length - 1]}-12-31`)
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
              value={currentFrom}
              onChange={(e) => setDateRange(e.target.value, currentTo)}
              className="w-full h-7 px-2 text-xs border border-gray-200 rounded-lg outline-none focus:border-brand transition-colors"
            />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">To</p>
            <input
              type="date"
              value={currentTo}
              onChange={(e) => setDateRange(currentFrom, e.target.value)}
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
  const selected = getMultiSelected(field.name, filters);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
          {field.name}
        </p>
        {selected.length > 0 && (
          <button
            onClick={() => onChange(clearField(field.name, filters))}
            className="text-[10px] text-brand hover:underline"
          >
            Clear ({selected.length})
          </button>
        )}
      </div>

      {/* Search */}
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
                    onChange(applyMultiSelect(field.name, next, filters));
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

export interface WorksheetFilterDrawerProps {
  open: boolean;
  onClose: () => void;
  filters: Filter[];
  fields: DatasetField[];
  datasetId: string;
  onChange: (filters: Filter[]) => void;
  /** Smart analytical filter state */
  activeSmartFilters?: ActiveSmartFilters;
  onSmartFiltersChange?: (ids: ActiveSmartFilters) => void;
}

export function WorksheetFilterDrawer({
  open,
  onClose,
  filters,
  fields,
  datasetId,
  onChange,
  activeSmartFilters = [],
  onSmartFiltersChange,
}: WorksheetFilterDrawerProps) {
  const [fieldValues, setFieldValues] = useState<Record<string, string[]>>({});
  const [loadingValues, setLoadingValues] = useState<string | null>(null);
  const [fieldRanges, setFieldRanges] = useState<Record<string, { min: number; max: number }>>({});
  const [loadingRanges, setLoadingRanges] = useState(false);
  const [fieldSearch, setFieldSearch] = useState<Record<string, string>>({});

  const groupedFields = groupFieldsByCategory(fields);
  const smartFilters = getDatasetSmartFilters(fields);
  const activeCount = fields.filter((f) => isFieldActive(f.name, f.type, filters)).length + activeSmartFilters.length;

  // ── Fetch min/max for number fields when drawer opens ─────────────
  useEffect(() => {
    if (!open || !datasetId) return;
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
      body: JSON.stringify({ datasetId, metrics, dimensions: [] }),
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
  }, [open, datasetId, fields.map((f) => f.name).join(",")]);

  // ── Fetch values for string/date fields (lazy, cached) ────────────
  const fetchValues = useCallback(
    async (field: string) => {
      if (fieldValues[field] !== undefined || !datasetId) return;
      setLoadingValues(field);
      try {
        const vals: string[] = await fetch(
          `/api/datasets/${datasetId}/values?field=${encodeURIComponent(field)}`
        )
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => []);
        setFieldValues((prev) => ({ ...prev, [field]: vals.sort() }));
      } finally {
        setLoadingValues(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [datasetId, JSON.stringify(Object.keys(fieldValues))]
  );

  function prefetchSection(sectionFields: DatasetField[]) {
    for (const f of sectionFields) {
      if (!isNumericType(f.type)) fetchValues(f.name);
    }
  }

  const defaultOpen = groupedFields
    .filter(
      (g) =>
        g.fields.some((f) => isFieldActive(f.name, f.type, filters)) ||
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
            <h2 className="font-semibold text-sm text-gray-900">Sheet filter</h2>
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

        {/* Tab row */}
        <div className="px-5 border-b border-gray-100 shrink-0 flex gap-5">
          <button className="py-2.5 text-sm font-semibold text-brand border-b-2 border-brand -mb-px">
            Filter
          </button>
        </div>

        {/* Accordion body */}
        <div className="flex-1 overflow-y-auto">
          {/* ── Smart Filters section ──────────────────────────────── */}
          {smartFilters.length > 0 && onSmartFiltersChange && (
            <div className="border-b border-gray-100">
              <Accordion.Root
                multiple
                defaultValue={activeSmartFilters.length > 0 ? ["smart-filters"] : []}
              >
                <Accordion.Item value="smart-filters" className="border-0">
                  <Accordion.Header className="flex">
                    <Accordion.Trigger className="flex flex-1 items-center justify-between px-5 py-3.5 text-sm font-medium text-gray-700 hover:bg-muted/40 transition-colors group data-[panel-open]:text-gray-900">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                        <span>Smart Filters</span>
                        {activeSmartFilters.length > 0 && (
                          <span className="text-[10px] bg-amber-500 text-white px-1.5 py-0.5 rounded-full font-bold leading-none">
                            {activeSmartFilters.length}
                          </span>
                        )}
                      </div>
                      <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[panel-open]:rotate-180" />
                    </Accordion.Trigger>
                  </Accordion.Header>
                  <Accordion.Panel className="px-5 pb-5 pt-1 space-y-1 overflow-hidden">
                    {smartFilters.map((sf) => {
                      const isActive = activeSmartFilters.includes(sf.id);
                      return (
                        <button
                          key={sf.id}
                          onClick={() => {
                            const next = isActive
                              ? activeSmartFilters.filter((id) => id !== sf.id)
                              : [...activeSmartFilters, sf.id];
                            onSmartFiltersChange(next);
                          }}
                          className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-muted text-left transition-colors"
                        >
                          <div
                            className={cn(
                              "h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0 transition-colors",
                              isActive
                                ? "bg-amber-500 border-amber-500"
                                : "border-gray-300"
                            )}
                          >
                            {isActive && (
                              <Check className="h-2.5 w-2.5 text-white" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-gray-700 truncate">
                              {sf.label}
                            </p>
                            <p className="text-[10px] text-muted-foreground/70 leading-tight">
                              {sf.description}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </Accordion.Panel>
                </Accordion.Item>
              </Accordion.Root>
            </div>
          )}

          {groupedFields.length === 0 && smartFilters.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-10">
              No filterable fields
            </p>
          ) : (
            <Accordion.Root
              multiple
              defaultValue={defaultOpen}
              onValueChange={(openValues) => {
                for (const cat of openValues as string[]) {
                  const group = groupedFields.find((g) => g.category === cat);
                  if (group) prefetchSection(group.fields);
                }
              }}
            >
              {groupedFields.map(({ category, label, fields: gFields }) => {
                const sectionActiveCount = gFields.filter((f) =>
                  isFieldActive(f.name, f.type, filters)
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
                          filters={filters}
                          onChange={onChange}
                          fieldValues={fieldValues}
                          loadingValues={loadingValues}
                          fieldRanges={fieldRanges}
                          loadingRanges={loadingRanges}
                          fieldSearch={fieldSearch}
                          onSearchChange={(name, val) =>
                            setFieldSearch((prev) => ({ ...prev, [name]: val }))
                          }
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
            onClick={() => {
              onChange([]);
              onSmartFiltersChange?.([]);
            }}
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
