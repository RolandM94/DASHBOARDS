"use client";

import { useState } from "react";
import { DatasetField, Filter, ActiveSmartFilters, isNumericType, isDateType } from "@/types";
import { SlidersHorizontal, Plus, X, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { WorksheetFilterDrawer } from "./WorksheetFilterDrawer";
import { getDatasetSmartFilterMap } from "@/lib/data/smart-filters";
import { generateId } from "@/lib/utils/ids";

interface WorksheetFilterBarProps {
  filters: Filter[];
  fields: DatasetField[];
  datasetId: string;
  onChange: (filters: Filter[]) => void;
  /** Smart analytical filter state */
  activeSmartFilters?: ActiveSmartFilters;
  onSmartFiltersChange?: (ids: ActiveSmartFilters) => void;
}

// ── Derive active fields and build chip labels ────────────────────

function formatDateChip(iso: string): string {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function getActiveFields(fields: DatasetField[], filters: Filter[]) {
  return fields.filter((f) => {
    if (isNumericType(f.type) || isDateType(f.type)) {
      return filters.some(
        (x) => x.field === f.name && (x.operator === "gte" || x.operator === "lte" || x.operator === "gt" || x.operator === "lt")
      );
    }
    return filters.some(
      (x) => x.field === f.name && (x.operator === "in" || x.operator === "equals")
    );
  });
}

function fieldChipLabel(field: DatasetField, filters: Filter[]): string {
  if (isDateType(field.type)) {
    const gte = filters.find((f) => f.field === field.name && (f.operator === "gte" || f.operator === "gt"));
    const lte = filters.find((f) => f.field === field.name && (f.operator === "lte" || f.operator === "lt"));
    const parts: string[] = [];
    if (gte) parts.push(`from ${formatDateChip(String(gte.value))}`);
    if (lte) parts.push(`to ${formatDateChip(String(lte.value))}`);
    return `${field.name}: ${parts.join(" ")}`;
  }
  if (isNumericType(field.type)) {
    const gte = filters.find((f) => f.field === field.name && (f.operator === "gte" || f.operator === "gt"));
    const lte = filters.find((f) => f.field === field.name && (f.operator === "lte" || f.operator === "lt"));
    const parts: string[] = [];
    if (gte) parts.push(`≥ ${Number(gte.value).toLocaleString()}`);
    if (lte) parts.push(`≤ ${Number(lte.value).toLocaleString()}`);
    return `${field.name}: ${parts.join(" ")}`;
  }
  const f = filters.find(
    (x) => x.field === field.name && (x.operator === "in" || x.operator === "equals")
  );
  if (!f) return field.name;
  if (f.operator === "in" && Array.isArray(f.value)) {
    return f.value.length === 1
      ? `${field.name}: ${f.value[0]}`
      : `${field.name}: ${f.value.length} selected`;
  }
  return `${field.name}: ${f.value}`;
}

// ── Component ─────────────────────────────────────────────────────

export function WorksheetFilterBar({
  filters,
  fields,
  datasetId,
  onChange,
  activeSmartFilters,
  onSmartFiltersChange,
}: WorksheetFilterBarProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const smartFilterMap = getDatasetSmartFilterMap(fields);
  const smartFilterIds = activeSmartFilters ?? filters
    .filter((f) => f.field === "_smart" && typeof f.value === "string")
    .map((f) => f.value as string);
  const updateSmartFilters = onSmartFiltersChange ?? ((ids: ActiveSmartFilters) => {
    const regularFilters = filters.filter((f) => f.field !== "_smart");
    onChange([
      ...regularFilters,
      ...ids.map((id) => ({
        id: generateId(),
        field: "_smart",
        operator: "equals" as const,
        value: id,
        label: smartFilterMap.get(id)?.label ?? "Smart Filter",
      })),
    ]);
  });

  const activeFields = getActiveFields(fields, filters);
  const hasActive = activeFields.length > 0 || smartFilterIds.length > 0;

  if (fields.length === 0) return null;

  return (
    <>
      <div className="px-4 py-2 bg-white border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Icon */}
          <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

          {/* Active filter chips */}
          {activeFields.map((f) => (
            <button
              key={f.name}
              onClick={() => setDrawerOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-tint-100 border border-brand/20 text-brand-deep text-xs font-medium hover:bg-brand-tint-200 transition-colors"
            >
              <span>{fieldChipLabel(f, filters)}</span>
              <span
                role="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(filters.filter((x) => x.field !== f.name));
                }}
                className="flex items-center hover:opacity-60 transition-opacity"
              >
                <X className="h-3 w-3" />
              </span>
            </button>
          ))}

          {/* Smart filter chips */}
          {smartFilterIds.map((sfId) => {
            const def = smartFilterMap.get(sfId);
            return (
              <button
                key={`smart-${sfId}`}
                onClick={() => setDrawerOpen(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium hover:bg-amber-100 transition-colors"
              >
                <Sparkles className="h-3 w-3 shrink-0" />
                <span>{def?.label ?? sfId}</span>
                <span
                  role="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    updateSmartFilters(smartFilterIds.filter((id) => id !== sfId));
                  }}
                  className="flex items-center hover:opacity-60 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </span>
              </button>
            );
          })}

          {/* Add Filter button */}
          <button
            onClick={() => setDrawerOpen(true)}
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-colors",
              drawerOpen
                ? "border-brand bg-brand-tint-100 text-brand-deep"
                : "border-dashed border-gray-300 text-gray-500 hover:border-brand hover:text-brand"
            )}
          >
            <Plus className="h-3 w-3" />
            Add Filter
          </button>

          {/* Clear all */}
          {hasActive && (
            <button
              onClick={() => onChange([])}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors ml-1"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* Slide-in filter drawer */}
      <WorksheetFilterDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        filters={filters}
        fields={fields}
        datasetId={datasetId}
        onChange={onChange}
        activeSmartFilters={smartFilterIds}
        onSmartFiltersChange={updateSmartFilters}
      />
    </>
  );
}
