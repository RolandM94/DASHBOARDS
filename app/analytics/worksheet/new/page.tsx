import type { Metadata } from "next";
import { WorksheetBuilder } from "@/components/analytics/worksheet/WorksheetBuilder";

export const metadata: Metadata = {
  title: "New Worksheet | Eyemark",
};

export default function NewWorksheetPage() {
  return (
    <div className="h-full overflow-hidden">
      <WorksheetBuilder />
    </div>
  );
}
