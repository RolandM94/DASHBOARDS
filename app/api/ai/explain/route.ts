import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { buildExplainPrompt } from "@/lib/ai/prompts";
import type { Metric, WorksheetConfig, DatasetField } from "@/types";

/**
 * POST /api/ai/explain
 *
 * Generates a plain-language explanation of a rendered chart by:
 *   1. Loading the worksheet config
 *   2. Running aggregate_dataset to get the actual chart rows
 *   3. Sending those rows + config to Claude
 *   4. Returning the explanation text
 *
 * The caller (WidgetCard) can then insert the result as a TextBlockConfig
 * on the canvas.
 */
export async function POST(request: Request) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured on the server." },
      { status: 503 },
    );
  }

  // ── Input ─────────────────────────────────────────────────────────────────
  const { worksheetId, canvasId } = await request.json() as {
    worksheetId: string;
    canvasId?:   string;
  };

  if (!worksheetId) {
    return NextResponse.json({ error: "worksheetId is required" }, { status: 400 });
  }

  // ── Load worksheet (RLS enforces ownership / access) ──────────────────────
  const { data: ws } = await supabase
    .from("worksheets")
    .select("id, name, dataset_id, config")
    .eq("id", worksheetId)
    .single();

  if (!ws) {
    return NextResponse.json({ error: "Worksheet not found or access denied" }, { status: 404 });
  }

  const config = ws.config as WorksheetConfig;

  // ── Verify dataset access (RLS) ───────────────────────────────────────────
  const { data: ds } = await supabase
    .from("datasets")
    .select("id, fields")
    .eq("id", ws.dataset_id)
    .single();

  if (!ds) {
    return NextResponse.json({ error: "Dataset not found or access denied" }, { status: 404 });
  }

  // ── Fetch aggregated chart data ───────────────────────────────────────────
  const serviceClient = await createServiceClient();

  const fieldTypeMap = Object.fromEntries(
    (ds.fields as DatasetField[]).map((f) => [f.name, f.type]),
  );

  const enrichedMetrics: Metric[] = config.metrics.map((m) => ({
    ...m,
    fieldType: m.fieldType ?? fieldTypeMap[m.field],
  }));

  const { data: aggData, error: aggError } = await serviceClient.rpc("aggregate_dataset", {
    p_dataset_id:         ws.dataset_id,
    p_dimensions:         config.dimensions,
    p_metrics:            enrichedMetrics,
    p_worksheet_filters:  config.filters ?? [],
    p_global_filters:     {},
    p_sort:               config.sort ?? "natural",
  });

  if (aggError) {
    return NextResponse.json({ error: aggError.message }, { status: 500 });
  }

  const rows = (aggData ?? []) as Record<string, unknown>[];

  // ── Audit log ─────────────────────────────────────────────────────────────
  const { data: logRow } = await supabase
    .from("ai_logs")
    .insert({
      user_id:      user.id,
      dataset_id:   ws.dataset_id,
      canvas_id:    canvasId ?? null,
      worksheet_id: worksheetId,
      prompt:       `Explain chart: "${ws.name}"`,
    })
    .select("id")
    .single();

  const logId = logRow?.id as string | undefined;

  // ── Call Claude ───────────────────────────────────────────────────────────
  try {
    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 400,
      messages: [{
        role:    "user",
        content: buildExplainPrompt(
          ws.name,
          config.chartType,
          config.dimensions,
          config.metrics,
          rows,
        ),
      }],
    });

    const explanation = message.content
      .filter((c) => c.type === "text")
      .map((c) => (c as { type: "text"; text: string }).text)
      .join("")
      .trim();

    if (logId) {
      await supabase
        .from("ai_logs")
        .update({ config: { explanation } })
        .eq("id", logId);
    }

    return NextResponse.json({ explanation });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (logId) {
      await supabase.from("ai_logs").update({ error: msg }).eq("id", logId);
    }
    return NextResponse.json({ error: `AI request failed: ${msg}` }, { status: 502 });
  }
}
