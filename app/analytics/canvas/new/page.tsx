"use client";

import { CanvasBuilder } from "@/components/analytics/canvas/CanvasBuilder";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export default function NewCanvasPage() {
  return (
    <ErrorBoundary>
      <div className="h-full overflow-hidden">
        <CanvasBuilder />
      </div>
    </ErrorBoundary>
  );
}
