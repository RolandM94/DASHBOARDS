"use client";

import { useParams } from "next/navigation";
import { useWorksheetStore } from "@/store/worksheetStore";
import { WorksheetBuilder } from "@/components/analytics/worksheet/WorksheetBuilder";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export default function EditWorksheetPage() {
  const { id } = useParams<{ id: string }>();
  const hydrated  = useWorksheetStore((s) => s.hydrated);
  const worksheet = useWorksheetStore((s) => s.getWorksheetById(id));

  // Don't show "not found" while DataLoader is still fetching
  if (!hydrated) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!worksheet) {
    return (
      <div className="h-full flex items-center justify-center flex-col gap-4">
        <p className="text-muted-foreground">Worksheet not found.</p>
        <Link href="/analytics">
          <Button variant="outline">Back to Analytics</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden">
      <WorksheetBuilder existingWorksheet={worksheet} />
    </div>
  );
}
