"use client";

import { useRef, useState } from "react";
import { Upload, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  onFile: (file: File) => void;
  loading: boolean;
}

export function DropZone({ onFile, loading }: Props) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onFile(file);
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={cn(
        "border-2 border-dashed rounded-2xl p-16 text-center transition-colors cursor-pointer",
        dragging ? "border-brand bg-brand-tint-100" : "border-muted-foreground/25 hover:border-brand-light hover:bg-brand-tint-100/50"
      )}
      onClick={() => !loading && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        className="hidden"
        onChange={handleChange}
        disabled={loading}
      />
      {loading ? (
        <div className="space-y-3">
          <div className="h-10 w-10 border-4 border-brand border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">Parsing your file…</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="h-14 w-14 bg-brand-tint-100 rounded-2xl flex items-center justify-center mx-auto">
            <FileSpreadsheet className="h-7 w-7 text-brand" />
          </div>
          <div>
            <p className="font-semibold text-base">Drop your data file here</p>
            <p className="text-sm text-muted-foreground mt-1">Supports CSV, XLSX, and XLS files</p>
          </div>
          <Button variant="outline" size="sm" className="gap-2">
            <Upload className="h-4 w-4" />
            Browse file
          </Button>
        </div>
      )}
    </div>
  );
}
