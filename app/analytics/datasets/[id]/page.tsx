"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { DatasetTableView } from "@/components/analytics/datasets/DatasetTableView";
import { useWorksheetStore } from "@/store/worksheetStore";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export default function DatasetPage() {
  const { id } = useParams<{ id: string }>();
  const hydrated = useWorksheetStore((s) => s.hydrated);
  const dataset = useWorksheetStore((s) => s.getDatasetById(id));

  if (!hydrated) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!dataset) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-sm text-muted-foreground">Dataset not found.</p>
        <Link href="/analytics">
          <Button variant="outline">Back to Analytics</Button>
        </Link>
      </div>
    );
  }

  return <DatasetTableView dataset={dataset} />;
}
