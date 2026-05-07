"use client";

import { HelpCircle } from "lucide-react";
import { useTourStore } from "@/store/tourStore";
import { cn } from "@/lib/utils";

export default function TourLauncher({ collapsed }: { collapsed?: boolean }) {
  const { startTour, isActive } = useTourStore();

  if (isActive) return null;

  return (
    <button
      onClick={startTour}
      className={cn(
        "flex items-center rounded-lg text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
        collapsed
          ? "justify-center w-8 h-8 mx-auto p-0"
          : "gap-2 px-3 py-2 w-full"
      )}
      title={collapsed ? "Take the tour" : undefined}
    >
      <HelpCircle className={cn("shrink-0", collapsed ? "h-4 w-4" : "h-3.5 w-3.5")} />
      {!collapsed && <span>Take the tour</span>}
    </button>
  );
}
