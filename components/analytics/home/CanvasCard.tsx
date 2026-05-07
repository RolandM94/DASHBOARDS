"use client";

import { useState } from "react";
import { Canvas } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { LayoutDashboard, Trash2, Globe, ExternalLink, Loader2 } from "lucide-react";
import Link from "next/link";
import { useCanvasStore } from "@/store/canvasStore";
import { toast } from "@/lib/toast";

const CANVAS_COLOR = "#7C3AED";

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export function CanvasCard({ canvas }: { canvas: Canvas }) {
  const deleteCanvas = useCanvasStore((s) => s.deleteCanvas);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/canvases/${canvas.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      deleteCanvas(canvas.id);
      toast.success("Canvas deleted");
    } catch {
      toast.error("Failed to delete canvas");
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
            <DialogTitle>Delete canvas?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">{canvas.name}</strong> will be permanently deleted.
            Any published dashboards using it will go offline.
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

    <div
      className="relative rounded-xl border bg-white overflow-hidden group"
      style={{ boxShadow: "0px 0px 1px 0px rgba(0,0,0,.15), 0px 1px 4px 0px rgba(0,0,0,.04)" }}
    >
      {/* Coloured accent strip */}
      <div className="h-1 w-full" style={{ backgroundColor: CANVAS_COLOR }} />

      <Link href={`/home/canvas/${canvas.id}`} className="block p-4 space-y-3 transition-all duration-200 hover:bg-slate-50/60">
        {/* Icon + delete */}
        <div className="flex items-start justify-between">
          <div
            className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${CANVAS_COLOR}18` }}
          >
            <LayoutDashboard className="h-4 w-4" style={{ color: CANVAS_COLOR }} />
          </div>
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmOpen(true); }}
            className="h-6 w-6 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
            title="Delete canvas"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Name */}
        <p className="font-semibold text-sm leading-snug line-clamp-2 text-slate-800">
          {canvas.name}
        </p>

        {/* Meta row */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-medium">
            {canvas.blocks.length} block{canvas.blocks.length !== 1 ? "s" : ""}
          </Badge>
          {canvas.published && (
            <Badge className="text-[10px] px-1.5 py-0 bg-green-100 text-green-700 border-green-200 font-medium">
              <Globe className="h-2.5 w-2.5 mr-0.5" />
              Published
            </Badge>
          )}
        </div>

        {/* Timestamp */}
        <p className="text-[10px] text-muted-foreground/60">
          Updated {timeAgo(canvas.updatedAt)}
        </p>
      </Link>

      {/* View Dashboard — only when published, sits outside the edit link */}
      {canvas.published && (
        <div className="px-4 pb-3">
          <Link
            href={`/dashboard/${canvas.id}`}
            className="flex items-center justify-center gap-1.5 w-full py-1.5 rounded-lg text-[11px] font-medium transition-colors"
            style={{ backgroundColor: `${CANVAS_COLOR}12`, color: CANVAS_COLOR }}
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="h-3 w-3" />
            View Dashboard
          </Link>
        </div>
      )}
    </div>
    </>
  );
}
