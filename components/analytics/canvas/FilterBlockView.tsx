"use client";

import { useState } from "react";
import { FilterBlockConfig, ActiveGlobalFilters, GlobalFilterValue } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, X, Filter } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  block: FilterBlockConfig;
  allValues: string[];
  activeFilters: ActiveGlobalFilters;
  onFilterChange: (field: string, value: GlobalFilterValue) => void;
  readOnly?: boolean;
}

function MultiSelectDropdown({
  label,
  values,
  selected,
  onChange,
}: {
  label: string;
  values: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);

  function toggle(v: string) {
    if (selected.includes(v)) onChange(selected.filter((x) => x !== v));
    else onChange([...selected, v]);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-1.5 h-8 px-3 rounded-lg border text-sm transition-colors",
          selected.length > 0
            ? "border-brand bg-brand-tint-100 text-brand-deep"
            : "border-input bg-transparent hover:bg-muted"
        )}
      >
        <Filter className="h-3.5 w-3.5" />
        <span>{label}</span>
        {selected.length > 0 && (
          <Badge className="h-4 text-[10px] px-1.5 bg-brand text-white">{selected.length}</Badge>
        )}
        <ChevronDown className="h-3.5 w-3.5 ml-0.5" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1 left-0 z-50 bg-white border rounded-xl shadow-lg min-w-[180px] max-h-64 overflow-y-auto">
            <div className="p-2 border-b flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">{label}</span>
              {selected.length > 0 && (
                <button
                  onClick={() => { onChange([]); setOpen(false); }}
                  className="text-xs text-brand hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="p-1">
              {values.slice(0, 100).map((v) => (
                <label
                  key={v}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted cursor-pointer text-sm"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(v)}
                    onChange={() => toggle(v)}
                    className="h-3.5 w-3.5 rounded"
                  />
                  <span className="truncate">{v}</span>
                </label>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function FilterBlockView({ block, allValues, activeFilters, onFilterChange, readOnly }: Props) {
  const currentValue = activeFilters[block.field];

  // ── Read-only display (published dashboard) ───────────────────────
  if (readOnly) {
    const active = Array.isArray(currentValue)
      ? currentValue
      : currentValue
      ? [String(currentValue)]
      : [];
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-muted-foreground">{block.label}:</span>
        {active.length === 0 ? (
          <span className="text-xs text-muted-foreground/50 italic">All</span>
        ) : (
          active.map((v) => (
            <Badge key={v} variant="secondary" className="text-xs">{v}</Badge>
          ))
        )}
      </div>
    );
  }

  // ── Multi-select ─────────────────────────────────────────────────
  if (block.filterType === "multi_select") {
    const selected = Array.isArray(currentValue) ? currentValue : [];
    return (
      <div className="flex items-center gap-2">
        <MultiSelectDropdown
          label={block.label}
          values={allValues}
          selected={selected}
          onChange={(v) => onFilterChange(block.field, v)}
        />
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {selected.map((v) => (
              <Badge key={v} variant="secondary" className="text-xs gap-1 pr-1">
                {v}
                <button onClick={() => onFilterChange(block.field, selected.filter((x) => x !== v))}>
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Dropdown (single select) ──────────────────────────────────────
  const single = typeof currentValue === "string" ? currentValue : "";
  return (
    <div className="flex items-center gap-2">
      <Select
        value={single || undefined}
        onValueChange={(v) => v && onFilterChange(block.field, v)}
      >
        <SelectTrigger className="h-8 text-sm min-w-[140px]">
          <div className="flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <SelectValue placeholder={block.label} />
          </div>
        </SelectTrigger>
        <SelectContent>
          {allValues.map((v) => (
            <SelectItem key={v} value={v} className="text-sm">{v}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {single && (
        <Button variant="ghost" size="icon" className="h-7 w-7"
          onClick={() => onFilterChange(block.field, "")}>
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
