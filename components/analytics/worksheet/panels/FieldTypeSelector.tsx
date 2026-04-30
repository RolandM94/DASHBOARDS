"use client";

import { useState } from "react";
import { DatasetField, FieldType, FIELD_TYPE_LABELS } from "@/types";
import { Settings2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface CompatStats {
  total: number;
  incompatible: number;
  examples: string[];
}

interface Props {
  field: DatasetField;
  datasetId: string;
  onTypeChange: (updated: DatasetField) => void;
}

export function FieldTypeSelector({ field, datasetId, onTypeChange }: Props) {
  const [checking, setChecking] = useState(false);
  const [pending, setPending] = useState<FieldType | "default" | null>(null);
  const [stats, setStats] = useState<CompatStats | null>(null);
  const [applying, setApplying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // "default" means the type matches the inferred type (no user override)
  const currentValue: FieldType | "default" =
    !field.inferredType || field.type === field.inferredType ? "default" : field.type;

  async function handleSelect(newType: FieldType | "default") {
    if (newType === currentValue) return;

    setChecking(true);
    try {
      const res = await fetch(
        `/api/datasets/${datasetId}/fields/${encodeURIComponent(field.name)}/compatibility?targetType=${newType}`
      );
      if (res.ok) {
        const data: CompatStats & { total: number } = await res.json();
        if (data.incompatible > 0) {
          setPending(newType);
          setStats(data);
          return;
        }
      }
      // Compatible or couldn't check — apply directly
      await applyChange(newType);
    } finally {
      setChecking(false);
    }
  }

  async function applyChange(newType: FieldType | "default", force = false) {
    setApplying(true);
    setErrorMsg(null);
    try {
      const res = await fetch(
        `/api/datasets/${datasetId}/fields/${encodeURIComponent(field.name)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newType, ...(force ? { force: true } : {}) }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setErrorMsg(body.error ?? "Failed to update type");
        return;
      }
      const { fields } = (await res.json()) as { fields: DatasetField[] };
      const updated = fields.find((f) => f.name === field.name);
      if (updated) onTypeChange(updated);
    } catch {
      setErrorMsg("Network error — try again");
    } finally {
      setApplying(false);
      setPending(null);
      setStats(null);
    }
  }

  const inferredLabel = field.inferredType ? FIELD_TYPE_LABELS[field.inferredType] : null;
  const pendingLabel = pending ? FIELD_TYPE_LABELS[pending] : "";

  return (
    <div className="relative shrink-0">
      {errorMsg && (
        <span
          className="absolute left-0 top-6 z-50 whitespace-nowrap rounded bg-destructive px-1.5 py-0.5 text-[10px] text-white shadow cursor-pointer"
          onClick={() => setErrorMsg(null)}
        >
          {errorMsg}
        </span>
      )}
      <Select
        value={currentValue}
        onValueChange={(v) => handleSelect(v as FieldType | "default")}
        disabled={checking || applying}
      >
        {/* Gear icon — visible only on group hover */}
        <SelectTrigger
          size="sm"
          className="h-5 w-5 min-w-0 shrink-0 p-0 border-0 bg-transparent hover:bg-black/10 rounded overflow-hidden opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity [&>svg:last-child]:hidden [&_[data-slot=select-icon]]:hidden"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Settings2 className="h-3 w-3 shrink-0" />
        </SelectTrigger>

        <SelectContent align="start" side="bottom" alignItemWithTrigger={false}>
          <SelectGroup>
            <SelectLabel>Change type — {field.name}</SelectLabel>
            <SelectItem value="default">
              Default{inferredLabel ? ` (${inferredLabel})` : ""}
            </SelectItem>
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectItem value="integer">Number (Whole)</SelectItem>
            <SelectItem value="decimal">Number (Decimal)</SelectItem>
            <SelectItem value="string">String</SelectItem>
            <SelectItem value="date">Date</SelectItem>
            <SelectItem value="datetime">Date and Time</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>

      {/* Incompatibility warning */}
      <Dialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Incompatible values detected</DialogTitle>
            <DialogDescription>
              <strong>{stats?.incompatible}</strong> of <strong>{stats?.total}</strong> rows
              can&apos;t be converted to <strong>{pendingLabel}</strong>. Those values will
              display as empty after the change.
              {stats?.examples && stats.examples.length > 0 && (
                <span className="block mt-2 font-mono text-xs bg-muted px-2 py-1.5 rounded">
                  e.g. {stats.examples.slice(0, 3).join(", ")}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)} disabled={applying}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={applying}
              onClick={() => pending && applyChange(pending, true)}
            >
              {applying ? "Applying…" : "Change anyway"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
