"use client";

import { useState, useRef } from "react";
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  useDraggable, useDroppable, PointerSensor, useSensor, useSensors,
} from "@dnd-kit/core";
import { DatasetField, WorksheetConfig, isNumericType } from "@/types";
import { Hash, Calendar, AlignLeft, ToggleLeft, GripVertical, BarChart2, Tag, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { FieldTypeSelector } from "./FieldTypeSelector";

// ─── Types ────────────────────────────────────────────────────────

export type FieldCategory = "dimension" | "measure";
export type FieldCategoryMap = Record<string, FieldCategory>;

export function buildDefaultCategoryMap(fields: DatasetField[]): FieldCategoryMap {
  return Object.fromEntries(
    fields.map((f) => [f.name, isNumericType(f.type) ? "measure" : "dimension"])
  );
}

// ─── Styles ───────────────────────────────────────────────────────

const typeIcon: Record<string, React.ComponentType<{ className?: string }>> = {
  integer:  Hash,
  decimal:  Hash,
  number:   Hash,   // legacy
  date:     Calendar,
  datetime: Calendar,
  string:   AlignLeft,
  boolean:  ToggleLeft,
};

const sectionStyle = {
  dimension: {
    header: "bg-violet-50/80 border-violet-100 text-violet-800",
    headerIcon: "text-violet-600",
    pill: "border-violet-200 bg-white text-violet-800 hover:bg-violet-50 hover:border-violet-300",
    pillActive: "bg-violet-600 border-violet-600 text-white hover:bg-violet-700",
    dropActive: "border-violet-300 bg-violet-50/60",
    dropIdle: "border-slate-200 bg-white",
    label: "Dimensions",
    icon: Tag,
    desc: "Categories & labels",
  },
  measure: {
    header: "bg-brand-tint-100/80 border-brand-tint-200 text-brand-deep",
    headerIcon: "text-brand",
    pill: "border-brand-tint-300 bg-white text-brand-deep hover:bg-brand-tint-100 hover:border-brand-light",
    pillActive: "bg-brand border-brand text-white hover:bg-brand-dark",
    dropActive: "border-brand-light bg-brand-tint-100/70",
    dropIdle: "border-slate-200 bg-white",
    label: "Measures",
    icon: BarChart2,
    desc: "Numeric values",
  },
};

// ─── Helpers ──────────────────────────────────────────────────────

function isFieldInUse(fieldName: string, config: WorksheetConfig): boolean {
  return (
    config.dimensions.some((d) => d.field === fieldName) ||
    config.metrics.some((m) => m.field === fieldName)
  );
}

// ─── Draggable pill ───────────────────────────────────────────────

// ─── Description editor ──────────────────────────────────────────

function DescriptionEditor({
  field,
  onSave,
}: {
  field: DatasetField;
  onSave: (updated: DatasetField) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(field.description ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  // Tracks when Escape was pressed so onBlur doesn't save a cancelled edit
  const cancelledRef = useRef(false);

  function commit() {
    if (cancelledRef.current) { cancelledRef.current = false; return; }
    onSave({ ...field, description: value.trim() || undefined });
    setOpen(false);
  }

  function cancel() {
    cancelledRef.current = true;
    setValue(field.description ?? "");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        title={field.description ? `Description: ${field.description}` : "Add description"}
        onClick={(e) => {
          e.stopPropagation();
          cancelledRef.current = false;
          setValue(field.description ?? "");
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className={cn(
          "opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity p-0.5",
          field.description && "opacity-60"
        )}
      >
        <Pencil className="h-2.5 w-2.5" />
      </button>
    );
  }

  return (
    <div
      className="absolute right-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-lg shadow-lg p-2 w-52"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <p className="text-[10px] font-semibold text-slate-500 mb-1.5">{field.name} — description</p>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") cancel();
        }}
        onBlur={commit}
        placeholder="e.g. Budget allocated to this project"
        className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 outline-none focus:border-brand"
      />
      <p className="text-[9px] text-muted-foreground mt-1">Enter to save · Esc to cancel</p>
    </div>
  );
}

// ─── Draggable pill ───────────────────────────────────────────────

function DraggablePill({
  field,
  category,
  inUse,
  datasetId,
  onClick,
  onTypeChange,
  onDescriptionChange,
}: {
  field: DatasetField;
  category: FieldCategory;
  inUse: boolean;
  datasetId: string;
  onClick: () => void;
  onTypeChange?: (updated: DatasetField) => void;
  onDescriptionChange?: (updated: DatasetField) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: field.name,
    data: { field, fromCategory: category },
  });

  const styles = sectionStyle[category];
  const Icon = typeIcon[field.type] ?? AlignLeft;

  return (
    <div
      ref={setNodeRef}
      style={{ opacity: isDragging ? 0.3 : 1 }}
      className={cn(
        "group relative flex h-8 w-full max-w-full items-center gap-1 rounded-lg border px-2 text-xs font-medium transition-all cursor-pointer select-none",
        inUse ? styles.pillActive : styles.pill
      )}
    >
      {/* Drag handle */}
      <span
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="cursor-grab active:cursor-grabbing touch-none opacity-30 hover:opacity-60 transition-opacity"
        title="Drag to recategorise"
      >
        <GripVertical className="h-3 w-3" />
      </span>

      {/* Clickable content */}
      <button
        onClick={onClick}
        className="flex min-w-0 flex-1 items-center gap-1"
      >
        <Icon className="h-3 w-3 shrink-0 opacity-70" />
        <span className="truncate">{field.name}</span>
        {inUse && <span className="text-[9px] opacity-80 ml-0.5">✓</span>}
      </button>

      {/* Description editor — revealed on hover */}
      {onDescriptionChange && (
        <DescriptionEditor field={field} onSave={onDescriptionChange} />
      )}

      {/* Type selector gear — revealed on hover */}
      {onTypeChange && (
        <FieldTypeSelector
          field={field}
          datasetId={datasetId}
          onTypeChange={onTypeChange}
        />
      )}
    </div>
  );
}

// ─── Droppable section ────────────────────────────────────────────

function DroppableSection({
  id,
  fields,
  config,
  datasetId,
  onFieldClick,
  onFieldTypeChange,
  onFieldDescriptionChange,
}: {
  id: FieldCategory;
  fields: DatasetField[];
  config: WorksheetConfig;
  datasetId: string;
  onFieldClick: (field: DatasetField) => void;
  onFieldTypeChange?: (updated: DatasetField) => void;
  onFieldDescriptionChange?: (updated: DatasetField) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const styles = sectionStyle[id];
  const HeaderIcon = styles.icon;

  return (
    <div className="space-y-1.5">
      {/* Section header */}
      <div className={cn("flex h-9 items-center gap-2 rounded-lg border px-2.5 text-[10px] font-bold uppercase tracking-wider", styles.header)}>
        <HeaderIcon className={cn("h-3.5 w-3.5", styles.headerIcon)} />
        <span>{styles.label}</span>
        <span className="ml-auto max-w-[92px] truncate text-[9px] font-normal normal-case opacity-60">{styles.desc}</span>
        <span className="ml-1 rounded-full bg-white/60 px-1.5 py-0.5 text-[9px] font-semibold opacity-70">{fields.length}</span>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={cn(
          "min-h-[48px] rounded-lg border border-dashed p-1.5 flex flex-col gap-1.5 transition-all duration-150",
          isOver ? styles.dropActive : styles.dropIdle
        )}
      >
        {fields.length === 0 ? (
          <p className="m-auto w-full py-1 text-center text-[10px] text-muted-foreground/40">
            {isOver ? "Drop here ↓" : "Drag fields here to recategorise"}
          </p>
        ) : (
          fields.map((field) => (
            <DraggablePill
              key={field.name}
              field={field}
              category={id}
              inUse={isFieldInUse(field.name, config)}
              datasetId={datasetId}
              onClick={() => onFieldClick(field)}
              onTypeChange={onFieldTypeChange}
              onDescriptionChange={onFieldDescriptionChange}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Main FieldPanel ──────────────────────────────────────────────

interface Props {
  fields: DatasetField[];
  fileName: string;
  config: WorksheetConfig;
  categoryMap: FieldCategoryMap;
  datasetId: string;
  onFieldClick: (field: DatasetField) => void;
  onCategoryChange: (updated: FieldCategoryMap) => void;
  onFieldTypeChange?: (updated: DatasetField) => void;
  onFieldDescriptionChange?: (updated: DatasetField) => void;
}

export function FieldPanel({ fields, fileName, config, categoryMap, datasetId, onFieldClick, onCategoryChange, onFieldTypeChange, onFieldDescriptionChange }: Props) {
  const [dragging, setDragging] = useState<DatasetField | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const dimensions = fields.filter((f) => (categoryMap[f.name] ?? "dimension") === "dimension");
  const measures = fields.filter((f) => (categoryMap[f.name] ?? "dimension") === "measure");

  function handleDragStart(e: DragStartEvent) {
    const field = e.active.data.current?.field as DatasetField | undefined;
    setDragging(field ?? null);
  }

  function handleDragEnd(e: DragEndEvent) {
    setDragging(null);
    const { active, over } = e;
    if (!over) return;

    const fromCategory = active.data.current?.fromCategory as FieldCategory;
    const toCategory = over.id as FieldCategory;
    if (fromCategory === toCategory) return;

    onCategoryChange({ ...categoryMap, [String(active.id)]: toCategory });
  }

  const inUseCount = fields.filter((f) => isFieldInUse(f.name, config)).length;

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header */}
      <div className="border-b bg-slate-50/70 px-4 py-3">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-0.5">
          Data Fields
        </p>
        <p className="text-[10px] text-muted-foreground truncate" title={fileName}>{fileName}</p>
      </div>

      {/* Tip */}
      <div className="border-b border-slate-100 bg-white px-4 py-2">
        <p className="text-[10px] text-slate-500 leading-relaxed">
          <span className="font-semibold text-slate-600">Click</span> a pill to add to chart &nbsp;·&nbsp; <span className="font-semibold text-slate-600">Drag</span> between sections to recategorise
        </p>
      </div>

      {/* Drag context + sections */}
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <DroppableSection
            id="dimension"
            fields={dimensions}
            config={config}
            datasetId={datasetId}
            onFieldClick={onFieldClick}
            onFieldTypeChange={onFieldTypeChange}
            onFieldDescriptionChange={onFieldDescriptionChange}
          />

          <DroppableSection
            id="measure"
            fields={measures}
            config={config}
            datasetId={datasetId}
            onFieldClick={onFieldClick}
            onFieldTypeChange={onFieldTypeChange}
            onFieldDescriptionChange={onFieldDescriptionChange}
          />

          {/* Floating drag overlay */}
          <DragOverlay dropAnimation={{ duration: 150, easing: "ease" }}>
            {dragging ? (
              <div className="flex h-8 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 text-xs font-medium text-gray-700 shadow-xl ring-2 ring-brand-light ring-offset-1">
                <GripVertical className="h-3 w-3 opacity-40" />
                {dragging.name}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t bg-slate-50/70 px-4 py-2 text-[10px] text-slate-400">
        <span>{dimensions.length} dim · {measures.length} meas</span>
        <span className={inUseCount > 0 ? "text-brand font-medium" : ""}>{inUseCount} in use</span>
      </div>
    </div>
  );
}
