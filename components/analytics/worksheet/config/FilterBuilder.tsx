"use client";

import { DatasetField, Filter, FilterOperator } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, X } from "lucide-react";
import { generateId } from "@/lib/utils/ids";
import { useState } from "react";

const OPERATORS: { value: FilterOperator; label: string }[] = [
  { value: "equals", label: "=" },
  { value: "not_equals", label: "≠" },
  { value: "contains", label: "contains" },
  { value: "in", label: "in" },
  { value: "gt", label: ">" },
  { value: "gte", label: "≥" },
  { value: "lt", label: "<" },
  { value: "lte", label: "≤" },
];

interface Props {
  filters: Filter[];
  fields: DatasetField[];
  onChange: (filters: Filter[]) => void;
}

function FilterRow({
  filter,
  fields,
  onUpdate,
  onRemove,
}: {
  filter: Filter;
  fields: DatasetField[];
  onUpdate: (patch: Partial<Filter>) => void;
  onRemove: () => void;
}) {
  const [multiInput, setMultiInput] = useState("");
  const field = fields.find((f) => f.name === filter.field);
  const isMulti = filter.operator === "in";
  const multiValues = Array.isArray(filter.value) ? (filter.value as string[]) : [];

  function addMultiValue() {
    if (!multiInput.trim()) return;
    onUpdate({ value: [...multiValues, multiInput.trim()] });
    setMultiInput("");
  }

  function removeMultiValue(v: string) {
    onUpdate({ value: multiValues.filter((x) => x !== v) });
  }

  return (
    <div className="bg-muted/50 rounded-lg p-2 space-y-1.5">
      <div className="flex gap-1.5 items-center">
        <Select value={filter.field} onValueChange={(v) => v && onUpdate({ field: v, value: "" })}>
          <SelectTrigger className="h-7 text-xs flex-1">
            <SelectValue placeholder="Field" />
          </SelectTrigger>
          <SelectContent>
            {fields.map((f) => <SelectItem key={f.name} value={f.name} className="text-xs">{f.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filter.operator} onValueChange={(v) => v && onUpdate({ operator: v as FilterOperator, value: isMulti ? [] : "" })}>
          <SelectTrigger className="h-7 text-xs w-24 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OPERATORS.map((op) => (
              <SelectItem key={op.value} value={op.value} className="text-xs">{op.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onRemove}>
          <X className="h-3 w-3" />
        </Button>
      </div>

      {isMulti ? (
        <div className="space-y-1">
          <div className="flex gap-1">
            {field?.sample.slice(0, 8).map((s) => (
              <button
                key={s}
                onClick={() => !multiValues.includes(s) && onUpdate({ value: [...multiValues, s] })}
                className="text-[10px] px-1.5 py-0.5 rounded bg-white border hover:border-brand hover:text-brand transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
          {multiValues.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {multiValues.map((v) => (
                <Badge key={v} variant="secondary" className="text-[10px] gap-1 pr-1">
                  {v}
                  <button onClick={() => removeMultiValue(v)}><X className="h-2 w-2" /></button>
                </Badge>
              ))}
            </div>
          )}
          <div className="flex gap-1">
            <Input value={multiInput} onChange={(e) => setMultiInput(e.target.value)} placeholder="Custom value" className="h-6 text-xs flex-1" onKeyDown={(e) => e.key === "Enter" && addMultiValue()} />
            <Button variant="outline" size="sm" className="h-6 text-xs px-2" onClick={addMultiValue}>Add</Button>
          </div>
        </div>
      ) : field?.type === "string" && field.sample.length <= 20 ? (
        <Select value={String(filter.value)} onValueChange={(v) => v !== null && onUpdate({ value: v })}>
          <SelectTrigger className="h-7 text-xs w-full">
            <SelectValue placeholder="Select value" />
          </SelectTrigger>
          <SelectContent>
            {field.sample.map((s) => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
          </SelectContent>
        </Select>
      ) : (
        <Input
          value={String(filter.value)}
          onChange={(e) => onUpdate({ value: e.target.value })}
          placeholder="Value"
          className="h-7 text-xs"
        />
      )}
    </div>
  );
}

export function FilterBuilder({ filters, fields, onChange }: Props) {
  function add() {
    const defaultField = fields[0];
    if (!defaultField) return;
    onChange([
      ...filters,
      { id: generateId(), field: defaultField.name, operator: "equals", value: "", label: defaultField.name },
    ]);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Filters</p>
        <Button variant="ghost" size="sm" onClick={add} className="h-6 text-xs gap-1 text-orange-600 hover:text-orange-700">
          <Plus className="h-3 w-3" /> Add
        </Button>
      </div>
      {filters.length === 0 && (
        <p className="text-xs text-muted-foreground italic">No filters. Data will show unfiltered.</p>
      )}
      {filters.map((f) => (
        <FilterRow
          key={f.id}
          filter={f}
          fields={fields}
          onUpdate={(patch) => onChange(filters.map((x) => (x.id === f.id ? { ...x, ...patch } : x)))}
          onRemove={() => onChange(filters.filter((x) => x.id !== f.id))}
        />
      ))}
    </div>
  );
}
