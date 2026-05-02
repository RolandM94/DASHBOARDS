import { redirect } from "next/navigation";

export default function LegacyNewWorksheetPage() {
  redirect("/analytics/workbook/new");
}
