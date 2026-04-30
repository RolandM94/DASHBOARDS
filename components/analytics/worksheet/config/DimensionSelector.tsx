"use client";

import { DatasetField, Dimension } from "@/types";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Plus, X } from "lucide-react";
import { generateId } from "@/lib/utils/ids";

interface Props {
  dimensions: Dimension[];
  fields: DatasetField[];
  onChange: (dimensions: Dimension[]) => void;
}

export function DimensionSelector({ dimensions, fields, onChange }: Props) {
  function add() {
    const used = new Set(dimensions.map((d) => d.field));
    const available = fields.find((f) => !used.has(f.name));
    if (!available) return;
    onChange([
      ...dimensions,
      { id: generateId(), field: available.name, label: available.name },
    ]);
  }

  function update(id: string, patch: Partial<Dimension>) {
    onChange(
      dimensions.map((d) => {
        if (d.id !== id) return d;
        const updated = { ...d, ...patch };
        if (patch.field) updated.label = patch.field;
        return updated;
      })
    );
  }

  function remove(id: string) {
    onChange(dimensions.filter((d) => d.id !== id));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Dimensions</p>
        <Button variant="ghost" size="sm" onClick={add} className="h-6 text-xs gap-1 text-purple-600 hover:text-purple-700">
          <Plus className="h-3 w-3" /> Add
        </Button>
      </div>
      {dimensions.length === 0 && (
        <p className="text-xs text-muted-foreground italic">No dimensions. Add one to group your data.</p>
      )}
      {dimensions.map((d) => (
        <div key={d.id} className="bg-muted/50 rounded-lg p-2 space-y-1.5">
          <div className="flex gap-1.5">
            <Select value={d.field} onValueChange={(v) => v && update(d.id, { field: v })}>
              <SelectTrigger className="h-7 text-xs flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {fields.map((f) => <SelectItem key={f.name} value={f.name} className="text-xs">{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => remove(d.id)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
          <Input
            value={d.label}
            onChange={(e) => update(d.id, { label: e.target.value })}
            placeholder="Axis label"
            className="h-7 text-xs"
          />
        </div>
      ))}
    </div>
  );
}
