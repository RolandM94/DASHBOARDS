import type { Metadata } from "next";
import { WorksheetBuilder } from "@/components/analytics/worksheet/WorksheetBuilder";

export const metadata: Metadata = {
  title: "New Workbook | Supercoolstuff",
};

export default function NewWorkbookPage() {
  return (
    <div className="h-full min-h-0 min-w-0 overflow-hidden">
      <WorksheetBuilder />
    </div>
  );
}
