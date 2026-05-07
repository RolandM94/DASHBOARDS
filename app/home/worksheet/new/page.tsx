import { redirect } from "next/navigation";

export default function LegacyNewWorksheetPage() {
  redirect("/home/workbook/new");
}
