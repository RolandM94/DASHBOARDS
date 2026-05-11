"use client";

import { DatasetField, Metric, AggregationFn, isNumericType } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X } from "lucide-react";
import { generateId } from "@/lib/utils/ids";

const BASE_AGG_FNS: AggregationFn[] = ["COUNT", "SUM", "AVG", "MIN", "MAX"];

interface Props {
  metrics: Metric[];
  fields: DatasetField[];
  onChange: (metrics: Metric[]) => void;
}

export function MetricBuilder({ metrics, fields, onChange }: Props) {
  const numericFields = fields.filter((f) => isNumericType(f.type));
  const allFields = fields;

  function add() {
    const defaultField = numericFields[0] ?? allFields[0];
    if (!defaultField) return;
    const agg: AggregationFn = isNumericType(defaultField.type) ? "SUM" : "COUNT";
    onChange([
      ...metrics,
      {
        id: generateId(),
        field: defaultField.name,
        aggregation: agg,
        label: `${agg} of ${defaultField.name}`,
      },
    ]);
  }

  function update(id: string, patch: Partial<Metric>) {
    onChange(
      metrics.map((m) => {
        if (m.id !== id) return m;
        const updated = { ...m, ...patch };
        // Auto-update label if it was auto-generated
        if (patch.field || patch.aggregation) {
          updated.label = `${updated.aggregation} of ${updated.field}`;
        }
        return updated;
      })
    );
  }

  function remove(id: string) {
    onChange(metrics.filter((m) => m.id !== id));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Metrics</p>
        <Button variant="ghost" size="sm" onClick={add} className="h-6 text-xs gap-1 text-brand hover:text-brand-deep">
          <Plus className="h-3 w-3" /> Add
        </Button>
      </div>
      {metrics.length === 0 && (
        <p className="text-xs text-muted-foreground italic">No metrics. Click Add to define what to measure.</p>
      )}
      {metrics.map((m) => (
        <div key={m.id} className="bg-muted/50 rounded-lg p-2 space-y-1.5">
          <div className="flex gap-1.5">
            <Select value={m.aggregation} onValueChange={(v) => v && update(m.id, { aggregation: v as AggregationFn })}>
              <SelectTrigger className="h-7 text-xs w-20 shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BASE_AGG_FNS.map((fn) => <SelectItem key={fn} value={fn} className="text-xs">{fn}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={m.field} onValueChange={(v) => v && update(m.id, { field: v })}>
              <SelectTrigger className="h-7 text-xs flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allFields.map((f) => <SelectItem key={f.name} value={f.name} className="text-xs">{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => remove(m.id)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
          <Input
            value={m.label}
            onChange={(e) => update(m.id, { label: e.target.value })}
            placeholder="Label"
            className="h-7 text-xs"
          />
        </div>
      ))}
    </div>
  );
}
