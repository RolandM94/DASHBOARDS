import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * POST /api/templates/[id]/use
 * Clones a template into a new canvas for the current user.
 * Returns { canvasId } — redirect to canvas builder.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  // Load template
  const { data: template, error: tplErr } = await supabase
    .from("dashboard_templates")
    .select("*")
    .eq("id", id)
    .single();

  if (tplErr || !template) return NextResponse.json({ error: "Template not found" }, { status: 404 });
  const tpl = template as Record<string, unknown>;

  const tplData = tpl.data as Record<string, unknown>;
  const sheets = (tplData.sheets ?? []) as Array<{
    name: string;
    metrics: unknown[];
    dimensions: unknown[];
    filters: unknown[];
    chartType: string;
  }>;

  let datasetId: string | undefined;
  const serviceClient = await createServiceClient();

  const sampleRows = (tpl.sample_dataset as Array<Record<string, unknown>> | null) ?? [];
  const sampleFields = (tpl.sample_dataset_fields as Array<{ name: string; type: string; sample?: string[] }> | null) ?? [];

  // Create a dataset for template fields even when the seed has no rows yet.
  if (sampleRows.length > 0 || sampleFields.length > 0) {
    const { data: ds, error: dsErr } = await supabase
      .from("datasets")
      .insert({
        file_name: `${tpl.title} — Sample Data`,
        user_id: user.id,
        fields: sampleFields.map((field) => ({
          ...field,
          sample: field.sample ?? [],
        })),
        row_count: sampleRows.length,
        is_seed: false,
      })
      .select("id")
      .single();

    if (dsErr) return NextResponse.json({ error: dsErr.message }, { status: 500 });
    datasetId = ds.id;

    if (sampleRows.length > 0) {
      const dbRows = sampleRows.map((row, i) => ({ dataset_id: datasetId, row_index: i, data: row }));
      const { error: rowsErr } = await serviceClient
        .from("dataset_rows")
        .insert(dbRows);

      if (rowsErr) {
        await supabase.from("datasets").delete().eq("id", datasetId);
        return NextResponse.json({ error: rowsErr.message }, { status: 500 });
      }
    }
  } else if (tplData.datasetId) {
    datasetId = tplData.datasetId as string;
  }

  if (!datasetId) {
    return NextResponse.json({ error: "Template does not include a dataset or sample fields" }, { status: 400 });
  }

  // Create worksheets from the template's sheets config
  const worksheetIds: { id: string; name: string }[] = [];
  for (const sheet of sheets) {
    const sheetId = sheet.name ?? "Sheet 1";
    const workbookSheet = { ...sheet, id: sheetId, name: sheetId };
    const { data: ws, error: wsErr } = await supabase
      .from("worksheets")
      .insert({
        name: sheetId,
        dataset_id: datasetId,
        config: { version: 1, activeSheetId: sheetId, sheets: [workbookSheet] },
        user_id: user.id,
        status: "saved",
      })
      .select("id, name")
      .single();

    if (!wsErr && ws) {
      worksheetIds.push({ id: ws.id, name: ws.name });
    }
  }

  // Create canvas using template blocks + layout
  const tplBlocks = (tplData.blocks ?? []) as Array<Record<string, unknown>>;
  const tplLayout = (tplData.layout ?? []) as Array<Record<string, unknown>>;

  // Map template worksheet references to the newly created worksheets
  const nameToId = Object.fromEntries(worksheetIds.map((w) => [w.name, w.id]));
  const blocks = tplBlocks.map((block) => {
    const sheetName = block.sheetName ?? block.sheetId;
    if (block.type === "widget" && typeof sheetName === "string" && nameToId[sheetName]) {
      return { ...block, worksheetId: nameToId[sheetName], sheetId: sheetName };
    }
    return block;
  });

  const { data: canvas, error: cvErr } = await supabase
    .from("canvases")
    .insert({
      name: `${tpl.title} (from template)`,
      blocks,
      layout: tplLayout,
      user_id: user.id,
      published: false,
    })
    .select("id")
    .single();

  if (cvErr) return NextResponse.json({ error: cvErr.message }, { status: 500 });

  // Increment download count (fire-and-forget)
  await serviceClient
    .from("dashboard_templates")
    .update({ downloads: ((tpl.downloads as number) ?? 0) + 1 })
    .eq("id", id);

  return NextResponse.json({ canvasId: canvas.id });
}
