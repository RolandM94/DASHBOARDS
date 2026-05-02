import { redirect } from "next/navigation";

export default async function LegacyEditWorksheetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/analytics/workbook/${id}`);
}
