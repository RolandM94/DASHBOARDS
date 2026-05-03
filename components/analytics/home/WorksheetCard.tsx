"use client";

import { useState } from "react";
import { Worksheet } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { BarChart2, Trash2, BarChart, LineChart, PieChart, Table2, TrendingUp, Hash, Globe, Loader2 } from "lucide-react";
import Link from "next/link";
import { useWorksheetStore } from "@/store/worksheetStore";
import { toast } from "@/lib/toast";
import { getActiveWorkbookSheet, getWorkbookSheets } from "@/lib/workbook";

const CHART_META: Record<string, { label: string; color: string; Icon: React.ElementType }> = {
  bar:         { label: "Bar",         color: "#4ECDC4", Icon: BarChart },
  grouped_bar: { label: "Grouped Bar", color: "#4ECDC4", Icon: BarChart },
  line:        { label: "Line",        color: "#4D96FF", Icon: LineChart },
  area:        { label: "Area",        color: "#4D96FF", Icon: TrendingUp },
  pie:         { label: "Pie",         color: "#FF8FAB", Icon: PieChart },
  kpi:         { label: "KPI",         color: "#FFD166", Icon: Hash },
  table:       { label: "Table",       color: "#A29BFE", Icon: Table2 },
  map:         { label: "Map",         color: "#06B6D4", Icon: Globe },
};

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export function WorksheetCard({ worksheet }: { worksheet: Worksheet }) {
  const deleteWorksheet = useWorksheetStore((s) => s.deleteWorksheet);
  const sheet = getActiveWorkbookSheet(worksheet);
  const sheets = getWorkbookSheets(worksheet);
  const meta = CHART_META[sheet.chartType] ?? { label: sheet.chartType, color: "#94a3b8", Icon: BarChart2 };
  const { Icon } = meta;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/workbooks/${worksheet.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      deleteWorksheet(worksheet.id);
      toast.success("Workbook deleted");
    } catch {
      toast.error("Failed to delete workbook");
    } finally {
      setDeleting(false);
      setConfirmOpen(false);
    }
  }

  return (
    <>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete workbook?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">{worksheet.name}</strong> will be permanently deleted.
            Any canvas widgets using its sheets will stop displaying data.
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Link href={`/analytics/workbook/${worksheet.id}`} className="block group h-full">
        <div
          className="relative flex flex-col h-full rounded-xl border bg-white overflow-hidden transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
          style={{ boxShadow: "0px 0px 1px 0px rgba(0,0,0,.15), 0px 1px 4px 0px rgba(0,0,0,.04)" }}
        >
          {/* Coloured accent strip */}
          <div className="h-1 w-full shrink-0" style={{ backgroundColor: meta.color }} />

          <div className="p-4 space-y-3 flex flex-col flex-1">
            {/* Icon + delete */}
            <div className="flex items-start justify-between">
              <div
                className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${meta.color}20` }}
              >
                <Icon className="h-4 w-4" style={{ color: meta.color }} />
              </div>
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmOpen(true); }}
                className="h-6 w-6 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                title="Delete workbook"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Name + description */}
            <div className="flex-1">
              <p className="font-semibold text-sm leading-snug line-clamp-2 text-slate-800">
                {worksheet.name}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1 min-h-[1rem]">
                {worksheet.description ?? "\u00A0"}
              </p>
            </div>

            {/* Meta row */}
            <div className="flex items-center gap-1.5 flex-wrap min-h-[22px]">
              <Badge
                variant="secondary"
                className="text-[10px] px-1.5 py-0 font-medium"
                style={{ backgroundColor: `${meta.color}18`, color: meta.color, border: "none" }}
              >
                {meta.label}
              </Badge>
              {sheet.metrics.length > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  {sheet.metrics.length} metric{sheet.metrics.length !== 1 ? "s" : ""}
                </span>
              )}
              {sheets.length > 1 && (
                <span className="text-[10px] text-muted-foreground">
                  {sheets.length} sheets
                </span>
              )}
            </div>

            {/* Timestamp */}
            <p className="text-[10px] text-muted-foreground/60">
              Updated {timeAgo(worksheet.updatedAt)}
            </p>
          </div>
        </div>
      </Link>
    </>
  );
}
