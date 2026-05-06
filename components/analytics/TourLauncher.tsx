"use client";

import { HelpCircle } from "lucide-react";
import { useTourStore } from "@/store/tourStore";

export default function TourLauncher() {
  const { startTour, isActive } = useTourStore();

  if (isActive) return null;

  return (
    <button
      onClick={startTour}
      className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors w-full"
      title="Take the tour"
    >
      <HelpCircle className="h-3.5 w-3.5" />
      <span>Take the tour</span>
    </button>
  );
}
