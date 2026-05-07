"use client";

import { useParams } from "next/navigation";
import { useCanvasStore } from "@/store/canvasStore";
import { CanvasBuilder } from "@/components/analytics/canvas/CanvasBuilder";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export default function EditCanvasPage() {
  const { id } = useParams<{ id: string }>();
  const hydrated = useCanvasStore((s) => s.hydrated);
  const canvas   = useCanvasStore((s) => s.getCanvasById(id));

  // Don't show "not found" while DataLoader is still fetching
  if (!hydrated) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!canvas) {
    return (
      <div className="h-full flex items-center justify-center flex-col gap-4">
        <p className="text-muted-foreground">Canvas not found.</p>
        <Link href="/home">
          <Button variant="outline">Back to Home</Button>
        </Link>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="h-full min-h-0 min-w-0 overflow-hidden">
        <CanvasBuilder existingCanvas={canvas} />
      </div>
    </ErrorBoundary>
  );
}
