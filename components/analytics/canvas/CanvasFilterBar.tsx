"use client";

import { useState } from "react";
import { DatasetField, ActiveGlobalFilters, ActiveSmartFilters, DateRangeValue, GlobalFilterValue, NumericRangeValue, FieldType, isNumericType, isDateType } from "@/types";
import { isNumericRange, isDateRange, hasActiveFilterValue } from "@/lib/data/filters";
import { getDatasetSmartFilterMap } from "@/lib/data/smart-filters";
import { SlidersHorizontal, Plus, X, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { CanvasFilterDrawer } from "./CanvasFilterDrawer";

export interface CanvasFilterBarProps {
  canvasFields: DatasetField[];
  datasetIds: string[];
  activeFilters: ActiveGlobalFilters;
  onFilterChange: (field: string, value: GlobalFilterValue) => void;
  onClearAll: () => void;
  fieldWidgetCounts?: Record<string, number>;
  dashboardId?: string;
  /** Smart analytical filter state */
  activeSmartFilters?: ActiveSmartFilters;
  onSmartFiltersChange?: (ids: ActiveSmartFilters) => void;
}

// ── Chip label ────────────────────────────────────────────────────

function formatDateChip(iso: string): string {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function chipLabel(field: string, value: GlobalFilterValue): string {
  if (Array.isArray(value)) {
    return value.length === 1
      ? `${field}: ${value[0]}`
      : `${field}: ${value.length} selected`;
  }
  if (isNumericRange(value)) {
    const parts: string[] = [];
    if (value.min !== undefined) parts.push(`≥ ${value.min.toLocaleString()}`);
    if (value.max !== undefined) parts.push(`≤ ${value.max.toLocaleString()}`);
    return `${field}: ${parts.join(" ")}`;
  }
  if (isDateRange(value)) {
    const parts: string[] = [];
    if (value.from) parts.push(`from ${formatDateChip(value.from)}`);
    if (value.to)   parts.push(`to ${formatDateChip(value.to)}`);
    return `${field}: ${parts.join(" ")}`;
  }
  return `${field}: ${value}`;
}

function clearValue(fieldType: FieldType): GlobalFilterValue {
  if (isNumericType(fieldType)) return {} as NumericRangeValue;
  if (isDateType(fieldType)) return {} as DateRangeValue;
  return [];
}

// ── Component ─────────────────────────────────────────────────────

export function CanvasFilterBar({
  canvasFields,
  datasetIds,
  activeFilters,
  onFilterChange,
  onClearAll,
  fieldWidgetCounts,
  dashboardId,
  activeSmartFilters = [],
  onSmartFiltersChange,
}: CanvasFilterBarProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const smartFilterMap = getDatasetSmartFilterMap(canvasFields);

  const activeEntries = canvasFields.filter((f) =>
    hasActiveFilterValue(activeFilters[f.name])
  );
  const hasActive = activeEntries.length > 0 || activeSmartFilters.length > 0;

  if (canvasFields.length === 0) return null;

  return (
    <>
      <div className="px-6 py-2 bg-white border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Icon */}
          <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

          {/* Active filter chips */}
          {activeEntries.map((f) => {
            const value = activeFilters[f.name];
            return (
              <button
                key={f.name}
                onClick={() => setDrawerOpen(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-tint-100 border border-brand/20 text-brand-deep text-xs font-medium hover:bg-brand-tint-200 transition-colors"
              >
                <span>{chipLabel(f.name, value)}</span>
                <span
                  role="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFilterChange(f.name, clearValue(f.type));
                  }}
                  className="flex items-center hover:opacity-60 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </span>
              </button>
            );
          })}

          {/* Smart filter chips */}
          {activeSmartFilters.map((sfId) => {
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
                    onSmartFiltersChange?.(activeSmartFilters.filter((id) => id !== sfId));
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
              onClick={onClearAll}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors ml-1"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* Slide-in filter drawer */}
      <CanvasFilterDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        fields={canvasFields}
        datasetIds={datasetIds}
        activeFilters={activeFilters}
        onFilterChange={onFilterChange}
        onClearAll={() => {
          onClearAll();
          onSmartFiltersChange?.([]);
          setDrawerOpen(false);
        }}
        fieldWidgetCounts={fieldWidgetCounts}
        dashboardId={dashboardId}
        activeSmartFilters={activeSmartFilters}
        onSmartFiltersChange={onSmartFiltersChange}
      />
    </>
  );
}
