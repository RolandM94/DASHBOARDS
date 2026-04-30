"use client";

import { useState } from "react";
import { DashboardPermission, PublishedDashboard } from "@/types";
import { useCanvasStore } from "@/store/canvasStore";
import { useDashboardStore } from "@/store/dashboardStore";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Globe, Lock, Building2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

const PERMISSIONS: { value: DashboardPermission; label: string; desc: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "private", label: "Private", desc: "Only you", icon: Lock },
  { value: "org", label: "Organisation", desc: "Anyone in your org", icon: Building2 },
  { value: "public", label: "Public", desc: "Anyone with link", icon: Globe },
];

interface Props {
  canvasId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function PublishModal({ canvasId, open, onOpenChange }: Props) {
  const router = useRouter();
  const canvas = useCanvasStore((s) => s.getCanvasById(canvasId));
  const updateCanvas = useCanvasStore((s) => s.updateCanvas);
  const publishDashboard = useDashboardStore((s) => s.publishDashboard);

  const [title, setTitle] = useState(canvas?.publishedTitle ?? canvas?.name ?? "");
  const [permission, setPermission] = useState<DashboardPermission>(
    canvas?.publishedPermission ?? "org"
  );

  async function handlePublish() {
    if (!canvas || !title.trim()) return;

    const res = await fetch(`/api/canvases/${canvas.id}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), permission }),
    });

    if (!res.ok) return;
    const data = await res.json();

    const dashboard: PublishedDashboard = {
      id: data.id,
      canvasId: data.canvasId,
      title: data.title,
      permission: data.permission,
      publishedAt: data.publishedAt,
      blocks: data.blocks,
      layout: data.layout,
    };

    publishDashboard(dashboard);
    updateCanvas(canvas.id, {
      published: true,
      publishedTitle: data.title,
      publishedPermission: data.permission,
      publishedAt: data.publishedAt,
    });

    onOpenChange(false);
    router.push(`/dashboard/${canvas.id}`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-brand" />
            Publish Dashboard
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="dash-title">Title</Label>
            <Input
              id="dash-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Dashboard title"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>Access</Label>
            <div className="grid grid-cols-3 gap-2">
              {PERMISSIONS.map(({ value, label, desc, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => setPermission(value)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-colors",
                    permission === value
                      ? "border-brand bg-brand-tint-100"
                      : "border-muted hover:border-muted-foreground/40 hover:bg-muted/50"
                  )}
                >
                  <Icon className={cn("h-5 w-5", permission === value ? "text-brand" : "text-muted-foreground")} />
                  <span className={cn("text-xs font-medium", permission === value ? "text-brand-deep" : "text-foreground")}>{label}</span>
                  <span className="text-[10px] text-muted-foreground leading-tight">{desc}</span>
                  {permission === value && <CheckCircle2 className="h-3.5 w-3.5 text-brand" />}
                </button>
              ))}
            </div>
          </div>

          {permission === "public" && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Public dashboards are accessible to anyone with the link. Data will be shared within the same browser session.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handlePublish} disabled={!title.trim()} className="gap-2">
            <Globe className="h-4 w-4" />
            {canvas?.published ? "Republish" : "Publish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
